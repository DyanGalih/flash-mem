import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { performance } from 'node:perf_hooks';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { createMcpServer } from '../../src/mcp/server';

describe('get_relevant_context tool integration', () => {
  let db: any;
  const testDbFile = path.resolve(__dirname, 'get-relevant-context-workspace', 'flashmem.sqlite');
  const workspaceRoot = path.dirname(testDbFile);

  beforeEach(() => {
    fs.removeSync(path.dirname(testDbFile));
    db = createDatabaseConnection(testDbFile);
    new SchemaMigrationService(db).ensureCurrentSchema();
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    fs.removeSync(path.dirname(testDbFile));
  });

  it('registers the get_relevant_context tool and conforms to JSON-RPC scheme', async () => {
    const project = new ProjectRepository(db).upsertByRootPath(workspaceRoot, 'get-relevant-context-workspace');
    const server = createMcpServer({ db, workspaceRoot });

    // Seed some test data via add_memory tool
    await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'add_memory',
        arguments: {
          projectId: project.id,
          title: 'JWT Refresh Token Rotation Pattern',
          content: 'Rotate refresh tokens on each request to prevent reuse attacks.',
          category: 'pattern',
          source: 'src/auth/jwt.ts',
          tags: ['jwt', 'auth', 'rotation'],
          confidence: 90
        }
      }
    });

    await server.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'add_memory',
        arguments: {
          projectId: project.id,
          title: 'JWT Secret Rotation Decision',
          content: 'Use an asynchronous rotation runner for secrets.',
          category: 'decision',
          source: 'src/auth/secrets.ts',
          tags: ['jwt', 'decision'],
          confidence: 85
        }
      }
    });

    // Execute get_relevant_context tool
    const start = performance.now();
    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'get_relevant_context',
        arguments: {
          projectId: project.id,
          query: 'JWT'
        }
      }
    });
    const duration = performance.now() - start;

    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();

    const result = response.result as any;
    expect(result).toHaveProperty('project');
    expect(result.project).toHaveProperty('id', project.id);
    expect(result).toHaveProperty('query', 'JWT');
    expect(result).toHaveProperty('context');
    expect(result.context).toHaveProperty('relatedPatterns');
    expect(result.context).toHaveProperty('relatedDecisions');
    expect(result.context).toHaveProperty('securityNotes');
    expect(result.context).toHaveProperty('knownRisks');
    expect(result.context).toHaveProperty('relevantConventions');

    // Verify correct mapping
    expect(result.context.relatedPatterns.length).toBe(1);
    expect(result.context.relatedPatterns[0].title).toBe('JWT Refresh Token Rotation Pattern');
    expect(result.context.relatedPatterns[0]).not.toHaveProperty('content'); // token minimization

    expect(result.context.relatedDecisions.length).toBe(1);
    expect(result.context.relatedDecisions[0].title).toBe('JWT Secret Rotation Decision');

    expect(result).toHaveProperty('markdown');
    expect(result.markdown).toContain('# Relevant Context: "JWT"');
    expect(result.markdown).toContain('## Related Patterns');
    expect(result.markdown).toContain('## Related Decisions');

    // Performance gate check
    expect(duration).toBeLessThan(200);
  });

  it('rejects empty and whitespace-only queries via JSON-RPC validation', async () => {
    const project = new ProjectRepository(db).upsertByRootPath(workspaceRoot, 'get-relevant-context-workspace');
    const server = createMcpServer({ db, workspaceRoot });

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'get_relevant_context',
        arguments: {
          projectId: project.id,
          query: '   '
        }
      }
    });

    expect(response.error).toBeDefined();
    // Zod parsing error or tool execution error
    expect(response.error?.message).toMatch(/validation|empty|whitespace|too_small/i);
  });
});
