import Database from 'better-sqlite3';
import { createId, now } from '../helpers';
import { IndexingRun, IndexingRunSchema } from '../../../domain/entities/IndexingRun';

export class IndexingRunRepository {
  constructor(private readonly db: Database.Database) {}

  public createRun(projectId: string, schemaVersion: string, sourceCount = 0): IndexingRun {
    const run: IndexingRun = IndexingRunSchema.parse({
      id: createId(),
      projectId,
      startedAt: now(),
      finishedAt: null,
      status: 'running',
      sourceCount,
      entryCount: 0,
      errorMessage: null,
      schemaVersion
    });

    this.db.prepare(`
      INSERT INTO indexing_runs (
        id, project_id, started_at, finished_at, status, source_count, entry_count, error_message, schema_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      run.id,
      run.projectId,
      run.startedAt,
      run.finishedAt ?? null,
      run.status,
      run.sourceCount,
      run.entryCount,
      run.errorMessage ?? null,
      run.schemaVersion
    );

    return run;
  }

  public finishRun(runId: string, status: IndexingRun['status'], entryCount: number, errorMessage: string | null = null): void {
    this.db.prepare(`
      UPDATE indexing_runs
      SET finished_at = ?, status = ?, entry_count = ?, error_message = ?
      WHERE id = ?
    `).run(now(), status, entryCount, errorMessage, runId);
  }
}
