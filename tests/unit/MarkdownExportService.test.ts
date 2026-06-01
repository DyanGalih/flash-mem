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
    const projectSummaryRepo = new ProjectSummaryRepository(db);
    const project = projectRepo.upsertByRootPath(testWorkspace, 'markdown-export-workspace');
    projectSummaryRepo.upsert(project.id, {
      projectName: 'markdown-export-workspace',
      purpose: 'Keep memory exports concise and restore-safe.',
      techStack: 'TypeScript, SQLite',
      architectureStyle: 'Layered services',
      importantConventions: 'Memory-first workflow',
      knownConstraints: 'Local file system only',
      securitySensitiveAreas: 'Secrets in content'
    });
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
    const createdEntry = memory.createMemoryEntry({
      projectId: project.id,
      title: 'Use SQLite again',
      content: 'Another decision on the same export date',
      category: 'decision',
      source: 'test',
      tags: ['decision']
    });

    const exportRoot = path.join(testWorkspace, '.flash-mem', 'exports');
    fs.ensureDirSync(exportRoot);
    fs.writeFileSync(path.join(exportRoot, 'keep.txt'), 'preserve me');

    const result = await new MarkdownExportService(
      new ProjectRepository(db),
      projectSummaryRepo,
      new MemoryEntryRepository(db),
      new TagRepository(db),
      new RelationshipRepository(db),
      new SourceDocumentRepository(db),
      new SchemaMigrationService(db)
    ).exportWorkspace(testWorkspace);

    const exportDateKey = new Date(createdEntry!.createdAt).toISOString().slice(0, 10);

    expect(result.files.map((file) => file.fileName)).toEqual([
      `${exportDateKey}/bug-fixes.md`,
      `${exportDateKey}/conventions.md`,
      `${exportDateKey}/decisions.md`,
      `${exportDateKey}/patterns.md`,
      `${exportDateKey}/security-notes.md`,
      'project-summary.md'
    ]);

    expect(fs.existsSync(path.join(exportRoot, 'keep.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(exportRoot, exportDateKey, 'decisions.md'), 'utf8')).toContain('[REDACTED_SECRET]');
    expect(fs.readFileSync(path.join(exportRoot, 'project-summary.md'), 'utf8')).toContain('## Category Breakdown');
    expect(result.skippedFiles).toBe(0);
    expect(result.prunedDirectories).toEqual([]);
  });

  it('keeps project-summary as one file and supports incremental skip + pruning', async () => {
    const projectRepo = new ProjectRepository(db);
    const projectSummaryRepo = new ProjectSummaryRepository(db);
    const project = projectRepo.upsertByRootPath(testWorkspace, 'markdown-export-workspace');
    const exportRoot = path.join(testWorkspace, '.flash-mem', 'exports');
    const memory = new MemoryEntryService(
      projectRepo,
      new MemoryEntryRepository(db),
      new TagRepository(db),
      new RelationshipRepository(db),
      new SourceDocumentRepository(db),
      new SqliteTransactionRunner(db)
    );

    for (let index = 0; index < 21; index += 1) {
      memory.createMemoryEntry({
        projectId: project.id,
        title: `Decision entry ${index}`,
        content: `Decision content ${index}`,
        category: 'decision',
        source: 'test',
        tags: ['decision']
      });
    }

    const firstResult = await new MarkdownExportService(
      new ProjectRepository(db),
      projectSummaryRepo,
      new MemoryEntryRepository(db),
      new TagRepository(db),
      new RelationshipRepository(db),
      new SourceDocumentRepository(db),
      new SchemaMigrationService(db)
    ).exportWorkspace(testWorkspace);

    const exportDateKey = new Date(project.createdAt).toISOString().slice(0, 10);
    const decisionFiles = firstResult.files
      .map((file) => file.fileName)
      .filter((fileName) => fileName.startsWith(`${exportDateKey}/decisions`));

    expect(decisionFiles).toEqual([
      `${exportDateKey}/decisions.part-01.md`,
      `${exportDateKey}/decisions.part-02.md`
    ]);
    expect(fs.existsSync(path.join(exportRoot, 'project-summary.md'))).toBe(true);

    fs.ensureDirSync(path.join(exportRoot, '2001-01-01'));
    const secondResult = await new MarkdownExportService(
      new ProjectRepository(db),
      projectSummaryRepo,
      new MemoryEntryRepository(db),
      new TagRepository(db),
      new RelationshipRepository(db),
      new SourceDocumentRepository(db),
      new SchemaMigrationService(db)
    ).exportWorkspace(testWorkspace);

    expect(secondResult.skippedFiles).toBe(firstResult.files.length);
    expect(secondResult.prunedDirectories).toContain('2001-01-01');
  });
});
