#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs-extra';
import * as path from 'path';
import { InitializeProjectService } from '../../application/services/InitializeProjectService';
import { MarkdownExportService } from '../../application/services/MarkdownExportService';
import { MarkdownRestoreService } from '../../application/services/MarkdownRestoreService';
import { SchemaMigrationService } from '../../application/services/SchemaMigrationService';
import { MemoryEntryService } from '../../application/services/MemoryEntryService';
import { IndexingService } from '../../application/services/IndexingService';
import { createDatabaseConnection } from '../../infrastructure/database/connection';
import { PathSanitizer } from '../../infrastructure/safety/PathSanitizer';
import { IndexingInputGuard } from '../../infrastructure/safety/IndexingInputGuard';
import { ProjectRepository } from '../../infrastructure/database/repositories/ProjectRepository';
import { MemoryEntryRepository } from '../../infrastructure/database/repositories/MemoryEntryRepository';
import { TagRepository } from '../../infrastructure/database/repositories/TagRepository';
import { RelationshipRepository } from '../../infrastructure/database/repositories/RelationshipRepository';
import { SourceDocumentRepository } from '../../infrastructure/database/repositories/SourceDocumentRepository';
import { IndexingRunRepository } from '../../infrastructure/database/repositories/IndexingRunRepository';

const program = new Command();

program
  .name('flash-mem')
  .description('Local-first engineering memory server and CLI tool')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize a new flash-mem workspace')
  .argument('[path]', 'The project path to initialize', '.')
  .option('-j, --json', 'Output structured JSON instead of plain text')
  .action((dirArg, options) => {
    const service = new InitializeProjectService();
    const useJson = !!options.json;

    try {
      const targetDir = path.resolve(process.cwd(), dirArg);
      const result = service.execute(targetDir);

      if (useJson) {
        process.stdout.write(JSON.stringify({
          success: true,
          path: result.path,
          metadata: result.metadata
        }, null, 2) + '\n');
      } else {
        process.stdout.write(`flash-mem initialized successfully at: ${result.path}\n`);
      }
      process.exit(0);
    } catch (err: any) {
      const errMsg = err.message || 'Unknown error occurred during initialization';
      process.stderr.write(`Error: ${errMsg}\n`);

      if (useJson) {
        process.stdout.write(JSON.stringify({
          success: false,
          error: errMsg
        }, null, 2) + '\n');
      }
      process.exit(1);
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
          process.stdout.write(JSON.stringify({
            success: true,
            path: result.manifest.exportRoot,
            manifest: result.manifest,
            files: result.files
          }, null, 2) + '\n');
        } else {
          process.stdout.write(`markdown backups exported successfully to: ${result.manifest.exportRoot}\n`);
        }

        process.exit(0);
      } finally {
        db.close();
      }
    } catch (err: any) {
      const errMsg = err.message || 'Unknown error occurred during markdown export';
      process.stderr.write(`Error: ${errMsg}\n`);

      if (useJson) {
        process.stdout.write(JSON.stringify({
          success: false,
          error: errMsg
        }, null, 2) + '\n');
      }
      process.exit(1);
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

          let entryType = 'note';
          if (relPath.includes('decision')) entryType = 'decision';
          else if (relPath.includes('pattern')) entryType = 'pattern';
          else if (relPath.includes('bug') || relPath.includes('fix')) entryType = 'bug-fix';
          else if (relPath.includes('security')) entryType = 'security-note';
          else if (relPath.includes('convention') || relPath.includes('style')) entryType = 'convention';

          return {
            path: relPath,
            checksum,
            title,
            content,
            entryType,
            tags: [entryType]
          };
        });

        const indexingService = new IndexingService(
          db,
          new ProjectRepository(db),
          new SourceDocumentRepository(db),
          new IndexingRunRepository(db),
          new MemoryEntryService(db),
          new SchemaMigrationService(db)
        );

        const results = indexingService.rebuildIndex(project.id, sources);

        if (useJson) {
          process.stdout.write(JSON.stringify({
            success: true,
            rebuilt: true,
            entryCount: results.length,
            sourcesIndexed: sources.map(s => s.path)
          }, null, 2) + '\n');
        } else {
          process.stdout.write(`Index rebuilt successfully! Transactionally processed ${results.length} entries from ${sources.length} markdown source files.\n`);
        }

        process.exit(0);
      } finally {
        db.close();
      }
    } catch (err: any) {
      const errMsg = err.message || 'Unknown error occurred during index rebuild';
      process.stderr.write(`Error: ${errMsg}\n`);

      if (useJson) {
        process.stdout.write(JSON.stringify({
          success: false,
          error: errMsg
        }, null, 2) + '\n');
      }
      process.exit(1);
    }
  });

program
  .command('restore-backup')
  .description('Restore memory entries from markdown backup files')
  .argument('[path]', 'Path to the backup directory (defaults to .flash-mem/exports relative to workspace root)')
  .option('-j, --json', 'Output structured JSON instead of plain text')
  .option('--workspace <path>', 'The workspace root to restore into (defaults to current working directory)', '.')
  .action((dirArg, options) => {
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
          db,
          new ProjectRepository(db),
          new MemoryEntryRepository(db),
          new TagRepository(db),
          new RelationshipRepository(db),
          new SourceDocumentRepository(db),
          new SchemaMigrationService(db)
        );

        const result = service.restore(backupDirectory, workspaceRoot);

        if (useJson) {
          process.stdout.write(JSON.stringify({
            success: true,
            restoredEntries: result.restoredEntries,
            restoredRelationships: result.restoredRelationships,
            skippedFiles: result.skippedFiles,
            warnings: result.warnings
          }, null, 2) + '\n');
        } else {
          process.stdout.write(
            `Restore complete. Restored ${result.restoredEntries} entr${result.restoredEntries === 1 ? 'y' : 'ies'} ` +
            `and ${result.restoredRelationships} relationship${result.restoredRelationships === 1 ? '' : 's'}` +
            (result.skippedFiles.length > 0 ? ` (${result.skippedFiles.length} file(s) skipped).` : '.') +
            '\n'
          );
        }

        process.exit(0);
      } finally {
        db.close();
      }
    } catch (err: any) {
      const errMsg = err.message || 'Unknown error occurred during backup restore';
      process.stderr.write(`Error: ${errMsg}\n`);

      if (useJson) {
        process.stdout.write(JSON.stringify({
          success: false,
          error: errMsg
        }, null, 2) + '\n');
      }
      process.exit(1);
    }
  });

// Only parse if executed as a script
if (require.main === module || !module.parent) {
  void program.parseAsync(process.argv);
}

export { program };
