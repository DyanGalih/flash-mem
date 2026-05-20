import Database from 'better-sqlite3';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface DatabaseConnectionOptions {
  verbose?: (message?: any, ...additionalArgs: any[]) => void;
}

export function createDatabaseConnection(
  dbFilePath: string,
  options: DatabaseConnectionOptions = {}
): Database.Database {
  // Ensure the parent directory of the database file exists
  const parentDir = path.dirname(dbFilePath);
  fs.ensureDirSync(parentDir);

  const db = new Database(dbFilePath, {
    verbose: options.verbose
  });

  // Enable WAL (Write-Ahead Logging) mode for optimal performance (Architecture Constitution A5)
  db.pragma('journal_mode = WAL');

  // Enable Foreign Keys enforcement
  db.pragma('foreign_keys = ON');

  return db;
}
