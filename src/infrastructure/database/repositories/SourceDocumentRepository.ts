import Database from 'better-sqlite3';
import { createId, now } from '../helpers';
import { SourceDocument, SourceDocumentSchema } from '../../../domain/entities/SourceDocument';
import { ISourceDocumentRepository } from '../../../domain/repositories/interfaces';

export class SourceDocumentRepository implements ISourceDocumentRepository {
  constructor(private readonly db: Database.Database) {}

  public upsert(projectId: string, path: string, checksum: string, lastIndexedAt: number | null = null): SourceDocument {
    const existing = this.findByProjectAndPath(projectId, path);
    const timestamp = now();

    if (existing) {
      this.db.prepare(`
        UPDATE source_documents
        SET checksum = ?, last_indexed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(checksum, lastIndexedAt, timestamp, existing.id);

      return SourceDocumentSchema.parse({
        ...existing,
        checksum,
        lastIndexedAt,
        updatedAt: timestamp
      });
    }

    const sourceDocument: SourceDocument = SourceDocumentSchema.parse({
      id: createId(),
      projectId,
      path,
      checksum,
      lastIndexedAt,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    this.db.prepare(`
      INSERT INTO source_documents (id, project_id, path, checksum, last_indexed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      sourceDocument.id,
      sourceDocument.projectId,
      sourceDocument.path,
      sourceDocument.checksum,
      sourceDocument.lastIndexedAt ?? null,
      sourceDocument.createdAt,
      sourceDocument.updatedAt
    );

    return sourceDocument;
  }

  public findByProjectAndPath(projectId: string, path: string): SourceDocument | null {
    const row = this.db.prepare(`
      SELECT id, project_id AS projectId, path, checksum, last_indexed_at AS lastIndexedAt,
             created_at AS createdAt, updated_at AS updatedAt
      FROM source_documents
      WHERE project_id = ? AND path = ?
    `).get(projectId, path) as SourceDocument | undefined;

    return row ? SourceDocumentSchema.parse(row) : null;
  }

  public findById(sourceDocumentId: string): SourceDocument | null {
    const row = this.db.prepare(`
      SELECT id, project_id AS projectId, path, checksum, last_indexed_at AS lastIndexedAt,
             created_at AS createdAt, updated_at AS updatedAt
      FROM source_documents
      WHERE id = ?
    `).get(sourceDocumentId) as SourceDocument | undefined;

    return row ? SourceDocumentSchema.parse(row) : null;
  }

  public listByProject(projectId: string): SourceDocument[] {
    const rows = this.db.prepare(`
      SELECT id, project_id AS projectId, path, checksum, last_indexed_at AS lastIndexedAt,
             created_at AS createdAt, updated_at AS updatedAt
      FROM source_documents
      WHERE project_id = ?
      ORDER BY path ASC
    `).all(projectId) as SourceDocument[];

    return rows.map((row) => SourceDocumentSchema.parse(row));
  }
}
