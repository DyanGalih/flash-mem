import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { createMcpServer } from '../../src/mcp/server';

describe('MCP Tool Registry', () => {
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

  it('registers memory tools with schemas', () => {
    const project = new ProjectRepository(db).upsertByRootPath(path.dirname(testDbFile), 'mcp-tools-workspace');
    const server = createMcpServer({ db });

    expect(server.listTools().length).toBeGreaterThanOrEqual(4);
    expect(server.listTools()[0]).toHaveProperty('schema');
    expect(project.name).toBe('mcp-tools-workspace');
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
        expect.objectContaining({ name: 'memory.search' })
      ])
    );

    const callResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'memory-entry.create',
        arguments: {
          projectId: project.id,
          title: 'SDK-backed entry',
          content: 'Created through JSON-RPC',
          entryType: 'note',
          tags: ['rpc']
        }
      }
    });

    expect(callResponse.result).toHaveProperty('title', 'SDK-backed entry');
  });
});
