import { Server } from '@modelcontextprotocol/sdk';
import Database from 'better-sqlite3';
import * as readline from 'node:readline';
import * as path from 'path';
import { ArtifactMemoryCaptureService } from '../application/services/ArtifactMemoryCaptureService';
import { IndexingService } from '../application/services/IndexingService';
import { MarkdownExportService } from '../application/services/MarkdownExportService';
import { MarkdownRestoreService } from '../application/services/MarkdownRestoreService';
import { MemoryEntryService } from '../application/services/MemoryEntryService';
import { MemorySearchService } from '../application/services/MemorySearchService';
import { ProjectSummaryService } from '../application/services/ProjectSummaryService';
import { RelevantContextService } from '../application/services/RelevantContextService';
import { SchemaMigrationService } from '../application/services/SchemaMigrationService';
import { WorkspaceIndexingService } from '../application/services/WorkspaceIndexingService';
import { IndexingRunRepository } from '../infrastructure/database/repositories/IndexingRunRepository';
import { MemoryEntryRepository } from '../infrastructure/database/repositories/MemoryEntryRepository';
import { ProjectRepository } from '../infrastructure/database/repositories/ProjectRepository';
import { ProjectSummaryRepository } from '../infrastructure/database/repositories/ProjectSummaryRepository';
import { RelationshipRepository } from '../infrastructure/database/repositories/RelationshipRepository';
import { SourceDocumentRepository } from '../infrastructure/database/repositories/SourceDocumentRepository';
import { TagRepository } from '../infrastructure/database/repositories/TagRepository';
import { SqliteTransactionRunner } from '../infrastructure/database/SqliteTransactionRunner';
import { ArtifactReader } from '../infrastructure/markdown/ArtifactReader';
import { CaptureDeduplicationGuard } from '../infrastructure/safety/CaptureDeduplicationGuard';
import { PathSanitizer } from '../infrastructure/safety/PathSanitizer';
import { SecretScanner } from '../infrastructure/safety/SecretScanner';
import { createAddMemoryTool } from './tools/add-memory';
import { createCaptureArtifactMemoryTool } from './tools/capture-artifact-memory';
import { createDeleteMemoryTool } from './tools/delete-memory';
import { createExportMarkdownTool } from './tools/export-markdown';
import { createGetProjectSummaryTool } from './tools/get-project-summary';
import { createGetRelevantContextTool } from './tools/get-relevant-context';
import { createIndexingTool } from './tools/indexing';
import { createMemoryEntryTool, updateMemoryEntryTool } from './tools/memory-entry';
import { createMemorySearchTool } from './tools/memory-search';
import { createRebuildIndexTool } from './tools/rebuild-index';
import { createRelationshipTool } from './tools/relationships';
import { createSearchMemoryTool } from './tools/search-memory';
import { createUpdateMemoryTool } from './tools/update-memory';
import { createUpdateProjectSummaryTool } from './tools/update-project-summary';
import { createRestoreBackupTool } from './tools/restore-backup';

export interface McpServerContext {
  db: Database.Database;
  workspaceRoot: string;
  summaryWriteAccessEnabled?: boolean;
}

export function createMcpServer(context: McpServerContext) {
  const projectRepository = new ProjectRepository(context.db);
  const workspaceProject = projectRepository.upsertByRootPath(context.workspaceRoot, path.basename(context.workspaceRoot));
  const memoryEntryRepository = new MemoryEntryRepository(context.db);
  const projectSummaryRepository = new ProjectSummaryRepository(context.db);
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
  const memorySearchService = new MemorySearchService(memoryEntryRepository, tagRepository, projectRepository);
  const schemaMigrationService = new SchemaMigrationService(context.db);
  const artifactMemoryCaptureService = new ArtifactMemoryCaptureService(
    context.workspaceRoot,
    projectRepository,
    memoryEntryRepository,
    sourceDocumentRepository,
    transactionRunner,
    new ArtifactReader(),
    { resolveRoot: (root) => PathSanitizer.resolveRoot(root) },
    { redact: (value) => SecretScanner.redact(value) },
    new CaptureDeduplicationGuard()
  );

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
  const markdownRestoreService = new MarkdownRestoreService(
    projectRepository,
    memoryEntryRepository,
    tagRepository,
    relationshipRepository,
    sourceDocumentRepository,
    schemaMigrationService,
    transactionRunner
  );
  const projectSummaryService = new ProjectSummaryService(
    workspaceProject.id,
    projectRepository,
    projectSummaryRepository
  );
  const relevantContextService = new RelevantContextService(
    projectRepository,
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
    .registerTool(createUpdateProjectSummaryTool(projectSummaryService, {
      canWriteProjectSummary: context.summaryWriteAccessEnabled === true
    }))
    .registerTool(createSearchMemoryTool(memorySearchService))
    .registerTool(createCaptureArtifactMemoryTool(artifactMemoryCaptureService))
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
    .registerTool(createIndexingTool(indexingService))
    .registerTool(createRestoreBackupTool(markdownRestoreService));

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
