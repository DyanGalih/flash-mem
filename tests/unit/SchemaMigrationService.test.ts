import * as fs from 'fs-extra';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';

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

    expect(service.ensureCurrentSchema()).toBe('1.1.0');
    expect(service.currentVersion()).toBe('1.1.0');
  });
});
