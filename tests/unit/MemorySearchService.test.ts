import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { MemoryEntryService } from '../../src/application/services/MemoryEntryService';
import { MemorySearchService } from '../../src/application/services/MemorySearchService';

describe('MemorySearchService', () => {
  let db: any;
  const testDbFile = path.resolve(__dirname, 'memory-search-workspace', 'flashmem.sqlite');

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

  it('returns ranked search results by content and tag', () => {
    const project = new ProjectRepository(db).upsertByRootPath(path.dirname(testDbFile), 'memory-search-workspace');
    const entryService = new MemoryEntryService(db);
    const searchService = new MemorySearchService(db);

    entryService.createMemoryEntry({
      projectId: project.id,
      title: 'SQLite memory store',
      content: 'Store engineering knowledge in SQLite',
      entryType: 'note',
      tags: ['sqlite', 'memory']
    });

    const results = searchService.search(project.id, 'sqlite');
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('SQLite memory store');
    expect(results[0].tags).toContain('sqlite');
  });

  it('returns an empty array for blank search input', () => {
    const searchService = new MemorySearchService(db);
    expect(searchService.search('project-id', '   ')).toEqual([]);
  });
});
