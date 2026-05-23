import * as fs from 'fs-extra';
import { performance } from 'node:perf_hooks';
import { PassThrough } from 'node:stream';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { createMcpServer, startMcpServer } from '../../src/mcp/server';

describe('MCP Server Foundation', () => {
  let db: any;
  const testDbFile = path.resolve(__dirname, 'mcp-tools-workspace', 'flashmem.sqlite');
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

  it('registers the required tools with schemas', () => {
    const project = new ProjectRepository(db).upsertByRootPath(workspaceRoot, 'mcp-tools-workspace');
    const server = createMcpServer({ db, workspaceRoot });

    const toolNames = server.listTools().map((tool) => tool.name);
    expect(toolNames).toEqual(expect.arrayContaining([
      'get_project_summary',
      'update_project_summary',
      'search_memory',
      'get_relevant_context',
      'capture_artifact_memory',
      'add_memory',
      'export_markdown',
      'rebuild_index'
    ]));
    expect(server.listTools()[0]).toHaveProperty('schema');
    expect(project.name).toBe('mcp-tools-workspace');
  });

  it('discovers the required tools within the startup target window', () => {
    const start = performance.now();
    const server = createMcpServer({ db, workspaceRoot });
    const elapsed = performance.now() - start;

    expect(server.listTools().map((tool) => tool.name)).toEqual(expect.arrayContaining([
      'get_project_summary',
      'update_project_summary',
      'search_memory',
      'get_relevant_context',
      'capture_artifact_memory',
      'add_memory',
      'export_markdown',
      'rebuild_index'
    ]));
    expect(elapsed).toBeLessThan(30000);
  });

  it('responds to JSON-RPC tool listing and tool calls', async () => {
    const project = new ProjectRepository(db).upsertByRootPath(workspaceRoot, 'mcp-tools-workspace');
    const server = createMcpServer({ db, workspaceRoot });

    const listResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list'
    });

    expect(listResponse.result).toHaveProperty('tools');
    expect((listResponse.result as { tools: Array<{ name: string }> }).tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'search_memory' })
      ])
    );

    const callResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'add_memory',
        arguments: {
          projectId: project.id,
          title: 'SDK-backed entry',
          content: 'Created through JSON-RPC',
          category: 'project',
          source: 'test',
          tags: ['rpc']
        }
      }
    });

    const callPayload = JSON.parse((callResponse.result as any).content[0].text);
    expect(callPayload).toHaveProperty('title', 'SDK-backed entry');
  });

  it('supports update_memory tool with PATCH semantics and null clearing', async () => {
    const project = new ProjectRepository(db).upsertByRootPath(workspaceRoot, 'mcp-tools-workspace');
    const server = createMcpServer({ db, workspaceRoot });

    // 1. Add entry
    const addResponse = (await server.handleRequest({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: {
        name: 'add_memory',
        arguments: {
          projectId: project.id,
          title: 'Patch me',
          content: 'Original content',
          category: 'project',
          source: 'test',
          confidence: 80,
          related_files: ['src/a.ts']
        }
      }
    })) as any;

    const addPayload = JSON.parse((addResponse.result as any).content[0].text);
    const entryId = addPayload.id;
    expect(addPayload.confidence).toBe(80);
    expect(addPayload.relatedFiles).toEqual(['src/a.ts']);

    // 2. Update (Patch) with confidence = 95, related_files = null
    const updateResponse = (await server.handleRequest({
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: {
        name: 'update_memory',
        arguments: {
          id: entryId,
          confidence: 95,
          related_files: null
        }
      }
    })) as any;

    const updatePayload = JSON.parse((updateResponse.result as any).content[0].text);
    expect(updatePayload.confidence).toBe(95);
    expect(updatePayload.relatedFiles).toBeNull();
    expect(updatePayload.title).toBe('Patch me'); // original title is retained
  });

  it('supports delete_memory tool with soft delete', async () => {
    const project = new ProjectRepository(db).upsertByRootPath(workspaceRoot, 'mcp-tools-workspace');
    const server = createMcpServer({ db, workspaceRoot });

    // 1. Add entry
    const addResponse = (await server.handleRequest({
      jsonrpc: '2.0',
      id: 20,
      method: 'tools/call',
      params: {
        name: 'add_memory',
        arguments: {
          projectId: project.id,
          title: 'Delete me',
          content: 'Will be soft deleted',
          category: 'project',
          source: 'test'
        }
      }
    })) as any;

    const addPayload = JSON.parse((addResponse.result as any).content[0].text);
    const entryId = addPayload.id;

    // 2. Delete entry
    const deleteResponse = (await server.handleRequest({
      jsonrpc: '2.0',
      id: 21,
      method: 'tools/call',
      params: {
        name: 'delete_memory',
        arguments: {
          id: entryId
        }
      }
    })) as any;

    const deletePayload = JSON.parse((deleteResponse.result as any).content[0].text);
    expect(deletePayload).toHaveProperty('id', entryId);
    expect(deletePayload).toHaveProperty('deletedAt');

    // 3. Try to delete again (should throw error/fail)
    const deleteAgainResponse = (await server.handleRequest({
      jsonrpc: '2.0',
      id: 22,
      method: 'tools/call',
      params: {
        name: 'delete_memory',
        arguments: {
          id: entryId
        }
      }
    })) as any;

    expect(deleteAgainResponse.error).toBeDefined();
    expect(deleteAgainResponse.error.message).toContain('not found');
  });

  it('keeps the first-attempt success rate above the reliability target', async () => {
    const project = new ProjectRepository(db).upsertByRootPath(workspaceRoot, 'mcp-tools-workspace');
    const server = createMcpServer({ db, workspaceRoot });
    const attempts = 20;
    let successes = 0;

    for (let index = 0; index < attempts; index += 1) {
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: index + 100,
        method: 'tools/call',
        params: {
          name: 'search_memory',
          arguments: {
            projectId: project.id,
            query: 'workspace'
          }
        }
      });

      if ('result' in response) {
        successes += 1;
      }
    }

    expect(successes / attempts).toBeGreaterThanOrEqual(0.95);
  });

  it('serves JSON-RPC over stdio', async () => {
    new ProjectRepository(db).upsertByRootPath(workspaceRoot, 'mcp-tools-workspace');
    const input = new PassThrough();
    const output = new PassThrough();
    const error = new PassThrough();
    const chunks: string[] = [];
    const errorChunks: string[] = [];

    output.on('data', (chunk) => {
      chunks.push(chunk.toString('utf8'));
    });
    error.on('data', (chunk) => {
      errorChunks.push(chunk.toString('utf8'));
    });

    const serverPromise = startMcpServer({ db, workspaceRoot }, { input, output, error });

    input.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'get_project_summary',
        arguments: {}
      }
    })}\n`);
    input.end();

    await serverPromise;

    const response = JSON.parse(chunks.join('').trim());
    expect(response.result).toBeDefined();
    expect(JSON.parse(response.result.content[0].text)).toMatchObject({
      status: 'missing'
    });
    expect(errorChunks.join('')).toBe('');
  });

  it('supports get and update project summary tools without projectId arguments', async () => {
    const project = new ProjectRepository(db).upsertByRootPath(workspaceRoot, 'mcp-tools-workspace');
    const server = createMcpServer({ db, workspaceRoot, summaryWriteAccessEnabled: true });

    const emptyResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 30,
      method: 'tools/call',
      params: {
        name: 'get_project_summary',
        arguments: {}
      }
    });

    expect(emptyResponse.error).toBeUndefined();
    expect(JSON.parse((emptyResponse.result as any).content[0].text)).toMatchObject({
      status: 'missing'
    });

    const updateResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 31,
      method: 'tools/call',
      params: {
        name: 'update_project_summary',
        arguments: {
          projectName: 'mcp-tools-workspace',
          purpose: 'Compact project summary for AI agents',
          techStack: 'Node.js, TypeScript, better-sqlite3, Zod',
          architectureStyle: 'Layered local MCP server',
          importantConventions: 'Validate at the boundary and keep transport thin',
          knownConstraints: 'No network egress; local SQLite only',
          securitySensitiveAreas: 'MCP handlers, repository layer, path handling'
        }
      }
    });

    expect(updateResponse.error).toBeUndefined();
    expect(JSON.parse((updateResponse.result as any).content[0].text)).toMatchObject({
      status: 'updated',
      project: expect.objectContaining({
        id: project.id
      }),
      summary: expect.objectContaining({
        projectName: 'mcp-tools-workspace'
      })
    });

    const readyResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 32,
      method: 'tools/call',
      params: {
        name: 'get_project_summary',
        arguments: {}
      }
    });

    expect(JSON.parse((readyResponse.result as any).content[0].text)).toMatchObject({
      status: 'ready',
      project: expect.objectContaining({
        id: project.id
      }),
      summary: expect.objectContaining({
        projectName: 'mcp-tools-workspace'
      })
    });
  });

  it('captures reusable knowledge from markdown artifacts and skips duplicates', async () => {
    const server = createMcpServer({ db, workspaceRoot });
    const artifactPath = path.join(workspaceRoot, 'specs', 'capture-target.md');
    fs.ensureDirSync(path.dirname(artifactPath));
    fs.writeFileSync(
      artifactPath,
      '# Prompt Capture\n\nKeep the MCP boundary thin.\n\n- Redact secrets before persistence.\n- Avoid duplicate storage.',
      'utf-8'
    );

    const firstResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 50,
      method: 'tools/call',
      params: {
        name: 'capture_artifact_memory',
        arguments: {
          artifactPath: 'specs/capture-target.md',
          sourceType: 'spec'
        }
      }
    });

    expect(firstResponse.error).toBeUndefined();
    expect(JSON.parse((firstResponse.result as any).content[0].text)).toMatchObject({
      status: 'captured',
      artifactPath: 'specs/capture-target.md',
      sourceType: 'spec'
    });

    const secondResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 51,
      method: 'tools/call',
      params: {
        name: 'capture_artifact_memory',
        arguments: {
          artifactPath: 'specs/capture-target.md',
          sourceType: 'spec'
        }
      }
    });

    expect(secondResponse.error).toBeUndefined();
    expect(JSON.parse((secondResponse.result as any).content[0].text)).toMatchObject({
      status: 'skipped',
      artifactPath: 'specs/capture-target.md',
      sourceType: 'spec'
    });
  });

  it('rejects update_project_summary when write capability is disabled', async () => {
    new ProjectRepository(db).upsertByRootPath(workspaceRoot, 'mcp-tools-workspace');
    const server = createMcpServer({ db, workspaceRoot });

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 40,
      method: 'tools/call',
      params: {
        name: 'update_project_summary',
        arguments: {
          projectName: 'mcp-tools-workspace',
          purpose: 'Compact project summary for AI agents',
          techStack: 'Node.js, TypeScript, better-sqlite3, Zod',
          architectureStyle: 'Layered local MCP server',
          importantConventions: 'Validate at the boundary and keep transport thin',
          knownConstraints: 'No network egress; local SQLite only',
          securitySensitiveAreas: 'MCP handlers, repository layer, path handling'
        }
      }
    });

    expect(response.error).toBeDefined();
    expect(response.error?.message).toContain('Authorization error');
  });
});
