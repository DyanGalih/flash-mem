import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';
import { createDatabaseConnection } from './connection';
import { SchemaMigrationService } from '../../application/services/SchemaMigrationService';

export function getGlobalHubDatabase(): Database.Database {
  const globalDbPath = path.join(os.homedir(), '.flash-mem', 'hub.sqlite');
  const db = createDatabaseConnection(globalDbPath);
  
  const migrationService = new SchemaMigrationService(db);
  migrationService.ensureCurrentSchema();
  
  return db;
}
