import Database from 'better-sqlite3';
import { initializeMemoryStoreSchema, readSchemaVersion } from '../../infrastructure/database/migrations/0001_memory_store';
import { initializeKnowledgeObjectSchema } from '../../infrastructure/database/migrations/0002_knowledge_objects';

export class SchemaMigrationService {
  constructor(private readonly db: Database.Database) {}

  public ensureCurrentSchema(): string {
    const currentVersion = this.safeReadVersion();

    if (!currentVersion || currentVersion < '1.1.0') {
      initializeMemoryStoreSchema(this.db);
    }

    const versionAfter0001 = this.safeReadVersion();
    if (versionAfter0001 && versionAfter0001 < '2.0.0') {
      initializeKnowledgeObjectSchema(this.db);
    }

    return this.safeReadVersion() ?? '1.0.0';
  }

  private safeReadVersion(): string | null {
    try {
      return readSchemaVersion(this.db);
    } catch {
      return null;
    }
  }

  public currentVersion(): string | null {
    return readSchemaVersion(this.db);
  }
}
