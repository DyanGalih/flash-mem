import Database from 'better-sqlite3';
import { ProjectSummary, ProjectSummaryInput, ProjectSummarySchema } from '../../../domain/entities/ProjectSummary';
import { IProjectSummaryRepository } from '../../../domain/repositories/interfaces';
import { now } from '../helpers';

interface ProjectSummaryRow {
  projectId: string;
  projectName: string;
  purpose: string;
  techStack: string;
  architectureStyle: string;
  importantConventions: string;
  knownConstraints: string;
  securitySensitiveAreas: string;
  lastUpdatedAt: number;
}

export class ProjectSummaryRepository implements IProjectSummaryRepository {
  constructor(private readonly db: Database.Database) {}

  public findByProjectId(projectId: string): ProjectSummary | null {
    const row = this.db.prepare(`
      SELECT
        project_id AS projectId,
        project_name AS projectName,
        purpose,
        tech_stack AS techStack,
        architecture_style AS architectureStyle,
        important_conventions AS importantConventions,
        known_constraints AS knownConstraints,
        security_sensitive_areas AS securitySensitiveAreas,
        last_updated_at AS lastUpdatedAt
      FROM project_summaries
      WHERE project_id = ?
    `).get(projectId) as ProjectSummaryRow | undefined;

    return row ? ProjectSummarySchema.parse(row) : null;
  }

  public upsert(projectId: string, input: ProjectSummaryInput): ProjectSummary {
    const record: ProjectSummary = ProjectSummarySchema.parse({
      projectId,
      ...input,
      lastUpdatedAt: now()
    });

    this.db.prepare(`
      INSERT INTO project_summaries (
        project_id,
        project_name,
        purpose,
        tech_stack,
        architecture_style,
        important_conventions,
        known_constraints,
        security_sensitive_areas,
        last_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        project_name = excluded.project_name,
        purpose = excluded.purpose,
        tech_stack = excluded.tech_stack,
        architecture_style = excluded.architecture_style,
        important_conventions = excluded.important_conventions,
        known_constraints = excluded.known_constraints,
        security_sensitive_areas = excluded.security_sensitive_areas,
        last_updated_at = excluded.last_updated_at
    `).run(
      record.projectId,
      record.projectName,
      record.purpose,
      record.techStack,
      record.architectureStyle,
      record.importantConventions,
      record.knownConstraints,
      record.securitySensitiveAreas,
      record.lastUpdatedAt
    );

    return record;
  }
}
