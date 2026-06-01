import Database from 'better-sqlite3';
import { MemoryEntry, MemoryEntryInput, MemoryEntrySchema } from '../../../domain/entities/MemoryEntry';
import { Relationship } from '../../../domain/entities/Relationship';
import { IMemoryEntryRepository, MemorySearchOptions } from '../../../domain/repositories/interfaces';
import { createId, now } from '../helpers';

export interface MemoryEntryRecord extends MemoryEntry {
  tags: string[];
  relationships: Relationship[];
}

export class MemoryEntryRepository implements IMemoryEntryRepository {
  private hasFtsSearchIndexCache: boolean | null = null;

  constructor(private readonly db: Database.Database) { }

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

      this.refreshSearchIndex(existing.id);
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

    this.refreshSearchIndex(record.id);
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

    this.refreshSearchIndex(entry.id);
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
      this.refreshSearchIndex(entryId);
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
      DELETE FROM memory_entry_tags
      WHERE entry_id = ?
    `).run(entryId);

    if (this.hasFtsSearchIndex()) {
      this.db.prepare(`
        DELETE FROM memory_entries_fts
        WHERE entry_id = ?
      `).run(entryId);
    }

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
    if (options.query?.trim() && this.hasFtsSearchIndex()) {
      const ftsResults = this.searchWithFts({
        ...options,
        query: options.query.trim()
      });

      if (ftsResults.length > 0) {
        return ftsResults;
      }
    }

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

  public refreshSearchIndex(entryId: string): void {
    if (!this.hasFtsSearchIndex()) {
      return;
    }

    const row = this.db.prepare(`
      SELECT me.id AS entryId, me.project_id AS projectId, me.title, me.summary, me.content, me.category
      FROM memory_entries me
      WHERE me.id = ? AND me.deleted_at IS NULL
    `).get(entryId) as
      | { entryId: string; projectId: string; title: string; summary: string | null; content: string; category: string }
      | undefined;

    if (!row) {
      this.db.prepare(`
        DELETE FROM memory_entries_fts
        WHERE entry_id = ?
      `).run(entryId);
      return;
    }

    const tags = this.db.prepare(`
      SELECT COALESCE(GROUP_CONCAT(tag_name, ' '), '') AS tags
      FROM (
        SELECT DISTINCT t.name AS tag_name
        FROM memory_entry_tags met
        INNER JOIN tags t ON t.id = met.tag_id
        WHERE met.entry_id = ?
        ORDER BY tag_name ASC
      )
    `).get(entryId) as { tags?: string } | undefined;

    this.db.prepare(`
      DELETE FROM memory_entries_fts
      WHERE entry_id = ?
    `).run(entryId);

    this.db.prepare(`
      INSERT INTO memory_entries_fts (
        entry_id,
        project_id,
        title,
        summary,
        content,
        tags,
        category
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.entryId,
      row.projectId,
      row.title,
      row.summary ?? '',
      row.content,
      tags?.tags ?? '',
      row.category
    );
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

  private searchWithFts(options: MemorySearchOptions): Array<MemoryEntry & { tags: string[]; relationships: Relationship[]; score: number }> {
    const query = options.query?.trim();
    if (!query) {
      return [];
    }

    const ftsQuery = this.buildFtsQuery(query);
    if (!ftsQuery) {
      return [];
    }

    const params: any[] = [ftsQuery];
    const whereClauses: string[] = ['me.deleted_at IS NULL'];
    const joins: string[] = [
      `INNER JOIN (
        SELECT entry_id, bm25(memory_entries_fts) AS fts_rank
        FROM memory_entries_fts
        WHERE memory_entries_fts MATCH ?
      ) fts ON fts.entry_id = me.id`
    ];

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
      const lowerTags = options.tags.map((tag) => tag.toLowerCase());

      if (options.tagOperator === 'OR') {
        whereClauses.push(`me.id IN (
          SELECT met.entry_id
          FROM memory_entry_tags met
          JOIN tags t ON t.id = met.tag_id
          WHERE LOWER(t.name) IN (${tagPlaceholders})
        )`);
        params.push(...lowerTags);
      } else {
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

    const contentSelect = options.includeContent ? 'me.content' : "''";
    const sql = `
      SELECT me.id, me.project_id AS projectId, me.title, ${contentSelect} AS content, me.content_hash AS contentHash,
             me.category, me.source, me.confidence, me.summary, me.source_document_id AS sourceDocumentId,
             me.created_at AS createdAt, me.updated_at AS updatedAt, me.deleted_at AS deletedAt,
             fts.fts_rank AS ftsRank
      FROM memory_entries me
      ${joins.join('\n      ')}
      WHERE ${whereClauses.join(' AND ')}
    `;

    const rows = this.db.prepare(sql).all(...params) as Array<any & { ftsRank: number }>;

    const results = rows.map((row) => {
      const entryTags = this.listTagsForEntry(row.id);
      const metadataScore = this.calculateMetadataScore(row.title, row.category, entryTags, query);
      const confidenceScore = this.calculateConfidenceScore(row.confidence);
      const recencyScore = this.calculateRecencyScore(row.updatedAt);
      const ftsScore = this.calculateFtsScore(row.ftsRank);
      const score = (ftsScore * 1000) + (metadataScore * 10) + confidenceScore + recencyScore;
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
      .sort((left, right) => {
        const confidenceDiff = (right.confidence ?? 0) - (left.confidence ?? 0);
        return right.score - left.score || confidenceDiff || right.updatedAt - left.updatedAt || left.id.localeCompare(right.id);
      })
      .slice(0, limit);
  }

  private hasFtsSearchIndex(): boolean {
    if (this.hasFtsSearchIndexCache !== null) {
      return this.hasFtsSearchIndexCache;
    }

    const row = this.db.prepare(`
      SELECT 1 AS present
      FROM sqlite_master
      WHERE type = 'table' AND name = 'memory_entries_fts'
    `).get() as { present?: number } | undefined;

    this.hasFtsSearchIndexCache = !!row?.present;
    return this.hasFtsSearchIndexCache;
  }

  private buildFtsQuery(query: string): string | null {
    const tokens = query
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0)
      .map((token) => token.replace(/["']/g, ''))
      .filter((token) => token.length > 0);

    if (tokens.length === 0) {
      return null;
    }

    return tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(' AND ');
  }

  private calculateMetadataScore(title: string, category: string, tags: string[], query: string): number {
    const queryLower = query.toLowerCase();
    const titleLower = title.toLowerCase();
    const categoryLower = category.toLowerCase();
    const lowerTags = tags.map((tag) => tag.toLowerCase());

    if (titleLower === queryLower) {
      return 100;
    }

    if (titleLower.includes(queryLower)) {
      return 80;
    }

    if (lowerTags.some((tag) => tag === queryLower)) {
      return 90;
    }

    if (lowerTags.some((tag) => tag.includes(queryLower))) {
      return 70;
    }

    if (categoryLower === queryLower) {
      return 60;
    }

    if (categoryLower.includes(queryLower)) {
      return 40;
    }

    return 10;
  }

  private calculateConfidenceScore(confidence: number | null | undefined): number {
    if (confidence === null || confidence === undefined) {
      return 0;
    }

    return Math.max(0, Math.min(100, confidence));
  }

  private calculateRecencyScore(updatedAt: number): number {
    const ageDays = Math.max(0, (Date.now() - updatedAt) / 86_400_000);
    return Math.max(0, 100 - Math.min(100, ageDays));
  }

  private calculateFtsScore(rawRank: number | null | undefined): number {
    if (rawRank === null || rawRank === undefined || Number.isNaN(rawRank)) {
      return 0;
    }

    return Math.max(0, -rawRank);
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
