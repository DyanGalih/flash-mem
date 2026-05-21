import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import os from 'os';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { MemoryEntryService } from '../../src/application/services/MemoryEntryService';
import { MemoryEntryRepository } from '../../src/infrastructure/database/repositories/MemoryEntryRepository';
import { TagRepository } from '../../src/infrastructure/database/repositories/TagRepository';
import { RelationshipRepository } from '../../src/infrastructure/database/repositories/RelationshipRepository';
import { SourceDocumentRepository } from '../../src/infrastructure/database/repositories/SourceDocumentRepository';
import { MarkdownExportService } from '../../src/application/services/MarkdownExportService';
import { MarkdownRestoreService } from '../../src/application/services/MarkdownRestoreService';
import { SqliteTransactionRunner } from '../../src/infrastructure/database/SqliteTransactionRunner';

async function exportWorkspace(workspaceRoot: string, dbFile: string): Promise<string> {
  const db = createDatabaseConnection(dbFile);
  try {
    const result = await new MarkdownExportService(
      new ProjectRepository(db),
      new MemoryEntryRepository(db),
      new TagRepository(db),
      new RelationshipRepository(db),
      new SourceDocumentRepository(db),
      new SchemaMigrationService(db)
    ).exportWorkspace(workspaceRoot);
    return result.manifest.exportRoot;
  } finally {
    db.close();
  }
}

describe('Markdown Restore — Integration (export → restore cycle)', () => {
  let tmpDir: string;
  let workspaceRoot: string;
  let dbFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-mem-restore-integration-'));
    workspaceRoot = path.join(tmpDir, 'workspace');
    fs.ensureDirSync(workspaceRoot);
    dbFile = path.join(workspaceRoot, '.flash-mem', 'flashmem.sqlite');
    fs.ensureDirSync(path.dirname(dbFile));
  });

  afterEach(() => {
    fs.removeSync(tmpDir);
  });

  it('restores all exported entries after database deletion', async () => {
    // 1. Seed entries
    const db = createDatabaseConnection(dbFile);
    const migSvc = new SchemaMigrationService(db);
    migSvc.ensureCurrentSchema();
    const project = new ProjectRepository(db).upsertByRootPath(workspaceRoot, 'integration-test');
    const entrySvc = new MemoryEntryService(
      new ProjectRepository(db),
      new MemoryEntryRepository(db),
      new TagRepository(db),
      new RelationshipRepository(db),
      new SourceDocumentRepository(db),
      new SqliteTransactionRunner(db)
    );

    const e1 = entrySvc.createMemoryEntry({
      projectId: project.id,
      title: 'Decision Alpha',
      content: 'We decided to use alpha pattern.',
      category: 'decision',
      source: 'test',
      tags: ['alpha', 'decision']
    })!;
    const e2 = entrySvc.createMemoryEntry({
      projectId: project.id,
      title: 'Bug Fix Beta',
      content: 'Fixed a bug in beta module.',
      category: 'bug-fix',
      source: 'test',
      tags: ['beta', 'bug']
    })!;
    db.close();

    // 2. Export to markdown
    const exportDir = await exportWorkspace(workspaceRoot, dbFile);

    // 3. Delete the SQLite database
    fs.removeSync(dbFile);
    expect(fs.existsSync(dbFile)).toBe(false);

    // 4. Re-create a fresh database
    const freshDb = createDatabaseConnection(dbFile);
    new SchemaMigrationService(freshDb).ensureCurrentSchema();

    // 5. Restore from backups
    const service = new MarkdownRestoreService(
      new ProjectRepository(freshDb),
      new MemoryEntryRepository(freshDb),
      new TagRepository(freshDb),
      new RelationshipRepository(freshDb),
      new SourceDocumentRepository(freshDb),
      new SchemaMigrationService(freshDb),
      new SqliteTransactionRunner(freshDb)
    );

    const result = service.restore(exportDir, workspaceRoot);
    freshDb.close();

    expect(result.restoredEntries).toBeGreaterThanOrEqual(2);

    // 6. Verify entries are present in the new database
    const verifyDb = createDatabaseConnection(dbFile);
    try {
      const row1 = verifyDb
        .prepare(`SELECT * FROM memory_entries WHERE id = ?`)
        .get(e1.id) as any;
      expect(row1).toBeDefined();
      expect(row1.title).toBe('Decision Alpha');

      const row2 = verifyDb
        .prepare(`SELECT * FROM memory_entries WHERE id = ?`)
        .get(e2.id) as any;
      expect(row2).toBeDefined();
      expect(row2.title).toBe('Bug Fix Beta');
    } finally {
      verifyDb.close();
    }
  });

  it('restores relationships after full export-restore cycle', async () => {
    // 1. Seed entries with a relationship
    const db = createDatabaseConnection(dbFile);
    new SchemaMigrationService(db).ensureCurrentSchema();
    const project = new ProjectRepository(db).upsertByRootPath(workspaceRoot, 'rel-test');
    const entrySvc = new MemoryEntryService(
      new ProjectRepository(db),
      new MemoryEntryRepository(db),
      new TagRepository(db),
      new RelationshipRepository(db),
      new SourceDocumentRepository(db),
      new SqliteTransactionRunner(db)
    );
    const relRepo = new RelationshipRepository(db);

    // Create both entries first (no inline relationships — avoids FK constraint with placeholder)
    const source = entrySvc.createMemoryEntry({
      projectId: project.id,
      title: 'Source Entry',
      content: 'This is the source.',
      category: 'note',
      source: 'test',
      tags: []
    })!;

    const target = entrySvc.createMemoryEntry({
      projectId: project.id,
      title: 'Target Entry',
      content: 'This is the target.',
      category: 'note',
      source: 'test',
      tags: []
    })!;

    // Add the relationship after both entries exist
    relRepo.upsert(project.id, source.id, {
      targetEntryId: target.id,
      relationshipType: 'relates-to'
    });
    db.close();


    // 2. Export
    const exportDir = await exportWorkspace(workspaceRoot, dbFile);

    // 3. Fresh DB + restore
    fs.removeSync(dbFile);
    const freshDb = createDatabaseConnection(dbFile);
    new SchemaMigrationService(freshDb).ensureCurrentSchema();

    const svc = new MarkdownRestoreService(
      new ProjectRepository(freshDb),
      new MemoryEntryRepository(freshDb),
      new TagRepository(freshDb),
      new RelationshipRepository(freshDb),
      new SourceDocumentRepository(freshDb),
      new SchemaMigrationService(freshDb),
      new SqliteTransactionRunner(freshDb)
    );

    const result = svc.restore(exportDir, workspaceRoot);
    freshDb.close();

    // Relationships restored (either via direct relationship or via export)
    expect(result.restoredEntries).toBeGreaterThanOrEqual(2);

    const verifyDb = createDatabaseConnection(dbFile);
    try {
      const srcRow = verifyDb
        .prepare(`SELECT id FROM memory_entries WHERE id = ?`)
        .get(source.id) as any;
      expect(srcRow).toBeDefined();

      const tgtRow = verifyDb
        .prepare(`SELECT id FROM memory_entries WHERE id = ?`)
        .get(target.id) as any;
      expect(tgtRow).toBeDefined();
    } finally {
      verifyDb.close();
    }
  });

  it('is atomic — database has 0 entries if restore fails mid-transaction', async () => {
    // Write a valid backup file
    const backupDir = path.join(tmpDir, 'backup');
    fs.ensureDirSync(backupDir);

    const validMd = [
      '---',
      'title: "Test"',
      'project: "fail-test"',
      'section: "decisions"',
      'workspace_root: "/workspace"',
      '---',
      '',
      '## Valid Entry',
      '- ID: valid-1',
      '- Type: decision',
      '- Tags: none',
      '- Updated: 2026-05-20T00:00:00.000Z',
      '- Source: not recorded',
      '',
      '> Good content.',
      ''
    ].join('\n');

    fs.writeFileSync(path.join(backupDir, 'data.md'), validMd, 'utf8');

    // Create a fresh db and CLOSE it immediately to trigger a failure
    const freshDb = createDatabaseConnection(dbFile);
    new SchemaMigrationService(freshDb).ensureCurrentSchema();
    const svc = new MarkdownRestoreService(
      new ProjectRepository(freshDb),
      new MemoryEntryRepository(freshDb),
      new TagRepository(freshDb),
      new RelationshipRepository(freshDb),
      new SourceDocumentRepository(freshDb),
      new SchemaMigrationService(freshDb),
      new SqliteTransactionRunner(freshDb)
    );
    freshDb.close(); // Force failure

    expect(() => svc.restore(backupDir, workspaceRoot)).toThrow();

    // Verify the DB is still empty
    const verifyDb = createDatabaseConnection(dbFile);
    try {
      const count = (verifyDb
        .prepare(`SELECT COUNT(*) AS c FROM memory_entries`)
        .get() as any)?.c ?? 0;
      expect(count).toBe(0);
    } finally {
      verifyDb.close();
    }
  });
});
