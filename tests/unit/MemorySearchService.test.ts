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

    searchService = new MemorySearchService(memoryEntryRepo, tagRepo, projectRepo);
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
      category: 'project',
      source: 'test',
      tags: ['sqlite', 'memory']
    });

    const { results } = searchService.search({ projectId: project.id, query: 'sqlite' });
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('SQLite memory store');
    expect(results[0].tags).toContain('sqlite');
  });

  it('rejects invalid category filter', () => {
    const project = projectRepo.upsertByRootPath(path.dirname(testDbFile), 'memory-search-workspace');
    expect(() => {
      searchService.search({ projectId: project.id, category: 'invalid_category_name' });
    }).toThrow(/Invalid category/);
  });

  it('rejects invalid confidence score bounds', () => {
    const project = projectRepo.upsertByRootPath(path.dirname(testDbFile), 'memory-search-workspace');
    expect(() => {
      searchService.search({ projectId: project.id, minConfidence: 150 });
    }).toThrow(/Confidence score must be between 0 and 100/);

    expect(() => {
      searchService.search({ projectId: project.id, minConfidence: -10 });
    }).toThrow(/Confidence score must be between 0 and 100/);
  });

  it('rejects empty query when no filters are present', () => {
    expect(() => {
      searchService.search({ query: '   ' });
    }).toThrow(/Please provide a search query or at least one filter/);
  });

  it('suggests tags and categories on zero results', () => {
    const project = projectRepo.upsertByRootPath(path.dirname(testDbFile), 'memory-search-workspace');
    entryService.createMemoryEntry({
      projectId: project.id,
      title: 'SQLite memory store',
      content: 'Store engineering knowledge in SQLite',
      category: 'project',
      source: 'test',
      tags: ['sqlite', 'memory']
    });

    const response = searchService.search({ projectId: project.id, query: 'nonexistentkeyword' });
    expect(response.results.length).toBe(0);
    expect(response.suggestions).toBeDefined();
    expect(response.suggestions?.categories).toContain('project');
    expect(response.suggestions?.tags).toContain('sqlite');
  });

  it('prevents path traversal in source filter', () => {
    const project = projectRepo.upsertByRootPath(path.dirname(testDbFile), 'memory-search-workspace');
    expect(() => {
      searchService.search({ projectId: project.id, source: '../../outside.txt' });
    }).toThrow(/Directory traversal detected/);
  });
});
