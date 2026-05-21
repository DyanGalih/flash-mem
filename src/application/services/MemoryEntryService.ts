import { createHash } from 'node:crypto';
import * as path from 'path';
import { MemoryEntryInput } from '../../domain/entities/MemoryEntry';
import { Project } from '../../domain/entities/Project';
import { RelationshipInput } from '../../domain/entities/Relationship';
import {
  IProjectRepository,
  IMemoryEntryRepository,
  ITagRepository,
  IRelationshipRepository,
  ISourceDocumentRepository,
  ITransactionRunner
} from '../../domain/repositories/interfaces';
import { createId, now } from '../../infrastructure/database/helpers';
import { IndexingInputGuard } from '../../infrastructure/safety/IndexingInputGuard';
import { SecretScanner } from '../../infrastructure/safety/SecretScanner';
import { PathSanitizer } from '../../infrastructure/safety/PathSanitizer';

export class MemoryEntryService {
  private readonly indexingInputGuard: IndexingInputGuard;

  constructor(
    private readonly projectRepository: IProjectRepository,
    private readonly memoryEntryRepository: IMemoryEntryRepository,
    private readonly tagRepository: ITagRepository,
    private readonly relationshipRepository: IRelationshipRepository,
    private readonly sourceDocumentRepository: ISourceDocumentRepository,
    private readonly transactionRunner: ITransactionRunner
  ) {
    this.indexingInputGuard = new IndexingInputGuard();
  }

  public createMemoryEntry(input: MemoryEntryInput & { projectId?: string; rootPath?: string; projectName?: string }) {
    const project = this.resolveProject(input);

    if (input.relatedFiles) {
      const resolvedRoot = PathSanitizer.resolveRoot(project.rootPath);
      for (const file of input.relatedFiles) {
        const absoluteFilePath = path.resolve(resolvedRoot, file);
        if (!PathSanitizer.isWithinRoot(resolvedRoot, absoluteFilePath)) {
          throw new Error(`Directory traversal detected in related file path: "${file}"`);
        }
      }
    }

    const redactedTitle = SecretScanner.redact(input.title);
    const redactedContent = SecretScanner.redact(input.content);

    return this.transactionRunner.run(() => {
      const sourceDocumentId = this.resolveSourceDocumentId(project, input);
      const entry = this.memoryEntryRepository.create({
        projectId: project.id,
        title: redactedTitle,
        content: redactedContent,
        category: input.category,
        source: input.source,
        confidence: input.confidence,
        relatedFiles: input.relatedFiles,
        tags: input.tags ?? [],
        sourceDocumentPath: input.sourceDocumentPath,
        sourceChecksum: input.sourceChecksum,
        relationships: input.relationships ?? []
      }, sourceDocumentId);

      this.tagRepository.replaceEntryTags(entry.id, input.tags ?? []);
      for (const relationship of input.relationships ?? []) {
        this.relationshipRepository.upsert(project.id, entry.id, relationship);
      }

      return this.memoryEntryRepository.findById(entry.id);
    });
  }

  public updateMemoryEntry(entryId: string, input: Partial<MemoryEntryInput> & { tags?: string[]; relationships?: RelationshipInput[] }) {
    const existing = this.memoryEntryRepository.findById(entryId);
    if (!existing) {
      return null;
    }

    if (input.relatedFiles) {
      const project = this.projectRepository.findById(existing.projectId);
      if (project) {
        const resolvedRoot = PathSanitizer.resolveRoot(project.rootPath);
        for (const file of input.relatedFiles) {
          const absoluteFilePath = path.resolve(resolvedRoot, file);
          if (!PathSanitizer.isWithinRoot(resolvedRoot, absoluteFilePath)) {
            throw new Error(`Directory traversal detected in related file path: "${file}"`);
          }
        }
      }
    }

    const redactedTitle = input.title !== undefined ? SecretScanner.redact(input.title) : undefined;
    const redactedContent = input.content !== undefined ? SecretScanner.redact(input.content) : undefined;

    return this.transactionRunner.run(() => {
      const updated = this.memoryEntryRepository.update(entryId, {
        title: redactedTitle,
        content: redactedContent,
        category: input.category,
        source: input.source,
        confidence: input.confidence,
        relatedFiles: input.relatedFiles
      });

      if (!updated) {
        return null;
      }

      if (input.tags) {
        this.tagRepository.replaceEntryTags(entryId, input.tags);
      }

      if (input.relationships) {
        for (const relationship of input.relationships) {
          this.relationshipRepository.upsert(existing.projectId, entryId, relationship);
        }
      }

      return this.memoryEntryRepository.findById(entryId);
    });
  }

  public deleteMemoryEntry(entryId: string): boolean {
    return this.transactionRunner.run(() => this.memoryEntryRepository.softDelete(entryId));
  }

  public createProject(rootPath: string, projectName: string) {
    return this.projectRepository.upsertByRootPath(rootPath, projectName);
  }

  private resolveProject(input: { projectId?: string; rootPath?: string; projectName?: string; tags?: string[] }): Project {
    if (input.projectId) {
      const existing = this.projectRepository.findById(input.projectId);
      if (!existing) {
        throw new Error(`Unknown project "${input.projectId}"`);
      }
      return existing;
    }

    if (!input.rootPath) {
      throw new Error('projectId or rootPath is required to create memory entries');
    }

    return this.projectRepository.upsertByRootPath(
      input.rootPath,
      input.projectName ?? 'flash-mem-project'
    );
  }

  private resolveSourceDocumentId(project: Project, input: MemoryEntryInput): string | null {
    if (!input.sourceDocumentPath) {
      return null;
    }

    const normalizedSourcePath = this.indexingInputGuard.normalizeSourcePath(project.rootPath, input.sourceDocumentPath);
    const checksum = input.sourceChecksum ?? this.hashSource(normalizedSourcePath, input.content);
    return this.sourceDocumentRepository.upsert(project.id, normalizedSourcePath, checksum, now()).id;
  }

  private hashSource(path: string, content: string): string {
    return createHash('sha256').update(`${path}\n${content}`).digest('hex');
  }
}
