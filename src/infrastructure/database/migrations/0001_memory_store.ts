import Database from 'better-sqlite3';

export const MEMORY_STORE_SCHEMA_VERSION = '1.1.0';

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db.prepare(
    "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?"
  ).get(tableName) as { name?: string } | undefined;
  return !!row;
}

function objectType(db: Database.Database, objectName: string): 'table' | 'view' | null {
  const row = db.prepare(
    "SELECT type FROM sqlite_master WHERE type IN ('table','view') AND name = ?"
  ).get(objectName) as { type?: 'table' | 'view' } | undefined;
  if (row?.type === 'table' || row?.type === 'view') {
    return row.type;
  }
  return null;
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
      CREATE TABLE IF NOT EXISTS project_summaries (
        project_id TEXT PRIMARY KEY,
        project_name TEXT NOT NULL,
        purpose TEXT NOT NULL,
        tech_stack TEXT NOT NULL,
        architecture_style TEXT NOT NULL,
        important_conventions TEXT NOT NULL,
        known_constraints TEXT NOT NULL,
        security_sensitive_areas TEXT NOT NULL,
        last_updated_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        category TEXT NOT NULL,
        source TEXT NOT NULL,
        confidence INTEGER,
        summary TEXT,
        related_files TEXT,
        source_document_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (source_document_id) REFERENCES source_documents(id) ON DELETE SET NULL
      )
    `).run();

    // Dynamic runtime migration to handle upgrading existing databases from older runs
    const columns = db.prepare("PRAGMA table_info(memory_entries)").all() as Array<{ name: string }>;
    const columnNames = columns.map(c => c.name);

    if (columnNames.includes('entry_type') && !columnNames.includes('category')) {
      db.prepare("ALTER TABLE memory_entries RENAME COLUMN entry_type TO category").run();
    }
    if (!columnNames.includes('source')) {
      db.prepare("ALTER TABLE memory_entries ADD COLUMN source TEXT NOT NULL DEFAULT 'unknown'").run();
    }
    if (!columnNames.includes('confidence')) {
      db.prepare("ALTER TABLE memory_entries ADD COLUMN confidence INTEGER").run();
    }
    if (!columnNames.includes('related_files')) {
      db.prepare("ALTER TABLE memory_entries ADD COLUMN related_files TEXT").run();
    }
    if (!columnNames.includes('summary')) {
      db.prepare("ALTER TABLE memory_entries ADD COLUMN summary TEXT").run();
    }

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
      CREATE TABLE IF NOT EXISTS shared_lessons (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        lesson TEXT NOT NULL,
        framework TEXT,
        language TEXT,
        source_project_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS schema_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();

    // Legacy compatibility views over canonical tables.
    const entriesTagsType = objectType(db, 'entries_tags');
    if (entriesTagsType === 'table') {
      db.prepare(`DROP TABLE entries_tags`).run();
    }

    const entriesType = objectType(db, 'entries');
    if (entriesType === 'table') {
      db.prepare(`DROP TABLE entries`).run();
    }

    db.prepare(`
      CREATE VIEW IF NOT EXISTS entries AS
      SELECT
        id,
        content_hash AS hash,
        category AS type,
        title,
        content,
        COALESCE(source_document_id, '') AS path,
        created_at,
        updated_at
      FROM memory_entries
      WHERE deleted_at IS NULL
    `).run();

    db.prepare(`
      CREATE VIEW IF NOT EXISTS entries_tags AS
      SELECT entry_id, tag_id
      FROM memory_entry_tags
    `).run();

    initializeMemoryEntriesFts(db);

    db.prepare(`CREATE INDEX IF NOT EXISTS idx_memory_entries_project ON memory_entries(project_id)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_memory_entries_hash ON memory_entries(content_hash)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_memory_entries_deleted_at ON memory_entries(deleted_at)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_tags_project_name ON tags(project_id, name)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_entry_id)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_entry_id)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_source_documents_project_path ON source_documents(project_id, path)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_indexing_runs_project_started ON indexing_runs(project_id, started_at)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_shared_lessons_framework ON shared_lessons(framework)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_shared_lessons_language ON shared_lessons(language)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_shared_lessons_topic ON shared_lessons(topic)`).run();

    db.prepare(`DROP VIEW IF EXISTS memory_entries_view`).run();
    db.prepare(`
      CREATE VIEW memory_entries_view AS
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

function initializeMemoryEntriesFts(db: Database.Database): void {
  const statusRow = db.prepare(`
    SELECT value
    FROM schema_metadata
    WHERE key = 'fts5_enabled'
  `).get() as { value?: string } | undefined;

  if (statusRow?.value === 'disabled') {
    return;
  }

  const ftsExists = tableExists(db, 'memory_entries_fts');

  try {
    if (!ftsExists) {
      db.prepare(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_entries_fts USING fts5(
          entry_id UNINDEXED,
          project_id UNINDEXED,
          title,
          summary,
          content,
          tags,
          category,
          tokenize = 'unicode61 remove_diacritics 2'
        )
      `).run();
    }

    rebuildMemoryEntriesFts(db);
    upsertSchemaMetadata(db, 'fts5_enabled', 'enabled');
  } catch {
    upsertSchemaMetadata(db, 'fts5_enabled', 'disabled');
  }
}

function rebuildMemoryEntriesFts(db: Database.Database): void {
  if (!tableExists(db, 'memory_entries_fts')) {
    return;
  }

  db.prepare(`DELETE FROM memory_entries_fts`).run();
  db.prepare(`
    INSERT INTO memory_entries_fts (
      entry_id,
      project_id,
      title,
      summary,
      content,
      tags,
      category
    )
    SELECT
      me.id,
      me.project_id,
      me.title,
      COALESCE(me.summary, ''),
      me.content,
      COALESCE((
        SELECT GROUP_CONCAT(tag_name, ' ')
        FROM (
          SELECT DISTINCT t.name AS tag_name
          FROM memory_entry_tags met
          INNER JOIN tags t ON t.id = met.tag_id
          WHERE met.entry_id = me.id
          ORDER BY tag_name ASC
        )
      ), ''),
      me.category
    FROM memory_entries me
    WHERE me.deleted_at IS NULL
  `).run();
}

function upsertSchemaMetadata(db: Database.Database, key: string, value: string): void {
  try {
    const timestamp = Date.now();
    const exists = db.prepare(`
      SELECT 1
      FROM schema_metadata
      WHERE key = ?
    `).get(key);

    if (!exists) {
      db.prepare(`
        INSERT INTO schema_metadata (key, value, updated_at)
        VALUES (?, ?, ?)
      `).run(key, value, timestamp);
      return;
    }

    db.prepare(`
      UPDATE schema_metadata
      SET value = ?, updated_at = ?
      WHERE key = ?
    `).run(value, timestamp, key);
  } catch (error: any) {
    if (error?.code === 'SQLITE_BUSY') {
      return;
    }
    throw error;
  }
}

export function isMemoryStoreInitialized(db: Database.Database): boolean {
  const requiredTables = [
    'projects',
    'project_summaries',
    'memory_entries',
    'tags',
    'memory_entry_tags',
    'relationships',
    'source_documents',
    'indexing_runs',
    'shared_lessons',
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
