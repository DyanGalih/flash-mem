import Database from 'better-sqlite3';
import { initializeMemoryStoreSchema, isMemoryStoreInitialized, readSchemaVersion } from '../migrations/0001_memory_store';

export class SchemaRepository {
  constructor(private readonly db: Database.Database) {}

  public initializeSchema(): void {
    initializeMemoryStoreSchema(this.db);
  }

  public verifyTablesExist(): boolean {
    return isMemoryStoreInitialized(this.db);
  }

  public getSchemaVersion(): string | null {
    return readSchemaVersion(this.db);
  }
}
