import Database from 'better-sqlite3';
import { createId, now } from '../helpers';
import { Relationship, RelationshipInput } from '../../../domain/entities/Relationship';
import { IRelationshipRepository } from '../../../domain/repositories/interfaces';

export class RelationshipRepository implements IRelationshipRepository {
  constructor(private readonly db: Database.Database) {}

  public upsert(projectId: string, sourceEntryId: string, relationship: RelationshipInput): Relationship {
    const existing = this.findByLogicalKey(projectId, sourceEntryId, relationship.targetEntryId, relationship.relationshipType);
    if (existing) {
      return existing;
    }

    const record: Relationship = {
      id: createId(),
      projectId,
      sourceEntryId,
      targetEntryId: relationship.targetEntryId,
      relationshipType: relationship.relationshipType,
      createdAt: now()
    };

    this.db.prepare(`
      INSERT INTO relationships (id, project_id, source_entry_id, target_entry_id, relationship_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.projectId,
      record.sourceEntryId,
      record.targetEntryId,
      record.relationshipType,
      record.createdAt
    );

    return record;
  }

  public listForSourceEntry(sourceEntryId: string): Relationship[] {
    const rows = this.db.prepare(`
      SELECT id, project_id AS projectId, source_entry_id AS sourceEntryId,
             target_entry_id AS targetEntryId, relationship_type AS relationshipType, created_at AS createdAt
      FROM relationships
      WHERE source_entry_id = ?
      ORDER BY created_at DESC
    `).all(sourceEntryId) as Relationship[];

    return rows;
  }

  public findByLogicalKey(projectId: string, sourceEntryId: string, targetEntryId: string, relationshipType: string): Relationship | null {
    const row = this.db.prepare(`
      SELECT id, project_id AS projectId, source_entry_id AS sourceEntryId,
             target_entry_id AS targetEntryId, relationship_type AS relationshipType, created_at AS createdAt
      FROM relationships
      WHERE project_id = ? AND source_entry_id = ? AND target_entry_id = ? AND relationship_type = ?
    `).get(projectId, sourceEntryId, targetEntryId, relationshipType) as Relationship | undefined;

    return row ?? null;
  }
}
