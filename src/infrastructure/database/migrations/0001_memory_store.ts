import Database from 'better-sqlite3';

export const MEMORY_STORE_SCHEMA_VERSION = '1.0.0';

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db.prepare(
    "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?"
  ).get(tableName) as { name?: string } | undefined;
  return !!row;
}

export function initializeMemoryStoreSchema(db: Database.Database): void {
  const migration = db.transaction(() => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        root_path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        entry_type TEXT NOT NULL,
        source_document_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (source_document_id) REFERENCES source_documents(id) ON DELETE SET NULL
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        UNIQUE (project_id, name)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS memory_entry_tags (
        entry_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        PRIMARY KEY (entry_id, tag_id),
        FOREIGN KEY (entry_id) REFERENCES memory_entries(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS relationships (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        source_entry_id TEXT NOT NULL,
        target_entry_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (source_entry_id) REFERENCES memory_entries(id) ON DELETE CASCADE,
        FOREIGN KEY (target_entry_id) REFERENCES memory_entries(id) ON DELETE CASCADE,
        UNIQUE (project_id, source_entry_id, target_entry_id, relationship_type)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS source_documents (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        path TEXT NOT NULL,
        checksum TEXT NOT NULL,
        last_indexed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        UNIQUE (project_id, path)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS indexing_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        status TEXT NOT NULL,
        source_count INTEGER NOT NULL,
        entry_count INTEGER NOT NULL,
        error_message TEXT,
        schema_version TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS schema_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();

    // Compatibility tables for the existing init feature and older tests.
    db.prepare(`
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS entries_tags (
        entry_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        PRIMARY KEY (entry_id, tag_id),
        FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )
    `).run();

    db.prepare(`CREATE INDEX IF NOT EXISTS idx_memory_entries_project ON memory_entries(project_id)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_memory_entries_hash ON memory_entries(content_hash)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_memory_entries_deleted_at ON memory_entries(deleted_at)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_tags_project_name ON tags(project_id, name)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_entry_id)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_entry_id)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_source_documents_project_path ON source_documents(project_id, path)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_indexing_runs_project_started ON indexing_runs(project_id, started_at)`).run();

    db.prepare(`
      CREATE VIEW IF NOT EXISTS memory_entries_view AS
      SELECT me.*
      FROM memory_entries me
    `).run();

    const versionExists = db.prepare(
      `SELECT 1 FROM schema_metadata WHERE key = 'schema_version'`
    ).get();

    if (!versionExists) {
      db.prepare(`
        INSERT INTO schema_metadata (key, value, updated_at)
        VALUES ('schema_version', ?, ?)
      `).run(MEMORY_STORE_SCHEMA_VERSION, Date.now());
    } else {
      db.prepare(`
        UPDATE schema_metadata
        SET value = ?, updated_at = ?
        WHERE key = 'schema_version'
      `).run(MEMORY_STORE_SCHEMA_VERSION, Date.now());
    }
  });

  migration();
}

export function isMemoryStoreInitialized(db: Database.Database): boolean {
  const requiredTables = [
    'projects',
    'memory_entries',
    'tags',
    'memory_entry_tags',
    'relationships',
    'source_documents',
    'indexing_runs',
    'schema_metadata',
    'entries',
    'entries_tags'
  ];

  for (const tableName of requiredTables) {
    if (!tableExists(db, tableName)) {
      return false;
    }
  }

  return true;
}

export function readSchemaVersion(db: Database.Database): string | null {
  const row = db.prepare(
    `SELECT value FROM schema_metadata WHERE key = 'schema_version'`
  ).get() as { value?: string } | undefined;
  return row?.value ?? null;
}
