import Database from 'better-sqlite3';
import { KnowledgeObject, KnowledgeObjectInput, KnowledgeObjectSchema } from '../../../domain/entities/KnowledgeObject';
import { KnowledgeRelationship } from '../../../domain/entities/KnowledgeRelationship';
import { IKnowledgeObjectRepository, KnowledgeSearchOptions } from '../../../domain/repositories/interfaces';
import { createId, now } from '../helpers';

export class KnowledgeObjectRepository implements IKnowledgeObjectRepository {
  constructor(private readonly db: Database.Database) { }

  public findById(id: string): KnowledgeObject | null {
    const row = this.db.prepare(`
      SELECT
        id, project_id AS projectId, knowledge_type AS knowledgeType,
        title, content, summary,
        authority_level AS authorityLevel, authority_source AS authoritySource,
        authority_verified_at AS authorityVerifiedAt,
        confidence,
        freshness_status AS freshnessStatus,
        freshness_validated_at AS freshnessValidatedAt,
        scope_level AS scopeLevel, scope_projects AS scopeProjects,
        scope_paths AS scopePaths,
        capture_method AS captureMethod, capture_tool AS captureTool,
        extraction_rule AS extractionRule, hash,
        source_doc_id AS sourceDocId, tags_hash AS tagsHash,
        created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
      FROM knowledge_objects
      WHERE id = ?
    `).get(id) as any | undefined;

    return row ? KnowledgeObjectSchema.parse(row) : null;
  }

  public listByProject(projectId: string): KnowledgeObject[] {
    const rows = this.db.prepare(`
      SELECT
        id, project_id AS projectId, knowledge_type AS knowledgeType,
        title, content, summary,
        authority_level AS authorityLevel, authority_source AS authoritySource,
        authority_verified_at AS authorityVerifiedAt,
        confidence,
        freshness_status AS freshnessStatus,
        freshness_validated_at AS freshnessValidatedAt,
        scope_level AS scopeLevel, scope_projects AS scopeProjects,
        scope_paths AS scopePaths,
        capture_method AS captureMethod, capture_tool AS captureTool,
        extraction_rule AS extractionRule, hash,
        source_doc_id AS sourceDocId, tags_hash AS tagsHash,
        created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
      FROM knowledge_objects
      WHERE project_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC
    `).all(projectId) as any[];

    return rows.map(r => KnowledgeObjectSchema.parse(r));
  }

  public create(input: KnowledgeObjectInput, sourceDocumentId: string | null = null): KnowledgeObject {
    const timestamp = now();
    const authorityLevel = input.authorityLevel ?? 'provisional';
    const hash = this.computeHash({
      knowledgeType: input.knowledgeType,
      title: input.title,
      content: input.content,
      authorityLevel
    });
    const tagsHash = input.tags && input.tags.length > 0
      ? this.hashTags(input.tags)
      : null;

    const record: KnowledgeObject = KnowledgeObjectSchema.parse({
      id: createId(),
      projectId: input.projectId,
      knowledgeType: input.knowledgeType,
      title: input.title,
      content: input.content,
      summary: input.summary ?? null,
      authorityLevel: input.authorityLevel ?? 'provisional',
      authoritySource: input.authoritySource ?? null,
      authorityVerifiedAt: null,
      confidence: input.confidence ?? null,
      freshnessStatus: input.freshnessStatus ?? 'current',
      freshnessValidatedAt: null,
      scopeLevel: input.scopeLevel ?? 'project',
      scopeProjects: input.scopeProjects ?? null,
      scopePaths: input.scopePaths ?? null,
      captureMethod: input.captureMethod ?? 'manual',
      captureTool: input.captureTool ?? 'flash-mem',
      extractionRule: input.extractionRule ?? null,
      hash,
      sourceDocId: sourceDocumentId ?? null,
      tagsHash,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null
    });

    this.db.prepare(`
      INSERT INTO knowledge_objects (
        id, project_id, knowledge_type, title, content, summary,
        authority_level, authority_source, authority_verified_at, confidence,
        freshness_status, freshness_validated_at,
        scope_level, scope_projects, scope_paths,
        capture_method, capture_tool, extraction_rule,
        hash, source_doc_id, tags_hash,
        created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.projectId,
      record.knowledgeType,
      record.title,
      record.content,
      record.summary ?? null,
      record.authorityLevel,
      record.authoritySource ?? null,
      record.authorityVerifiedAt ?? null,
      record.confidence ?? null,
      record.freshnessStatus,
      record.freshnessValidatedAt ?? null,
      record.scopeLevel,
      record.scopeProjects ?? null,
      record.scopePaths ?? null,
      record.captureMethod,
      record.captureTool,
      record.extractionRule ?? null,
      record.hash,
      record.sourceDocId ?? null,
      record.tagsHash ?? null,
      record.createdAt,
      record.updatedAt,
      record.deletedAt ?? null
    );

    this.refreshFtsIndex(record.id);
    return record;
  }

  public update(
    id: string,
    input: Partial<{
      title: string; content: string; knowledgeType: string;
      summary: string | null; authorityLevel: string;
      authoritySource: string | null; confidence: number | null;
      freshnessStatus: string; scopeLevel: string;
      scopeProjects: string | null; scopePaths: string | null;
      captureMethod: string; captureTool: string; extractionRule: string | null;
    }>
  ): KnowledgeObject | null {
    const existing = this.findById(id);
    if (!existing || existing.deletedAt !== null && existing.deletedAt !== undefined) {
      return null;
    }

    const newTitle = input.title ?? existing.title;
    const newContent = input.content ?? existing.content;
    const newKnowledgeType = input.knowledgeType ?? existing.knowledgeType;
    const newAuthorityLevel = input.authorityLevel ?? existing.authorityLevel;
    const newHash = this.computeHash({
      knowledgeType: newKnowledgeType,
      title: newTitle,
      content: newContent,
      authorityLevel: newAuthorityLevel
    });

    const fields: string[] = [];
    const params: any[] = [];

    if (input.title !== undefined) { fields.push('title = ?'); params.push(input.title); }
    if (input.content !== undefined) { fields.push('content = ?'); params.push(input.content); }
    if (input.knowledgeType !== undefined) { fields.push('knowledge_type = ?'); params.push(input.knowledgeType); }
    if (input.summary !== undefined) { fields.push('summary = ?'); params.push(input.summary); }
    if (input.authorityLevel !== undefined) { fields.push('authority_level = ?'); params.push(input.authorityLevel); }
    if (input.authoritySource !== undefined) { fields.push('authority_source = ?'); params.push(input.authoritySource); }
    if (input.confidence !== undefined) { fields.push('confidence = ?'); params.push(input.confidence); }
    if (input.freshnessStatus !== undefined) { fields.push('freshness_status = ?'); params.push(input.freshnessStatus); }
    if (input.scopeLevel !== undefined) { fields.push('scope_level = ?'); params.push(input.scopeLevel); }
    if (input.scopeProjects !== undefined) { fields.push('scope_projects = ?'); params.push(input.scopeProjects); }
    if (input.scopePaths !== undefined) { fields.push('scope_paths = ?'); params.push(input.scopePaths); }
    if (input.captureMethod !== undefined) { fields.push('capture_method = ?'); params.push(input.captureMethod); }
    if (input.captureTool !== undefined) { fields.push('capture_tool = ?'); params.push(input.captureTool); }
    if (input.extractionRule !== undefined) { fields.push('extraction_rule = ?'); params.push(input.extractionRule); }

    fields.push('hash = ?');
    params.push(newHash);

    const timestamp = now();
    fields.push('updated_at = ?');
    params.push(timestamp);

    fields.push('freshness_validated_at = ?');
    params.push(timestamp);

    params.push(id);
    this.db.prepare(`
      UPDATE knowledge_objects
      SET ${fields.join(', ')}
      WHERE id = ?
    `).run(...params);

    const updated = this.findById(id);
    if (updated) {
      this.refreshFtsIndex(id);
    }
    return updated;
  }

  public softDelete(id: string): boolean {
    const result = this.db.prepare(`
      UPDATE knowledge_objects
      SET deleted_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(now(), id);

    try {
      this.db.prepare(`DELETE FROM knowledge_fts WHERE entry_id = ?`).run(id);
    } catch {
      // ponytail: FTS table may not exist or be disabled, swallow gracefully
    }

    return result.changes > 0;
  }

  public findByHash(projectId: string, hash: string): KnowledgeObject | null {
    const row = this.db.prepare(`
      SELECT
        id, project_id AS projectId, knowledge_type AS knowledgeType,
        title, content, summary,
        authority_level AS authorityLevel, authority_source AS authoritySource,
        authority_verified_at AS authorityVerifiedAt,
        confidence,
        freshness_status AS freshnessStatus,
        freshness_validated_at AS freshnessValidatedAt,
        scope_level AS scopeLevel, scope_projects AS scopeProjects,
        scope_paths AS scopePaths,
        capture_method AS captureMethod, capture_tool AS captureTool,
        extraction_rule AS extractionRule, hash,
        source_doc_id AS sourceDocId, tags_hash AS tagsHash,
        created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
      FROM knowledge_objects
      WHERE project_id = ? AND hash = ? AND deleted_at IS NULL
      LIMIT 1
    `).get(projectId, hash) as any | undefined;

    return row ? KnowledgeObjectSchema.parse(row) : null;
  }

  public search(options: KnowledgeSearchOptions): Array<KnowledgeObject & { tags: string[]; relationships: KnowledgeRelationship[]; score: number }> {
    if (options.query?.trim() && this.hasFtsIndex()) {
      const ftsResults = this.searchFts(options);
      if (ftsResults.length > 0) return ftsResults;
    }

    const where: string[] = ['ko.deleted_at IS NULL'];
    const params: any[] = [];

    if (options.projectId) {
      where.push('ko.project_id = ?');
      params.push(options.projectId);
    }
    if (options.knowledgeType) {
      where.push('ko.knowledge_type = ?');
      params.push(options.knowledgeType);
    }
    if (options.minConfidence != null) {
      where.push('ko.confidence >= ?');
      params.push(options.minConfidence);
    }

    const limit = options.limit ?? 100;

    const rows = this.db.prepare(`
      SELECT
        ko.id, ko.project_id AS projectId, ko.knowledge_type AS knowledgeType,
        ko.title, ko.content, ko.summary,
        ko.authority_level AS authorityLevel, ko.authority_source AS authoritySource,
        ko.authority_verified_at AS authorityVerifiedAt,
        ko.confidence,
        ko.freshness_status AS freshnessStatus,
        ko.freshness_validated_at AS freshnessValidatedAt,
        ko.scope_level AS scopeLevel, ko.scope_projects AS scopeProjects,
        ko.scope_paths AS scopePaths,
        ko.capture_method AS captureMethod, ko.capture_tool AS captureTool,
        ko.extraction_rule AS extractionRule, ko.hash,
        ko.source_doc_id AS sourceDocId, ko.tags_hash AS tagsHash,
        ko.created_at AS createdAt, ko.updated_at AS updatedAt, ko.deleted_at AS deletedAt
      FROM knowledge_objects ko
      WHERE ${where.join(' AND ')}
      ORDER BY ko.updated_at DESC
      LIMIT ?
    `).all(...params, limit) as any[];

    return rows.map(r => ({
      ...KnowledgeObjectSchema.parse(r),
      tags: [],
      relationships: [],
      score: 1
    }));
  }

  public refreshFtsIndex(id: string): void {
    if (!this.hasFtsIndex()) return;
    const obj = this.findById(id);
    if (!obj) return;

    this.db.prepare(`DELETE FROM knowledge_fts WHERE entry_id = ?`).run(id);
    this.db.prepare(`
      INSERT INTO knowledge_fts (entry_id, project_id, knowledge_type, title, summary, content, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      obj.id,
      obj.projectId,
      obj.knowledgeType,
      obj.title,
      obj.summary ?? '',
      obj.content,
      obj.tagsHash ?? ''
    );
  }

  private computeHash(input: { knowledgeType: string; title: string; content: string; authorityLevel: string }): string {
    const { createHash } = require('node:crypto') as typeof import('node:crypto');
    return createHash('sha256')
      .update(input.knowledgeType + input.title + input.content + input.authorityLevel)
      .digest('hex');
  }

  private hashTags(tags: string[]): string {
    const { createHash } = require('node:crypto') as typeof import('node:crypto');
    return createHash('sha256').update(tags.sort().join(',')).digest('hex');
  }

  private hasFtsIndex(): boolean {
    const row = this.db.prepare(
      `SELECT value FROM schema_metadata WHERE key = 'fts5_enabled'`
    ).get() as { value?: string } | undefined;
    return row?.value === 'enabled';
  }

  private searchFts(options: KnowledgeSearchOptions): Array<KnowledgeObject & { tags: string[]; relationships: KnowledgeRelationship[]; score: number }> {
    const where: string[] = ['knowledge_fts MATCH ?'];
    const params: any[] = [options.query!.trim()];

    if (options.projectId) {
      where.push('knowledge_fts.project_id = ?');
      params.push(options.projectId);
    }

    const limit = options.limit ?? 100;
    const rows = this.db.prepare(`
      SELECT
        ko.id, ko.project_id AS projectId, ko.knowledge_type AS knowledgeType,
        ko.title, ko.content, ko.summary,
        ko.authority_level AS authorityLevel, ko.authority_source AS authoritySource,
        ko.authority_verified_at AS authorityVerifiedAt,
        ko.confidence,
        ko.freshness_status AS freshnessStatus,
        ko.freshness_validated_at AS freshnessValidatedAt,
        ko.scope_level AS scopeLevel, ko.scope_projects AS scopeProjects,
        ko.scope_paths AS scopePaths,
        ko.capture_method AS captureMethod, ko.capture_tool AS captureTool,
        ko.extraction_rule AS extractionRule, ko.hash,
        ko.source_doc_id AS sourceDocId, ko.tags_hash AS tagsHash,
        ko.created_at AS createdAt, ko.updated_at AS updatedAt, ko.deleted_at AS deletedAt,
        rank
      FROM knowledge_fts
      JOIN knowledge_objects ko ON ko.rowid = knowledge_fts.rowid
      WHERE ${where.join(' AND ')} AND ko.deleted_at IS NULL
      ORDER BY rank
      LIMIT ?
    `).all(...params, limit) as any[];

    return rows.map((r: any) => ({
      ...KnowledgeObjectSchema.parse(r),
      tags: [],
      relationships: [],
      score: 1 / (1 + (r.rank || 0))
    }));
  }
}

export function knowledgeEntryToObject(row: any): KnowledgeObject {
  return KnowledgeObjectSchema.parse(row);
}