import { ExportManifest, ExportSectionMetadata } from '../../domain/entities/ExportManifest';
import { MarkdownMetadataWriter } from './MarkdownMetadataWriter';
import { Relationship } from '../../domain/entities/Relationship';

export interface ExportedMemoryEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  updatedAt: number;
  createdAt: number;
  sourceDocumentPath?: string | null;
  relationships: Relationship[];
}

export class MarkdownExportFormatter {
  private readonly metadataWriter = new MarkdownMetadataWriter();

  public formatSectionDocument(manifest: ExportManifest, section: ExportSectionMetadata, entries: ExportedMemoryEntry[]): string {
    const frontmatter = this.metadataWriter.write({
      title: section.title,
      project: manifest.projectName,
      project_id: manifest.projectId,
      section: section.key,
      file_name: section.fileName,
      workspace_root: manifest.rootPath,
      export_root: manifest.exportRoot,
      generated_at: new Date(manifest.generatedAt).toISOString(),
      entry_count: section.entryCount,
      total_entries: manifest.totalEntries
    });

    const body = section.key === 'project-summary'
      ? this.formatProjectSummary(manifest, entries)
      : this.formatSectionEntries(section, entries);

    return `${frontmatter}${body}`;
  }

  private formatProjectSummary(manifest: ExportManifest, entries: ExportedMemoryEntry[]): string {
    const lines: string[] = [
      `# ${manifest.projectName} Backup Summary`,
      '',
      '## Overview',
      `- Workspace root: \`${manifest.rootPath}\``,
      `- Export directory: \`${manifest.exportRoot}\``,
      `- Memory entries exported: ${manifest.totalEntries}`,
      `- Generated at: ${new Date(manifest.generatedAt).toISOString()}`,
      ''
    ];

    if (entries.length === 0) {
      lines.push('No memory entries were available at export time.', '');
      return `${lines.join('\n')}\n`;
    }

    lines.push('## Entries');
    for (const entry of entries) {
      lines.push(
        '',
        `### ${entry.title}`,
        `- ID: ${entry.id}`,
        `- Category: ${entry.category}`,
        `- Tags: ${this.formatTags(entry.tags)}`,
        `- Updated: ${new Date(entry.updatedAt).toISOString()}`,
        `- Source: ${entry.sourceDocumentPath ? `\`${entry.sourceDocumentPath}\`` : 'not recorded'}`,
        '',
        this.formatQuotedContent(entry.content)
      );

      if (entry.relationships.length > 0) {
        lines.push('', '- Relationships:');
        for (const relationship of entry.relationships) {
          lines.push(`  - ${relationship.relationshipType} -> \`${relationship.targetEntryId}\``);
        }
      }
    }

    lines.push('');
    return `${lines.join('\n')}\n`;
  }

  private formatSectionEntries(section: ExportSectionMetadata, entries: ExportedMemoryEntry[]): string {
    const lines: string[] = [
      `# ${section.title}`,
      '',
      entries.length === 0
        ? 'No matching memory entries were exported for this section.'
        : `This section contains ${entries.length} exported entr${entries.length === 1 ? 'y' : 'ies'}.`,
      ''
    ];

    if (entries.length === 0) {
      return `${lines.join('\n')}\n`;
    }

    for (const entry of entries) {
      lines.push(
        `## ${entry.title}`,
        `- ID: ${entry.id}`,
        `- Category: ${entry.category}`,
        `- Tags: ${this.formatTags(entry.tags)}`,
        `- Updated: ${new Date(entry.updatedAt).toISOString()}`,
        `- Source: ${entry.sourceDocumentPath ? `\`${entry.sourceDocumentPath}\`` : 'not recorded'}`,
        '',
        this.formatQuotedContent(entry.content)
      );

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

  private formatQuotedContent(content: string): string {
    return content
      .split('\n')
      .map((line) => `> ${line.length > 0 ? line : ''}`)
      .join('\n');
  }
}
