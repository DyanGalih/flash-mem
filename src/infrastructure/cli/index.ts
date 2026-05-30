#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as readline from 'readline';
import { IndexingService } from '../../application/services/IndexingService';
import { DocSynthesisService } from '../../application/services/DocSynthesisService';
import {
  AGENT_INSTRUCTION_TARGETS,
  AgentInstructionTargetId,
  InitializeProjectService,
  MCP_TARGETS,
  McpTargetId
} from '../../application/services/InitializeProjectService';
import { MemorySynthesisService } from '../../application/services/MemorySynthesisService';
import { MarkdownExportService } from '../../application/services/MarkdownExportService';
import { MarkdownRestoreService } from '../../application/services/MarkdownRestoreService';
import { MemoryEntryService } from '../../application/services/MemoryEntryService';
import { MemorySearchService } from '../../application/services/MemorySearchService';
import { ProjectSummaryService } from '../../application/services/ProjectSummaryService';
import { RelevantContextService } from '../../application/services/RelevantContextService';
import { SchemaMigrationService } from '../../application/services/SchemaMigrationService';
import { SharedLessonService } from '../../application/services/SharedLessonService';
import { SpecKitCompatibilityService } from '../../application/services/SpecKitCompatibilityService';
import { TokenBudgetService } from '../../application/services/TokenBudgetService';
import { VALID_CATEGORIES } from '../../domain/entities/MemoryEntry';
import { createDatabaseConnection } from '../../infrastructure/database/connection';
import { IndexingRunRepository } from '../../infrastructure/database/repositories/IndexingRunRepository';
import { MemoryEntryRepository } from '../../infrastructure/database/repositories/MemoryEntryRepository';
import { ProjectRepository } from '../../infrastructure/database/repositories/ProjectRepository';
import { ProjectSummaryRepository } from '../../infrastructure/database/repositories/ProjectSummaryRepository';
import { RelationshipRepository } from '../../infrastructure/database/repositories/RelationshipRepository';
import { SourceDocumentRepository } from '../../infrastructure/database/repositories/SourceDocumentRepository';
import { TagRepository } from '../../infrastructure/database/repositories/TagRepository';
import { SharedLessonRepository } from '../../infrastructure/database/repositories/SharedLessonRepository';
import { SqliteTransactionRunner } from '../../infrastructure/database/SqliteTransactionRunner';
import { IndexingInputGuard } from '../../infrastructure/safety/IndexingInputGuard';
import { PathSanitizer } from '../../infrastructure/safety/PathSanitizer';
import { getGlobalHubDatabase } from '../../infrastructure/database/global';
import { startMcpServer } from '../../mcp/server';
import { resolveWorkspaceRootForAdd } from './workspace-root';

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

function normalizeRepeatedValues(input?: string | string[]): string[] {
  if (!input) {
    return [];
  }

  const values = Array.isArray(input) ? input : [input];
  return Array.from(new Set(
    values
      .flatMap((value) => value.split(','))
      .map((item) => item.trim())
      .filter(Boolean)
  ));
}

function parseConfidence(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    throw new Error('Confidence must be an integer between 0 and 100');
  }

  return parsed;
}

interface WorkspaceCompatibilityBundle {
  db: ReturnType<typeof createDatabaseConnection>;
  project: ReturnType<ProjectRepository['upsertByRootPath']>;
  compatibilityService: SpecKitCompatibilityService;
  memorySynthesisService: MemorySynthesisService;
  docSynthesisService: DocSynthesisService;
  sharedLessonService: SharedLessonService;
  tokenBudgetService: TokenBudgetService;
}

function formatJsonOutput(payload: unknown): string {
  return JSON.stringify(payload, null, 2) + '\n';
}

function formatTokenReport(report: {
  baselineTokens: number;
  cachedTokens: number;
  savedTokens: number;
  savedPercent: number;
  baselineSources: string[];
  cachedArtifacts: string[];
}): string {
  return [
    `Baseline tokens: ${report.baselineTokens}`,
    `Cached tokens: ${report.cachedTokens}`,
    `Saved tokens: ${report.savedTokens} (${report.savedPercent.toFixed(1)}%)`,
    `Baseline sources: ${report.baselineSources.length > 0 ? report.baselineSources.join(', ') : 'none'}`,
    `Cached artifacts: ${report.cachedArtifacts.join(', ')}`
  ].join('\n') + '\n';
}

function normalizePathArg(target: string | undefined, fallback = '.'): string {
  return path.resolve(process.cwd(), target ?? fallback);
}

function createWorkspaceCompatibilityBundle(workspaceRoot: string): WorkspaceCompatibilityBundle {
  const dbFile = PathSanitizer.sanitizeSubPath(workspaceRoot, '.flash-mem/flashmem.sqlite');
  if (!fs.existsSync(dbFile)) {
    throw new Error(`No SQLite memory store found at "${dbFile}". Run "flash-mem init" first.`);
  }

  const db = createDatabaseConnection(dbFile);
  new SchemaMigrationService(db).ensureCurrentSchema();

  const projectRepo = new ProjectRepository(db);
  const project = projectRepo.upsertByRootPath(workspaceRoot, path.basename(workspaceRoot));
  const memoryEntryRepository = new MemoryEntryRepository(db);
  const tagRepository = new TagRepository(db);
  const relationshipRepository = new RelationshipRepository(db);
  const sourceDocumentRepository = new SourceDocumentRepository(db);
  const projectSummaryRepository = new ProjectSummaryRepository(db);
  const sharedLessonRepository = new SharedLessonRepository(db);
  const transactionRunner = new SqliteTransactionRunner(db);
  const memorySearchService = new MemorySearchService(memoryEntryRepository, tagRepository, projectRepo);
  const projectSummaryService = new ProjectSummaryService(project.id, projectRepo, projectSummaryRepository);
  const relevantContextService = new RelevantContextService(projectRepo, memorySearchService);
  const memorySynthesisService = new MemorySynthesisService(projectRepo, projectSummaryService, relevantContextService);
  const docSynthesisService = new DocSynthesisService();
  
  const globalDb = getGlobalHubDatabase();
  const globalSharedLessonRepository = new SharedLessonRepository(globalDb);
  
  const sharedLessonService = new SharedLessonService(sharedLessonRepository, globalSharedLessonRepository);
  const compatibilityService = new SpecKitCompatibilityService(
    memorySynthesisService,
    docSynthesisService,
    sharedLessonService,
    new TokenBudgetService()
  );

  // Keep the original write-capable services available for future command extensions.
  void relationshipRepository;
  void sourceDocumentRepository;
  void transactionRunner;

  return {
    db,
    project,
    compatibilityService,
    memorySynthesisService,
    docSynthesisService,
    sharedLessonService,
    tokenBudgetService: new TokenBudgetService()
  };
}

async function promptForAgentInstructionTargets(targetDir: string): Promise<AgentInstructionTargetId[]> {
  if (!process.stdin.isTTY) {
    throw new Error('Interactive mode requires a TTY terminal');
  }

  const service = new InitializeProjectService();
  const targets = service.getAgentInstructionTargets(targetDir);
  const detectedIds = targets.filter(t => t.exists).map(t => t.id);

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

  const selectionHelp = targets
    .map((target, index) => `${index + 1}. ${target.label} (${target.filePath})${target.exists ? ' (Detected)' : ''}`)
    .join('\n');

  try {
    while (true) {
      const promptText = detectedIds.length > 0 
        ? 'Enter numbers separated by commas, or press Enter to update detected agents: '
        : 'Enter numbers separated by commas, or press Enter for all: ';

      const input = await ask([
        'Select agent instruction files to create:',
        selectionHelp,
        promptText
      ].join('\n'));

      if (input.trim() === '') {
        return detectedIds.length > 0 ? detectedIds : AGENT_INSTRUCTION_TARGETS.map((target) => target.id);
      }

      const selectedIndexes = Array.from(new Set(
        input
          .split(',')
          .map((token) => Number.parseInt(token.trim(), 10))
          .filter((value) => Number.isInteger(value) && value >= 1 && value <= AGENT_INSTRUCTION_TARGETS.length)
      ));

      if (selectedIndexes.length === 0) {
        process.stderr.write('Invalid selection. Try again.\n');
        continue;
      }

      return selectedIndexes
        .map((index) => AGENT_INSTRUCTION_TARGETS[index - 1])
        .filter((target): target is (typeof AGENT_INSTRUCTION_TARGETS)[number] => Boolean(target))
        .map((target) => target.id);
    }
  } finally {
    rl.close();
  }
}

async function promptForMcpTargets(targetDir: string): Promise<McpTargetId[]> {
  if (!process.stdin.isTTY) {
    throw new Error('Interactive mode requires a TTY terminal');
  }

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

  const selectionHelp = MCP_TARGETS
    .map((target, index) => `${index + 1}. ${target.label} (${target.filePath})`)
    .join('\n');

  try {
    while (true) {
      const promptText = 'Enter numbers separated by commas, or press Enter for all: ';

      const input = await ask([
        '\nSelect MCP configuration files to create:',
        selectionHelp,
        promptText
      ].join('\n'));

      if (input.trim() === '') {
        return MCP_TARGETS.map((target) => target.id);
      }

      const selectedIndexes = Array.from(new Set(
        input
          .split(',')
          .map((token) => Number.parseInt(token.trim(), 10))
          .filter((value) => Number.isInteger(value) && value >= 1 && value <= MCP_TARGETS.length)
      ));

      if (selectedIndexes.length === 0) {
        process.stderr.write('Invalid selection. Try again.\n');
        continue;
      }

      return selectedIndexes
        .map((index) => MCP_TARGETS[index - 1])
        .filter((target): target is (typeof MCP_TARGETS)[number] => Boolean(target))
        .map((target) => target.id);
    }
  } finally {
    rl.close();
  }
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
  .version(require('../../../package.json').version);

program
  .command('init')
  .description('Initialize a new flash-mem workspace')
  .argument('[path]', 'The project path to initialize', '.')
  .option('-a, --all', 'Skip interactive prompt and create instruction files for all supported agents')
  .option('-i, --interactive', 'Interactively choose which prompt files to create (default in TTY)')
  .option('-j, --json', 'Output structured JSON instead of plain text')
  .action(async (dirArg, options) => {
    const service = new InitializeProjectService();
    const useJson = !!options.json;

    try {
      const targetDir = path.resolve(process.cwd(), dirArg);
      
      let promptTargetIds: AgentInstructionTargetId[] | undefined;
      let mcpTargetIds: McpTargetId[] | undefined;
      
      if (options.all) {
        promptTargetIds = AGENT_INSTRUCTION_TARGETS.map(t => t.id);
        mcpTargetIds = MCP_TARGETS.map(t => t.id);
      } else if (options.interactive || (process.stdin.isTTY && !useJson)) {
        promptTargetIds = await promptForAgentInstructionTargets(targetDir);
        mcpTargetIds = await promptForMcpTargets(targetDir);
      }
      const result = service.execute(targetDir, { promptTargetIds, mcpTargetIds });

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
  .command('update')
  .alias('inject-prompts')
  .description('Update existing Engineering Memory Protocol files in the current workspace and detect the active prompt surface')
  .argument('[path]', 'The project path to inject into', '.')
  .option('-j, --json', 'Output structured JSON instead of plain text')
  .action(async (dirArg, options) => {
    const useJson = !!options.json;

    try {
      const targetDir = path.resolve(process.cwd(), dirArg);

      if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
        throw new Error(`Path "${targetDir}" does not exist or is not a directory`);
      }

      const service = new InitializeProjectService();
      const { updated, skipped, detected } = service.writeAgentInstructions(targetDir, {
        existingOnly: true
      });

      if (useJson) {
        await writeStdout(JSON.stringify({
          success: true,
          updated,
          skipped,
          detected: detected.map((target) => ({
            id: target.id,
            label: target.label,
            filePath: target.filePath,
            kind: target.kind
          }))
        }, null, 2) + '\n');
      } else {
        if (detected.length > 0) {
          await writeStdout(`Detected prompt surface(s): ${detected.map((target) => `${target.label} (${target.filePath})`).join(', ')}\n`);
        } else {
          await writeStdout('No existing prompt injection files found in this workspace.\n');
        }
        if (updated.length > 0) {
          await writeStdout(`Updated ${updated.length} file(s):\n`);
          for (const f of updated) {
            await writeStdout(`  ✓ ${path.relative(targetDir, f)}\n`);
          }
        }
        if (skipped.length > 0) {
          await writeStdout(`Skipped ${skipped.length} file(s) (already up to date or unversioned):\n`);
          for (const f of skipped) {
            await writeStdout(`  - ${path.relative(targetDir, f)}\n`);
          }
        }
        if (updated.length === 0 && skipped.length === 0) {
          await writeStdout('No agent instruction files were updated.\n');
        }
      }

      process.exitCode = 0;
      return;
    } catch (err: any) {
      const errMsg = err.message || 'Unknown error occurred during prompt injection';
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

            if (
              item === 'node_modules' || item === 'dist' || item === 'coverage' || item === 'build' ||
              (item.startsWith('.') && item !== '.specify')
            ) {
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

        const { results: rebuildResults, warnings } = indexingService.rebuildIndex(project.id, sources);

        if (!useJson && warnings && warnings.length > 0) {
          await writeStderr('Safety warnings detected during indexing:\n');
          for (const warning of warnings) {
            await writeStderr(`  - ${warning.filePath}:${warning.line} - ${warning.category}\n`);
          }
        }

        if (useJson) {
          await writeStdout(JSON.stringify({
            success: true,
            rebuilt: true,
            entryCount: rebuildResults.length,
            sourcesIndexed: sources.map(s => s.path),
            warnings
          }, null, 2) + '\n');
        } else {
          await writeStdout(`Index rebuilt successfully! Transactionally processed ${rebuildResults.length} entries from ${sources.length} markdown source files.\n`);
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
  .option('--content <string>', 'Content/body of the memory entry')
  .option('--category <string>', 'Category of the memory entry')
  .option('--source <string>', 'Source of the memory entry')
  .option('--tag <string>', 'Tag for the memory entry', (value, previous: string[] = []) => {
    const normalized = value.trim();
    if (!normalized) {
      return previous;
    }

    return Array.from(new Set([...previous, normalized]));
  }, [])
  .option('--confidence <number>', 'Confidence score (0-100)', (val) => parseInt(val, 10))
  .option('--related-file <string>', 'Related file path for the memory entry', (value, previous: string[] = []) => {
    const normalized = value.trim();
    if (!normalized) {
      return previous;
    }

    return Array.from(new Set([...previous, normalized]));
  }, [])
  .option('--project-path <path>', 'Path to the workspace root directory (defaults to current working directory)', '.')
  .option('-i, --interactive', 'Interactively prompt for missing fields')
  .option('-j, --json', 'Output structured JSON instead of plain text')
  .action(async (options) => {
    const useJson = !!options.json;
    const isInteractive = !!options.interactive;

    try {
      let title = options.title?.trim();
      let content = options.content?.trim();
      let category = options.category?.trim();
      let source = options.source?.trim();
      let tags = normalizeRepeatedValues(options.tag);
      let confidence = parseConfidence(options.confidence);
      let relatedFiles = normalizeRepeatedValues(options.relatedFile);
      let projectPath = options.projectPath?.trim();

      // If interactive, prompt for missing required fields
      if (isInteractive) {
        if (!process.stdin.isTTY) {
          throw new Error('Interactive mode requires a TTY terminal');
        }

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

          if (!content) {
            while (!content) {
              content = await ask('Enter content (required): ');
              if (!content) {
                process.stderr.write('Content cannot be empty.\n');
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

          if (tags.length === 0) {
            const tagInput = await ask('Enter tags (comma-separated, optional): ');
            tags = normalizeRepeatedValues(tagInput);
          }

          while (confidence === undefined) {
            const confidenceInput = await ask('Enter confidence (0-100, default 50): ');
            if (confidenceInput.trim() === '') {
              confidence = 50;
              break;
            }

            try {
              confidence = parseConfidence(confidenceInput);
            } catch (promptError: any) {
              process.stderr.write(`${promptError.message}\n`);
            }
          }

          if (relatedFiles.length === 0) {
            const relatedFilesInput = await ask('Enter related files (comma-separated, optional): ');
            relatedFiles = normalizeRepeatedValues(relatedFilesInput);
          }

          if (!projectPath) {
            const projectPathInput = await ask('Enter project path (optional, defaults to current repo): ');
            projectPath = projectPathInput.trim();
          }
        } finally {
          rl.close();
        }
      }

      // 3. Validate presence of required fields (if not interactive)
      const missingFields: string[] = [];
      if (!title) missingFields.push('title');
      if (!content) missingFields.push('content');
      if (!category) missingFields.push('category');
      if (!source) missingFields.push('source');

      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }

      if (confidence === undefined) {
        confidence = 50;
      }

      const resolvedWorkspace = resolveWorkspaceRootForAdd(projectPath ?? '.');

      // 2. Resolve database path relative to workspace root (SEC-001)
      const dbFile = PathSanitizer.sanitizeSubPath(resolvedWorkspace, '.flash-mem/flashmem.sqlite');
      if (!fs.existsSync(dbFile)) {
        throw new Error(`No SQLite memory store found at "${dbFile}". Run "flash-mem init" first.`);
      }

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
          content,
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
            id: entry.id
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
          error: errMsg,
          details: [errMsg]
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
        const initService = new InitializeProjectService();
        initService.execute(workspaceRoot);
      }

      const db = createDatabaseConnection(dbFile);
      try {
        await startMcpServer({
          db,
          workspaceRoot,
          summaryWriteAccessEnabled: process.env.FLASH_MEM_ENABLE_PROJECT_SUMMARY_WRITES === '1'
        });
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

        if (result.warnings && result.warnings.length > 0) {
          for (const warning of result.warnings) {
            await writeStderr(`Warning: ${warning}\n`);
          }
        }

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

program
  .command('prepare-context')
  .description('Generate memory and doc synthesis artifacts plus a token report for a feature or workspace')
  .argument('[path]', 'The workspace path to prepare context for', '.')
  .option('--feature <path>', 'Feature path relative to the workspace root')
  .option('--query <query>', 'Override the memory synthesis query')
  .option('--token-budget <number>', 'Token budget for the memory synthesis output', (val) => parseInt(val, 10))
  .option('--write', 'Write memory-synthesis.md and doc-synthesis.md to the feature path')
  .option('-j, --json', 'Output structured JSON instead of plain text')
  .action(async (workspaceArg, options) => {
    const useJson = !!options.json;
    let bundle: WorkspaceCompatibilityBundle | null = null;

    try {
      const workspaceRoot = normalizePathArg(workspaceArg);
      bundle = createWorkspaceCompatibilityBundle(workspaceRoot);
      const result = bundle.compatibilityService.prepareContext({
        workspaceRoot,
        featurePath: options.feature,
        query: options.query,
        tokenBudget: options.tokenBudget,
        writeArtifacts: !!options.write
      });

      if (useJson) {
        await writeStdout(formatJsonOutput({
          success: true,
          workspaceRoot: result.workspaceRoot,
          featurePath: result.featurePath,
          query: result.query,
          memorySynthesis: result.memorySynthesis,
          docSynthesis: result.docSynthesis,
          tokenReport: result.tokenReport,
          memorySynthesisPath: result.memorySynthesisPath,
          docSynthesisPath: result.docSynthesisPath
        }));
      } else {
        await writeStdout(result.memorySynthesis.markdown);
        await writeStdout(result.docSynthesis.markdown);
        await writeStdout(formatTokenReport(result.tokenReport));
        if (result.memorySynthesisPath || result.docSynthesisPath) {
          await writeStdout([
            'Artifacts written:',
            result.memorySynthesisPath ? `- ${path.relative(workspaceRoot, result.memorySynthesisPath)}` : null,
            result.docSynthesisPath ? `- ${path.relative(workspaceRoot, result.docSynthesisPath)}` : null
          ].filter(Boolean).join('\n') + '\n');
        }
      }

      process.exitCode = 0;
      return;
    } catch (err: any) {
      const errMsg = err.message || 'Unknown error occurred while preparing context';
      await writeStderr(`Error: ${errMsg}\n`);
      if (useJson) {
        await writeStdout(formatJsonOutput({ success: false, error: errMsg }));
      }
      process.exitCode = 1;
      return;
    } finally {
      bundle?.db.close();
    }
  });

program
  .command('synthesize-memory')
  .description('Generate a memory synthesis for a feature or workspace')
  .argument('[path]', 'The workspace path to read from', '.')
  .option('--feature <path>', 'Feature path relative to the workspace root')
  .option('--query <query>', 'Override the memory synthesis query')
  .option('--token-budget <number>', 'Token budget for the synthesis output', (val) => parseInt(val, 10))
  .option('--write', 'Write memory-synthesis.md to the feature path')
  .option('-j, --json', 'Output structured JSON instead of plain text')
  .action(async (workspaceArg, options) => {
    const useJson = !!options.json;
    let bundle: WorkspaceCompatibilityBundle | null = null;

    try {
      const workspaceRoot = normalizePathArg(workspaceArg);
      bundle = createWorkspaceCompatibilityBundle(workspaceRoot);
      const result = bundle.memorySynthesisService.buildFeatureSynthesis({
        workspaceRoot,
        query: options.query ?? options.feature ?? path.basename(workspaceRoot),
        tokenBudget: options.tokenBudget,
        resultLimit: 4
      });

      const artifactPath = options.write
        ? PathSanitizer.sanitizeSubPath(options.feature ? PathSanitizer.sanitizeSubPath(workspaceRoot, options.feature) : workspaceRoot, 'memory-synthesis.md')
        : null;

      if (artifactPath) {
        fs.ensureDirSync(path.dirname(artifactPath));
        fs.writeFileSync(artifactPath, result.markdown, 'utf-8');
      }

      if (useJson) {
        await writeStdout(formatJsonOutput({
          success: true,
          workspaceRoot,
          query: options.query ?? options.feature ?? path.basename(workspaceRoot),
          synthesis: result,
          artifactPath
        }));
      } else {
        await writeStdout(result.markdown);
        await writeStdout(`Estimated tokens: ${result.tokenEstimate}\n`);
        if (artifactPath) {
          await writeStdout(`Artifact written: ${path.relative(workspaceRoot, artifactPath)}\n`);
        }
      }

      process.exitCode = 0;
      return;
    } catch (err: any) {
      const errMsg = err.message || 'Unknown error occurred while synthesizing memory';
      await writeStderr(`Error: ${errMsg}\n`);
      if (useJson) {
        await writeStdout(formatJsonOutput({ success: false, error: errMsg }));
      }
      process.exitCode = 1;
      return;
    } finally {
      bundle?.db.close();
    }
  });

program
  .command('synthesize-docs')
  .description('Generate a doc synthesis for a feature or workspace')
  .argument('[path]', 'The workspace path to read from', '.')
  .option('--feature <path>', 'Feature path relative to the workspace root')
  .option('--write', 'Write doc-synthesis.md to the feature path')
  .option('-j, --json', 'Output structured JSON instead of plain text')
  .action(async (workspaceArg, options) => {
    const useJson = !!options.json;
    let bundle: WorkspaceCompatibilityBundle | null = null;

    try {
      const workspaceRoot = normalizePathArg(workspaceArg);
      bundle = createWorkspaceCompatibilityBundle(workspaceRoot);
      const result = bundle.docSynthesisService.buildDocSynthesis({
        workspaceRoot,
        featurePath: options.feature ? options.feature : workspaceRoot
      });

      const featureRoot = options.feature
        ? PathSanitizer.sanitizeSubPath(workspaceRoot, options.feature)
        : workspaceRoot;
      const artifactPath = options.write
        ? PathSanitizer.sanitizeSubPath(featureRoot, 'doc-synthesis.md')
        : null;

      if (artifactPath) {
        fs.ensureDirSync(path.dirname(artifactPath));
        fs.writeFileSync(artifactPath, result.markdown, 'utf-8');
      }

      if (useJson) {
        await writeStdout(formatJsonOutput({
          success: true,
          workspaceRoot,
          featurePath: featureRoot,
          synthesis: result,
          artifactPath
        }));
      } else {
        await writeStdout(result.markdown);
        if (artifactPath) {
          await writeStdout(`Artifact written: ${path.relative(workspaceRoot, artifactPath)}\n`);
        }
      }

      process.exitCode = 0;
      return;
    } catch (err: any) {
      const errMsg = err.message || 'Unknown error occurred while synthesizing docs';
      await writeStderr(`Error: ${errMsg}\n`);
      if (useJson) {
        await writeStdout(formatJsonOutput({ success: false, error: errMsg }));
      }
      process.exitCode = 1;
      return;
    } finally {
      bundle?.db.close();
    }
  });

program
  .command('token-report')
  .description('Report the token budget comparison between raw docs and synthesized context')
  .argument('[path]', 'The workspace path to read from', '.')
  .option('--feature <path>', 'Feature path relative to the workspace root')
  .option('--query <query>', 'Override the memory synthesis query')
  .option('-j, --json', 'Output structured JSON instead of plain text')
  .action(async (workspaceArg, options) => {
    const useJson = !!options.json;
    let bundle: WorkspaceCompatibilityBundle | null = null;

    try {
      const workspaceRoot = normalizePathArg(workspaceArg);
      bundle = createWorkspaceCompatibilityBundle(workspaceRoot);
      const result = bundle.compatibilityService.prepareContext({
        workspaceRoot,
        featurePath: options.feature,
        query: options.query
      });

      if (useJson) {
        await writeStdout(formatJsonOutput({
          success: true,
          workspaceRoot,
          featurePath: result.featurePath,
          query: result.query,
          tokenReport: result.tokenReport
        }));
      } else {
        await writeStdout(formatTokenReport(result.tokenReport));
      }

      process.exitCode = 0;
      return;
    } catch (err: any) {
      const errMsg = err.message || 'Unknown error occurred while generating token report';
      await writeStderr(`Error: ${errMsg}\n`);
      if (useJson) {
        await writeStdout(formatJsonOutput({ success: false, error: errMsg }));
      }
      process.exitCode = 1;
      return;
    } finally {
      bundle?.db.close();
    }
  });

program
  .command('promote-lesson')
  .description('Promote a validated lesson into shared memory')
  .requiredOption('--topic <string>', 'Lesson topic')
  .requiredOption('--lesson <string>', 'Lesson body')
  .option('--framework <string>', 'Optional framework filter')
  .option('--language <string>', 'Optional language filter')
  .option('--workspace <path>', 'Workspace root used for source hashing', '.')
  .option('-j, --json', 'Output structured JSON instead of plain text')
  .action(async (options) => {
    const useJson = !!options.json;
    let bundle: WorkspaceCompatibilityBundle | null = null;

    try {
      const workspaceRoot = normalizePathArg(options.workspace);
      bundle = createWorkspaceCompatibilityBundle(workspaceRoot);
      const result = await bundle.compatibilityService.promoteLesson({
        topic: options.topic,
        lesson: options.lesson,
        framework: options.framework,
        language: options.language,
        workspaceRoot
      });

      if (useJson) {
        await writeStdout(formatJsonOutput({
          success: true,
          lesson: result
        }));
      } else {
        await writeStdout(`Shared lesson promoted: ${result.topic}\n`);
      }

      process.exitCode = 0;
      return;
    } catch (err: any) {
      const errMsg = err.message || 'Unknown error occurred while promoting lesson';
      await writeStderr(`Error: ${errMsg}\n`);
      if (useJson) {
        await writeStdout(formatJsonOutput({ success: false, error: errMsg }));
      }
      process.exitCode = 1;
      return;
    } finally {
      bundle?.db.close();
    }
  });

program
  .command('sync-shared')
  .description('Sync shared lessons into a local review file')
  .argument('[path]', 'The workspace path to sync into', '.')
  .option('--framework <string>', 'Override the framework filter')
  .option('--language <string>', 'Override the language filter')
  .option('--limit <number>', 'Maximum number of lessons to sync', (val) => parseInt(val, 10))
  .option('-j, --json', 'Output structured JSON instead of plain text')
  .action(async (workspaceArg, options) => {
    const useJson = !!options.json;
    let bundle: WorkspaceCompatibilityBundle | null = null;

    try {
      const workspaceRoot = normalizePathArg(workspaceArg);
      bundle = createWorkspaceCompatibilityBundle(workspaceRoot);
      const result = await bundle.compatibilityService.syncSharedLessons({
        workspaceRoot,
        framework: options.framework,
        language: options.language,
        limit: options.limit
      });

      if (useJson) {
        await writeStdout(formatJsonOutput({
          success: true,
          workspaceRoot,
          ...result
        }));
      } else {
        await writeStdout(result.markdown);
        await writeStdout([
          `Shared lessons written to: ${path.relative(workspaceRoot, result.filePath)}`,
          `Compatibility review written to: ${path.relative(workspaceRoot, result.reviewFilePath)}`
        ].join('\n') + '\n');
      }

      process.exitCode = 0;
      return;
    } catch (err: any) {
      const errMsg = err.message || 'Unknown error occurred while syncing shared lessons';
      await writeStderr(`Error: ${errMsg}\n`);
      if (useJson) {
        await writeStdout(formatJsonOutput({ success: false, error: errMsg }));
      }
      process.exitCode = 1;
      return;
    } finally {
      bundle?.db.close();
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
