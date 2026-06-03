import { createHash } from 'node:crypto';
import * as path from 'path';
import { IndexSourceInput, IndexingResult, IndexingService } from './IndexingService';
import { IProjectRepository } from '../../domain/repositories/interfaces';
import { IndexingInputGuard, SafetyWarning } from '../../infrastructure/safety/IndexingInputGuard';
import { PathSanitizer } from '../../infrastructure/safety/PathSanitizer';

export interface MarkdownArtifactIngestionInput {
  artifactPath: string;
  content: string;
  source?: string;
}

export interface MarkdownArtifactIngestionResult {
  workspaceRoot: string;
  projectId: string;
  projectName: string;
  entryCount: number;
  sourceCount: number;
  sources: string[];
  warnings: SafetyWarning[];
  results: IndexingResult['results'];
}

export class MarkdownArtifactIngestionService {
  private readonly indexingInputGuard = new IndexingInputGuard();

  constructor(
    private readonly projectRepository: IProjectRepository,
    private readonly indexingService: IndexingService
  ) {}

  public ingestMarkdownArtifacts(workspaceRoot: string, artifacts: MarkdownArtifactIngestionInput[]): MarkdownArtifactIngestionResult | null {
    const resolvedRoot = PathSanitizer.resolveRoot(workspaceRoot);
    const project = this.projectRepository.upsertByRootPath(resolvedRoot, path.basename(resolvedRoot));
    const sources = artifacts
      .map((artifact) => this.toIndexSource(resolvedRoot, artifact))
      .filter((source): source is IndexSourceInput => source !== null);

    if (sources.length === 0) {
      return null;
    }

    const indexingResult = this.indexingService.indexSources(project.id, sources);

    return {
      workspaceRoot: resolvedRoot,
      projectId: project.id,
      projectName: project.name,
      entryCount: indexingResult.results.length,
      sourceCount: sources.length,
      sources: sources.map((source) => source.path),
      warnings: indexingResult.warnings,
      results: indexingResult.results
    };
  }

  private toIndexSource(workspaceRoot: string, artifact: MarkdownArtifactIngestionInput): IndexSourceInput | null {
    const relativePath = this.indexingInputGuard.normalizeSourcePath(workspaceRoot, artifact.artifactPath);
    const content = artifact.content.trim();
    if (content.length === 0) {
      return null;
    }

    const category = this.inferCategory(relativePath);

    return {
      path: relativePath,
      checksum: createHash('sha256').update(content).digest('hex'),
      title: this.extractTitle(content, relativePath),
      content,
      category,
      source: artifact.source ?? 'file',
      tags: [category]
    };
  }

  private extractTitle(content: string, relativePath: string): string {
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('# ')) {
        return trimmed.slice(2).trim();
      }
    }

    return path.basename(relativePath, path.extname(relativePath));
  }

  private inferCategory(relativePath: string): IndexSourceInput['category'] {
    if (relativePath.includes('decision')) return 'decision';
    if (relativePath.includes('pattern')) return 'pattern';
    if (relativePath.includes('bug') || relativePath.includes('fix')) return 'bug_fix';
    if (relativePath.includes('security')) return 'security_note';
    if (relativePath.includes('convention') || relativePath.includes('style')) return 'convention';
    if (relativePath.includes('architecture')) return 'architecture';
    return 'project';
  }
}
