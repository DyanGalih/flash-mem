import { createHash } from 'crypto';
import * as path from 'path';
import { ArtifactMemoryCaptureEntry, ArtifactMemoryCaptureInput, ArtifactMemoryCaptureResult } from '../../domain/entities/ArtifactMemoryCapture';
import {
  IArtifactReader,
  ICaptureDeduplicationGuard,
  IMemoryEntryRepository,
  IPathSanitizer,
  IProjectRepository,
  ISecretScanner,
  ISourceDocumentRepository,
  ITransactionRunner
} from '../../domain/repositories/interfaces';
import { ArtifactMemoryExtractionService } from './ArtifactMemoryExtractionService';
import { MemoryEntryService } from './MemoryEntryService';

export class ArtifactMemoryCaptureService {
  constructor(
    private readonly workspaceRoot: string,
    private readonly projectRepository: IProjectRepository,
    private readonly memoryEntryRepository: IMemoryEntryRepository,
    private readonly sourceDocumentRepository: ISourceDocumentRepository,
    private readonly transactionRunner: ITransactionRunner,
    private readonly artifactReader: IArtifactReader,
    private readonly pathSanitizer: IPathSanitizer,
    private readonly secretScanner: ISecretScanner,
    private readonly deduplicationGuard: ICaptureDeduplicationGuard,
    private readonly extractionService = new ArtifactMemoryExtractionService()
  ) { }

  public captureArtifactMemory(input: ArtifactMemoryCaptureInput): ArtifactMemoryCaptureResult {
    const artifactPath = input.artifactPath.trim();
    const workspaceRoot = this.pathSanitizer.resolveRoot(this.workspaceRoot);
    const projectName = path.basename(workspaceRoot);

    try {
      const project = this.projectRepository.upsertByRootPath(workspaceRoot, projectName);
      const artifact = this.artifactReader.read(workspaceRoot, artifactPath);
      const sourceType = this.extractionService.inferSourceType(artifact.relativePath, input.sourceType);
      const candidates = this.extractionService.extractCandidates(artifact.content, sourceType, artifact.relativePath);

      if (candidates.length === 0) {
        return this.skippedResult(project.id, project.name, artifact.relativePath, sourceType, 'No reusable knowledge was found in the artifact.');
      }

      const sourceChecksum = this.hashSource(artifact.relativePath, artifact.content);
      const entries: ArtifactMemoryCaptureEntry[] = [];
      let skippedCount = 0;

      this.transactionRunner.run(() => {
        const sourceDocument = this.sourceDocumentRepository.upsert(project.id, artifact.relativePath, sourceChecksum, Date.now());

        for (const candidate of candidates) {
          const redactedTitle = this.secretScanner.redact(candidate.title).trim();
          const redactedContent = this.secretScanner.redact(candidate.content).trim();
          const redactedSummary = candidate.summary ? this.secretScanner.redact(candidate.summary).trim() : MemoryEntryService.extractSummary(redactedContent);
          const signature = this.deduplicationGuard.signature({
            title: redactedTitle,
            content: redactedContent,
            category: candidate.category
          });
          const existing = this.memoryEntryRepository.findByProjectAndHash(project.id, signature, candidate.category);

          if (existing) {
            skippedCount += 1;
            continue;
          }

          const created = this.memoryEntryRepository.create({
            projectId: project.id,
            title: redactedTitle,
            content: redactedContent,
            category: candidate.category,
            source: sourceType,
            confidence: candidate.confidence,
            summary: redactedSummary.length > 0 ? redactedSummary : undefined,
            sourceDocumentPath: artifact.relativePath,
            sourceChecksum
          }, sourceDocument.id);

          entries.push(this.toPublicEntry(created, artifact.relativePath, sourceType));
        }
      });

      if (entries.length === 0) {
        return this.skippedResult(project.id, project.name, artifact.relativePath, sourceType, 'All capture candidates were already stored previously.', skippedCount);
      }

      return {
        status: 'captured',
        artifactPath: artifact.relativePath,
        sourceType,
        projectId: project.id,
        projectName: project.name,
        createdCount: entries.length,
        skippedCount,
        entries
      };
    } catch (error: any) {
      return {
        status: 'failed',
        artifactPath,
        sourceType: input.sourceType ?? 'custom_markdown',
        projectId: '',
        projectName,
        createdCount: 0,
        skippedCount: 0,
        entries: [],
        reason: error?.message ?? 'Artifact capture failed'
      };
    }
  }

  private skippedResult(projectId: string, projectName: string, artifactPath: string, sourceType: ArtifactMemoryCaptureResult['sourceType'], reason: string, skippedCount = 0): ArtifactMemoryCaptureResult {
    return {
      status: 'skipped',
      artifactPath,
      sourceType,
      projectId,
      projectName,
      createdCount: 0,
      skippedCount,
      entries: [],
      reason
    };
  }

  private toPublicEntry(entry: { id: string; title: string; category: string; confidence?: number | null; summary?: string | null }, artifactPath: string, sourceType: ArtifactMemoryCaptureResult['sourceType']): ArtifactMemoryCaptureEntry {
    return {
      id: entry.id,
      title: entry.title,
      category: entry.category as ArtifactMemoryCaptureEntry['category'],
      confidence: entry.confidence ?? null,
      summary: entry.summary ?? null,
      sourceType,
      artifactPath
    };
  }

  private hashSource(relativePath: string, content: string): string {
    return createHash('sha256').update(`${relativePath}\n${content}`).digest('hex');
  }
}