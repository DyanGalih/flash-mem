import Database from 'better-sqlite3';
import { createId, now, normalizeName } from '../helpers';
import { Tag, TagSchema } from '../../../domain/entities/Tag';
import { ITagRepository } from '../../../domain/repositories/interfaces';

export class TagRepository implements ITagRepository {
  constructor(private readonly db: Database.Database) {}

  public getOrCreate(projectId: string, name: string): Tag {
    const normalizedName = normalizeName(name);
    const existing = this.findByProjectAndName(projectId, normalizedName);

    if (existing) {
      return existing;
    }

    const tag: Tag = TagSchema.parse({
      id: createId(),
      projectId,
      name: normalizedName,
      createdAt: now()
    });

    this.db.prepare(`
      INSERT INTO tags (id, project_id, name, created_at)
      VALUES (?, ?, ?, ?)
    `).run(tag.id, tag.projectId, tag.name, tag.createdAt);

    return tag;
  }

  public findByProjectAndName(projectId: string, name: string): Tag | null {
    const row = this.db.prepare(`
      SELECT id, project_id AS projectId, name, created_at AS createdAt
      FROM tags
      WHERE project_id = ? AND name = ?
    `).get(projectId, normalizeName(name)) as Tag | undefined;

    return row ? TagSchema.parse(row) : null;
  }

  public listForEntry(entryId: string): Tag[] {
    const rows = this.db.prepare(`
      SELECT t.id, t.project_id AS projectId, t.name, t.created_at AS createdAt
      FROM tags t
      INNER JOIN memory_entry_tags met ON met.tag_id = t.id
      WHERE met.entry_id = ?
      ORDER BY t.name ASC
    `).all(entryId) as Tag[];

    return rows.map((row) => TagSchema.parse(row));
  }

  public replaceEntryTags(entryId: string, tagNames: string[]): Tag[] {
    this.db.prepare(`DELETE FROM memory_entry_tags WHERE entry_id = ?`).run(entryId);
    this.db.prepare(`DELETE FROM entries_tags WHERE entry_id = ?`).run(entryId);

    const tags: Tag[] = [];
    for (const tagName of tagNames) {
      const tag = this.getOrCreateFromEntry(entryId, tagName);
      this.db.prepare(`
        INSERT OR IGNORE INTO memory_entry_tags (entry_id, tag_id)
        VALUES (?, ?)
      `).run(entryId, tag.id);
      this.db.prepare(`
        INSERT OR IGNORE INTO entries_tags (entry_id, tag_id)
        VALUES (?, ?)
      `).run(entryId, tag.id);
      tags.push(tag);
    }
    return tags;
  }

  private getOrCreateFromEntry(entryId: string, name: string): Tag {
    const projectRow = this.db.prepare(`
      SELECT project_id AS projectId
      FROM memory_entries
      WHERE id = ?
    `).get(entryId) as { projectId?: string } | undefined;

    if (!projectRow?.projectId) {
      throw new Error(`Cannot resolve project for memory entry "${entryId}"`);
    }

    return this.getOrCreate(projectRow.projectId, name);
  }
}
