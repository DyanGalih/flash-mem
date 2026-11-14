import * as fs from 'fs-extra';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';

const TEST_DIR = path.resolve(__dirname, 'knowledge-migration-workspace');

function createFreshDb(): any {
  fs.removeSync(TEST_DIR);
  const dbPath = path.join(TEST_DIR, 'flashmem.sqlite');
  return createDatabaseConnection(dbPath);
}

function initV1Schema(db: any): void {
  const migration = db.transaction(() => {
    db.prepare(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, root_path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS memory_entries (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, content_hash TEXT NOT NULL, category TEXT NOT NULL, source TEXT NOT NULL, confidence INTEGER, summary TEXT, related_files TEXT, source_document_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER)`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE (project_id, name))`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS memory_entry_tags (entry_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY (entry_id, tag_id))`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS relationships (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, source_entry_id TEXT NOT NULL, target_entry_id TEXT NOT NULL, relationship_type TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE (project_id, source_entry_id, target_entry_id, relationship_type))`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS source_documents (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, path TEXT NOT NULL, checksum TEXT NOT NULL, last_indexed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE (project_id, path))`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS indexing_runs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER, status TEXT NOT NULL, source_count INTEGER NOT NULL, entry_count INTEGER NOT NULL, error_message TEXT, schema_version TEXT NOT NULL)`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS shared_lessons (id TEXT PRIMARY KEY, topic TEXT NOT NULL, lesson TEXT NOT NULL, framework TEXT, language TEXT, source_project_hash TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS schema_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`).run();
    db.prepare(`INSERT OR REPLACE INTO schema_metadata (key, value, updated_at) VALUES ('schema_version', '1.1.0', ?)`).run(Date.now());
  });
  migration();
}

function tableExists(db: any, name: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?").get(name);
  return !!row;
}

function columnExists(db: any, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some(c => c.name === column);
}

describe('Knowledge Objects Migration', () => {
  let db: any;

  afterEach(() => {
    if (db) db.close();
    fs.removeSync(TEST_DIR);
  });

  it('is idempotent (run 0002 twice)', () => {
    db = createFreshDb();
    const svc = new SchemaMigrationService(db);
    svc.ensureCurrentSchema();

    const version1 = svc.currentVersion();
    svc.ensureCurrentSchema();
    const version2 = svc.currentVersion();

    expect(version1).toBe('2.0.0');
    expect(version2).toBe('2.0.0');
    expect(tableExists(db, 'knowledge_objects')).toBe(true);
    expect(tableExists(db, 'knowledge_rels')).toBe(true);
    expect(tableExists(db, 'authority_chain')).toBe(true);
  });

  it('migrates v1.x schema to v2.0', () => {
    db = createFreshDb();
    initV1Schema(db);

    expect(tableExists(db, 'knowledge_objects')).toBe(false);

    const svc = new SchemaMigrationService(db);
    const version = svc.ensureCurrentSchema();

    expect(version).toBe('2.0.0');
    expect(tableExists(db, 'knowledge_objects')).toBe(true);
    expect(tableExists(db, 'knowledge_rels')).toBe(true);
    expect(tableExists(db, 'authority_chain')).toBe(true);
    expect(tableExists(db, 'entries_v2')).toBe(true);

    expect(columnExists(db, 'source_documents', 'document_type')).toBe(true);
    expect(columnExists(db, 'source_documents', 'sections_json')).toBe(true);
  });

  it('entries_v2 returns legacy rows', () => {
    db = createFreshDb();
    initV1Schema(db);

    db.prepare(`INSERT INTO projects (id, root_path, name, created_at, updated_at) VALUES ('p1', '/test', 'test', ?, ?)`).run(Date.now(), Date.now());
    db.prepare(`INSERT INTO memory_entries (id, project_id, title, content, content_hash, category, source, created_at, updated_at) VALUES ('e1', 'p1', 'legacy', 'content', 'hash1', 'decision', 'manual', ?, ?)`).run(Date.now(), Date.now());

    const svc = new SchemaMigrationService(db);
    svc.ensureCurrentSchema();

    const rows = db.prepare(`SELECT id, entry_source FROM entries_v2`).all() as Array<{ id: string; entry_source: string }>;
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe('e1');
    expect(rows[0].entry_source).toBe('memory_entry');
  });

  it('handles FTS5 failure gracefully', () => {
    db = createFreshDb();

    const svc = new SchemaMigrationService(db);
    svc.ensureCurrentSchema();

    db.prepare(`UPDATE schema_metadata SET value = 'disabled' WHERE key = 'fts5_enabled'`).run();

    const svc2 = new SchemaMigrationService(db);
    const version = svc2.ensureCurrentSchema();

    expect(version).toBe('2.0.0');
    expect(tableExists(db, 'knowledge_objects')).toBe(true);

    const ftsStatus = db.prepare(`SELECT value FROM schema_metadata WHERE key = 'fts5_enabled'`).get() as { value: string };
    expect(ftsStatus.value).toBe('disabled');
  });
});
