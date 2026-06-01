import { ExportManifest, ExportSectionMetadata } from '../../domain/entities/ExportManifest';
import { ProjectSummary } from '../../domain/entities/ProjectSummary';
import { Relationship } from '../../domain/entities/Relationship';
import { MarkdownMetadataWriter } from './MarkdownMetadataWriter';

export interface ExportedMemoryEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  summary: string | null;
  confidence: number | null;
  relatedFiles: string[];
  tags: string[];
  createdAt: number;
  updatedAt: number;
  sourceDocumentPath?: string | null;
  sourceDocumentChecksum?: string | null;
  sourceDocumentLastIndexedAt?: number | null;
  relationships: Relationship[];
}

interface ProjectSummaryOverview {
  projectSummary: ProjectSummary | null;
  categoryBreakdown: Array<{ category: string; count: number }>;
  highConfidenceIndex: Array<{ title: string; category: string; confidence: number }>;
}

export class MarkdownExportFormatter {
  private readonly metadataWriter = new MarkdownMetadataWriter();

  public formatSectionDocument(
    manifest: ExportManifest,
    section: ExportSectionMetadata,
    entries: ExportedMemoryEntry[],
    options: { fileName: string; dateKey: string; displayTitle?: string; compact?: boolean }
  ): string {
    const title = options.displayTitle ?? `${section.title} - ${options.dateKey}`;
    const frontmatter = this.metadataWriter.write({
      title,
      project: manifest.projectName,
      project_id: manifest.projectId,
      section: section.key,
      file_name: options.fileName,
      workspace_root: manifest.rootPath,
      export_root: manifest.exportRoot,
      export_date: options.dateKey,
      generated_at: new Date(manifest.generatedAt).toISOString(),
      entry_count: entries.length,
      total_entries: manifest.totalEntries
    });

    const body = section.key === 'project-summary'
      ? this.formatProjectSummary(manifest, entries, options.dateKey)
      : this.formatSectionEntries(section, entries, options.dateKey, options.compact === true);

    return `${frontmatter}${body}`;
  }

  private formatProjectSummary(manifest: ExportManifest, entries: ExportedMemoryEntry[], dateKey: string): string {
    const overview = this.readProjectSummaryOverview(entries[0]?.content);
    const lines: string[] = [
      `# ${manifest.projectName} Backup Summary - ${dateKey}`,
      '',
      '## Overview',
      `- Workspace root: \`${manifest.rootPath}\``,
      `- Export directory: \`${manifest.exportRoot}\``,
      `- Memory entries exported on ${dateKey}: ${manifest.totalEntries}`,
      `- Total memory entries in export: ${manifest.totalEntries}`,
      `- Generated at: ${new Date(manifest.generatedAt).toISOString()}`,
      ''
    ];

    lines.push('## Project Metadata');
    if (!overview?.projectSummary) {
      lines.push('- No project summary is recorded for this workspace.', '');
    } else {
      const summary = overview.projectSummary;
      lines.push(
        `- Project name: ${summary.projectName}`,
        `- Purpose: ${summary.purpose}`,
        `- Tech stack: ${summary.techStack}`,
        `- Architecture style: ${summary.architectureStyle}`,
        `- Conventions: ${summary.importantConventions}`,
        `- Constraints: ${summary.knownConstraints}`,
        `- Security-sensitive areas: ${summary.securitySensitiveAreas}`,
        `- Last updated: ${new Date(summary.lastUpdatedAt).toISOString()}`,
        ''
      );
    }

    lines.push('## Category Breakdown');
    if (!overview || overview.categoryBreakdown.length === 0) {
      lines.push('No categorized entries were available.', '');
    } else {
      lines.push('| Category | Count |', '| --- | ---: |');
      for (const item of overview.categoryBreakdown) {
        lines.push(`| ${item.category} | ${item.count} |`);
      }
      lines.push('');
    }

    lines.push('## High-Confidence Entry Index');
    if (!overview || overview.highConfidenceIndex.length === 0) {
      lines.push('- No entries with confidence >= 90 were found.', '');
    } else {
      for (const item of overview.highConfidenceIndex) {
        lines.push(`- ${item.title} (${item.category})`);
      }
      lines.push('');
    }

    lines.push('');
    return `${lines.join('\n')}\n`;
  }

  private formatSectionEntries(section: ExportSectionMetadata, entries: ExportedMemoryEntry[], dateKey: string, compact: boolean): string {
    const lines: string[] = [
      `# ${section.title} - ${dateKey}`,
      '',
      entries.length === 0
        ? 'No matching memory entries were exported for this section.'
        : `This section contains ${entries.length} exported entr${entries.length === 1 ? 'y' : 'ies'} for ${dateKey}.`,
      ''
    ];

    if (entries.length === 0) {
      return `${lines.join('\n')}\n`;
    }

    for (const entry of entries) {
      const displayId = compact ? entry.id.slice(0, 8) : entry.id;
      lines.push(
        `## ${entry.title}`,
        `- ID: ${entry.id}`,
        `- Display ID: ${displayId}`,
        `- Category: ${entry.category}`,
        `- Summary: ${entry.summary && entry.summary.trim().length > 0 ? entry.summary : 'not recorded'}`,
        `- Confidence: ${entry.confidence !== null && entry.confidence !== undefined ? entry.confidence : 'unknown'}`,
        `- Created: ${new Date(entry.createdAt).toISOString()}`,
        `- Updated: ${new Date(entry.updatedAt).toISOString()}`,
        '',
        this.formatQuotedContent(entry.content)
      );

      if (!compact || entry.relatedFiles.length > 0) {
        lines.splice(lines.length - 2, 0, `- Related Files: ${this.formatRelatedFiles(entry.relatedFiles)}`);
      }
      if (!compact || entry.tags.length > 0) {
        lines.splice(lines.length - 2, 0, `- Tags: ${this.formatTags(entry.tags)}`);
      }
      if (entry.sourceDocumentPath) {
        lines.splice(lines.length - 2, 0, `- Source: \`${entry.sourceDocumentPath}\``);
      } else if (!compact) {
        lines.splice(lines.length - 2, 0, '- Source: not recorded');
      }
      if (!compact) {
        lines.splice(lines.length - 2, 0, `- Source checksum: ${entry.sourceDocumentChecksum ? `\`${entry.sourceDocumentChecksum}\`` : 'not recorded'}`);
        lines.splice(lines.length - 2, 0, `- Source last indexed: ${entry.sourceDocumentLastIndexedAt ? new Date(entry.sourceDocumentLastIndexedAt).toISOString() : 'not recorded'}`);
      }

      if (entry.relationships.length > 0) {
        lines.push('', '### Relationships');
        for (const relationship of entry.relationships) {
          lines.push(`- ${relationship.relationshipType} -> \`${relationship.targetEntryId}\``);
        }
      }

      lines.push('');
    }

    return `${lines.join('\n')}\n`;
  }

  private formatTags(tags: string[]): string {
    return tags.length > 0 ? tags.map((tag) => `\`${tag}\``).join(', ') : 'none';
  }

  private formatRelatedFiles(relatedFiles: string[]): string {
    return relatedFiles.length > 0 ? relatedFiles.map((file) => `\`${file}\``).join(', ') : 'none';
  }

  private formatQuotedContent(content: string): string {
    return content
      .split('\n')
      .map((line) => `> ${line.length > 0 ? line : ''}`)
      .join('\n');
  }

  private readProjectSummaryOverview(raw: string | undefined): ProjectSummaryOverview | null {
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as ProjectSummaryOverview;
      if (!parsed || !Array.isArray(parsed.categoryBreakdown) || !Array.isArray(parsed.highConfidenceIndex)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
}
