import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';

describe('SchemaMigrationService', () => {
  let db: any;
  const testDbFile = path.resolve(__dirname, 'schema-migration-workspace', 'flashmem.sqlite');

  beforeEach(() => {
    fs.removeSync(path.dirname(testDbFile));
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    fs.removeSync(path.dirname(testDbFile));
  });

  it('ensures the current schema version is stored and readable', () => {
    db = createDatabaseConnection(testDbFile);
    const service = new SchemaMigrationService(db);

    expect(service.ensureCurrentSchema()).toBe('1.0.0');
    expect(service.currentVersion()).toBe('1.0.0');
  });
});
