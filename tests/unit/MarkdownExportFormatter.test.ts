import { describe, it, expect } from 'vitest';
import { MarkdownExportFormatter } from '../../src/infrastructure/markdown/MarkdownExportFormatter';
import { ExportManifestSchema } from '../../src/domain/entities/ExportManifest';

describe('MarkdownExportFormatter', () => {
  it('writes frontmatter and readable markdown for exported sections', () => {
    const formatter = new MarkdownExportFormatter();
    const manifest = ExportManifestSchema.parse({
      id: 'manifest-1',
      projectId: 'project-1',
      projectName: 'flash-mem',
      rootPath: '/workspace/flash-mem',
      exportRoot: '/workspace/flash-mem/.flash-mem/exports',
      generatedAt: 1_700_000_000_000,
      totalEntries: 1,
      sections: [
        { key: 'project-summary', fileName: 'project-summary.md', title: 'Project Summary', entryCount: 1 }
      ]
    });

    const output = formatter.formatSectionDocument(manifest, manifest.sections[0], [{
      id: 'entry-1',
      title: 'Use SQLite',
      content: 'Store memory locally.',
      category: 'decision',
      tags: ['sqlite', 'memory'],
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      sourceDocumentPath: 'docs/memory/sqlite.md',
      relationships: [{
        id: 'rel-1',
        projectId: 'project-1',
        sourceEntryId: 'entry-1',
        targetEntryId: 'entry-2',
        relationshipType: 'references',
        createdAt: 1_700_000_000_100
      }]
    }]);

    expect(output).toContain('---');
    expect(output).toContain('title: "Project Summary"');
    expect(output).toContain('section: "project-summary"');
    expect(output).toContain('# flash-mem Backup Summary');
    expect(output).toContain('### Use SQLite');
    expect(output).toContain('> Store memory locally.');
    expect(output).toContain('- Relationships:');
  });
});
