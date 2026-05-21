import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { PassThrough } from 'node:stream';
import { performance } from 'node:perf_hooks';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { createMcpServer, startMcpServer } from '../../src/mcp/server';

describe('MCP Server Foundation', () => {
  let db: any;
  const testDbFile = path.resolve(__dirname, 'mcp-tools-workspace', 'flashmem.sqlite');

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
    const project = new ProjectRepository(db).upsertByRootPath(path.dirname(testDbFile), 'mcp-tools-workspace');
    const server = createMcpServer({ db });

    const toolNames = server.listTools().map((tool) => tool.name);
    expect(toolNames).toEqual(expect.arrayContaining([
      'get_project_summary',
      'search_memory',
      'get_relevant_context',
      'add_memory',
      'export_markdown',
      'rebuild_index'
    ]));
    expect(server.listTools()[0]).toHaveProperty('schema');
    expect(project.name).toBe('mcp-tools-workspace');
  });

  it('discovers the required tools within the startup target window', () => {
    const start = performance.now();
    const server = createMcpServer({ db });
    const elapsed = performance.now() - start;

    expect(server.listTools().map((tool) => tool.name)).toEqual(expect.arrayContaining([
      'get_project_summary',
      'search_memory',
      'get_relevant_context',
      'add_memory',
      'export_markdown',
      'rebuild_index'
    ]));
    expect(elapsed).toBeLessThan(30000);
  });

  it('responds to JSON-RPC tool listing and tool calls', async () => {
    const project = new ProjectRepository(db).upsertByRootPath(path.dirname(testDbFile), 'mcp-tools-workspace');
    const server = createMcpServer({ db });

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

    expect(callResponse.result).toHaveProperty('title', 'SDK-backed entry');
  });

  it('supports update_memory tool with PATCH semantics and null clearing', async () => {
    const project = new ProjectRepository(db).upsertByRootPath(path.dirname(testDbFile), 'mcp-tools-workspace');
    const server = createMcpServer({ db });

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

    const entryId = addResponse.result.id;
    expect(addResponse.result.confidence).toBe(80);
    expect(addResponse.result.relatedFiles).toEqual(['src/a.ts']);

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

    expect(updateResponse.result.confidence).toBe(95);
    expect(updateResponse.result.relatedFiles).toBeNull();
    expect(updateResponse.result.title).toBe('Patch me'); // original title is retained
  });

  it('supports delete_memory tool with soft delete', async () => {
    const project = new ProjectRepository(db).upsertByRootPath(path.dirname(testDbFile), 'mcp-tools-workspace');
    const server = createMcpServer({ db });

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

    const entryId = addResponse.result.id;

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

    expect(deleteResponse.result).toHaveProperty('id', entryId);
    expect(deleteResponse.result).toHaveProperty('deletedAt');

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
    const project = new ProjectRepository(db).upsertByRootPath(path.dirname(testDbFile), 'mcp-tools-workspace');
    const server = createMcpServer({ db });
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
    const project = new ProjectRepository(db).upsertByRootPath(path.dirname(testDbFile), 'mcp-tools-workspace');
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

    const serverPromise = startMcpServer({ db }, { input, output, error });

    input.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'get_project_summary',
        arguments: {
          projectId: project.id
        }
      }
    })}\n`);
    input.end();

    await serverPromise;

    const response = JSON.parse(chunks.join('').trim());
    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 3,
      result: {
        project: expect.objectContaining({
          id: project.id
        })
      }
    });
    expect(errorChunks.join('')).toBe('');
  });
});
