import Database from 'better-sqlite3';
import { AuthorityChain, AuthorityChainInput, AuthorityChainSchema } from '../../../domain/entities/AuthorityChain';
import { IAuthorityChainRepository } from '../../../domain/repositories/interfaces';
import { createId, now } from '../helpers';

export class AuthorityChainRepository implements IAuthorityChainRepository {
  constructor(private readonly db: Database.Database) { }

  public listForKnowledge(objectId: string): AuthorityChain[] {
    const rows = this.db.prepare(`
      SELECT
        id, project_id AS projectId,
        object_id AS objectId,
        previous_hash AS previousHash,
        superseded_by AS supersededBy,
        change_reason AS changeReason,
        changed_at AS changedAt,
        changed_by AS changedBy
      FROM authority_chain
      WHERE object_id = ?
      ORDER BY changed_at ASC
    `).all(objectId) as any[];

    return rows.map(r => AuthorityChainSchema.parse(r));
  }

  public append(projectId: string, input: AuthorityChainInput): AuthorityChain {
    const timestamp = now();

    const record = AuthorityChainSchema.omit({
      id: true,
      projectId: true,
      supersededBy: true,
      changedAt: true
    }).parse(input);

    const entry: AuthorityChain = {
      id: createId(),
      projectId,
      objectId: input.objectId,
      previousHash: input.previousHash ?? null,
      supersededBy: null,
      changeReason: input.changeReason,
      changedAt: timestamp,
      changedBy: input.changedBy ?? null
    };

    this.db.prepare(`
      INSERT INTO authority_chain (
        id, project_id, object_id, previous_hash,
        superseded_by, change_reason, changed_at, changed_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id,
      entry.projectId,
      entry.objectId,
      entry.previousHash ?? null,
      entry.supersededBy ?? null,
      entry.changeReason,
      entry.changedAt,
      entry.changedBy ?? null
    );

    return entry;
  }
}