import * as path from 'path';
import {
  ARTIFACT_MEMORY_SOURCE_TYPES,
  ArtifactMemoryCandidate,
  ArtifactMemorySourceType,
  ArtifactMemorySourceTypeSchema
} from '../../domain/entities/ArtifactMemoryCapture';
import { MemoryEntryService } from './MemoryEntryService';

const SOURCE_TYPE_CATEGORY_MAP: Record<ArtifactMemorySourceType, ArtifactMemoryCandidate['category']> = {
  constitution: 'architecture',
  spec: 'architecture',
  plan: 'decision',
  tasks: 'convention',
  architecture_review: 'architecture',
  security_review: 'security_note',
  implementation_notes: 'pattern',
  validation_report: 'bug_fix',
  markdown_backup: 'project',
  custom_markdown: 'decision'
};

export class ArtifactMemoryExtractionService {
  public inferSourceType(artifactPath: string, sourceType?: ArtifactMemorySourceType): ArtifactMemorySourceType {
    if (sourceType) {
      return ArtifactMemorySourceTypeSchema.parse(sourceType);
    }

    const name = path.basename(artifactPath).toLowerCase();
    if (name.includes('constitution') || name.includes('architecture')) {
      return 'constitution';
    }
    if (name.includes('spec')) {
      return 'spec';
    }
    if (name.includes('plan')) {
      return 'plan';
    }
    if (name.includes('task')) {
      return 'tasks';
    }
    if (name.includes('security')) {
      return 'security_review';
    }
    if (name.includes('validation')) {
      return 'validation_report';
    }
    if (name.includes('note')) {
      return 'implementation_notes';
    }
    if (name.includes('backup')) {
      return 'markdown_backup';
    }

    return 'custom_markdown';
  }

  public extractCandidates(content: string, sourceType: ArtifactMemorySourceType, artifactPath: string): ArtifactMemoryCandidate[] {
    const trimmed = content.trim();
    if (!trimmed) {
      return [];
    }

    const blocks = this.splitBlocks(trimmed);
    const candidates = blocks
      .map((block, index) => this.toCandidate(block.title || this.defaultTitle(artifactPath, sourceType, index), block.body, sourceType, artifactPath))
      .filter((candidate): candidate is ArtifactMemoryCandidate => candidate !== null);

    if (candidates.length === 0) {
      const fallback = this.toCandidate(this.defaultTitle(artifactPath, sourceType, 0), trimmed, sourceType, artifactPath);
      if (fallback) {
        candidates.push(fallback);
      }
    }

    return candidates.slice(0, 10);
  }

  private splitBlocks(content: string): Array<{ title: string; body: string }> {
    const lines = content.split(/\r?\n/);
    const blocks: Array<{ title: string; body: string }> = [];
    let currentTitle = '';
    let currentLines: string[] = [];

    const flush = () => {
      const body = currentLines.join('\n').trim();
      if (body.length > 0) {
        blocks.push({ title: currentTitle, body });
      }
      currentLines = [];
    };

    for (const line of lines) {
      const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
      if (headingMatch) {
        flush();
        currentTitle = headingMatch[1].trim();
        continue;
      }

      if (line.trim().startsWith('<!--')) {
        continue;
      }

      currentLines.push(line);
    }

    flush();

    return blocks;
  }

  private toCandidate(title: string, body: string, sourceType: ArtifactMemorySourceType, artifactPath: string): ArtifactMemoryCandidate | null {
    const normalizedBody = body.trim().replace(/\n{3,}/g, '\n\n');
    const meaningfulBody = normalizedBody
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line !== '---')
      .join('\n')
      .trim();

    if (meaningfulBody.length === 0) {
      return null;
    }

    const category = this.inferCategory(`${title}\n${meaningfulBody}`, sourceType);
    const summary = MemoryEntryService.extractSummary(meaningfulBody);
    const confidence = this.inferConfidence(meaningfulBody, sourceType, title);

    return {
      title: title.trim(),
      content: meaningfulBody,
      category,
      confidence,
      summary: summary.length > 0 ? summary : undefined,
      sourceType,
      artifactPath
    };
  }

  private defaultTitle(artifactPath: string, sourceType: ArtifactMemorySourceType, index: number): string {
    const baseName = path.basename(artifactPath, path.extname(artifactPath)).replace(/[-_]+/g, ' ').trim();
    const fallbackTitle = baseName.length > 0 ? baseName : sourceType.replace(/_/g, ' ');
    return index > 0 ? `${fallbackTitle} ${index + 1}` : fallbackTitle;
  }

  private inferCategory(text: string, sourceType: ArtifactMemorySourceType): ArtifactMemoryCandidate['category'] {
    const lower = text.toLowerCase();
    const keywordMap: Array<[ArtifactMemoryCandidate['category'], RegExp]> = [
      ['security_note', /\b(security|secret|credential|token|password|redact|vulnerability)\b/],
      ['bug_fix', /\b(bug|fix|error|failure|regression|test|assert)\b/],
      ['dependency', /\b(dependency|package|install|version|npm|pnpm|yarn|library)\b/],
      ['constraint', /\b(constraint|must not|cannot|only|limit|forbidden|never)\b/],
      ['integration', /\b(integration|mcp|api|json-rpc|transport|tool)\b/],
      ['convention', /\b(convention|pattern|style|lint|format|standard)\b/],
      ['architecture', /\b(architecture|layer|boundary|service|repository|domain)\b/],
      ['project', /\b(project|workspace|summary|goal|scope)\b/]
    ];

    for (const [category, pattern] of keywordMap) {
      if (pattern.test(lower)) {
        return category;
      }
    }

    return SOURCE_TYPE_CATEGORY_MAP[sourceType];
  }

  private inferConfidence(body: string, sourceType: ArtifactMemorySourceType, title: string): number {
    let confidence = 60;

    if (title.trim().length > 0) {
      confidence += 10;
    }
    if (body.length > 120) {
      confidence += 10;
    }
    if (ARTIFACT_MEMORY_SOURCE_TYPES.includes(sourceType)) {
      confidence += 10;
    }

    return Math.min(95, confidence);
  }
}