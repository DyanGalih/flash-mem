import Database from 'better-sqlite3';
import { createId, now } from '../helpers';
import { SharedLesson, SharedLessonSchema } from '../../../domain/entities/SharedLesson';

export interface SharedLessonRecord extends SharedLesson {
  sourceProjectHash: string;
  updatedAt: number;
}

export interface SharedLessonQuery {
  framework?: string | null;
  language?: string | null;
  limit?: number;
}

export class SharedLessonRepository {
  constructor(private readonly db: Database.Database) {}

  public listLessons(query: SharedLessonQuery = {}): SharedLessonRecord[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (query.framework) {
      clauses.push('framework = ?');
      params.push(query.framework.trim());
    }

    if (query.language) {
      clauses.push('language = ?');
      params.push(query.language.trim());
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limitClause = query.limit && query.limit > 0 ? 'LIMIT ?' : '';
    if (limitClause) {
      params.push(query.limit as number);
    }

    const rows = this.db.prepare(`
      SELECT id, topic, lesson, framework, language, source_project_hash AS sourceProjectHash, created_at AS createdAt, updated_at AS updatedAt
      FROM shared_lessons
      ${whereClause}
      ORDER BY updated_at DESC, created_at DESC
      ${limitClause}
    `).all(...params) as SharedLessonRecord[];

    return rows.map((row) => ({
      ...SharedLessonSchema.parse({
        ...row,
        createdAt: new Date(row.createdAt).toISOString()
      }),
      sourceProjectHash: row.sourceProjectHash,
      updatedAt: row.updatedAt
    }));
  }

  public getLessonsByFramework(framework: string): Promise<SharedLessonRecord[]> {
    return Promise.resolve(this.listLessons({ framework }));
  }

  public saveLesson(lesson: SharedLesson, sourceProjectHash: string): Promise<SharedLessonRecord> {
    const timestamp = now();
    const stored: SharedLessonRecord = {
      ...SharedLessonSchema.parse(lesson),
      sourceProjectHash,
      updatedAt: timestamp
    };

    this.db.prepare(`
      INSERT INTO shared_lessons (id, topic, lesson, framework, language, source_project_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        topic = excluded.topic,
        lesson = excluded.lesson,
        framework = excluded.framework,
        language = excluded.language,
        source_project_hash = excluded.source_project_hash,
        updated_at = excluded.updated_at
    `).run(
      stored.id,
      stored.topic,
      stored.lesson,
      stored.framework,
      stored.language,
      stored.sourceProjectHash,
      timestamp,
      stored.updatedAt
    );

    return Promise.resolve(stored);
  }

  public listMatchingLessons(query: SharedLessonQuery = {}): Promise<SharedLessonRecord[]> {
    return Promise.resolve(this.listLessons(query));
  }

  public createLessonId(): string {
    return createId();
  }
}
