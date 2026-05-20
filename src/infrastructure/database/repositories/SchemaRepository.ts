import Database from 'better-sqlite3';

export class SchemaRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Initializes the database schema tables and indexes.
   * This is idempotent (uses CREATE TABLE IF NOT EXISTS).
   */
  public initializeSchema(): void {
    // Run schema creation inside a transaction to ensure atomic execution
    const initializeTransaction = this.db.transaction(() => {
      // 1. Entries table
      this.db.prepare(`
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

      // 2. Tags table
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS tags (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE
        )
      `).run();

      // 3. Entries-Tags Junction table
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS entries_tags (
          entry_id TEXT NOT NULL,
          tag_id TEXT NOT NULL,
          PRIMARY KEY (entry_id, tag_id),
          FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
          FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )
      `).run();

      // 4. Relationships table
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS relationships (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL,
          target_id TEXT NOT NULL,
          type TEXT NOT NULL,
          FOREIGN KEY (source_id) REFERENCES entries(id) ON DELETE CASCADE,
          FOREIGN KEY (target_id) REFERENCES entries(id) ON DELETE CASCADE,
          UNIQUE (source_id, target_id, type)
        )
      `).run();

      // Create indexes for optimization
      this.db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(type)
      `).run();

      this.db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_entries_path ON entries(path)
      `).run();

      this.db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_id)
      `).run();

      this.db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_id)
      `).run();
    });

    initializeTransaction();
  }

  /**
   * Checks if the required tables exist in the database.
   * Useful for self-healing/integrity checks.
   */
  public verifyTablesExist(): boolean {
    const requiredTables = ['entries', 'tags', 'entries_tags', 'relationships'];
    const stmt = this.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name=?
    `);

    for (const table of requiredTables) {
      const row = stmt.get(table);
      if (!row) {
        return false;
      }
    }
    return true;
  }
}
