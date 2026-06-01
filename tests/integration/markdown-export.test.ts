import * as fs from 'fs-extra';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MarkdownExportService } from '../../src/application/services/MarkdownExportService';
import { MemoryEntryService } from '../../src/application/services/MemoryEntryService';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { MemoryEntryRepository } from '../../src/infrastructure/database/repositories/MemoryEntryRepository';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { ProjectSummaryRepository } from '../../src/infrastructure/database/repositories/ProjectSummaryRepository';
import { RelationshipRepository } from '../../src/infrastructure/database/repositories/RelationshipRepository';
import { SourceDocumentRepository } from '../../src/infrastructure/database/repositories/SourceDocumentRepository';
import { TagRepository } from '../../src/infrastructure/database/repositories/TagRepository';
import { SqliteTransactionRunner } from '../../src/infrastructure/database/SqliteTransactionRunner';

describe('Markdown export integration', () => {
  let db: any;
  let memory: MemoryEntryService;
  let projectRepo: ProjectRepository;
  const testWorkspace = path.resolve(__dirname, 'markdown-export-integration-workspace');
  const dbFile = path.join(testWorkspace, '.flash-mem', 'flashmem.sqlite');

  beforeEach(() => {
    fs.removeSync(testWorkspace);
    db = createDatabaseConnection(dbFile);
    new SchemaMigrationService(db).ensureCurrentSchema();

    projectRepo = new ProjectRepository(db);
    memory = new MemoryEntryService(
      projectRepo,
      new MemoryEntryRepository(db),
      new TagRepository(db),
      new RelationshipRepository(db),
      new SourceDocumentRepository(db),
      new SqliteTransactionRunner(db)
    );
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    fs.removeSync(testWorkspace);
  });

  it('exports the expected markdown files with readable content', async () => {
    const project = projectRepo.upsertByRootPath(testWorkspace, 'markdown-export-integration-workspace');

    memory.createMemoryEntry({
      projectId: project.id,
      title: 'Decision: use SQLite',
      content: 'SQLite keeps the memory local and fast.',
      category: 'decision',
      source: 'test',
      tags: ['decision', 'sqlite']
    });
    memory.createMemoryEntry({
      projectId: project.id,
      title: 'Security note',
      content: 'Private key: -----BEGIN PRIVATE KEY-----abc-----END PRIVATE KEY-----',
      category: 'security_note',
      source: 'test',
      tags: ['security']
    });

    const exportRoot = path.join(testWorkspace, '.flash-mem', 'exports');
    fs.ensureDirSync(exportRoot);
    fs.writeFileSync(path.join(exportRoot, 'unrelated.txt'), 'keep this file');

    const result = await new MarkdownExportService(
      new ProjectRepository(db),
      new ProjectSummaryRepository(db),
      new MemoryEntryRepository(db),
      new TagRepository(db),
      new RelationshipRepository(db),
      new SourceDocumentRepository(db),
      new SchemaMigrationService(db)
    ).exportWorkspace(testWorkspace);

    const exportDateKey = new Date(project.createdAt).toISOString().slice(0, 10);

    expect(result.manifest.totalEntries).toBe(2);
    expect(fs.existsSync(path.join(exportRoot, 'project-summary.md'))).toBe(true);
    expect(fs.existsSync(path.join(exportRoot, exportDateKey, 'decisions.md'))).toBe(true);
    expect(fs.existsSync(path.join(exportRoot, exportDateKey, 'security-notes.md'))).toBe(true);
    expect(fs.existsSync(path.join(exportRoot, 'unrelated.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(exportRoot, exportDateKey, 'security-notes.md'), 'utf8')).toContain('[REDACTED_SECRET]');
  });

  it('exports a representative workspace in under 2 minutes', async () => {
    const project = projectRepo.upsertByRootPath(testWorkspace, 'markdown-export-integration-workspace');

    for (let index = 0; index < 120; index += 1) {
      memory.createMemoryEntry({
        projectId: project.id,
        title: `Decision ${index}`,
        content: `Remember item ${index}`,
        category: index % 2 === 0 ? 'decision' : 'pattern',
        source: 'test',
        tags: index % 2 === 0 ? ['decision'] : ['pattern']
      });
    }

    const startedAt = Date.now();
    await new MarkdownExportService(
      new ProjectRepository(db),
      new ProjectSummaryRepository(db),
      new MemoryEntryRepository(db),
      new TagRepository(db),
      new RelationshipRepository(db),
      new SourceDocumentRepository(db),
      new SchemaMigrationService(db)
    ).exportWorkspace(testWorkspace);
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeLessThan(120_000);
  });
});
