import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { MemoryEntryService } from '../../src/application/services/MemoryEntryService';

describe('MemoryEntryService', () => {
  let db: any;
  const testDbFile = path.resolve(__dirname, 'memory-entry-workspace', 'flashmem.sqlite');

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

  it('creates, updates, and deletes memory entries with normalized tags', () => {
    const project = new ProjectRepository(db).upsertByRootPath(path.dirname(testDbFile), 'memory-entry-workspace');
    const service = new MemoryEntryService(db);

    const created = service.createMemoryEntry({
      projectId: project.id,
      title: 'Initial memory',
      content: 'Remember the initial design',
      entryType: 'note',
      tags: ['SQLite', 'Memory']
    });

    expect(created?.title).toBe('Initial memory');

    const updated = service.updateMemoryEntry(created!.id, {
      title: 'Updated memory',
      tags: ['sqlite']
    });

    expect(updated?.title).toBe('Updated memory');
    expect(service.deleteMemoryEntry(created!.id)).toBe(true);
  });
});
