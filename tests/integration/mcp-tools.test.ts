import * as fs from 'fs-extra';
import { performance } from 'node:perf_hooks';
import { PassThrough } from 'node:stream';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { decodeToon } from '../../src/infrastructure/llm/toon';
import { createMcpServer, startMcpServer } from '../../src/mcp/server';
import { WorkspaceManager } from '../../src/mcp/WorkspaceManager';

describe('MCP Server Foundation', () => {
  let db: any;
  let previousGlobalDbPath: string | undefined;
  const testDbFile = path.resolve(__dirname, 'mcp-tools-workspace', 'flashmem.sqlite');
  const workspaceRoot = path.dirname(testDbFile);

  beforeEach(() => {
    fs.removeSync(path.dirname(testDbFile));
    previousGlobalDbPath = process.env.FLASH_MEM_GLOBAL_DB_PATH;
    process.env.FLASH_MEM_GLOBAL_DB_PATH = path.resolve(
      path.dirname(testDbFile),
      `.hub-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
    );
    db = createDatabaseConnection(testDbFile);
    new SchemaMigrationService(db).ensureCurrentSchema();
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (previousGlobalDbPath === undefined) {
      delete process.env.FLASH_MEM_GLOBAL_DB_PATH;
    } else {
      process.env.FLASH_MEM_GLOBAL_DB_PATH = previousGlobalDbPath;
    }
    fs.removeSync(path.dirname(testDbFile));
  });

  it('registers the required tools with schemas', () => {
    const project = new ProjectRepository(db).upsertByRootPath(workspaceRoot, 'mcp-tools-workspace');
    const manager = new WorkspaceManager();
    const server = createMcpServer({ manager });
    const tools = server.listTools();

    const toolNames = tools.map((tool) => tool.name);
    expect(toolNames.slice(0, 10)).toEqual([
      'get_project_summary',
      'update_project_summary',
      'search_memory',
      'get_relevant_context',
      'add_memory',
      'update_memory',
      'delete_memory',
      'capture_artifact_memory',
      'export_markdown',
      'rebuild_index'
    ]);
    expect(toolNames.slice(10, 16)).toEqual([
      'memory_project_summary_get',
      'memory_project_summary_update',
      'memory_search',
      'memory_entry_create',
      'memory_entry_update',
      'memory_relationship_create'
    ]);
    expect(toolNames.slice(16, 19)).toEqual([
      'add_memory_relationship',
      'memory_index',
      'restore_backup'
    ]);
    expect(toolNames).toEqual(expect.arrayContaining([
      'prepare_context',
      'memory_synthesis',
      'doc_synthesis',
      'token_report',
      'promote_shared_lesson',
      'sync_shared_lessons',
      'generate_memory_synthesis',
      'generate_doc_synthesis',
      'speckit_memory_search',
      'speckit_memory_synthesize',
      'speckit_memory_token_report',
      'speckit_memory_share_lesson',
      'speckit_memory_sync_shared',
      'speckit_memory_init_project'
    ]));
    expect(tools[0]).toHaveProperty('schema');
    expect(tools.every((tool) => typeof tool.description === 'string' && tool.description.length > 0)).toBe(true);
    expect(project.name).toBe('mcp-tools-workspace');
  });

  it('discovers the required tools within the startup target window', () => {
    const start = performance.now();
    const manager = new WorkspaceManager();
    const server = createMcpServer({ manager });
    const elapsed = performance.now() - start;

    expect(server.listTools().map((tool) => tool.name).slice(0, 10)).toEqual([
      'get_project_summary',
      'update_project_summary',
      'search_memory',
      'get_relevant_context',
      'add_memory',
      'update_memory',
      'delete_memory',
      'capture_artifact_memory',
      'export_markdown',
      'rebuild_index'
    ]);
    expect(elapsed).toBeLessThan(30000);
  });

  it('responds to JSON-RPC tool listing and tool calls', async () => {
    const project = new ProjectRepository(db).upsertByRootPath(workspaceRoot, 'mcp-tools-workspace');
    const manager = new WorkspaceManager();
    const server = createMcpServer({ manager });

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
    expect((listResponse.result as { tools: Array<{ name: string; description?: string }> }).tools.every((tool) => typeof tool.description === 'string' && tool.description.length > 0)).toBe(true);

    const callResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'add_memory',
        arguments: {
          project_path: workspaceRoot,
          project_path: workspaceRoot,
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
    const manager = new WorkspaceManager();
    const server = createMcpServer({ manager });

    // 1. Add entry
    const addResponse = (await server.handleRequest({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: {
        name: 'add_memory',
        arguments: {
          project_path: workspaceRoot,
          project_path: workspaceRoot,
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
          project_path: workspaceRoot,
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

  it('supports backward-compatible alias tools for retrieval and writes', async () => {
    const project = new ProjectRepository(db).upsertByRootPath(workspaceRoot, 'mcp-tools-workspace');
    const manager = new WorkspaceManager();
    const server = createMcpServer({ manager });

    const addResponse = (await server.handleRequest({
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: {
        name: 'memory_entry_create',
        arguments: {
          project_path: workspaceRoot,
          project_path: workspaceRoot,
          title: 'Alias entry',
          content: 'Created via compatibility alias',
          category: 'project',
          source: 'test'
        }
      }
    })) as any;

    const addPayload = JSON.parse((addResponse.result as any).content[0].text);
    const entryId = addPayload.id;
    expect(addPayload.title).toBe('Alias entry');

    const searchResponse = (await server.handleRequest({
      jsonrpc: '2.0',
      id: 13,
      method: 'tools/call',
      params: {
        name: 'memory_search',
        arguments: {
          project_path: workspaceRoot,
          project_path: workspaceRoot,
          query: 'Alias entry'
        }
      }
    })) as any;

    const searchPayload = await decodeToon<any>((searchResponse.result as any).content[0].text);
    expect(searchPayload.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: entryId })
    ]));

    const updateResponse = (await server.handleRequest({
      jsonrpc: '2.0',
      id: 14,
      method: 'tools/call',
      params: {
        name: 'memory_entry_update',
        arguments: {
          project_path: workspaceRoot,
          id: entryId,
          confidence: 91
        }
      }
    })) as any;

    const updatePayload = JSON.parse((updateResponse.result as any).content[0].text);
    expect(updatePayload.confidence).toBe(91);
  });

  it('supports delete_memory tool with soft delete', async () => {
    const project = new ProjectRepository(db).upsertByRootPath(workspaceRoot, 'mcp-tools-workspace');
    const manager = new WorkspaceManager();
    const server = createMcpServer({ manager });

    // 1. Add entry
    const addResponse = (await server.handleRequest({
      jsonrpc: '2.0',
      id: 20,
      method: 'tools/call',
      params: {
        name: 'add_memory',
        arguments: {
          project_path: workspaceRoot,
          project_path: workspaceRoot,
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
          project_path: workspaceRoot,
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
          project_path: workspaceRoot,
          id: entryId
        }
      }
    })) as any;

    expect(deleteAgainResponse.error).toBeDefined();
    expect(deleteAgainResponse.error.message).toContain('not found');
  });

  it('keeps the first-attempt success rate above the reliability target', async () => {
    const project = new ProjectRepository(db).upsertByRootPath(workspaceRoot, 'mcp-tools-workspace');
    const manager = new WorkspaceManager();
    const server = createMcpServer({ manager });
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
          project_path: workspaceRoot,
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
        arguments: {
          project_path: workspaceRoot,
          project_path: workspaceRoot
        }
      }
    })}\n`);
    input.end();

    await serverPromise;

    const response = JSON.parse(chunks.join('').trim());
    expect(response.result).toBeDefined();
    expect(await decodeToon<any>(response.result.content[0].text)).toMatchObject({
      status: 'missing'
    });
    expect(errorChunks.join('')).toBe('');
  });

  it('supports get and update project summary tools without projectId arguments', async () => {
    const project = new ProjectRepository(db).upsertByRootPath(workspaceRoot, 'mcp-tools-workspace');
    const manager = new WorkspaceManager();
    const server = createMcpServer({ manager });

    const emptyResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 30,
      method: 'tools/call',
      params: {
        name: 'get_project_summary',
        arguments: {
          project_path: workspaceRoot,
          project_path: workspaceRoot
        }
      }
    });

    expect(emptyResponse.error).toBeUndefined();
    expect(await decodeToon<any>((emptyResponse.result as any).content[0].text)).toMatchObject({
      status: 'missing'
    });

    const updateResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 31,
      method: 'tools/call',
      params: {
        name: 'update_project_summary',
        arguments: {
          project_path: workspaceRoot,
          project_path: workspaceRoot,
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
        arguments: {
          project_path: workspaceRoot,}
      }
    });

    expect(await decodeToon<any>((readyResponse.result as any).content[0].text)).toMatchObject({
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
    const manager = new WorkspaceManager();
    const server = createMcpServer({ manager });
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
          project_path: workspaceRoot,
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
          project_path: workspaceRoot,
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

  it('prepares combined context through the compatibility layer', async () => {
    const project = new ProjectRepository(db).upsertByRootPath(workspaceRoot, 'mcp-tools-workspace');
    const manager = new WorkspaceManager();
    const server = createMcpServer({ manager });
    const featurePath = path.join(workspaceRoot, 'specs', 'feature-a');
    fs.ensureDirSync(featurePath);
    fs.writeFileSync(path.join(featurePath, 'spec.md'), '# Feature A\n\nMemory-first planning.', 'utf-8');

    await server.handleRequest({
      jsonrpc: '2.0',
      id: 60,
      method: 'tools/call',
      params: {
        name: 'add_memory',
        arguments: {
          project_path: workspaceRoot,
          project_path: workspaceRoot,
          title: 'Memory-first planning',
          content: 'Search memory before plan generation.',
          category: 'decision',
          source: 'docs/spec.md'
        }
      }
    });

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 61,
      method: 'tools/call',
      params: {
        name: 'prepare_context',
        arguments: {
          project_path: workspaceRoot,
          workspaceRoot,
          featurePath: 'specs/feature-a',
          query: 'memory-first'
        }
      }
    });

    expect(response.error).toBeUndefined();
    const payload = await decodeToon<any>((response.result as any).content[0].text);
    expect(payload).toMatchObject({
      workspaceRoot,
      featurePath: featurePath,
      query: 'memory-first'
    });
    expect(payload).toHaveProperty('memorySynthesis');
    expect(payload).toHaveProperty('docSynthesis');
    expect(payload).toHaveProperty('tokenReport');
  });

  it('supports memory-hub-compatible speckit tool names with normalized arguments', async () => {
    const manager = new WorkspaceManager();
    const server = createMcpServer({ manager });

    const initResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 70,
      method: 'tools/call',
      params: {
        name: 'speckit_memory_init_project',
        arguments: {
          project_path: workspaceRoot,
          projectRoot: workspaceRoot,
          language: 'typescript',
          framework: 'nest'
        }
      }
    });

    expect(initResponse.error).toBeUndefined();
    expect(JSON.parse((initResponse.result as any).content[0].text)).toMatchObject({
      language: 'typescript',
      framework: 'nest',
      profileStatus: expect.any(String)
    });
    const initProfilePath = path.join(workspaceRoot, '.specify', 'extensions', 'memory-md', 'config.yml');
    expect(fs.existsSync(initProfilePath)).toBe(true);
    expect(fs.readFileSync(initProfilePath, 'utf-8')).toBe(
      [
        'project_profile:',
        '  language: typescript',
        '  framework: nest',
        '  shared_memory:',
        '    enabled: true',
        '    sync_channels:',
        '      - global',
        '      - typescript',
        '      - nest',
        ''
      ].join('\n')
    );
    expect(fs.existsSync(path.join(workspaceRoot, '.flash-mem'))).toBe(true);
    expect(fs.existsSync(path.join(workspaceRoot, '.flash-mem', 'project-profile.json'))).toBe(true);

    const featurePath = path.join(workspaceRoot, 'specs', 'feature-b');
    fs.ensureDirSync(featurePath);
    fs.writeFileSync(path.join(featurePath, 'spec.md'), '# Feature B\n\nMemory-hub compatibility.', 'utf-8');

    const searchProject = new ProjectRepository(db).upsertByRootPath(workspaceRoot, 'mcp-tools-workspace');
    await server.handleRequest({
      jsonrpc: '2.0',
      id: 71,
      method: 'tools/call',
      params: {
        name: 'add_memory',
        arguments: {
          project_path: workspaceRoot,
          projectId: searchProject.id,
          title: 'Memory-hub compatibility',
          content: 'Keep the compatibility layer additive.',
          category: 'decision',
          source: 'docs/compatibility.md'
        }
      }
    });

    const searchResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 72,
      method: 'tools/call',
      params: {
        name: 'speckit_memory_search',
        arguments: {
          project_path: workspaceRoot,
          projectRoot: workspaceRoot,
          query: 'compatibility'
        }
      }
    });
    expect(searchResponse.error).toBeUndefined();
    expect(await decodeToon<any>((searchResponse.result as any).content[0].text)).toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({ title: 'Memory-hub compatibility' })
      ])
    });

    const synthesizeResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 73,
      method: 'tools/call',
      params: {
        name: 'speckit_memory_synthesize',
        arguments: {
          project_path: workspaceRoot,
          projectRoot: workspaceRoot,
          feature: 'specs/feature-b',
          query: 'compatibility'
        }
      }
    });
    expect(synthesizeResponse.error).toBeUndefined();
    expect((synthesizeResponse.result as any).content[0].text).toContain('# Memory Synthesis: compatibility');
    expect((synthesizeResponse.result as any).content[0].text).toContain('## Relevant Decisions');

    const tokenReportResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 74,
      method: 'tools/call',
      params: {
        name: 'speckit_memory_token_report',
        arguments: {
          project_path: workspaceRoot,
          projectRoot: workspaceRoot,
          feature: 'specs/feature-b',
          query: 'compatibility'
        }
      }
    });
    expect(tokenReportResponse.error).toBeUndefined();
    expect(await decodeToon<any>((tokenReportResponse.result as any).content[0].text)).toMatchObject({
      workspaceRoot,
      featurePath: path.join(workspaceRoot, 'specs', 'feature-b'),
      query: 'compatibility',
      tokenReport: expect.objectContaining({
        baselineTokens: expect.any(Number),
        cachedTokens: expect.any(Number),
        savedTokens: expect.any(Number),
        savedPercent: expect.any(Number),
        baselineSources: expect.any(Array),
        cachedArtifacts: ['memory-synthesis.md', 'doc-synthesis.md']
      })
    });

    const shareLessonResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 75,
      method: 'tools/call',
      params: {
        name: 'speckit_memory_share_lesson',
        arguments: {
          project_path: workspaceRoot,
          projectRoot: workspaceRoot,
          id: 'lesson-compat-002',
          title: 'Compatibility review',
          content: 'Write the review buffer to docs/memory/SHARED_LESSONS.md.',
          framework: 'nest',
          language: 'typescript',
          tags: ['review', 'compatibility']
        }
      }
    });
    expect(shareLessonResponse.error).toBeUndefined();
    expect(JSON.parse((shareLessonResponse.result as any).content[0].text)).toMatchObject({
      reference: expect.objectContaining({
        id: 'lesson-compat-002',
        title: 'Compatibility review',
        language: 'typescript'
      }),
      sharedLesson: expect.objectContaining({
        id: 'lesson-compat-002',
        topic: 'Compatibility review'
      })
    });

    const syncResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 76,
      method: 'tools/call',
      params: {
        name: 'speckit_memory_sync_shared',
        arguments: {
          project_path: workspaceRoot,
          projectRoot: workspaceRoot,
          framework: 'nest',
          language: 'typescript',
          limit: 5
        }
      }
    });

    expect(syncResponse.error).toBeUndefined();
    const syncPayload = JSON.parse((syncResponse.result as any).content[0].text);
    expect(syncPayload).toHaveProperty('reviewFilePath');
    expect(syncPayload.reviewFilePath).toBe(path.join(workspaceRoot, 'docs', 'memory', 'SHARED_LESSONS.md'));
    expect(fs.existsSync(syncPayload.reviewFilePath)).toBe(true);
    expect(fs.readFileSync(syncPayload.reviewFilePath, 'utf-8')).toContain('# Shared Lessons Review Buffer');
    expect(fs.readFileSync(syncPayload.reviewFilePath, 'utf-8')).toContain('Compatibility review');
    expect(syncPayload.reviewMarkdown).toContain('Delete this file after review or after merging its useful lessons.');
  });


});
