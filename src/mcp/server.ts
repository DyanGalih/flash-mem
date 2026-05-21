import * as readline from 'node:readline';
import Database from 'better-sqlite3';
import { Server } from '@modelcontextprotocol/sdk';
import { IndexingService } from '../application/services/IndexingService';
import { MarkdownExportService } from '../application/services/MarkdownExportService';
import { MemoryEntryService } from '../application/services/MemoryEntryService';
import { MemorySearchService } from '../application/services/MemorySearchService';
import { ProjectSummaryService } from '../application/services/ProjectSummaryService';
import { RelevantContextService } from '../application/services/RelevantContextService';
import { SchemaMigrationService } from '../application/services/SchemaMigrationService';
import { WorkspaceIndexingService } from '../application/services/WorkspaceIndexingService';
import { ProjectRepository } from '../infrastructure/database/repositories/ProjectRepository';
import { SourceDocumentRepository } from '../infrastructure/database/repositories/SourceDocumentRepository';
import { IndexingRunRepository } from '../infrastructure/database/repositories/IndexingRunRepository';
import { MemoryEntryRepository } from '../infrastructure/database/repositories/MemoryEntryRepository';
import { RelationshipRepository } from '../infrastructure/database/repositories/RelationshipRepository';
import { TagRepository } from '../infrastructure/database/repositories/TagRepository';
import { SqliteTransactionRunner } from '../infrastructure/database/SqliteTransactionRunner';
import { createAddMemoryTool } from './tools/add-memory';
import { createUpdateMemoryTool } from './tools/update-memory';
import { createDeleteMemoryTool } from './tools/delete-memory';
import { createExportMarkdownTool } from './tools/export-markdown';
import { createGetProjectSummaryTool } from './tools/get-project-summary';
import { createGetRelevantContextTool } from './tools/get-relevant-context';
import { createMemoryEntryTool, updateMemoryEntryTool } from './tools/memory-entry';
import { createMemorySearchTool } from './tools/memory-search';
import { createRelationshipTool } from './tools/relationships';
import { createRebuildIndexTool } from './tools/rebuild-index';
import { createSearchMemoryTool } from './tools/search-memory';
import { createIndexingTool } from './tools/indexing';

export interface McpServerContext {
  db: Database.Database;
}

export function createMcpServer(context: McpServerContext) {
  const projectRepository = new ProjectRepository(context.db);
  const memoryEntryRepository = new MemoryEntryRepository(context.db);
  const tagRepository = new TagRepository(context.db);
  const relationshipRepository = new RelationshipRepository(context.db);
  const sourceDocumentRepository = new SourceDocumentRepository(context.db);
  const indexingRunRepository = new IndexingRunRepository(context.db);
  const transactionRunner = new SqliteTransactionRunner(context.db);

  const memoryEntryService = new MemoryEntryService(
    projectRepository,
    memoryEntryRepository,
    tagRepository,
    relationshipRepository,
    sourceDocumentRepository,
    transactionRunner
  );
  const memorySearchService = new MemorySearchService(memoryEntryRepository);
  const schemaMigrationService = new SchemaMigrationService(context.db);

  const indexingService = new IndexingService(
    projectRepository,
    sourceDocumentRepository,
    indexingRunRepository,
    memoryEntryService,
    schemaMigrationService,
    transactionRunner
  );
  const markdownExportService = new MarkdownExportService(
    projectRepository,
    memoryEntryRepository,
    tagRepository,
    relationshipRepository,
    sourceDocumentRepository,
    schemaMigrationService
  );
  const projectSummaryService = new ProjectSummaryService(
    projectRepository,
    memoryEntryRepository,
    tagRepository,
    relationshipRepository,
    sourceDocumentRepository
  );
  const relevantContextService = new RelevantContextService(
    projectSummaryService,
    memorySearchService
  );
  const workspaceIndexingService = new WorkspaceIndexingService(
    indexingService,
    projectRepository
  );

  const server = new Server({
    name: 'flash-mem',
    version: '0.1.0'
  });

  server
    .registerTool(createGetProjectSummaryTool(projectSummaryService))
    .registerTool(createSearchMemoryTool(memorySearchService))
    .registerTool(createGetRelevantContextTool(relevantContextService))
    .registerTool(createAddMemoryTool(memoryEntryService))
    .registerTool(createUpdateMemoryTool(memoryEntryService))
    .registerTool(createDeleteMemoryTool(memoryEntryService))
    .registerTool(createExportMarkdownTool(markdownExportService))
    .registerTool(createRebuildIndexTool(workspaceIndexingService))
    .registerTool(createMemoryEntryTool(memoryEntryService))
    .registerTool(updateMemoryEntryTool(memoryEntryService))
    .registerTool(createMemorySearchTool(memorySearchService))
    .registerTool(createRelationshipTool(memoryEntryService))
    .registerTool(createIndexingTool(indexingService));

  return server;
}

export interface McpStdioServerOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  error?: NodeJS.WritableStream;
}

export async function startMcpServer(context: McpServerContext, options: McpStdioServerOptions = {}): Promise<void> {
  const server = createMcpServer(context);
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const error = options.error ?? process.stderr;
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  let pending = Promise.resolve();

  const writeResponse = (payload: unknown): void => {
    output.write(`${JSON.stringify(payload)}\n`);
  };

  const handleLine = async (line: string): Promise<void> => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    try {
      const request = JSON.parse(trimmed);
      const response = await server.handleRequest(request);
      writeResponse(response);
    } catch (err: any) {
      const message = err instanceof SyntaxError ? 'Parse error' : (err?.message ?? 'Internal error');
      if (!(err instanceof SyntaxError)) {
        error.write(`Error: ${message}\n`);
      }
      writeResponse({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: err instanceof SyntaxError ? -32700 : -32603,
          message
        }
      });
    }
  };

  return new Promise<void>((resolve) => {
    rl.on('line', (line) => {
      pending = pending.then(() => handleLine(line));
    });

    rl.on('close', () => {
      void pending.finally(() => resolve());
    });
  });
}
