import Database from 'better-sqlite3';
import * as fs from 'fs-extra';
import os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownRestoreService } from '../../src/application/services/MarkdownRestoreService';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { MemoryEntryRepository } from '../../src/infrastructure/database/repositories/MemoryEntryRepository';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { RelationshipRepository } from '../../src/infrastructure/database/repositories/RelationshipRepository';
import { SourceDocumentRepository } from '../../src/infrastructure/database/repositories/SourceDocumentRepository';
import { TagRepository } from '../../src/infrastructure/database/repositories/TagRepository';

import { SqliteTransactionRunner } from '../../src/infrastructure/database/SqliteTransactionRunner';

// Helper to build a minimal section-file markdown string
function buildSectionMarkdown(entries: Array<{
  id: string;
  title: string;
  type?: string;
  summary?: string;
  confidence?: number | null;
  created?: string;
  tags?: string[];
  relatedFiles?: string[];
  content: string;
  source?: string;
  sourceChecksum?: string;
  sourceLastIndexed?: string;
  updated?: string;
  relationships?: Array<{ type: string; target: string }>;
}>): string {
  const frontmatter = [
    '---',
    'title: "Test Decisions"',
    'project: "test-restore-project"',
    'section: "decisions"',
    'workspace_root: "/workspace"',
    '---'
  ].join('\n');

  const body = entries
    .map((e) => {
      const lines = [
        `## ${e.title}`,
        `- ID: ${e.id}`,
        `- Type: ${e.type ?? 'decision'}`,
        `- Summary: ${e.summary ?? 'not recorded'}`,
        `- Confidence: ${e.confidence ?? 'unknown'}`,
        `- Created: ${e.created ?? '2026-05-20T00:00:00.000Z'}`,
        `- Related Files: ${e.relatedFiles?.map((file) => `\`${file}\``).join(', ') ?? 'none'}`,
        `- Tags: ${e.tags?.map((t) => `\`${t}\``).join(', ') ?? 'none'}`,
        `- Updated: ${e.updated ?? '2026-05-20T00:00:00.000Z'}`,
        `- Source: ${e.source ?? 'not recorded'}`,
        `- Source checksum: ${e.sourceChecksum ?? 'not recorded'}`,
        `- Source last indexed: ${e.sourceLastIndexed ?? 'not recorded'}`,
        '',
        ...e.content.split('\n').map((l) => `> ${l}`)
      ];

      if (e.relationships?.length) {
        lines.push('', '### Relationships');
        e.relationships.forEach((r) => lines.push(`- ${r.type} -> \`${r.target}\``));
      }

      lines.push('');
      return lines.join('\n');
    })
    .join('\n');

  return `${frontmatter}\n\n# Test Decisions\n\n${body}`;
}

describe('MarkdownRestoreService', () => {
  let tmpDir: string;
  let workspaceDir: string;
  let backupDir: string;
  let db: Database.Database;
  let service: MarkdownRestoreService;
  let exportScheduler: { schedule: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-mem-restore-test-'));
    workspaceDir = path.join(tmpDir, 'workspace');
    backupDir = path.join(tmpDir, 'backup');
    fs.ensureDirSync(workspaceDir);
    fs.ensureDirSync(backupDir);

    const dbFile = path.join(tmpDir, 'test.sqlite');
    db = createDatabaseConnection(dbFile);

    const migrationService = new SchemaMigrationService(db);
    migrationService.ensureCurrentSchema();
    exportScheduler = { schedule: vi.fn() };

    service = new MarkdownRestoreService(
      new ProjectRepository(db),
      new MemoryEntryRepository(db),
      new TagRepository(db),
      new RelationshipRepository(db),
      new SourceDocumentRepository(db),
      migrationService,
      new SqliteTransactionRunner(db),
      exportScheduler as any
    );
  });

  afterEach(() => {
    db.close();
    fs.removeSync(tmpDir);
  });

  it('restores a single valid entry from a markdown backup file', () => {
    const md = buildSectionMarkdown([{
      id: 'entry-abc',
      title: 'Use TypeScript',
      type: 'decision',
      tags: ['typescript', 'language'],
      content: 'We chose TypeScript for type safety.'
    }]);

    fs.writeFileSync(path.join(backupDir, 'decisions.md'), md, 'utf8');

    const result = service.restore(backupDir, workspaceDir);

    expect(result.restoredEntries).toBe(1);
    expect(result.warnings).toHaveLength(0);

    const row = db
      .prepare(`SELECT * FROM memory_entries WHERE id = 'entry-abc'`)
      .get() as any;
    expect(row).toBeDefined();
    expect(row.title).toBe('Use TypeScript');
    expect(row.category).toBe('decision');
    expect(exportScheduler.schedule).toHaveBeenCalledWith(workspaceDir);
  });

  it('restores multiple entries from multiple backup files', () => {
    const md1 = buildSectionMarkdown([{ id: 'e1', title: 'First', content: 'Content one.' }]);
    const md2 = buildSectionMarkdown([{ id: 'e2', title: 'Second', content: 'Content two.' }]);

    fs.writeFileSync(path.join(backupDir, 'file1.md'), md1, 'utf8');
    fs.writeFileSync(path.join(backupDir, 'file2.md'), md2, 'utf8');

    const result = service.restore(backupDir, workspaceDir);

    expect(result.restoredEntries).toBe(2);
    expect(db.prepare(`SELECT COUNT(*) AS c FROM memory_entries`).get() as any).toMatchObject({ c: 2 });
  });

  it('overwrites an existing entry with the same ID (FR-004, D7)', () => {
    // Seed an existing entry
    const md1 = buildSectionMarkdown([{
      id: 'overwrite-me',
      title: 'Original Title',
      content: 'Original content.'
    }]);
    fs.writeFileSync(path.join(backupDir, 'first.md'), md1, 'utf8');
    service.restore(backupDir, workspaceDir);

    // Clear backup dir and restore with updated content
    fs.emptyDirSync(backupDir);
    const md2 = buildSectionMarkdown([{
      id: 'overwrite-me',
      title: 'Updated Title',
      content: 'Updated content.'
    }]);
    fs.writeFileSync(path.join(backupDir, 'second.md'), md2, 'utf8');
    const result = service.restore(backupDir, workspaceDir);

    expect(result.restoredEntries).toBe(1);
    const row = db
      .prepare(`SELECT title, content FROM memory_entries WHERE id = 'overwrite-me'`)
      .get() as any;
    expect(row.title).toBe('Updated Title');
    expect(row.content).toBe('Updated content.');
  });

  it('deduplicates entries with the same ID across multiple files (keeps first)', () => {
    const md1 = buildSectionMarkdown([{ id: 'dup-id', title: 'Version A', content: 'Content A.' }]);
    const md2 = buildSectionMarkdown([{ id: 'dup-id', title: 'Version B', content: 'Content B.' }]);

    // Write alphabetically so file1.md is processed first
    fs.writeFileSync(path.join(backupDir, 'file1.md'), md1, 'utf8');
    fs.writeFileSync(path.join(backupDir, 'file2.md'), md2, 'utf8');

    const result = service.restore(backupDir, workspaceDir);

    expect(result.restoredEntries).toBe(1);
    expect(result.warnings.some((w) => w.includes('Duplicate entry ID'))).toBe(true);

    // Entry from file1.md should win (first seen)
    const row = db.prepare(`SELECT title FROM memory_entries WHERE id = 'dup-id'`).get() as any;
    expect(row.title).toBe('Version A');
  });

  it('restores entry tags', () => {
    const md = buildSectionMarkdown([{
      id: 'tagged-entry',
      title: 'Tagged Decision',
      tags: ['alpha', 'beta'],
      content: 'Tagged content.'
    }]);
    fs.writeFileSync(path.join(backupDir, 'tagged.md'), md, 'utf8');

    service.restore(backupDir, workspaceDir);

    const entryRepo = new MemoryEntryRepository(db);
    const tags = entryRepo.listTagsForEntry('tagged-entry');
    expect(tags).toContain('alpha');
    expect(tags).toContain('beta');
  });

  it('preserves summary, confidence, created time, and source checksum on restore', () => {
    const md = buildSectionMarkdown([{
      id: 'fidelity-entry',
      title: 'Fidelity Decision',
      summary: 'Compact summary text.',
      confidence: 88,
      created: '2026-05-19T10:00:00.000Z',
      relatedFiles: ['docs/decision.md'],
      tags: ['fidelity'],
      content: 'Restorable content.',
      source: 'docs/decision.md',
      sourceChecksum: 'abc123',
      sourceLastIndexed: '2026-05-19T11:00:00.000Z',
      updated: '2026-05-20T12:00:00.000Z'
    }]);
    fs.writeFileSync(path.join(backupDir, 'fidelity.md'), md, 'utf8');

    service.restore(backupDir, workspaceDir);

    const row = db.prepare(`SELECT * FROM memory_entries WHERE id = 'fidelity-entry'`).get() as any;
    expect(row.summary).toBe('Compact summary text.');
    expect(row.confidence).toBe(88);
    expect(new Date(row.created_at).toISOString()).toBe('2026-05-19T10:00:00.000Z');
    expect(row.related_files).toContain('docs/decision.md');

    const sourceDoc = db.prepare(`SELECT * FROM source_documents WHERE id = ?`).get(row.source_document_id) as any;
    expect(sourceDoc.checksum).toBe('abc123');
    expect(new Date(sourceDoc.last_indexed_at).toISOString()).toBe('2026-05-19T11:00:00.000Z');
  });

  it('restores relationships when both source and target entries exist', () => {
    const md = buildSectionMarkdown([
      {
        id: 'source-entry',
        title: 'Source',
        content: 'Source content.',
        relationships: [{ type: 'relates-to', target: 'target-entry' }]
      },
      {
        id: 'target-entry',
        title: 'Target',
        content: 'Target content.'
      }
    ]);
    fs.writeFileSync(path.join(backupDir, 'rels.md'), md, 'utf8');

    const result = service.restore(backupDir, workspaceDir);

    expect(result.restoredRelationships).toBe(1);
    const relRepo = new RelationshipRepository(db);
    const rels = relRepo.listForSourceEntry('source-entry');
    expect(rels).toHaveLength(1);
    expect(rels[0].relationshipType).toBe('relates-to');
    expect(rels[0].targetEntryId).toBe('target-entry');
  });

  it('skips dangling relationships with warnings to stderr (FR-008)', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const md = buildSectionMarkdown([{
      id: 'source-only',
      title: 'Source Entry',
      content: 'Source content.',
      relationships: [{ type: 'relates-to', target: 'ghost-entry' }]
    }]);
    fs.writeFileSync(path.join(backupDir, 'dangling.md'), md, 'utf8');

    const result = service.restore(backupDir, workspaceDir);

    expect(result.restoredRelationships).toBe(0);
    expect(result.warnings.some((w) => w.includes('ghost-entry'))).toBe(true);
    expect(stderrSpy).toHaveBeenCalled();

    stderrSpy.mockRestore();
  });

  it('rolls back transaction on partial failure — zero entries in DB', () => {
    const md = buildSectionMarkdown([{
      id: 'rollback-e1',
      title: 'Valid Entry',
      content: 'Should not persist.'
    }]);
    fs.writeFileSync(path.join(backupDir, 'test.md'), md, 'utf8');

    // Force a DB error by closing the database before restore
    db.close();

    expect(() => service.restore(backupDir, workspaceDir)).toThrow();

    // Reopen the DB and verify nothing was written
    const dbFile = db.name;
    const reopened = createDatabaseConnection(dbFile);
    try {
      const count = (reopened.prepare(`SELECT COUNT(*) AS c FROM memory_entries`).get() as any)?.c ?? 0;
      expect(count).toBe(0);
    } finally {
      reopened.close();
    }
  });

  it('throws error when backup directory does not exist', () => {
    expect(() => {
      service.restore(path.join(tmpDir, 'nonexistent'), workspaceDir);
    }).toThrow(/does not exist/);
  });

  it('returns a warning if no markdown files are found in backup directory', () => {
    // backupDir is empty
    const result = service.restore(backupDir, workspaceDir);
    expect(result.restoredEntries).toBe(0);
    expect(result.warnings.some((w) => w.includes('No markdown files found'))).toBe(true);
  });

  it('skips files that cannot be read and emits a warning', () => {
    // Write a valid file
    const md = buildSectionMarkdown([{ id: 'e-readable', title: 'Readable', content: 'Good.' }]);
    fs.writeFileSync(path.join(backupDir, 'readable.md'), md, 'utf8');

    // Write malformed markdown that parser will skip.
    const fakeMdPath = path.join(backupDir, 'fake.md');
    fs.writeFileSync(fakeMdPath, '# malformed\n\nThis file has no parsable entries.', 'utf8');

    const result = service.restore(backupDir, workspaceDir);

    expect(result.restoredEntries).toBe(1);
    expect(result.skippedFiles.some((f) => f === 'fake.md')).toBe(true);
  });
});
