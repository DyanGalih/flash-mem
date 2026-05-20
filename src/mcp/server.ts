import Database from 'better-sqlite3';
import { Server } from '@modelcontextprotocol/sdk';
import { IndexingService } from '../application/services/IndexingService';
import { MemoryEntryService } from '../application/services/MemoryEntryService';
import { MemorySearchService } from '../application/services/MemorySearchService';
import { SchemaMigrationService } from '../application/services/SchemaMigrationService';
import { ProjectRepository } from '../infrastructure/database/repositories/ProjectRepository';
import { SourceDocumentRepository } from '../infrastructure/database/repositories/SourceDocumentRepository';
import { IndexingRunRepository } from '../infrastructure/database/repositories/IndexingRunRepository';
import { createIndexingTool } from './tools/indexing';
import { createMemoryEntryTool, updateMemoryEntryTool } from './tools/memory-entry';
import { createMemorySearchTool } from './tools/memory-search';
import { createRelationshipTool } from './tools/relationships';

export interface McpServerContext {
  db: Database.Database;
}

export function createMcpServer(context: McpServerContext) {
  const memoryEntryService = new MemoryEntryService(context.db);
  const memorySearchService = new MemorySearchService(context.db);
  const indexingService = new IndexingService(
    context.db,
    new ProjectRepository(context.db),
    new SourceDocumentRepository(context.db),
    new IndexingRunRepository(context.db),
    memoryEntryService,
    new SchemaMigrationService(context.db)
  );

  const server = new Server({
    name: 'flash-mem',
    version: '0.1.0'
  });

  server
    .registerTool(createMemoryEntryTool(memoryEntryService))
    .registerTool(updateMemoryEntryTool(memoryEntryService))
    .registerTool(createMemorySearchTool(memorySearchService))
    .registerTool(createRelationshipTool(memoryEntryService))
    .registerTool(createIndexingTool(indexingService));

  return server;
}
