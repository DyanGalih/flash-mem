import { Server } from '@modelcontextprotocol/sdk';
import Database from 'better-sqlite3';
import * as readline from 'node:readline';
import * as path from 'path';
import { ArtifactMemoryCaptureService } from '../application/services/ArtifactMemoryCaptureService';
import { BackgroundMarkdownExportScheduler, resolveBackgroundMarkdownExportDelayMs } from '../application/services/BackgroundMarkdownExportScheduler';
import { DocSynthesisService } from '../application/services/DocSynthesisService';
import { IndexingService } from '../application/services/IndexingService';
import { MarkdownArtifactIngestionService } from '../application/services/MarkdownArtifactIngestionService';
import { MarkdownExportService } from '../application/services/MarkdownExportService';
import { MarkdownRestoreService } from '../application/services/MarkdownRestoreService';
import { MemoryEntryService } from '../application/services/MemoryEntryService';
import { MemorySearchService } from '../application/services/MemorySearchService';
import { MemorySynthesisService } from '../application/services/MemorySynthesisService';
import { ProjectSummaryService } from '../application/services/ProjectSummaryService';
import { RelevantContextService } from '../application/services/RelevantContextService';
import { SchemaMigrationService } from '../application/services/SchemaMigrationService';
import { SharedLessonService } from '../application/services/SharedLessonService';
import { SpecKitCompatibilityService } from '../application/services/SpecKitCompatibilityService';
import { TokenBudgetService } from '../application/services/TokenBudgetService';
import { WorkspaceIndexingService } from '../application/services/WorkspaceIndexingService';
import { DetachedMarkdownExportLauncher } from '../infrastructure/background/DetachedMarkdownExportLauncher';
import { getGlobalHubDatabase } from '../infrastructure/database/global';
import { IndexingRunRepository } from '../infrastructure/database/repositories/IndexingRunRepository';
import { MemoryEntryRepository } from '../infrastructure/database/repositories/MemoryEntryRepository';
import { ProjectRepository } from '../infrastructure/database/repositories/ProjectRepository';
import { ProjectSummaryRepository } from '../infrastructure/database/repositories/ProjectSummaryRepository';
import { RelationshipRepository } from '../infrastructure/database/repositories/RelationshipRepository';
import { SharedLessonRepository } from '../infrastructure/database/repositories/SharedLessonRepository';
import { SourceDocumentRepository } from '../infrastructure/database/repositories/SourceDocumentRepository';
import { TagRepository } from '../infrastructure/database/repositories/TagRepository';
import { SqliteTransactionRunner } from '../infrastructure/database/SqliteTransactionRunner';
import { formatMcpToolResult, McpToolResponseFormat } from '../infrastructure/llm/mcp-response-format';
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
import { createRebuildIndexTool } from './tools/rebuild-index';
import { createAddMemoryRelationshipTool } from './tools/relationships';
import { createRestoreBackupTool } from './tools/restore-backup';
import { createSearchMemoryTool } from './tools/search-memory';
import {
  createDocSynthesisTool,
  createMemorySynthesisTool,
  createPrepareContextTool,
  createPromoteSharedLessonTool,
  createSpeckitMemoryInitProjectTool,
  createSpeckitMemorySearchTool,
  createSpeckitMemoryShareLessonTool,
  createSpeckitMemorySyncSharedTool,
  createSpeckitMemorySynthesizeTool,
  createSpeckitMemoryTokenReportTool,
  createSyncSharedLessonsTool,
  createTokenReportTool
} from './tools/SpecKitTools';
import { createUpdateMemoryTool } from './tools/update-memory';
import { createUpdateProjectSummaryTool } from './tools/update-project-summary';

export interface McpServerContext {
    manager: import("./WorkspaceManager").WorkspaceManager;
}

type McpToolDefinition = {
  name: string;
  description: string;
  schema: unknown;
  execute: (input: any) => unknown;
  responseFormat?: McpToolResponseFormat;
};

function createToolAlias<T extends McpToolDefinition>(tool: T, name: string): T {
  return {
    ...tool,
    name
  };
}

function withFormattedResponse<T extends McpToolDefinition>(tool: T): T {
  return {
    ...tool,
    execute: async (input: any) => formatMcpToolResult(await tool.execute(input), tool.responseFormat)
  };
}

export function createMcpServer(context: McpServerContext) {

      const server = new Server({
        name: 'flash-mem',
        version: '0.2.0'
      });

      const manager = context.manager;

      const getProjectSummaryTool = withFormattedResponse(createGetProjectSummaryTool(manager));
      const updateProjectSummaryTool = withFormattedResponse(createUpdateProjectSummaryTool(manager));
      const searchMemoryTool = withFormattedResponse(createSearchMemoryTool(manager));
      const addMemoryTool = withFormattedResponse(createAddMemoryTool(manager));
      const updateMemoryTool = withFormattedResponse(createUpdateMemoryTool(manager));
      const addMemoryRelationshipTool = withFormattedResponse(createAddMemoryRelationshipTool(manager));
      const rebuildIndexTool = withFormattedResponse(createRebuildIndexTool(manager));
      const captureArtifactMemoryTool = withFormattedResponse(createCaptureArtifactMemoryTool(manager));
      const getRelevantContextTool = withFormattedResponse(createGetRelevantContextTool(manager));
      const deleteMemoryTool = withFormattedResponse(createDeleteMemoryTool(manager));
      const exportMarkdownTool = withFormattedResponse(createExportMarkdownTool(manager));
      const indexingTool = withFormattedResponse(createIndexingTool(manager));
      const restoreBackupTool = withFormattedResponse(createRestoreBackupTool(manager));
      const prepareContextTool = withFormattedResponse(createPrepareContextTool(manager));
      const memorySynthesisCompatTool = withFormattedResponse(createMemorySynthesisTool(manager));
      const docSynthesisCompatTool = withFormattedResponse(createDocSynthesisTool(manager));
      const tokenReportTool = withFormattedResponse(createTokenReportTool(manager));
      const promoteSharedLessonTool = withFormattedResponse(createPromoteSharedLessonTool(manager));
      const syncSharedLessonsTool = withFormattedResponse(createSyncSharedLessonsTool(manager));
      const initializeProjectTool = withFormattedResponse(createSpeckitMemoryInitProjectTool(manager));
      const speckitMemorySearchTool = withFormattedResponse(createSpeckitMemorySearchTool(manager));
      const speckitMemorySynthesizeTool = withFormattedResponse(createSpeckitMemorySynthesizeTool(manager));
      const speckitMemoryTokenReportTool = withFormattedResponse(createSpeckitMemoryTokenReportTool(manager));
      const speckitMemoryShareLessonTool = withFormattedResponse(createSpeckitMemoryShareLessonTool(manager));
      const speckitMemorySyncSharedTool = withFormattedResponse(createSpeckitMemorySyncSharedTool(manager));

      server
        .registerTool(getProjectSummaryTool)
        .registerTool(updateProjectSummaryTool)
        .registerTool(searchMemoryTool)
        .registerTool(getRelevantContextTool)
        .registerTool(addMemoryTool)
        .registerTool(updateMemoryTool)
        .registerTool(deleteMemoryTool)
        .registerTool(captureArtifactMemoryTool)
        .registerTool(exportMarkdownTool)
        .registerTool(rebuildIndexTool)
        .registerTool(createToolAlias(getProjectSummaryTool, 'memory_project_summary_get'))
        .registerTool(createToolAlias(updateProjectSummaryTool, 'memory_project_summary_update'))
        .registerTool(createToolAlias(searchMemoryTool, 'memory_search'))
        .registerTool(createToolAlias(addMemoryTool, 'memory_entry_create'))
        .registerTool(createToolAlias(updateMemoryTool, 'memory_entry_update'))
        .registerTool(createToolAlias(addMemoryRelationshipTool, 'memory_relationship_create'))
        .registerTool(addMemoryRelationshipTool)
        .registerTool(indexingTool)
        .registerTool(restoreBackupTool)
        .registerTool(prepareContextTool)
        .registerTool(memorySynthesisCompatTool)
        .registerTool(docSynthesisCompatTool)
        .registerTool(tokenReportTool)
        .registerTool(promoteSharedLessonTool)
        .registerTool(syncSharedLessonsTool)
        .registerTool(initializeProjectTool)
        .registerTool(speckitMemorySearchTool)
        .registerTool(speckitMemorySynthesizeTool)
        .registerTool(speckitMemoryTokenReportTool)
        .registerTool(speckitMemoryShareLessonTool)
        .registerTool(speckitMemorySyncSharedTool);

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
      if (response !== undefined) {
        writeResponse(response);
      }
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
