import Database from 'better-sqlite3';
import { createId, now, normalizeProjectPath } from '../helpers';
import { Project, ProjectSchema } from '../../../domain/entities/Project';
import { IProjectRepository } from '../../../domain/repositories/interfaces';

export class ProjectRepository implements IProjectRepository {
  constructor(private readonly db: Database.Database) {}

  public upsertByRootPath(rootPath: string, name: string): Project {
    const normalizedRootPath = normalizeProjectPath(rootPath);
    const existing = this.findByRootPath(normalizedRootPath);
    const timestamp = now();

    if (existing) {
      this.db.prepare(`
        UPDATE projects
        SET name = ?, updated_at = ?
        WHERE id = ?
      `).run(name, timestamp, existing.id);

      return {
        ...existing,
        name,
        updatedAt: timestamp
      };
    }

    const project: Project = ProjectSchema.parse({
      id: createId(),
      rootPath: normalizedRootPath,
      name,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    this.db.prepare(`
      INSERT INTO projects (id, root_path, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(project.id, project.rootPath, project.name, project.createdAt, project.updatedAt);

    return project;
  }

  public findByRootPath(rootPath: string): Project | null {
    const row = this.db.prepare(`
      SELECT id, root_path AS rootPath, name, created_at AS createdAt, updated_at AS updatedAt
      FROM projects
      WHERE root_path = ?
    `).get(normalizeProjectPath(rootPath)) as Project | undefined;

    return row ? ProjectSchema.parse(row) : null;
  }

  public findById(projectId: string): Project | null {
    const row = this.db.prepare(`
      SELECT id, root_path AS rootPath, name, created_at AS createdAt, updated_at AS updatedAt
      FROM projects
      WHERE id = ?
    `).get(projectId) as Project | undefined;

    return row ? ProjectSchema.parse(row) : null;
  }

  public ensureById(projectId: string, fallbackName?: string): Project {
    const existing = this.findById(projectId);
    if (existing) {
      return existing;
    }

    const timestamp = now();
    const project: Project = ProjectSchema.parse({
      id: projectId,
      rootPath: projectId,
      name: fallbackName ?? projectId,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    this.db.prepare(`
      INSERT INTO projects (id, root_path, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(project.id, project.rootPath, project.name, project.createdAt, project.updatedAt);

    return project;
  }
}
