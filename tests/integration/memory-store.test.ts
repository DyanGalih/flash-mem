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
import { IndexingRunRepository } from '../../src/infrastructure/database/repositories/IndexingRunRepository';
import { SqliteTransactionRunner } from '../../src/infrastructure/database/SqliteTransactionRunner';
import { MemoryEntryService } from '../../src/application/services/MemoryEntryService';
import { MemorySearchService } from '../../src/application/services/MemorySearchService';
import { IndexingService } from '../../src/application/services/IndexingService';

describe('Memory Store Integration', () => {
  let db: any;
  const testDbFile = path.resolve(__dirname, 'memory-store-workspace', 'flashmem.sqlite');

  beforeEach(() => {
    fs.removeSync(path.dirname(testDbFile));
    db = createDatabaseConnection(testDbFile);
    new SchemaMigrationService(db).ensureCurrentSchema();
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    fs.removeSync(path.dirname(testDbFile));
  });

  it('supports create, search, and indexing flows end to end', () => {
    const projectRepo = new ProjectRepository(db);
    const memoryEntryRepo = new MemoryEntryRepository(db);
    const tagRepo = new TagRepository(db);
    const relationshipRepo = new RelationshipRepository(db);
    const sourceDocumentRepo = new SourceDocumentRepository(db);
    const indexingRunRepo = new IndexingRunRepository(db);
    const transactionRunner = new SqliteTransactionRunner(db);
    const schemaMigrationService = new SchemaMigrationService(db);

    const project = projectRepo.upsertByRootPath(path.dirname(testDbFile), 'memory-store-workspace');
    const memoryEntries = new MemoryEntryService(
      projectRepo,
      memoryEntryRepo,
      tagRepo,
      relationshipRepo,
      sourceDocumentRepo,
      transactionRunner
    );
    const search = new MemorySearchService(memoryEntryRepo);
    const indexing = new IndexingService(
      projectRepo,
      sourceDocumentRepo,
      indexingRunRepo,
      memoryEntries,
      schemaMigrationService,
      transactionRunner
    );

    const created = memoryEntries.createMemoryEntry({
      projectId: project.id,
      title: 'Store memory',
      content: 'SQLite-backed memory store',
      category: 'project',
      source: 'test',
      tags: ['sqlite', 'memory']
    });

    expect(search.search({ projectId: project.id, query: 'memory' }).results[0].id).toBe(created?.id);

    const { results } = indexing.indexSources(project.id, [{
      path: 'docs/memory/overview.md',
      checksum: 'checksum-1',
      title: 'Overview',
      content: 'Store engineering memory',
      category: 'project',
      tags: ['docs']
    }]);

    expect(results.length).toBe(1);
    expect(search.search({ projectId: project.id, query: 'docs' }).results.length).toBe(1);
  });
});
