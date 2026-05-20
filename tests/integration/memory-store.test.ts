import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { SourceDocumentRepository } from '../../src/infrastructure/database/repositories/SourceDocumentRepository';
import { IndexingRunRepository } from '../../src/infrastructure/database/repositories/IndexingRunRepository';
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
    const project = new ProjectRepository(db).upsertByRootPath(path.dirname(testDbFile), 'memory-store-workspace');
    const memoryEntries = new MemoryEntryService(db);
    const search = new MemorySearchService(db);
    const indexing = new IndexingService(
      db,
      new ProjectRepository(db),
      new SourceDocumentRepository(db),
      new IndexingRunRepository(db),
      memoryEntries,
      new SchemaMigrationService(db)
    );

    const created = memoryEntries.createMemoryEntry({
      projectId: project.id,
      title: 'Store memory',
      content: 'SQLite-backed memory store',
      entryType: 'note',
      tags: ['sqlite', 'memory']
    });

    expect(search.search(project.id, 'memory')[0].id).toBe(created?.id);

    const results = indexing.indexSources(project.id, [{
      path: 'docs/memory/overview.md',
      checksum: 'checksum-1',
      title: 'Overview',
      content: 'Store engineering memory',
      entryType: 'note',
      tags: ['docs']
    }]);

    expect(results.length).toBe(1);
    expect(search.search(project.id, 'docs').length).toBe(1);
  });
});
