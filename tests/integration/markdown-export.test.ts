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
      new MemoryEntryRepository(db),
      new TagRepository(db),
      new RelationshipRepository(db),
      new SourceDocumentRepository(db),
      new SchemaMigrationService(db)
    ).exportWorkspace(testWorkspace);

    expect(result.manifest.totalEntries).toBe(2);
    expect(fs.existsSync(path.join(exportRoot, 'project-summary.md'))).toBe(true);
    expect(fs.existsSync(path.join(exportRoot, 'decisions.md'))).toBe(true);
    expect(fs.existsSync(path.join(exportRoot, 'security-notes.md'))).toBe(true);
    expect(fs.existsSync(path.join(exportRoot, 'unrelated.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(exportRoot, 'security-notes.md'), 'utf8')).toContain('[REDACTED_SECRET]');
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
