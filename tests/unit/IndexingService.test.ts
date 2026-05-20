import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { SourceDocumentRepository } from '../../src/infrastructure/database/repositories/SourceDocumentRepository';
import { IndexingRunRepository } from '../../src/infrastructure/database/repositories/IndexingRunRepository';
import { MemoryEntryService } from '../../src/application/services/MemoryEntryService';
import { IndexingService } from '../../src/application/services/IndexingService';
import { MemorySearchService } from '../../src/application/services/MemorySearchService';

describe('IndexingService', () => {
  let db: any;
  const testDbFile = path.resolve(__dirname, 'indexing-workspace', 'flashmem.sqlite');

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

  it('indexes sources once and avoids duplicate memory entries on repeated runs', () => {
    const project = new ProjectRepository(db).upsertByRootPath(path.dirname(testDbFile), 'indexing-workspace');
    const service = new IndexingService(
      db,
      new ProjectRepository(db),
      new SourceDocumentRepository(db),
      new IndexingRunRepository(db),
      new MemoryEntryService(db),
      new SchemaMigrationService(db)
    );
    const search = new MemorySearchService(db);

    const sources = [{
      path: 'docs/memory/sqlite.md',
      checksum: 'abc123',
      title: 'SQLite memory',
      content: 'Store memory locally',
      entryType: 'note',
      tags: ['sqlite']
    }];

    const firstRun = service.indexSources(project.id, sources);
    const secondRun = service.indexSources(project.id, sources);

    expect(firstRun.length).toBe(1);
    expect(secondRun.length).toBe(1);
    expect(search.search(project.id, 'sqlite').length).toBe(1);
  });

  it('redacts secrets and ignores excluded source files during indexing', () => {
    const root = path.dirname(testDbFile);
    fs.writeFileSync(path.join(root, '.gitignore'), 'docs/private.md\n');
    const project = new ProjectRepository(db).upsertByRootPath(root, 'indexing-workspace');
    const service = new IndexingService(
      db,
      new ProjectRepository(db),
      new SourceDocumentRepository(db),
      new IndexingRunRepository(db),
      new MemoryEntryService(db),
      new SchemaMigrationService(db)
    );
    const search = new MemorySearchService(db);

    const sources = [
      {
        path: 'docs/private.md',
        checksum: 'ignored',
        title: 'Private',
        content: 'This should not be stored',
        entryType: 'note',
        tags: ['ignore-me']
      },
      {
        path: 'docs/public.md',
        checksum: 'secret-1',
        title: 'API key inventory',
        content: 'api_key=YOUR_API_KEY\n-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
        entryType: 'note',
        tags: ['secret']
      }
    ];

    const result = service.indexSources(project.id, sources);
    expect(result.length).toBe(1);

    const matches = search.search(project.id, 'REDACTED_SECRET');
    expect(matches).toHaveLength(1);
    expect(matches[0].content).toContain('[REDACTED_SECRET]');
    expect(matches[0].title).toBe('API key inventory');
  });

  it('transactionally rebuilds the index by removing stale entries and adding new ones', () => {
    const project = new ProjectRepository(db).upsertByRootPath(path.dirname(testDbFile), 'indexing-workspace');
    const service = new IndexingService(
      db,
      new ProjectRepository(db),
      new SourceDocumentRepository(db),
      new IndexingRunRepository(db),
      new MemoryEntryService(db),
      new SchemaMigrationService(db)
    );
    const search = new MemorySearchService(db);

    // Initial index
    service.indexSources(project.id, [
      {
        path: 'docs/first.md',
        checksum: 'checksum1',
        title: 'First File',
        content: 'Content from first file',
        entryType: 'decision',
        tags: ['decision']
      }
    ]);

    expect(search.search(project.id, 'First').length).toBe(1);

    // Rebuild index with different sources
    service.rebuildIndex(project.id, [
      {
        path: 'docs/second.md',
        checksum: 'checksum2',
        title: 'Second File',
        content: 'Content from second file',
        entryType: 'decision',
        tags: ['decision']
      }
    ]);

    // The old file should be gone, and the new file should be indexed
    expect(search.search(project.id, 'First').length).toBe(0);
    expect(search.search(project.id, 'Second').length).toBe(1);
  });
});
