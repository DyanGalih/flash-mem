import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { MemoryEntryInput } from '../../domain/entities/MemoryEntry';
import { Project } from '../../domain/entities/Project';
import { RelationshipInput } from '../../domain/entities/Relationship';
import { MemoryEntryRepository } from '../../infrastructure/database/repositories/MemoryEntryRepository';
import { ProjectRepository } from '../../infrastructure/database/repositories/ProjectRepository';
import { RelationshipRepository } from '../../infrastructure/database/repositories/RelationshipRepository';
import { SourceDocumentRepository } from '../../infrastructure/database/repositories/SourceDocumentRepository';
import { TagRepository } from '../../infrastructure/database/repositories/TagRepository';
import { createId, now } from '../../infrastructure/database/helpers';
import { IndexingInputGuard } from '../../infrastructure/safety/IndexingInputGuard';

export class MemoryEntryService {
  private readonly projectRepository: ProjectRepository;
  private readonly memoryEntryRepository: MemoryEntryRepository;
  private readonly tagRepository: TagRepository;
  private readonly relationshipRepository: RelationshipRepository;
  private readonly sourceDocumentRepository: SourceDocumentRepository;
  private readonly indexingInputGuard: IndexingInputGuard;

  constructor(private readonly db: Database.Database) {
    this.projectRepository = new ProjectRepository(db);
    this.memoryEntryRepository = new MemoryEntryRepository(db);
    this.tagRepository = new TagRepository(db);
    this.relationshipRepository = new RelationshipRepository(db);
    this.sourceDocumentRepository = new SourceDocumentRepository(db);
    this.indexingInputGuard = new IndexingInputGuard();
  }

  public createMemoryEntry(input: MemoryEntryInput & { rootPath?: string; projectName?: string }) {
    const project = this.resolveProject(input);
    const run = this.db.transaction(() => {
      const sourceDocumentId = this.resolveSourceDocumentId(project, input);
      const entry = this.memoryEntryRepository.create({
        projectId: project.id,
        title: input.title,
        content: input.content,
        entryType: input.entryType,
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

    return run();
  }

  public updateMemoryEntry(entryId: string, input: Partial<MemoryEntryInput> & { tags?: string[]; relationships?: RelationshipInput[] }) {
    const run = this.db.transaction(() => {
      const existing = this.memoryEntryRepository.findById(entryId);
      if (!existing) {
        return null;
      }

      const updated = this.memoryEntryRepository.update(entryId, {
        title: input.title,
        content: input.content,
        entryType: input.entryType
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

    return run();
  }

  public deleteMemoryEntry(entryId: string): boolean {
    const run = this.db.transaction(() => this.memoryEntryRepository.softDelete(entryId));
    return run();
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
