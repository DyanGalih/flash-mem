import Database from 'better-sqlite3';
import { createId, now } from '../helpers';
import { MemoryEntry, MemoryEntryInput, MemoryEntrySchema } from '../../../domain/entities/MemoryEntry';
import { Relationship } from '../../../domain/entities/Relationship';
import { IMemoryEntryRepository, MemorySearchOptions } from '../../../domain/repositories/interfaces';

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
      summary: input.summary ?? null,
      sourceDocumentId,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null
    });

    if (existing) {
      this.db.prepare(`
        UPDATE memory_entries
        SET title = ?, content = ?, content_hash = ?, category = ?, source = ?, confidence = ?, summary = ?, related_files = ?, source_document_id = ?, updated_at = ?, deleted_at = NULL
        WHERE id = ?
      `).run(
        input.title,
        input.content,
        contentHash,
        input.category,
        input.source,
        input.confidence ?? null,
        input.summary ?? null,
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
        summary: input.summary ?? null,
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
        id, project_id, title, content, content_hash, category, source, confidence, summary, related_files, source_document_id, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.projectId,
      record.title,
      record.content,
      record.contentHash,
      record.category,
      record.source,
      record.confidence ?? null,
      record.summary ?? null,
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
        id, project_id, title, content, content_hash, category, source, confidence, summary, related_files, source_document_id, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id,
      entry.projectId,
      entry.title,
      entry.content,
      entry.contentHash,
      entry.category,
      entry.source,
      entry.confidence ?? null,
      entry.summary ?? null,
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
      summary: string | null;
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
    if (input.summary !== undefined) {
      fieldsToUpdate.push('summary = ?');
      params.push(input.summary);
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
             category, source, confidence, summary, related_files AS relatedFiles, source_document_id AS sourceDocumentId,
             created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
      FROM memory_entries
      WHERE id = ?
    `).get(entryId) as any | undefined;

    return row ? this.mapRowToEntry(row) : null;
  }

  public findByProjectAndHash(projectId: string, contentHash: string, category: string): MemoryEntry | null {
    const row = this.db.prepare(`
      SELECT id, project_id AS projectId, title, content, content_hash AS contentHash,
             category, source, confidence, summary, related_files AS relatedFiles, source_document_id AS sourceDocumentId,
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
             category, source, confidence, summary, related_files AS relatedFiles, source_document_id AS sourceDocumentId,
             created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
      FROM memory_entries
      WHERE project_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC
    `).all(projectId) as any[];

    return rows.map((row) => this.mapRowToEntry(row));
  }

  public search(options: MemorySearchOptions): Array<MemoryEntry & { tags: string[]; relationships: Relationship[]; score: number }> {
    const whereClauses: string[] = ['me.deleted_at IS NULL'];
    const joins: string[] = [];
    const params: any[] = [];

    if (options.projectId) {
      whereClauses.push('me.project_id = ?');
      params.push(options.projectId);
    }

    if (options.category) {
      whereClauses.push('me.category = ?');
      params.push(options.category);
    }

    if (options.minConfidence !== undefined && options.minConfidence !== null) {
      whereClauses.push('me.confidence >= ?');
      params.push(options.minConfidence);
    }

    if (options.source) {
      joins.push('LEFT JOIN source_documents sd ON sd.id = me.source_document_id');
      whereClauses.push('sd.path = ?');
      params.push(options.source);
    }

    if (options.tags && options.tags.length > 0) {
      const tagPlaceholders = options.tags.map(() => '?').join(', ');
      const lowerTags = options.tags.map(t => t.toLowerCase());

      if (options.tagOperator === 'OR') {
        whereClauses.push(`me.id IN (
          SELECT met.entry_id
          FROM memory_entry_tags met
          JOIN tags t ON t.id = met.tag_id
          WHERE LOWER(t.name) IN (${tagPlaceholders})
        )`);
        params.push(...lowerTags);
      } else {
        // Default to AND
        whereClauses.push(`me.id IN (
          SELECT met.entry_id
          FROM memory_entry_tags met
          JOIN tags t ON t.id = met.tag_id
          WHERE LOWER(t.name) IN (${tagPlaceholders})
          GROUP BY met.entry_id
          HAVING COUNT(DISTINCT LOWER(t.name)) = ?
        )`);
        params.push(...lowerTags, lowerTags.length);
      }
    }

    if (options.query) {
      const queryLower = options.query.trim().toLowerCase();
      const queryPattern = `%${queryLower}%`;
      whereClauses.push(`(
        LOWER(me.title) LIKE ? OR
        LOWER(me.content) LIKE ? OR
        me.id IN (
          SELECT met.entry_id
          FROM memory_entry_tags met
          JOIN tags t ON t.id = met.tag_id
          WHERE LOWER(t.name) LIKE ?
        )
      )`);
      params.push(queryPattern, queryPattern, queryPattern);
    }

    const sql = `
      SELECT me.id, me.project_id AS projectId, me.title, me.content, me.content_hash AS contentHash,
             me.category, me.source, me.confidence, me.summary, me.source_document_id AS sourceDocumentId,
             me.created_at AS createdAt, me.updated_at AS updatedAt, me.deleted_at AS deletedAt
      FROM memory_entries me
      ${joins.join('\n      ')}
      WHERE ${whereClauses.join(' AND ')}
    `;

    const rows = this.db.prepare(sql).all(...params) as any[];

    const results = rows.map((row) => {
      let score = 100;
      const entryTags = this.listTagsForEntry(row.id);

      if (options.query) {
        const queryLower = options.query.trim().toLowerCase();
        const titleLower = row.title.toLowerCase();
        const contentLower = (row.content ?? '').toLowerCase();

        if (titleLower === queryLower) {
          score = 100;
        } else if (titleLower.includes(queryLower)) {
          score = 80;
        } else if (entryTags.some(t => t.toLowerCase() === queryLower)) {
          score = 90;
        } else if (entryTags.some(t => t.toLowerCase().includes(queryLower))) {
          score = 70;
        } else if (contentLower.includes(queryLower)) {
          score = 50;
        } else {
          score = 10;
        }
      }

      const mapped = this.mapRowToEntry(row);
      return {
        ...mapped,
        content: options.includeContent ? (row.content ?? '') : '',
        contentHash: options.includeContent ? mapped.contentHash : 'OMITTED',
        tags: entryTags,
        relationships: this.listRelationshipsForEntry(row.id),
        score
      };
    });

    const limit = options.limit ?? 20;
    return results
      .sort((left, right) => right.score - left.score || right.updatedAt - left.updatedAt)
      .slice(0, limit);
  }

  public listAllCategories(projectId?: string): string[] {
    if (projectId) {
      const rows = this.db.prepare(`
        SELECT DISTINCT category
        FROM memory_entries
        WHERE project_id = ? AND deleted_at IS NULL
        ORDER BY category ASC
      `).all(projectId) as Array<{ category: string }>;
      return rows.map(r => r.category);
    } else {
      const rows = this.db.prepare(`
        SELECT DISTINCT category
        FROM memory_entries
        WHERE deleted_at IS NULL
        ORDER BY category ASC
      `).all() as Array<{ category: string }>;
      return rows.map(r => r.category);
    }
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
      content: row.content ?? '',
      contentHash: row.contentHash,
      category: row.category,
      source: row.source,
      confidence: row.confidence !== null && row.confidence !== undefined ? Number(row.confidence) : null,
      summary: row.summary ?? null,
      relatedFiles: relatedFiles,
      sourceDocumentId: row.sourceDocumentId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt
    });
  }
}
