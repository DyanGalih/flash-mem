import Database from 'better-sqlite3';
import { createId, now } from '../helpers';
import { MemoryEntry, MemoryEntryInput, MemoryEntrySchema } from '../../../domain/entities/MemoryEntry';
import { Relationship } from '../../../domain/entities/Relationship';
import { IMemoryEntryRepository } from '../../../domain/repositories/interfaces';

export interface MemoryEntryRecord extends MemoryEntry {
  tags: string[];
  relationships: Relationship[];
}

export class MemoryEntryRepository implements IMemoryEntryRepository {
  constructor(private readonly db: Database.Database) {}

  public create(input: MemoryEntryInput, sourceDocumentId: string | null = null): MemoryEntry {
    const timestamp = now();
    const contentHash = this.hashContent(input.title, input.content, input.category);
    const existing = this.findByProjectAndHash(input.projectId, contentHash, input.category);
    const record: MemoryEntry = MemoryEntrySchema.parse(existing ?? {
      id: createId(),
      projectId: input.projectId,
      title: input.title,
      content: input.content,
      contentHash,
      category: input.category,
      source: input.source,
      confidence: input.confidence ?? null,
      relatedFiles: input.relatedFiles ?? null,
      sourceDocumentId,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null
    });

    if (existing) {
      this.db.prepare(`
        UPDATE memory_entries
        SET title = ?, content = ?, content_hash = ?, category = ?, source = ?, confidence = ?, related_files = ?, source_document_id = ?, updated_at = ?, deleted_at = NULL
        WHERE id = ?
      `).run(
        input.title,
        input.content,
        contentHash,
        input.category,
        input.source,
        input.confidence ?? null,
        input.relatedFiles ? JSON.stringify(input.relatedFiles) : null,
        sourceDocumentId,
        timestamp,
        existing.id
      );

      const updatedRecord = {
        ...existing,
        title: input.title,
        content: input.content,
        contentHash,
        category: input.category,
        source: input.source,
        confidence: input.confidence ?? null,
        relatedFiles: input.relatedFiles ?? null,
        sourceDocumentId,
        updatedAt: timestamp,
        deletedAt: null
      };

      this.syncLegacyEntry(updatedRecord);
      return updatedRecord;
    }

    this.db.prepare(`
      INSERT INTO memory_entries (
        id, project_id, title, content, content_hash, category, source, confidence, related_files, source_document_id, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.projectId,
      record.title,
      record.content,
      record.contentHash,
      record.category,
      record.source,
      record.confidence ?? null,
      record.relatedFiles ? JSON.stringify(record.relatedFiles) : null,
      record.sourceDocumentId ?? null,
      record.createdAt,
      record.updatedAt,
      record.deletedAt ?? null
    );

    this.syncLegacyEntry(record);
    return record;
  }

  /**
   * Overwrite an existing memory entry by primary key, or insert it if missing.
   * Used for backup restoration (FR-004, Decision D7).
   */
  public restore(entry: MemoryEntry): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO memory_entries (
        id, project_id, title, content, content_hash, category, source, confidence, related_files, source_document_id, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id,
      entry.projectId,
      entry.title,
      entry.content,
      entry.contentHash,
      entry.category,
      entry.source,
      entry.confidence ?? null,
      entry.relatedFiles ? JSON.stringify(entry.relatedFiles) : null,
      entry.sourceDocumentId ?? null,
      entry.createdAt,
      entry.updatedAt,
      entry.deletedAt ?? null
    );

    this.syncLegacyEntry(entry);
  }

  public update(
    entryId: string,
    input: Partial<{
      title: string;
      content: string;
      category: string;
      source: string;
      confidence: number | null;
      relatedFiles: string[] | null;
    }>
  ): MemoryEntry | null {
    const existing = this.findById(entryId);
    if (!existing) {
      return null;
    }

    const newTitle = input.title !== undefined ? input.title : existing.title;
    const newContent = input.content !== undefined ? input.content : existing.content;
    const newCategory = input.category !== undefined ? input.category : existing.category;
    const contentHash = this.hashContent(newTitle, newContent, newCategory);

    const fieldsToUpdate: string[] = [];
    const params: any[] = [];

    if (input.title !== undefined) {
      fieldsToUpdate.push('title = ?');
      params.push(input.title);
    }
    if (input.content !== undefined) {
      fieldsToUpdate.push('content = ?');
      params.push(input.content);
    }
    if (input.category !== undefined) {
      fieldsToUpdate.push('category = ?');
      params.push(input.category);
    }
    if (input.source !== undefined) {
      fieldsToUpdate.push('source = ?');
      params.push(input.source);
    }
    if (input.confidence !== undefined) {
      fieldsToUpdate.push('confidence = ?');
      params.push(input.confidence);
    }
    if (input.relatedFiles !== undefined) {
      fieldsToUpdate.push('related_files = ?');
      params.push(input.relatedFiles ? JSON.stringify(input.relatedFiles) : null);
    }

    fieldsToUpdate.push('content_hash = ?');
    params.push(contentHash);

    const timestamp = now();
    fieldsToUpdate.push('updated_at = ?');
    params.push(timestamp);

    if (fieldsToUpdate.length > 0) {
      params.push(entryId);
      this.db.prepare(`
        UPDATE memory_entries
        SET ${fieldsToUpdate.join(', ')}
        WHERE id = ?
      `).run(...params);
    }

    const updated = this.findById(entryId);
    if (updated) {
      this.syncLegacyEntry(updated);
    }
    return updated;
  }

  public softDelete(entryId: string): boolean {
    const result = this.db.prepare(`
      UPDATE memory_entries
      SET deleted_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(now(), entryId);

    this.db.prepare(`
      DELETE FROM entries
      WHERE id = ?
    `).run(entryId);

    this.db.prepare(`
      DELETE FROM entries_tags
      WHERE entry_id = ?
    `).run(entryId);

    this.db.prepare(`
      DELETE FROM memory_entry_tags
      WHERE entry_id = ?
    `).run(entryId);

    return result.changes > 0;
  }

  public findById(entryId: string): MemoryEntry | null {
    const row = this.db.prepare(`
      SELECT id, project_id AS projectId, title, content, content_hash AS contentHash,
             category, source, confidence, related_files AS relatedFiles, source_document_id AS sourceDocumentId,
             created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
      FROM memory_entries
      WHERE id = ?
    `).get(entryId) as any | undefined;

    return row ? this.mapRowToEntry(row) : null;
  }

  public findByProjectAndHash(projectId: string, contentHash: string, category: string): MemoryEntry | null {
    const row = this.db.prepare(`
      SELECT id, project_id AS projectId, title, content, content_hash AS contentHash,
             category, source, confidence, related_files AS relatedFiles, source_document_id AS sourceDocumentId,
             created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
      FROM memory_entries
      WHERE project_id = ? AND content_hash = ? AND category = ? AND deleted_at IS NULL
      LIMIT 1
    `).get(projectId, contentHash, category) as any | undefined;

    return row ? this.mapRowToEntry(row) : null;
  }

  public listByProject(projectId: string): MemoryEntry[] {
    const rows = this.db.prepare(`
      SELECT id, project_id AS projectId, title, content, content_hash AS contentHash,
             category, source, confidence, related_files AS relatedFiles, source_document_id AS sourceDocumentId,
             created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
      FROM memory_entries
      WHERE project_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC
    `).all(projectId) as any[];

    return rows.map((row) => this.mapRowToEntry(row));
  }

  public search(projectId: string, query: string, limit = 20): Array<MemoryEntryRecord & { score: number }> {
    const normalized = query.trim().toLowerCase();
    const pattern = `%${normalized}%`;

    const contentRows = this.db.prepare(`
      SELECT
        id,
        CASE
          WHEN LOWER(title) = LOWER(?) THEN 100
          WHEN LOWER(content) LIKE ? THEN 80
          ELSE 0
        END AS score
      FROM memory_entries
      WHERE project_id = ? AND deleted_at IS NULL
        AND (LOWER(title) LIKE ? OR LOWER(content) LIKE ?)
    `).all(normalized, pattern, projectId, pattern, pattern) as Array<{ id: string; score: number }>;

    const tagRows = this.db.prepare(`
      SELECT
        me.id,
        CASE
          WHEN LOWER(t.name) = LOWER(?) THEN 90
          ELSE 70
        END AS score
      FROM memory_entries me
      INNER JOIN memory_entry_tags met ON met.entry_id = me.id
      INNER JOIN tags t ON t.id = met.tag_id
      WHERE me.project_id = ? AND me.deleted_at IS NULL
        AND (LOWER(t.name) = LOWER(?) OR LOWER(t.name) LIKE ?)
    `).all(normalized, projectId, normalized, pattern) as Array<{ id: string; score: number }>;

    const scoreMap = new Map<string, number>();
    for (const row of [...contentRows, ...tagRows]) {
      const previous = scoreMap.get(row.id) ?? 0;
      scoreMap.set(row.id, Math.max(previous, row.score));
    }

    const ids = Array.from(scoreMap.keys());
    if (ids.length === 0) {
      return [];
    }

    const placeholders = ids.map(() => '?').join(', ');
    const rows = this.db.prepare(`
      SELECT id, project_id AS projectId, title, content, content_hash AS contentHash,
             category, source, confidence, related_files AS relatedFiles, source_document_id AS sourceDocumentId,
             created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
      FROM memory_entries
      WHERE id IN (${placeholders})
    `).all(...ids) as any[];

    return rows
      .map((row) => ({
        ...this.mapRowToEntry(row),
        tags: this.listTagsForEntry(row.id),
        relationships: this.listRelationshipsForEntry(row.id),
        score: scoreMap.get(row.id) ?? 0
      }))
      .sort((left, right) => right.score - left.score || right.updatedAt - left.updatedAt)
      .slice(0, limit);
  }

  public listTagsForEntry(entryId: string): string[] {
    const rows = this.db.prepare(`
      SELECT t.name
      FROM tags t
      INNER JOIN memory_entry_tags met ON met.tag_id = t.id
      WHERE met.entry_id = ?
      ORDER BY t.name ASC
    `).all(entryId) as Array<{ name: string }>;

    return rows.map((row) => row.name);
  }

  public replaceLegacyTags(entryId: string, tagIds: string[]): void {
    this.db.prepare(`DELETE FROM entries_tags WHERE entry_id = ?`).run(entryId);
    const insert = this.db.prepare(`INSERT OR IGNORE INTO entries_tags (entry_id, tag_id) VALUES (?, ?)`);
    for (const tagId of tagIds) {
      insert.run(entryId, tagId);
    }
  }

  public listRelationshipsForEntry(entryId: string): Relationship[] {
    const rows = this.db.prepare(`
      SELECT id, project_id AS projectId, source_entry_id AS sourceEntryId,
             target_entry_id AS targetEntryId, relationship_type AS relationshipType, created_at AS createdAt
      FROM relationships
      WHERE source_entry_id = ?
      ORDER BY created_at DESC
    `).all(entryId) as Relationship[];

    return rows;
  }

  private hashContent(title: string, content: string, category: string): string {
    return Buffer.from(`${title}\n${content}\n${category}`).toString('base64');
  }

  private syncLegacyEntry(entry: MemoryEntry): void {
    this.db.prepare(`
      INSERT INTO entries (id, hash, type, title, content, path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        hash = excluded.hash,
        type = excluded.type,
        title = excluded.title,
        content = excluded.content,
        path = excluded.path,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `).run(
      entry.id,
      entry.contentHash,
      entry.category,
      entry.title,
      entry.content,
      entry.sourceDocumentId ?? '',
      entry.createdAt,
      entry.updatedAt
    );
  }

  private mapRowToEntry(row: any): MemoryEntry {
    let relatedFiles: string[] | null = null;
    if (row.relatedFiles) {
      try {
        relatedFiles = JSON.parse(row.relatedFiles);
      } catch {
        relatedFiles = null;
      }
    }
    return MemoryEntrySchema.parse({
      id: row.id,
      projectId: row.projectId,
      title: row.title,
      content: row.content,
      contentHash: row.contentHash,
      category: row.category,
      source: row.source,
      confidence: row.confidence !== null && row.confidence !== undefined ? Number(row.confidence) : null,
      relatedFiles: relatedFiles,
      sourceDocumentId: row.sourceDocumentId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    });
  }
}
