import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { performance } from 'node:perf_hooks';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { MemorySearchService } from '../../src/application/services/MemorySearchService';
import { MemoryEntryRepository } from '../../src/infrastructure/database/repositories/MemoryEntryRepository';

describe('Search Performance', () => {
  let db: any;
  const testDbFile = path.resolve(__dirname, 'search-performance-workspace', 'flashmem.sqlite');

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

  it('returns relevant results within the expected benchmark window for 10k entries', () => {
    const project = new ProjectRepository(db).upsertByRootPath(path.dirname(testDbFile), 'search-performance-workspace');
    const memoryEntries = db.prepare(`
      INSERT INTO memory_entries (
        id, project_id, title, content, content_hash, category, source, confidence, related_files, source_document_id, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tags = db.prepare(`INSERT INTO tags (id, project_id, name, created_at) VALUES (?, ?, ?, ?)`);
    const entryTags = db.prepare(`INSERT INTO memory_entry_tags (entry_id, tag_id) VALUES (?, ?)`);
 
    const seed = db.transaction(() => {
      const baseTime = Date.now();
      for (let i = 0; i < 10000; i++) {
        const entryId = `entry-${i}`;
        const tagId = `tag-${i}`;
        const title = i === 9999 ? 'Benchmark needle' : `Benchmark entry ${i}`;
        const content = i === 9999 ? 'This entry should match the search needle' : `Filler content ${i}`;
        memoryEntries.run(
          entryId,
          project.id,
          title,
          content,
          `${title}:${content}`,
          'note',
          'file',
          null,
          null,
          null,
          baseTime,
          baseTime,
          null
        );
        tags.run(tagId, project.id, i === 9999 ? 'needle' : `tag-${i}`, baseTime);
        entryTags.run(entryId, tagId);
      }
    });

    seed();

    const search = new MemorySearchService(new MemoryEntryRepository(db));
    const started = performance.now();
    const results = search.search(project.id, 'needle');
    const duration = performance.now() - started;

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toContain('Benchmark needle');
    expect(duration).toBeLessThan(1000);
  });
});
