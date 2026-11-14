import Database from 'better-sqlite3';

export const KNOWLEDGE_OBJECTS_SCHEMA_VERSION = '2.0.0';

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db.prepare(
    "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?"
  ).get(tableName) as { name?: string } | undefined;
  return !!row;
}

function rowExists(db: Database.Database, sql: string, ...params: any[]): boolean {
  const row = db.prepare(sql).get(...params);
  return !!row;
}

function runWithBusyRetry(operationName: string, work: () => void, maxAttempts = 3): void {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      work();
      return;
    } catch (error: any) {
      if (error?.code !== 'SQLITE_BUSY') {
        throw error;
      }
      if (attempt === maxAttempts) {
        console.warn(`[flash-mem] ${operationName} skipped after ${maxAttempts} SQLITE_BUSY attempts.`);
        return;
      }
    }
  }
}

export function initializeKnowledgeObjectSchema(db: Database.Database): void {
  const migration = db.transaction(() => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS knowledge_objects (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        knowledge_type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        summary TEXT,
        authority_level TEXT NOT NULL DEFAULT 'inferred',
        authority_source TEXT,
        authority_verified_at INTEGER,
        confidence INTEGER,
        freshness_status TEXT NOT NULL DEFAULT 'current',
        freshness_validated_at INTEGER,
        scope_level TEXT NOT NULL DEFAULT 'project',
        scope_projects TEXT,
        scope_paths TEXT,
        capture_method TEXT NOT NULL,
        capture_tool TEXT NOT NULL,
        extraction_rule TEXT,
        hash TEXT NOT NULL,
        source_doc_id TEXT REFERENCES source_documents(id),
        tags_hash TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS knowledge_rels (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        source_id TEXT NOT NULL REFERENCES knowledge_objects(id),
        target_id TEXT NOT NULL REFERENCES knowledge_objects(id),
        rel_type TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(project_id, source_id, target_id, rel_type)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS authority_chain (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        object_id TEXT NOT NULL REFERENCES knowledge_objects(id),
        previous_hash TEXT,
        superseded_by TEXT,
        change_reason TEXT,
        changed_at INTEGER NOT NULL,
        changed_by TEXT
      )
    `).run();

    const sdColumns = db.prepare("PRAGMA table_info(source_documents)").all() as Array<{ name: string }>;
    const sdColumnNames = sdColumns.map(c => c.name);

    if (!sdColumnNames.includes('document_type')) {
      db.prepare(`ALTER TABLE source_documents ADD COLUMN document_type TEXT`).run();
    }
    if (!sdColumnNames.includes('sections_json')) {
      db.prepare(`ALTER TABLE source_documents ADD COLUMN sections_json TEXT`).run();
    }

    db.prepare(`CREATE INDEX IF NOT EXISTS idx_knowledge_objects_project_type ON knowledge_objects(project_id, knowledge_type)`).run();
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_objects_hash ON knowledge_objects(project_id, hash)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_knowledge_objects_authority ON knowledge_objects(project_id, authority_level)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_knowledge_objects_freshness ON knowledge_objects(freshness_status)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_knowledge_objects_deleted ON knowledge_objects(deleted_at)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_knowledge_rels_source ON knowledge_rels(source_id)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_knowledge_rels_target ON knowledge_rels(target_id)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_knowledge_rels_type ON knowledge_rels(rel_type)`).run();

    db.prepare(`
      CREATE VIEW IF NOT EXISTS entries_v2 AS
        SELECT
          id, project_id, title, content,
          knowledge_type AS category,
          authority_level AS source,
          confidence,
          summary,
          NULL AS related_files,
          source_doc_id AS source_document_id,
          'knowledge_object' AS entry_source,
          created_at, updated_at, deleted_at
        FROM knowledge_objects
        WHERE deleted_at IS NULL
      UNION ALL
        SELECT
          id, project_id, title, content,
          category, source, confidence, summary,
          related_files, source_document_id,
          'memory_entry' AS entry_source,
          created_at, updated_at, deleted_at
        FROM memory_entries
        WHERE deleted_at IS NULL
    `).run();

    const versionExists = rowExists(
      db,
      `SELECT 1 FROM schema_metadata WHERE key = 'schema_version' AND value >= '2.0.0'`
    );
    if (!versionExists) {
      const current = db.prepare(
        `SELECT value FROM schema_metadata WHERE key = 'schema_version'`
      ).get() as { value?: string } | undefined;

      if (current && current.value && current.value < '2.0.0') {
        db.prepare(`
          UPDATE schema_metadata SET value = ?, updated_at = ? WHERE key = 'schema_version'
        `).run(KNOWLEDGE_OBJECTS_SCHEMA_VERSION, Date.now());
      } else if (!current) {
        db.prepare(`
          INSERT INTO schema_metadata (key, value, updated_at) VALUES ('schema_version', ?, ?)
        `).run(KNOWLEDGE_OBJECTS_SCHEMA_VERSION, Date.now());
      }
    }
  });

  migration();
  initializeKnowledgeFts(db);
}

export function isKnowledgeObjectSchemaInitialized(db: Database.Database): boolean {
  const required = ['knowledge_objects', 'knowledge_rels', 'authority_chain', 'entries_v2'];
  for (const name of required) {
    if (!tableExists(db, name)) {
      return false;
    }
  }
  return true;
}

function initializeKnowledgeFts(db: Database.Database): void {
  const statusRow = db.prepare(
    `SELECT value FROM schema_metadata WHERE key = 'fts5_enabled'`
  ).get() as { value?: string } | undefined;

  if (statusRow?.value === 'disabled') {
    return;
  }

  const ftsExists = tableExists(db, 'knowledge_fts');

  try {
    if (!ftsExists) {
      db.prepare(`
        CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
          entry_id UNINDEXED,
          project_id UNINDEXED,
          knowledge_type,
          title,
          summary,
          content,
          tags,
          tokenize = 'unicode61 remove_diacritics 2'
        )
      `).run();
    }

    rebuildKnowledgeFts(db);
    upsertSchemaMetadata(db, 'fts5_enabled', 'enabled');
  } catch {
    upsertSchemaMetadata(db, 'fts5_enabled', 'disabled');
  }
}

function rebuildKnowledgeFts(db: Database.Database): void {
  if (!tableExists(db, 'knowledge_fts')) {
    return;
  }

  db.prepare(`DELETE FROM knowledge_fts`).run();
  db.prepare(`
    INSERT INTO knowledge_fts (
      entry_id, project_id, knowledge_type, title, summary, content, tags
    )
    SELECT
      id, project_id, knowledge_type, title, COALESCE(summary, ''), content, ''
    FROM knowledge_objects
    WHERE deleted_at IS NULL
  `).run();
}

function upsertSchemaMetadata(db: Database.Database, key: string, value: string): void {
  runWithBusyRetry(`schema metadata upsert for "${key}"`, () => {
    const timestamp = Date.now();
    const exists = db.prepare(
      `SELECT 1 FROM schema_metadata WHERE key = ?`
    ).get(key);

    if (!exists) {
      db.prepare(`
        INSERT INTO schema_metadata (key, value, updated_at) VALUES (?, ?, ?)
      `).run(key, value, timestamp);
      return;
    }

    db.prepare(`
      UPDATE schema_metadata SET value = ?, updated_at = ? WHERE key = ?
    `).run(value, timestamp, key);
  });
}
