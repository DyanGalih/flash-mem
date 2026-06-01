import { describe, expect, it } from 'vitest';
import { ExportManifestSchema } from '../../src/domain/entities/ExportManifest';
import { MarkdownExportFormatter } from '../../src/infrastructure/markdown/MarkdownExportFormatter';

describe('MarkdownExportFormatter', () => {
  it('renders concise project-summary content without entry content quoting', () => {
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

    const overview = {
      projectSummary: {
        projectId: 'project-1',
        projectName: 'flash-mem',
        purpose: 'Store durable memory.',
        techStack: 'TypeScript + SQLite',
        architectureStyle: 'Layered architecture',
        importantConventions: 'Search memory first',
        knownConstraints: 'Local-only storage',
        securitySensitiveAreas: 'Secrets in markdown',
        lastUpdatedAt: 1_700_000_000_000
      },
      categoryBreakdown: [
        { category: 'decision', count: 3 }
      ],
      highConfidenceIndex: [
        { title: 'Use SQLite', category: 'decision', confidence: 95 }
      ]
    };

    const output = formatter.formatSectionDocument(manifest, manifest.sections[0], [{
      id: 'project-summary-overview',
      title: 'Project Summary Overview',
      content: JSON.stringify(overview),
      category: 'project-summary',
      summary: null,
      confidence: 100,
      tags: [],
      relatedFiles: [],
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      sourceDocumentPath: null,
      relationships: []
    }], {
      fileName: 'project-summary.md',
      dateKey: '2023-11-14',
      compact: true
    });

    expect(output).toContain('---');
    expect(output).toContain('title: "Project Summary - 2023-11-14"');
    expect(output).toContain('section: "project-summary"');
    expect(output).toContain('file_name: "project-summary.md"');
    expect(output).toContain('# flash-mem Backup Summary - 2023-11-14');
    expect(output).toContain('## Project Metadata');
    expect(output).toContain('| decision | 3 |');
    expect(output).toContain('- Use SQLite (decision)');
    expect(output).not.toContain('> Store memory locally.');
  });

  it('omits verbose metadata in compact section mode', () => {
    const formatter = new MarkdownExportFormatter();
    const manifest = ExportManifestSchema.parse({
      id: 'manifest-2',
      projectId: 'project-1',
      projectName: 'flash-mem',
      rootPath: '/workspace/flash-mem',
      exportRoot: '/workspace/flash-mem/.flash-mem/exports',
      generatedAt: 1_700_000_000_000,
      totalEntries: 1,
      sections: [
        { key: 'decisions', fileName: 'decisions.md', title: 'Decisions', entryCount: 1 }
      ]
    });

    const output = formatter.formatSectionDocument(manifest, manifest.sections[0], [{
      id: '12345678-1234-1234-1234-1234567890ab',
      title: 'Use SQLite',
      content: 'Store memory locally.',
      category: 'decision',
      summary: null,
      confidence: 90,
      tags: [],
      relatedFiles: [],
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      sourceDocumentPath: null,
      sourceDocumentChecksum: 'abc123',
      sourceDocumentLastIndexedAt: 1_700_000_000_100,
      relationships: []
    }], {
      fileName: '2023-11-14/decisions.md',
      dateKey: '2023-11-14',
      compact: true
    });

    expect(output).toContain('- ID: 12345678-1234-1234-1234-1234567890ab');
    expect(output).toContain('- Display ID: 12345678');
    expect(output).not.toContain('- Source checksum:');
    expect(output).not.toContain('- Source last indexed:');
    expect(output).not.toContain('- Source: not recorded');
    expect(output).not.toContain('- Related Files: none');
    expect(output).not.toContain('- Tags: none');
  });
});
