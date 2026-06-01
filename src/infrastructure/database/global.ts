import Database from 'better-sqlite3';
import * as os from 'os';
import * as path from 'path';
import { SchemaMigrationService } from '../../application/services/SchemaMigrationService';
import { createDatabaseConnection } from './connection';

export function getGlobalHubDatabase(): Database.Database {
  const configuredPath = process.env.FLASH_MEM_GLOBAL_DB_PATH?.trim();
  const expandedPath = configuredPath?.startsWith('~/')
    ? path.join(os.homedir(), configuredPath.slice(2))
    : configuredPath;
  const globalDbPath = expandedPath && expandedPath.length > 0
    ? path.resolve(expandedPath)
    : path.join(os.homedir(), '.flash-mem', 'hub.sqlite');
  const db = createDatabaseConnection(globalDbPath);

  const migrationService = new SchemaMigrationService(db);
  migrationService.ensureCurrentSchema();

  return db;
}
