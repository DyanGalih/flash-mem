import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { MemoryEntryRepository } from '../../src/infrastructure/database/repositories/MemoryEntryRepository';
import { TagRepository } from '../../src/infrastructure/database/repositories/TagRepository';
import { RelationshipRepository } from '../../src/infrastructure/database/repositories/RelationshipRepository';
import { SourceDocumentRepository } from '../../src/infrastructure/database/repositories/SourceDocumentRepository';
import { MemoryEntryService } from '../../src/application/services/MemoryEntryService';
import { MarkdownExportService } from '../../src/application/services/MarkdownExportService';
import { SqliteTransactionRunner } from '../../src/infrastructure/database/SqliteTransactionRunner';

describe('MarkdownExportService', () => {
  let db: any;
  const testWorkspace = path.resolve(__dirname, 'markdown-export-workspace');
  const dbFile = path.join(testWorkspace, '.flash-mem', 'flashmem.sqlite');

  beforeEach(() => {
    fs.removeSync(testWorkspace);
    db = createDatabaseConnection(dbFile);
    new SchemaMigrationService(db).ensureCurrentSchema();
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    fs.removeSync(testWorkspace);
  });

  it('exports markdown backups without deleting unrelated files', async () => {
    const projectRepo = new ProjectRepository(db);
    const project = projectRepo.upsertByRootPath(testWorkspace, 'markdown-export-workspace');
    const memory = new MemoryEntryService(
      projectRepo,
      new MemoryEntryRepository(db),
      new TagRepository(db),
      new RelationshipRepository(db),
      new SourceDocumentRepository(db),
      new SqliteTransactionRunner(db)
    );
    memory.createMemoryEntry({
      projectId: project.id,
      title: 'Use SQLite',
      content: 'api_key=SECRET_VALUE',
      category: 'decision',
      source: 'test',
      tags: ['decision']
    });

    const exportRoot = path.join(testWorkspace, '.flash-mem', 'exports');
    fs.ensureDirSync(exportRoot);
    fs.writeFileSync(path.join(exportRoot, 'keep.txt'), 'preserve me');

    const result = await new MarkdownExportService(
      new ProjectRepository(db),
      new MemoryEntryRepository(db),
      new TagRepository(db),
      new RelationshipRepository(db),
      new SourceDocumentRepository(db),
      new SchemaMigrationService(db)
    ).exportWorkspace(testWorkspace);

    expect(result.files.map((file) => file.fileName)).toEqual([
      'bug-fixes.md',
      'conventions.md',
      'decisions.md',
      'patterns.md',
      'project-summary.md',
      'security-notes.md'
    ]);

    expect(fs.existsSync(path.join(exportRoot, 'keep.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(exportRoot, 'project-summary.md'), 'utf8')).toContain('[REDACTED_SECRET]');
  });
});
