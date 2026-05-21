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
import { SqliteTransactionRunner } from '../../src/infrastructure/database/SqliteTransactionRunner';
import { MemoryEntryService } from '../../src/application/services/MemoryEntryService';
import { MemorySearchService } from '../../src/application/services/MemorySearchService';

describe('MemorySearchService', () => {
  let db: any;
  let entryService: MemoryEntryService;
  let searchService: MemorySearchService;
  let projectRepo: ProjectRepository;
  const testDbFile = path.resolve(__dirname, 'memory-search-workspace', 'flashmem.sqlite');

  beforeEach(() => {
    fs.removeSync(path.dirname(testDbFile));
    db = createDatabaseConnection(testDbFile);
    new SchemaMigrationService(db).ensureCurrentSchema();

    projectRepo = new ProjectRepository(db);
    const memoryEntryRepo = new MemoryEntryRepository(db);
    const tagRepo = new TagRepository(db);
    const relationshipRepo = new RelationshipRepository(db);
    const sourceDocumentRepo = new SourceDocumentRepository(db);
    const transactionRunner = new SqliteTransactionRunner(db);

    entryService = new MemoryEntryService(
      projectRepo,
      memoryEntryRepo,
      tagRepo,
      relationshipRepo,
      sourceDocumentRepo,
      transactionRunner
    );

    searchService = new MemorySearchService(memoryEntryRepo);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    fs.removeSync(path.dirname(testDbFile));
  });

  it('returns ranked search results by content and tag', () => {
    const project = projectRepo.upsertByRootPath(path.dirname(testDbFile), 'memory-search-workspace');

    entryService.createMemoryEntry({
      projectId: project.id,
      title: 'SQLite memory store',
      content: 'Store engineering knowledge in SQLite',
      category: 'note',
      source: 'test',
      tags: ['sqlite', 'memory']
    });

    const results = searchService.search(project.id, 'sqlite');
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('SQLite memory store');
    expect(results[0].tags).toContain('sqlite');
  });

  it('returns an empty array for blank search input', () => {
    expect(searchService.search('project-id', '   ')).toEqual([]);
  });
});
