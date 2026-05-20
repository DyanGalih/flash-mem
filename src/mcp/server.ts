import Database from 'better-sqlite3';
import { Server } from '@modelcontextprotocol/sdk';
import { IndexingService } from '../application/services/IndexingService';
import { MemoryEntryService } from '../application/services/MemoryEntryService';
import { MemorySearchService } from '../application/services/MemorySearchService';
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
  const indexingService = new IndexingService(context.db);

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
