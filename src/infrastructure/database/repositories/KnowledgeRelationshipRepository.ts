import Database from 'better-sqlite3';
import { KnowledgeRelationship, KnowledgeRelationshipInput, KnowledgeRelationshipInputSchema, KnowledgeRelationshipSchema } from '../../../domain/entities/KnowledgeRelationship';
import { IKnowledgeRelationshipRepository } from '../../../domain/repositories/interfaces';
import { createId, now } from '../helpers';

export class KnowledgeRelationshipRepository implements IKnowledgeRelationshipRepository {
  constructor(private readonly db: Database.Database) { }

  public listForSource(sourceId: string): KnowledgeRelationship[] {
    const rows = this.db.prepare(`
      SELECT
        id, project_id AS projectId,
        source_id AS sourceId, target_id AS targetId, rel_type AS relType,
        created_at AS createdAt
      FROM knowledge_rels
      WHERE source_id = ?
      ORDER BY created_at ASC
    `).all(sourceId) as any[];

    return rows.map(r => KnowledgeRelationshipSchema.parse(r));
  }

  public upsert(projectId: string, sourceId: string, input: KnowledgeRelationshipInput): KnowledgeRelationship {
    const validated = KnowledgeRelationshipInputSchema.parse(input);
    const timestamp = now();
    const id = createId();

    const existing = this.db.prepare(`
      SELECT id FROM knowledge_rels
      WHERE project_id = ? AND source_id = ? AND target_id = ? AND rel_type = ?
      LIMIT 1
    `).get(projectId, validated.sourceId, validated.targetId, validated.relType) as { id?: string } | undefined;

    const relId = existing?.id ?? id;

    this.db.prepare(`
      INSERT OR REPLACE INTO knowledge_rels (
        id, project_id, source_id, target_id, rel_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      relId,
      projectId,
      validated.sourceId,
      validated.targetId,
      validated.relType,
      timestamp
    );

    return KnowledgeRelationshipSchema.parse({
      id: relId,
      projectId,
      sourceId: validated.sourceId,
      targetId: validated.targetId,
      relType: validated.relType,
      createdAt: timestamp
    });
  }
}