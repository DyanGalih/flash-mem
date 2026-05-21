import Database from 'better-sqlite3';
import { ITransactionRunner } from '../../domain/repositories/interfaces';

export class SqliteTransactionRunner implements ITransactionRunner {
  constructor(private readonly db: Database.Database) {}

  public run<T>(work: () => T): T {
    return this.db.transaction(work)();
  }
}
