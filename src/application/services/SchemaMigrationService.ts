import Database from 'better-sqlite3';
import { initializeMemoryStoreSchema, readSchemaVersion } from '../../infrastructure/database/migrations/0001_memory_store';

export class SchemaMigrationService {
  constructor(private readonly db: Database.Database) {}

  public ensureCurrentSchema(): string {
    initializeMemoryStoreSchema(this.db);
    return readSchemaVersion(this.db) ?? '1.0.0';
  }

  public currentVersion(): string | null {
    return readSchemaVersion(this.db);
  }
}
