#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as readline from 'readline';
import { InitializeProjectService } from '../../application/services/InitializeProjectService';
import { MarkdownExportService } from '../../application/services/MarkdownExportService';
import { MarkdownRestoreService } from '../../application/services/MarkdownRestoreService';
import { SchemaMigrationService } from '../../application/services/SchemaMigrationService';
import { MemoryEntryService } from '../../application/services/MemoryEntryService';
import { MemorySearchService } from '../../application/services/MemorySearchService';
import { VALID_CATEGORIES } from '../../domain/entities/MemoryEntry';
import { IndexingService } from '../../application/services/IndexingService';
import { startMcpServer } from '../../mcp/server';
import { createDatabaseConnection } from '../../infrastructure/database/connection';
import { PathSanitizer } from '../../infrastructure/safety/PathSanitizer';
import { IndexingInputGuard } from '../../infrastructure/safety/IndexingInputGuard';
import { ProjectRepository } from '../../infrastructure/database/repositories/ProjectRepository';
import { MemoryEntryRepository } from '../../infrastructure/database/repositories/MemoryEntryRepository';
import { TagRepository } from '../../infrastructure/database/repositories/TagRepository';
import { RelationshipRepository } from '../../infrastructure/database/repositories/RelationshipRepository';
import { SourceDocumentRepository } from '../../infrastructure/database/repositories/SourceDocumentRepository';
import { IndexingRunRepository } from '../../infrastructure/database/repositories/IndexingRunRepository';
import { SqliteTransactionRunner } from '../../infrastructure/database/SqliteTransactionRunner';

const program = new Command();

function writeToStream(stream: NodeJS.WritableStream, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      stream.write(text, (error?: Error | null) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error as Error);
    }
  });
}

async function writeStdout(text: string): Promise<void> {
  console.log(text.endsWith('\n') ? text.slice(0, -1) : text);
  await new Promise<void>((resolve) => setTimeout(resolve, 25));
}

async function writeStderr(text: string): Promise<void> {
  console.error(text.endsWith('\n') ? text.slice(0, -1) : text);
  await new Promise<void>((resolve) => setTimeout(resolve, 25));
}

function normalizeList(input?: string): string[] {
  if (!input) {
    return [];
  }

  return Array.from(new Set(
    input
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  ));
}

function formatSearchTable(rows: Array<Record<string, string>>): string {
  if (rows.length === 0) {
    return '';
  }

  const headers = Object.keys(rows[0]);
  const widths = headers.map((header) => {
    const values = rows.map((row) => row[header] ?? '');
    return Math.max(header.length, ...values.map((value) => value.length));
  });

  const separator = `|-${widths.map((width) => '-'.repeat(width)).join('-|-')}-|`;
  const renderRow = (row: Record<string, string>) => `| ${headers.map((header, index) => (row[header] ?? '').padEnd(widths[index])).join(' | ')} |`;
  const headerRow = `| ${headers.map((header, index) => header.padEnd(widths[index])).join(' | ')} |`;

  return [
    headerRow,
    separator,
    ...rows.map(renderRow)
  ].join('\n');
}

function renderSearchOutput(result: {
  results: Array<{
    id: string;
    title: string;
    summary?: string | null;
    category: string;
    tags: string[];
    confidence?: number | null;
    source: string;
    content: string;
    score: number;
  }>;
  suggestions?: {
    categories: string[];
    tags: string[];
  };
}, useJson: boolean, query?: string) {
  if (useJson) {
    return JSON.stringify({
      success: true,
      query: query ?? '',
      results: result.results.map((entry) => ({
        id: entry.id,
        title: entry.title,
        summary: entry.summary,
        category: entry.category,
        tags: entry.tags,
        confidence: entry.confidence,
        source: entry.source,
        score: entry.score,
        content: entry.content
      })),
      suggestions: result.suggestions ?? null
    }, null, 2) + '\n';
  }

  if (result.results.length === 0) {
    const categories = result.suggestions?.categories ?? [];
    const tags = result.suggestions?.tags ?? [];
    return [
      'No matching memories were found.',
      categories.length > 0 ? `Available categories: ${categories.join(', ')}` : 'Available categories: none',
      tags.length > 0 ? `Available tags: ${tags.join(', ')}` : 'Available tags: none'
    ].join('\n') + '\n';
  }

  const table = formatSearchTable(result.results.map((entry) => ({
    Title: entry.title,
    Category: entry.category,
    Score: String(entry.score),
    Confidence: entry.confidence === null || entry.confidence === undefined ? 'n/a' : String(entry.confidence),
    Source: entry.source,
    Tags: entry.tags.join(', '),
    Summary: entry.summary ?? ''
  })));

  return [
    `Found ${result.results.length} matching memories.`,
    table
  ].join('\n') + '\n';
}

program
  .name('flash-mem')
  .description('Local-first engineering memory server and CLI tool')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize a new flash-mem workspace')
  .argument('[path]', 'The project path to initialize', '.')
  .option('-j, --json', 'Output structured JSON instead of plain text')
  .action(async (dirArg, options) => {
    const service = new InitializeProjectService();
    const useJson = !!options.json;

    try {
      const targetDir = path.resolve(process.cwd(), dirArg);
      const result = service.execute(targetDir);

      if (useJson) {
        await writeStdout(JSON.stringify({
          success: true,
          path: result.path,
          metadata: result.metadata
        }, null, 2) + '\n');
      } else {
        await writeStdout(`flash-mem initialized successfully at: ${result.path}\n`);
      }
      process.exitCode = 0;
      return;
    } catch (err: any) {
      const errMsg = err.message || 'Unknown error occurred during initialization';
      await writeStderr(`Error: ${errMsg}\n`);

      if (useJson) {
        await writeStdout(JSON.stringify({
          success: false,
          error: errMsg
        }, null, 2) + '\n');
      }
      process.exitCode = 1;
      return;
    }
  });

program
  .command('export')
  .description('Export markdown backups for the current workspace')
  .command('markdown')
  .argument('[path]', 'The workspace path to export', '.')
  .option('-j, --json', 'Output structured JSON instead of plain text')
  .action(async (dirArg, options) => {
    const useJson = !!options.json;

    try {
      const workspaceRoot = path.resolve(process.cwd(), dirArg);
      if (!fs.existsSync(workspaceRoot) || !fs.statSync(workspaceRoot).isDirectory()) {
        throw new Error(`Workspace path "${workspaceRoot}" does not exist or is not a directory`);
      }
      const dbFile = PathSanitizer.sanitizeSubPath(workspaceRoot, '.flash-mem/flashmem.sqlite');
      if (!fs.existsSync(dbFile)) {
        throw new Error(`No SQLite memory store found at "${dbFile}"`);
      }

      const db = createDatabaseConnection(dbFile);
      try {
        new SchemaMigrationService(db).ensureCurrentSchema();
        const service = new MarkdownExportService(
          new ProjectRepository(db),
          new MemoryEntryRepository(db),
          new TagRepository(db),
          new RelationshipRepository(db),
          new SourceDocumentRepository(db),
          new SchemaMigrationService(db)
        );
        const result = await service.exportWorkspace(workspaceRoot);

        if (useJson) {
          await writeStdout(JSON.stringify({
            success: true,
            path: result.manifest.exportRoot,
            manifest: result.manifest,
            files: result.files
          }, null, 2) + '\n');
        } else {
          await writeStdout(`markdown backups exported successfully to: ${result.manifest.exportRoot}\n`);
        }

        process.exitCode = 0;
        return;
      } finally {
        db.close();
      }
    } catch (err: any) {
      const errMsg = err.message || 'Unknown error occurred during markdown export';
      await writeStderr(`Error: ${errMsg}\n`);

      if (useJson) {
        await writeStdout(JSON.stringify({
          success: false,
          error: errMsg
        }, null, 2) + '\n');
      }
      process.exitCode = 1;
      return;
    }
  });

program
  .command('rebuild-index')
  .description('Perform a complete transactional rebuild of the workspace memory index')
  .argument('[path]', 'The workspace path to rebuild index for', '.')
  .option('-j, --json', 'Output structured JSON instead of plain text')
  .option('--yes', 'Confirm and skip warning validation for the destructive operation')
  .action(async (dirArg, options) => {
    const useJson = !!options.json;
    const confirm = !!options.yes;

    try {
      const workspaceRoot = path.resolve(process.cwd(), dirArg);
      if (!fs.existsSync(workspaceRoot) || !fs.statSync(workspaceRoot).isDirectory()) {
        throw new Error(`Workspace path "${workspaceRoot}" does not exist or is not a directory`);
      }
      const dbFile = PathSanitizer.sanitizeSubPath(workspaceRoot, '.flash-mem/flashmem.sqlite');
      if (!fs.existsSync(dbFile)) {
        throw new Error(`No SQLite memory store found at "${dbFile}"`);
      }

      if (!confirm) {
        throw new Error(`Rebuilding the index is a destructive operation that clears the database. Run with --yes to confirm.`);
      }

      const db = createDatabaseConnection(dbFile);
      try {
        const projectRepo = new ProjectRepository(db);
        const project = projectRepo.upsertByRootPath(workspaceRoot, path.basename(workspaceRoot));

        const markdownFiles: string[] = [];
        const indexingGuard = new IndexingInputGuard();

        const scanDir = (dir: string) => {
          const items = fs.readdirSync(dir);
          for (const item of items) {
            const fullPath = path.join(dir, item);
            const relativePath = path.relative(workspaceRoot, fullPath);

            if (item === '.git' || item === '.flash-mem' || item === 'node_modules') {
              continue;
            }

            let isIgnored = false;
            try {
              indexingGuard.normalizeSourcePath(workspaceRoot, relativePath);
            } catch {
              isIgnored = true;
            }

            if (isIgnored) {
              continue;
            }

            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              scanDir(fullPath);
            } else if (stat.isFile() && (item.endsWith('.md') || item.endsWith('.markdown'))) {
              markdownFiles.push(relativePath);
            }
          }
        };

        scanDir(workspaceRoot);

        const crypto = require('crypto');
        const sources = markdownFiles.map((relPath) => {
          const fullPath = path.join(workspaceRoot, relPath);
          const content = fs.readFileSync(fullPath, 'utf8');
          const checksum = crypto.createHash('sha256').update(content).digest('hex');

          const lines = content.split('\n');
          let title = path.basename(relPath, path.extname(relPath));
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('# ')) {
              title = trimmed.slice(2).trim();
              break;
            }
          }

          let category = 'project';
          if (relPath.includes('decision')) category = 'decision';
          else if (relPath.includes('pattern')) category = 'pattern';
          else if (relPath.includes('bug') || relPath.includes('fix')) category = 'bug_fix';
          else if (relPath.includes('security')) category = 'security_note';
          else if (relPath.includes('convention') || relPath.includes('style')) category = 'convention';

          return {
            path: relPath,
            checksum,
            title,
            content,
            category,
            tags: [category]
          };
        });

        const projectRepository = new ProjectRepository(db);
        const memoryEntryRepository = new MemoryEntryRepository(db);
        const tagRepository = new TagRepository(db);
        const relationshipRepository = new RelationshipRepository(db);
        const sourceDocumentRepository = new SourceDocumentRepository(db);
        const indexingRunRepository = new IndexingRunRepository(db);
        const transactionRunner = new SqliteTransactionRunner(db);
        const schemaMigrationService = new SchemaMigrationService(db);

        const memoryEntryService = new MemoryEntryService(
          projectRepository,
          memoryEntryRepository,
          tagRepository,
          relationshipRepository,
          sourceDocumentRepository,
          transactionRunner
        );

        const indexingService = new IndexingService(
          projectRepository,
          sourceDocumentRepository,
          indexingRunRepository,
          memoryEntryService,
          schemaMigrationService,
          transactionRunner
        );

        const results = indexingService.rebuildIndex(project.id, sources);

        if (useJson) {
          await writeStdout(JSON.stringify({
            success: true,
            rebuilt: true,
            entryCount: results.length,
            sourcesIndexed: sources.map(s => s.path)
          }, null, 2) + '\n');
        } else {
          await writeStdout(`Index rebuilt successfully! Transactionally processed ${results.length} entries from ${sources.length} markdown source files.\n`);
        }

        process.exitCode = 0;
        return;
      } finally {
        db.close();
      }
    } catch (err: any) {
      const errMsg = err.message || 'Unknown error occurred during index rebuild';
      await writeStderr(`Error: ${errMsg}\n`);

      if (useJson) {
        await writeStdout(JSON.stringify({
          success: false,
          error: errMsg
        }, null, 2) + '\n');
      }
      process.exitCode = 1;
      return;
    }
  });

program
  .command('add')
  .description('Add a new memory entry')
  .option('--title <string>', 'Title of the memory entry')
  .option('--summary <string>', 'Summary/content of the memory entry')
  .option('--category <string>', 'Category of the memory entry')
  .option('--source <string>', 'Source of the memory entry')
  .option('--tags <items>', 'Comma-separated tags')
  .option('--confidence <number>', 'Confidence score (0-100)', (val) => parseInt(val, 10))
  .option('--related-files <items>', 'Comma-separated relative file paths')
  .option('--project-path <path>', 'Path to the workspace root directory (defaults to current working directory)', '.')
  .option('-i, --interactive', 'Interactively prompt for missing fields')
  .option('-j, --json', 'Output structured JSON instead of plain text')
  .action(async (options) => {
    const useJson = !!options.json;
    const isInteractive = !!options.interactive;

    try {
      // 1. Resolve and validate workspace root using PathSanitizer.resolveRoot (SEC-001)
      const resolvedWorkspace = PathSanitizer.resolveRoot(options.projectPath ?? '.');
      if (!fs.existsSync(resolvedWorkspace) || !fs.statSync(resolvedWorkspace).isDirectory()) {
        throw new Error(`Workspace path "${resolvedWorkspace}" does not exist or is not a directory`);
      }

      // 2. Resolve database path relative to workspace root (SEC-001)
      const dbFile = PathSanitizer.sanitizeSubPath(resolvedWorkspace, '.flash-mem/flashmem.sqlite');
      if (!fs.existsSync(dbFile)) {
        throw new Error(`No SQLite memory store found at "${dbFile}". Run "flash-mem init" first.`);
      }

      let title = options.title?.trim();
      let summary = options.summary?.trim();
      let category = options.category?.trim();
      let source = options.source?.trim();

      // If interactive, prompt for missing required fields
      if (isInteractive) {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stderr
        });

        const linesQueue: string[] = [];
        let pendingResolve: ((value: string) => void) | null = null;

        rl.on('line', (line) => {
          const trimmed = line.trim();
          if (pendingResolve) {
            const resolve = pendingResolve;
            pendingResolve = null;
            resolve(trimmed);
          } else {
            linesQueue.push(trimmed);
          }
        });

        const ask = (query: string): Promise<string> => {
          process.stderr.write(query);
          const nextLine = linesQueue.shift();
          if (nextLine !== undefined) {
            return Promise.resolve(nextLine);
          }
          return new Promise((resolve) => {
            pendingResolve = resolve;
          });
        };

        try {
          if (!title) {
            while (!title) {
              title = await ask('Enter title (required): ');
              if (!title) {
                process.stderr.write('Title cannot be empty.\n');
              }
            }
          }

          if (!summary) {
            while (!summary) {
              summary = await ask('Enter summary (required): ');
              if (!summary) {
                process.stderr.write('Summary cannot be empty.\n');
              }
            }
          }

          const validCategories = VALID_CATEGORIES as readonly string[];
          if (!category || !validCategories.includes(category)) {
            while (!category || !validCategories.includes(category)) {
              const promptMsg = category 
                ? `Invalid category "${category}".\nChoose one of: ${validCategories.join(', ')}\nEnter category: `
                : `Enter category (${validCategories.join(', ')}): `;
              category = await ask(promptMsg);
              if (!category) {
                process.stderr.write('Category cannot be empty.\n');
              }
            }
          }

          if (!source) {
            while (!source) {
              source = await ask('Enter source (required, e.g., cli, mcp, user): ');
              if (!source) {
                process.stderr.write('Source cannot be empty.\n');
              }
            }
          }
        } finally {
          rl.close();
        }
      }

      // 3. Validate presence of required fields (if not interactive)
      const missingFields: string[] = [];
      if (!title) missingFields.push('title');
      if (!summary) missingFields.push('summary');
      if (!category) missingFields.push('category');
      if (!source) missingFields.push('source');

      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }

      // Parse tags and related files if provided
      let tags: string[] = [];
      if (options.tags) {
        tags = options.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
        // Deduplicate tags
        tags = Array.from(new Set(tags));
      }

      let relatedFiles: string[] = [];
      if (options.relatedFiles) {
        relatedFiles = options.relatedFiles.split(',').map((f: string) => f.trim()).filter(Boolean);
      }

      const confidence = options.confidence !== undefined ? options.confidence : undefined;

      // 4. Initialize Database and Services
      const db = createDatabaseConnection(dbFile);
      try {
        const projectRepo = new ProjectRepository(db);
        const project = projectRepo.upsertByRootPath(resolvedWorkspace, path.basename(resolvedWorkspace));

        const memoryEntryRepository = new MemoryEntryRepository(db);
        const tagRepository = new TagRepository(db);
        const relationshipRepository = new RelationshipRepository(db);
        const sourceDocumentRepository = new SourceDocumentRepository(db);
        const transactionRunner = new SqliteTransactionRunner(db);

        const memoryEntryService = new MemoryEntryService(
          projectRepo,
          memoryEntryRepository,
          tagRepository,
          relationshipRepository,
          sourceDocumentRepository,
          transactionRunner
        );

        const entry = memoryEntryService.createMemoryEntry({
          projectId: project.id,
          title,
          content: summary,
          category: category as any,
          source,
          tags,
          confidence,
          relatedFiles
        });

        if (!entry) {
          throw new Error('Failed to create memory entry');
        }

        if (useJson) {
          await writeStdout(JSON.stringify({
            success: true,
            id: entry.id,
            entry: {
              id: entry.id,
              title: entry.title,
              content: entry.content,
              category: entry.category,
              source: entry.source,
              tags: tags,
              confidence: entry.confidence,
              relatedFiles: entry.relatedFiles,
              createdAt: entry.createdAt,
              updatedAt: entry.updatedAt
            }
          }, null, 2) + '\n');
        } else {
          await writeStdout(`Memory entry added successfully! ID: ${entry.id}\n`);
        }

        process.exitCode = 0;
        return;
      } finally {
        db.close();
      }
    } catch (err: any) {
      const errMsg = err.message || 'Unknown error occurred during add';
      await writeStderr(`Error: ${errMsg}\n`);

      if (useJson) {
        await writeStdout(JSON.stringify({
          success: false,
          error: errMsg
        }, null, 2) + '\n');
      }
      process.exitCode = 1;
      return;
    }
  });

program
  .command('search')
  .description('Search memory entries by keyword and filters')
  .argument('[query]', 'Keyword to search for')
  .option('--workspace <path>', 'The workspace root containing the SQLite memory store', '.')
  .option('--tags <items>', 'Comma-separated tags to require')
  .option('--tag-operator <operator>', 'Combine multiple tags with AND or OR', 'AND')
  .option('--category <string>', 'Category filter')
  .option('--source <string>', 'Source document path filter')
  .option('--min-confidence <number>', 'Minimum confidence score (0-100)', (val) => parseInt(val, 10))
  .option('--limit <number>', 'Maximum number of results to return', (val) => parseInt(val, 10))
  .option('--full-content', 'Include full content in search results')
  .option('-j, --json', 'Output structured JSON instead of plain text')
  .action(async (queryArg, options) => {
    const useJson = !!options.json || !process.stdout.isTTY;

    try {
      const workspaceRoot = PathSanitizer.resolveRoot(options.workspace ?? '.');
      if (!fs.existsSync(workspaceRoot) || !fs.statSync(workspaceRoot).isDirectory()) {
        throw new Error(`Workspace path "${workspaceRoot}" does not exist or is not a directory`);
      }

      const dbFile = PathSanitizer.sanitizeSubPath(workspaceRoot, '.flash-mem/flashmem.sqlite');
      if (!fs.existsSync(dbFile)) {
        throw new Error(`No SQLite memory store found at "${dbFile}". Run "flash-mem init" first.`);
      }

      const db = createDatabaseConnection(dbFile);
      try {
        const projectRepo = new ProjectRepository(db);
        const memoryEntryRepository = new MemoryEntryRepository(db);
        const tagRepository = new TagRepository(db);
        const searchService = new MemorySearchService(memoryEntryRepository, tagRepository, projectRepo);

        const searchOptions = {
          query: typeof queryArg === 'string' ? queryArg.trim() : undefined,
          category: options.category?.trim() || undefined,
          tags: normalizeList(options.tags),
          tagOperator: options.tagOperator ? String(options.tagOperator).trim().toUpperCase() as 'AND' | 'OR' : undefined,
          minConfidence: options.minConfidence !== undefined ? Number(options.minConfidence) : undefined,
          source: options.source?.trim() || undefined,
          includeContent: !!options.fullContent,
          limit: options.limit !== undefined ? Number(options.limit) : undefined
        };

        const result = searchService.search(searchOptions);
        const output = renderSearchOutput(result, useJson, searchOptions.query);

        if (useJson) {
          await writeStdout(output);
        } else {
          await writeStdout(output);
        }

        process.exitCode = 0;
        return;
      } finally {
        db.close();
      }
    } catch (err: any) {
      const errMsg = err.message || 'Unknown error occurred during search';
      await writeStderr(`Error: ${errMsg}\n`);

      if (useJson) {
        await writeStdout(JSON.stringify({
          success: false,
          error: errMsg
        }, null, 2) + '\n');
      }
      process.exitCode = 1;
      return;
    }
  });

program
  .command('mcp')
  .description('Start the local MCP server over stdio')
  .argument('[path]', 'The workspace path to serve', '.')
  .action(async (dirArg) => {
    try {
      const workspaceRoot = path.resolve(process.cwd(), dirArg);
      if (!fs.existsSync(workspaceRoot) || !fs.statSync(workspaceRoot).isDirectory()) {
        throw new Error(`Workspace path "${workspaceRoot}" does not exist or is not a directory`);
      }

      const dbFile = PathSanitizer.sanitizeSubPath(workspaceRoot, '.flash-mem/flashmem.sqlite');
      if (!fs.existsSync(dbFile)) {
        throw new Error(`No SQLite memory store found at "${dbFile}". Run "flash-mem init" first.`);
      }

      const db = createDatabaseConnection(dbFile);
      try {
        await startMcpServer({ db });
      } finally {
        db.close();
      }
    } catch (err: any) {
      const errMsg = err.message || 'Unknown error occurred while starting the MCP server';
      await writeStderr(`Error: ${errMsg}\n`);
      process.exitCode = 1;
      return;
    }
  });

program
  .command('restore-backup')
  .description('Restore memory entries from markdown backup files')
  .argument('[path]', 'Path to the backup directory (defaults to .flash-mem/exports relative to workspace root)')
  .option('-j, --json', 'Output structured JSON instead of plain text')
  .option('--workspace <path>', 'The workspace root to restore into (defaults to current working directory)', '.')
  .action(async (dirArg, options) => {
    const useJson = !!options.json;

    try {
      const workspaceRoot = path.resolve(process.cwd(), options.workspace ?? '.');
      if (!fs.existsSync(workspaceRoot) || !fs.statSync(workspaceRoot).isDirectory()) {
        throw new Error(`Workspace path "${workspaceRoot}" does not exist or is not a directory`);
      }

      const dbFile = PathSanitizer.sanitizeSubPath(workspaceRoot, '.flash-mem/flashmem.sqlite');
      if (!fs.existsSync(dbFile)) {
        throw new Error(`No SQLite memory store found at "${dbFile}". Run "flash-mem init" first.`);
      }

      // Resolve backup directory: explicit arg or default .flash-mem/exports
      const backupDirectory = dirArg
        ? path.resolve(process.cwd(), dirArg)
        : PathSanitizer.sanitizeSubPath(workspaceRoot, '.flash-mem/exports');

      const db = createDatabaseConnection(dbFile);
      try {
        const service = new MarkdownRestoreService(
          new ProjectRepository(db),
          new MemoryEntryRepository(db),
          new TagRepository(db),
          new RelationshipRepository(db),
          new SourceDocumentRepository(db),
          new SchemaMigrationService(db),
          new SqliteTransactionRunner(db)
        );

        const result = service.restore(backupDirectory, workspaceRoot);

        if (useJson) {
          await writeStdout(JSON.stringify({
            success: true,
            restoredEntries: result.restoredEntries,
            restoredRelationships: result.restoredRelationships,
            skippedFiles: result.skippedFiles,
            warnings: result.warnings
          }, null, 2) + '\n');
        } else {
          await writeStdout(
            `Restore complete. Restored ${result.restoredEntries} entr${result.restoredEntries === 1 ? 'y' : 'ies'} ` +
            `and ${result.restoredRelationships} relationship${result.restoredRelationships === 1 ? '' : 's'}` +
            (result.skippedFiles.length > 0 ? ` (${result.skippedFiles.length} file(s) skipped).` : '.') +
            '\n'
          );
        }

        process.exitCode = 0;
        return;
      } finally {
        db.close();
      }
    } catch (err: any) {
      const errMsg = err.message || 'Unknown error occurred during backup restore';
      await writeStderr(`Error: ${errMsg}\n`);

      if (useJson) {
        await writeStdout(JSON.stringify({
          success: false,
          error: errMsg
        }, null, 2) + '\n');
      }
      process.exitCode = 1;
      return;
    }
  });

// Only parse if executed as a script
if ((require.main === module || !module.parent) && !process.env.VITEST && !process.env.VITEST_WORKER_ID) {
  const keepAlive = setInterval(() => {
    // Keep the event loop open until CLI parsing and output complete.
  }, 1000);
  void (async () => {
    try {
      await program.parseAsync(process.argv);
    } finally {
      clearInterval(keepAlive);
    }
  })();
}

export { program };
