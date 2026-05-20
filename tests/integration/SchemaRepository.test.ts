import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { SchemaRepository } from '../../src/infrastructure/database/repositories/SchemaRepository';

describe('SchemaRepository Integration', () => {
  let db: any;
  let schemaRepo: SchemaRepository;
  const testDbFile = path.resolve(__dirname, 'test-workspace', 'flashmem.sqlite');

  beforeEach(() => {
    // Ensure parent dir of test db is clean
    const parentDir = path.dirname(testDbFile);
    fs.removeSync(parentDir);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    fs.removeSync(path.dirname(testDbFile));
  });

  it('should successfully bootstrap a new database and verify tables exist', () => {
    db = createDatabaseConnection(testDbFile);
    schemaRepo = new SchemaRepository(db);

    // Schema should not exist yet
    expect(schemaRepo.verifyTablesExist()).toBe(false);

    // Initialize
    schemaRepo.initializeSchema();

    // Verification should now succeed
    expect(schemaRepo.verifyTablesExist()).toBe(true);
    expect(schemaRepo.getSchemaVersion()).toBe('1.0.0');

    // Verify individual tables exist and have expected columns
    const columns = db.prepare('PRAGMA table_info(entries)').all();
    const colNames = columns.map((c: any) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('hash');
    expect(colNames).toContain('type');
    expect(colNames).toContain('title');
    expect(colNames).toContain('content');
    expect(colNames).toContain('path');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('updated_at');
  });

  it('should be idempotent and not fail when run repeatedly', () => {
    db = createDatabaseConnection(testDbFile);
    schemaRepo = new SchemaRepository(db);

    schemaRepo.initializeSchema();
    expect(schemaRepo.verifyTablesExist()).toBe(true);
    expect(schemaRepo.getSchemaVersion()).toBe('1.0.0');

    // Re-running schema init should not crash or throw errors
    expect(() => schemaRepo.initializeSchema()).not.toThrow();
    expect(schemaRepo.verifyTablesExist()).toBe(true);
    expect(schemaRepo.getSchemaVersion()).toBe('1.0.0');
  });
});
