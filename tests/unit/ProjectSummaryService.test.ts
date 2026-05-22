import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { ProjectSummaryRepository } from '../../src/infrastructure/database/repositories/ProjectSummaryRepository';
import { ProjectSummaryService } from '../../src/application/services/ProjectSummaryService';

describe('ProjectSummaryService', () => {
  let db: any;
  let projectRepo: ProjectRepository;
  let summaryRepo: ProjectSummaryRepository;
  let service: ProjectSummaryService;
  const testDbFile = path.resolve(__dirname, 'project-summary-workspace', 'flashmem.sqlite');
  const workspaceRoot = path.dirname(testDbFile);

  beforeEach(() => {
    fs.removeSync(path.dirname(testDbFile));
    db = createDatabaseConnection(testDbFile);
    new SchemaMigrationService(db).ensureCurrentSchema();

    projectRepo = new ProjectRepository(db);
    summaryRepo = new ProjectSummaryRepository(db);
    const project = projectRepo.upsertByRootPath(workspaceRoot, 'project-summary-workspace');
    service = new ProjectSummaryService(project.id, projectRepo, summaryRepo);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    fs.removeSync(path.dirname(testDbFile));
  });

  it('returns a structured missing state when no summary has been stored', () => {
    const result = service.getProjectSummary();

    expect(result).toEqual({
      status: 'missing',
      message: 'Project summary has not been configured yet.'
    });
  });

  it('updates and overwrites the canonical project summary atomically', () => {
    const first = service.updateProjectSummary({
      projectName: 'project-summary-workspace',
      purpose: 'Quick project context for AI agents',
      techStack: 'Node.js, TypeScript, SQLite',
      architectureStyle: 'Layered local MCP server',
      importantConventions: 'Keep transports thin and validate at the boundary',
      knownConstraints: 'Local-only, no network egress',
      securitySensitiveAreas: 'MCP handlers and repository boundaries'
    });

    const second = service.updateProjectSummary({
      projectName: 'project-summary-workspace',
      purpose: 'Updated purpose text',
      techStack: 'Node.js, TypeScript, SQLite, Zod',
      architectureStyle: 'Layered local MCP server',
      importantConventions: 'Keep transports thin and validate at the boundary',
      knownConstraints: 'Local-only, no network egress',
      securitySensitiveAreas: 'MCP handlers and repository boundaries'
    });

    expect(second.status).toBe('updated');
    expect(second.summary.purpose).toBe('Updated purpose text');
    expect(second.summary.lastUpdatedAt).toBeGreaterThanOrEqual(first.summary.lastUpdatedAt);

    const ready = service.getProjectSummary();
    expect(ready.status).toBe('ready');

    if (ready.status !== 'ready') {
      throw new Error('Expected ready summary');
    }

    expect(ready.summary.purpose).toBe('Updated purpose text');
  });

  it('rejects whitespace-only and oversized summary fields', () => {
    expect(() => {
      service.updateProjectSummary({
        projectName: '   ',
        purpose: 'Quick project context for AI agents',
        techStack: 'Node.js, TypeScript, SQLite',
        architectureStyle: 'Layered local MCP server',
        importantConventions: 'Keep transports thin and validate at the boundary',
        knownConstraints: 'Local-only, no network egress',
        securitySensitiveAreas: 'MCP handlers and repository boundaries'
      });
    }).toThrow();

    expect(() => {
      service.updateProjectSummary({
        projectName: 'x'.repeat(1000),
        purpose: 'y'.repeat(1000),
        techStack: 'z'.repeat(1000),
        architectureStyle: 'a'.repeat(1000),
        importantConventions: 'b'.repeat(1000),
        knownConstraints: 'c'.repeat(1000),
        securitySensitiveAreas: 'd'.repeat(1000)
      });
    }).toThrow(/4000/);
  });
});
