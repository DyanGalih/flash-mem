import Database from 'better-sqlite3';
import { createId, now } from '../helpers';
import { MemoryEntry, MemoryEntryInput, MemoryEntrySchema } from '../../../domain/entities/MemoryEntry';
import { Relationship } from '../../../domain/entities/Relationship';

export interface MemoryEntryRecord extends MemoryEntry {
  tags: string[];
  relationships: Relationship[];
}

export class MemoryEntryRepository {
  constructor(private readonly db: Database.Database) {}

  public create(input: MemoryEntryInput, sourceDocumentId: string | null = null): MemoryEntry {
    const timestamp = now();
    const contentHash = this.hashContent(input.title, input.content, input.entryType);
    const existing = this.findByProjectAndHash(input.projectId, contentHash, input.entryType);
    const record: MemoryEntry = MemoryEntrySchema.parse(existing ?? {
      id: createId(),
      projectId: input.projectId,
      title: input.title,
      content: input.content,
      contentHash,
      entryType: input.entryType,
      sourceDocumentId,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null
    });

    if (existing) {
      this.db.prepare(`
        UPDATE memory_entries
        SET title = ?, content = ?, content_hash = ?, entry_type = ?, source_document_id = ?, updated_at = ?, deleted_at = NULL
        WHERE id = ?
      `).run(
        input.title,
        input.content,
        contentHash,
        input.entryType,
        sourceDocumentId,
        timestamp,
        existing.id
      );

      this.syncLegacyEntry({
        ...existing,
        title: input.title,
        content: input.content,
        contentHash,
        entryType: input.entryType,
        sourceDocumentId,
        updatedAt: timestamp,
        deletedAt: null
      });

      return {
        ...existing,
        title: input.title,
        content: input.content,
        contentHash,
        entryType: input.entryType,
        sourceDocumentId,
        updatedAt: timestamp,
        deletedAt: null
      };
    }

    this.db.prepare(`
      INSERT INTO memory_entries (
        id, project_id, title, content, content_hash, entry_type, source_document_id, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.projectId,
      record.title,
      record.content,
      record.contentHash,
      record.entryType,
      record.sourceDocumentId ?? null,
      record.createdAt,
      record.updatedAt,
      record.deletedAt ?? null
    );

    this.syncLegacyEntry(record);
    return record;
  }

  public update(entryId: string, input: Partial<Pick<MemoryEntryInput, 'title' | 'content' | 'entryType' | 'sourceDocumentPath'>>): MemoryEntry | null {
    const existing = this.findById(entryId);
    if (!existing) {
      return null;
    }

    const updated: MemoryEntry = MemoryEntrySchema.parse({
      ...existing,
      title: input.title ?? existing.title,
      content: input.content ?? existing.content,
      entryType: input.entryType ?? existing.entryType,
      contentHash: this.hashContent(input.title ?? existing.title, input.content ?? existing.content, input.entryType ?? existing.entryType),
      updatedAt: now()
    });

    this.db.prepare(`
      UPDATE memory_entries
      SET title = ?, content = ?, content_hash = ?, entry_type = ?, updated_at = ?, source_document_id = ?
      WHERE id = ?
    `).run(
      updated.title,
      updated.content,
      updated.contentHash,
      updated.entryType,
      updated.updatedAt,
      updated.sourceDocumentId ?? null,
      entryId
    );

    this.syncLegacyEntry(updated);
    return updated;
  }

  public softDelete(entryId: string): boolean {
    const result = this.db.prepare(`
      UPDATE memory_entries
      SET deleted_at = ?
      WHERE id = ?
    `).run(now(), entryId);

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
             entry_type AS entryType, source_document_id AS sourceDocumentId,
             created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
      FROM memory_entries
      WHERE id = ?
    `).get(entryId) as MemoryEntry | undefined;

    return row ? MemoryEntrySchema.parse(row) : null;
  }

  public findByProjectAndHash(projectId: string, contentHash: string, entryType: string): MemoryEntry | null {
    const row = this.db.prepare(`
      SELECT id, project_id AS projectId, title, content, content_hash AS contentHash,
             entry_type AS entryType, source_document_id AS sourceDocumentId,
             created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
      FROM memory_entries
      WHERE project_id = ? AND content_hash = ? AND entry_type = ? AND deleted_at IS NULL
      LIMIT 1
    `).get(projectId, contentHash, entryType) as MemoryEntry | undefined;

    return row ? MemoryEntrySchema.parse(row) : null;
  }

  public listByProject(projectId: string): MemoryEntry[] {
    const rows = this.db.prepare(`
      SELECT id, project_id AS projectId, title, content, content_hash AS contentHash,
             entry_type AS entryType, source_document_id AS sourceDocumentId,
             created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
      FROM memory_entries
      WHERE project_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC
    `).all(projectId) as MemoryEntry[];

    return rows.map((row) => MemoryEntrySchema.parse(row));
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
             entry_type AS entryType, source_document_id AS sourceDocumentId,
             created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
      FROM memory_entries
      WHERE id IN (${placeholders})
    `).all(...ids) as MemoryEntry[];

    return rows
      .map((row) => ({
        ...MemoryEntrySchema.parse(row),
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

  private hashContent(title: string, content: string, entryType: string): string {
    return Buffer.from(`${title}\n${content}\n${entryType}`).toString('base64');
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
      entry.entryType,
      entry.title,
      entry.content,
      entry.sourceDocumentId ?? '',
      entry.createdAt,
      entry.updatedAt
    );
  }
}
