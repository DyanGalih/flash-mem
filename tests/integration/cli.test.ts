import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { program } from '../../src/infrastructure/cli/index';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { MemoryEntryRepository } from '../../src/infrastructure/database/repositories/MemoryEntryRepository';
import { TagRepository } from '../../src/infrastructure/database/repositories/TagRepository';
import { RelationshipRepository } from '../../src/infrastructure/database/repositories/RelationshipRepository';
import { SourceDocumentRepository } from '../../src/infrastructure/database/repositories/SourceDocumentRepository';
import { SqliteTransactionRunner } from '../../src/infrastructure/database/SqliteTransactionRunner';
import { MemoryEntryService } from '../../src/application/services/MemoryEntryService';

function execAsync(command: string, options: { cwd?: string; input?: string[] } = {}) {
  const tokens = command.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((token) => token.replace(/^"(.*)"$/, '$1')) ?? [];
  const args = tokens.slice(2);

  const resetCommandState = (cmd: any) => {
    if (cmd._optionValues) {
      cmd._optionValues = {};
    }
    if (cmd._optionValueSources) {
      cmd._optionValueSources = {};
    }
    if (Array.isArray(cmd.options)) {
      for (const option of cmd.options) {
        const attributeName = typeof option.attributeName === 'function' ? option.attributeName() : option.long?.replace(/^--/, '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        if (attributeName && typeof attributeName === 'string') {
          delete cmd[attributeName];
        }
      }
    }
    if (Array.isArray(cmd.commands)) {
      for (const child of cmd.commands) {
        resetCommandState(child);
      }
    }
  };

  return (async () => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    const originalCwd = process.cwd;
    const originalStdinIsTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const originalExitCode = process.exitCode;

    console.log = (...values: any[]) => {
      stdoutChunks.push(`${values.join(' ')}\n`);
    };
    console.error = (...values: any[]) => {
      stderrChunks.push(`${values.join(' ')}\n`);
    };

    try {
      if (options.cwd) {
        process.cwd = () => path.resolve(options.cwd ?? '.');
      }
      Object.defineProperty(process.stdin, 'isTTY', {
        configurable: true,
        value: false
      });
      resetCommandState(program);
      try {
        await program.parseAsync(['node', 'flash-mem', ...args]);
      } catch (error: any) {
        const wrapped = error instanceof Error ? error : new Error(String(error));
        (wrapped as Error & { code?: number; stdout?: string; stderr?: string }).code = error?.exitCode ?? error?.code ?? 1;
        (wrapped as Error & { code?: number; stdout?: string; stderr?: string }).stdout = stdoutChunks.join('');
        (wrapped as Error & { code?: number; stdout?: string; stderr?: string }).stderr = stderrChunks.join('');
        throw wrapped;
      }

      const code = process.exitCode ?? 0;
      if (code !== 0) {
        const error = new Error(`Command failed: ${command}`) as Error & {
          code?: number;
          stdout?: string;
          stderr?: string;
        };
        error.code = code;
        error.stdout = stdoutChunks.join('');
        error.stderr = stderrChunks.join('');
        throw error;
      }

      return {
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join(''),
        code
      };
    } finally {
      console.log = originalLog;
      console.error = originalError;
      process.cwd = originalCwd;
      if (originalStdinIsTTY) {
        Object.defineProperty(process.stdin, 'isTTY', originalStdinIsTTY);
      } else {
        delete (process.stdin as any).isTTY;
      }
      process.exitCode = originalExitCode;
    }
  })();
}

describe('CLI Integration', () => {
  const testWorkspace = path.resolve(__dirname, 'test-workspace-cli');
  const cliScript = path.resolve(__dirname, '../../dist/infrastructure/cli/index.js');
  beforeEach(() => {
    fs.removeSync(testWorkspace);
    fs.ensureDirSync(testWorkspace);
  });

  afterEach(() => {
    fs.removeSync(testWorkspace);
  });

  it('should initialize a project and print plain text output on success', async () => {
    const { stdout, stderr } = await execAsync(`node ${cliScript} init "${testWorkspace}"`);

    expect(stdout).toContain('flash-mem initialized successfully at:');
    expect(stderr).toBe('');

    expect(fs.existsSync(path.join(testWorkspace, '.flash-mem'))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, '.flash-mem/index.json'))).toBe(true);
  });

  it('should initialize with --json option and output structured JSON', async () => {
    const { stdout, stderr } = await execAsync(`node ${cliScript} init "${testWorkspace}" --json`);

    expect(stderr).toBe('');
    const result = JSON.parse(stdout.trim());
    expect(result.success).toBe(true);
    expect(result.path).toBe(path.join(testWorkspace, '.flash-mem'));
    expect(result.metadata.name).toBe('test-workspace-cli');
    expect(result.metadata.schemaVersion).toBe('1.0.0');
  });

  it('should fallback to current working directory if path argument is omitted', async () => {
    // Run the cli in testWorkspace with CWD set to testWorkspace
    const { stdout, stderr } = await execAsync(`node ${cliScript} init`, {
      cwd: testWorkspace
    });

    expect(stdout).toContain('flash-mem initialized successfully at:');
    expect(stderr).toBe('');
    expect(fs.existsSync(path.join(testWorkspace, '.flash-mem'))).toBe(true);
  });

  it('should exit with 1 and print error to stderr on collision', async () => {
    // Create a regular file named .flash-mem
    fs.writeFileSync(path.join(testWorkspace, '.flash-mem'), 'colliding file');

    try {
      await execAsync(`node ${cliScript} init "${testWorkspace}"`);
      // If it doesn't throw, fail the test
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe(1);
      expect(err.stderr).toContain('Error: A regular file named ".flash-mem" already exists');
    }
  });

  it('should export markdown backups from the CLI boundary', async () => {
    const dbFile = path.join(testWorkspace, '.flash-mem', 'flashmem.sqlite');
    const db = createDatabaseConnection(dbFile);
    try {
      new SchemaMigrationService(db).ensureCurrentSchema();
      const projectRepo = new ProjectRepository(db);
      const project = projectRepo.upsertByRootPath(testWorkspace, 'test-workspace-cli');
      new MemoryEntryService(
        projectRepo,
        new MemoryEntryRepository(db),
        new TagRepository(db),
        new RelationshipRepository(db),
        new SourceDocumentRepository(db),
        new SqliteTransactionRunner(db)
      ).createMemoryEntry({
        projectId: project.id,
        title: 'CLI export decision',
        content: 'Export backups through the CLI command surface.',
        category: 'decision',
        source: 'test',
        tags: ['decision']
      });
    } finally {
      db.close();
    }

    const { stdout, stderr } = await execAsync(`node ${cliScript} export markdown "${testWorkspace}"`);

    expect(stderr).toBe('');
    expect(stdout).toContain('markdown backups exported successfully to:');
    expect(fs.existsSync(path.join(testWorkspace, '.flash-mem/exports/project-summary.md'))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, '.flash-mem/exports/decisions.md'))).toBe(true);
  });

  it('should output error JSON on stdout if collision occurs with --json option', async () => {
    // Create a regular file named .flash-mem
    fs.writeFileSync(path.join(testWorkspace, '.flash-mem'), 'colliding file');

    try {
      await execAsync(`node ${cliScript} init "${testWorkspace}" --json`);
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe(1);
      expect(err.stderr).toContain('Error: A regular file named ".flash-mem" already exists');
      const result = JSON.parse(err.stdout.trim());
      expect(result.success).toBe(false);
      expect(result.error).toContain('A regular file named ".flash-mem" already exists');
    }
  });
  it('should refuse to rebuild index without --yes confirmation', async () => {
    // Initialize first
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);

    try {
      await execAsync(`node ${cliScript} rebuild-index "${testWorkspace}"`);
      expect(true).toBe(false); // shouldn't reach here
    } catch (err: any) {
      expect(err.code).toBe(1);
      expect(err.stderr).toContain('Error: Rebuilding the index is a destructive operation that clears the database. Run with --yes to confirm.');
    }
  });

  it('should successfully rebuild index with --yes confirmation', async () => {
    // Initialize
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);

    // Create a markdown file to index
    const mdPath = path.join(testWorkspace, 'docs', 'decision-sqlite.md');
    fs.ensureDirSync(path.dirname(mdPath));
    fs.writeFileSync(mdPath, '# Decision: SQLite\nWe use SQLite for local memory.');

    // Build/rebuild index
    const { stdout, stderr } = await execAsync(`node ${cliScript} rebuild-index "${testWorkspace}" --yes`);
    expect(stderr).toBe('');
    expect(stdout).toContain('Index rebuilt successfully!');

    // Verify it was indexed
    const dbFile = path.join(testWorkspace, '.flash-mem', 'flashmem.sqlite');
    const db = createDatabaseConnection(dbFile);
    try {
      const row = db.prepare(`SELECT * FROM memory_entries WHERE title = 'Decision: SQLite'`).get() as any;
      expect(row).toBeDefined();
      expect(row.content).toContain('We use SQLite for local memory.');
    } finally {
      db.close();
    }
  });

  it('should successfully add a memory entry via CLI with valid arguments', async () => {
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);
    const { stdout, stderr } = await execAsync(
      `node ${cliScript} add --title "CLI Memory" --summary "Adding memory via CLI" --category "decision" --source "cli" --project-path "${testWorkspace}"`
    );

    expect(stderr).toBe('');
    expect(stdout).toContain('Memory entry added successfully!');
    expect(stdout).toContain('ID:');

    // Verify it is in database
    const dbFile = path.join(testWorkspace, '.flash-mem', 'flashmem.sqlite');
    const db = createDatabaseConnection(dbFile);
    try {
      const row = db.prepare(`SELECT * FROM memory_entries WHERE title = 'CLI Memory'`).get() as any;
      expect(row).toBeDefined();
      expect(row.content).toBe('Adding memory via CLI');
      expect(row.category).toBe('decision');
    } finally {
      db.close();
    }
  });

  it('should output JSON when --json option is passed', async () => {
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);
    const { stdout, stderr } = await execAsync(
      `node ${cliScript} add --title "JSON Memory" --summary "Adding JSON memory" --category "framework" --source "cli" --project-path "${testWorkspace}" --json`
    );

    expect(stderr).toBe('');
    const result = JSON.parse(stdout.trim());
    expect(result.success).toBe(true);
    expect(result.entry.title).toBe('JSON Memory');
    expect(result.entry.category).toBe('framework');
  });

  it('should reject missing required arguments when not in interactive mode', async () => {
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);
    try {
      await execAsync(
        `node ${cliScript} add --title "Missing Info" --project-path "${testWorkspace}"`
      );
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe(1);
      expect(err.stderr).toContain('Error: Missing required fields: summary, category, source');
    }
  });

  it('should validate category constraints and reject invalid category', async () => {
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);
    try {
      await execAsync(
        `node ${cliScript} add --title "Bad Category" --summary "Some content" --category "invalid-cat" --source "cli" --project-path "${testWorkspace}"`
      );
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe(1);
      expect(err.stderr).toContain('invalid_enum_value');
    }
  });

  it('should prevent directory traversal and exit with 1 on invalid project path', async () => {
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);
    try {
      await execAsync(
        `node ${cliScript} add --title "Traversal" --summary "content" --category "decision" --source "cli" --project-path "${testWorkspace}/non-existent"`
      );
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe(1);
      expect(err.stderr).toContain('does not exist or is not a directory');
    }
  });

  it('should redact secrets from title and summary', async () => {
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);
    const { stdout, stderr } = await execAsync(
      `node ${cliScript} add --title "AWS key AKIA1234567890123456" --summary "Secret is AKIA1234567890123456" --category "security_note" --source "cli" --project-path "${testWorkspace}" --json`
    );

    expect(stderr).toBe('');
    const result = JSON.parse(stdout.trim());
    expect(result.success).toBe(true);
    expect(result.entry.title).toContain('[REDACTED_SECRET]');
    expect(result.entry.content).toContain('[REDACTED_SECRET]');
  });

  it('should accept the interactive flag when required fields are provided', async () => {
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);

    const { stdout, stderr, code } = await execAsync(
      `node ${cliScript} add -i --title "Interactive Title" --summary "Interactive Content" --category "decision" --source "cli-interactive" --project-path "${testWorkspace}"`
    );
    expect(code).toBe(0);
    expect(stdout).toContain('Memory entry added successfully!');
    expect(stderr).toBe('');

    const dbFile = path.join(testWorkspace, '.flash-mem', 'flashmem.sqlite');
    const db = createDatabaseConnection(dbFile);
    try {
      const row = db.prepare(`SELECT * FROM memory_entries WHERE title = 'Interactive Title'`).get() as any;
      expect(row).toBeDefined();
      expect(row.content).toBe('Interactive Content');
      expect(row.category).toBe('decision');
      expect(row.source).toBe('cli-interactive');
    } finally {
      db.close();
    }
  });

  it('should reject whitespace-only title and content with trim validation', async () => {
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);
    try {
      await execAsync(
        `node ${cliScript} add --title "   " --summary "Valid content" --category "decision" --source "cli" --project-path "${testWorkspace}"`
      );
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe(1);
      expect(err.stderr).toContain('Missing required fields: title');
    }

    try {
      await execAsync(
        `node ${cliScript} add --title "Valid Title" --summary "   " --category "decision" --source "cli" --project-path "${testWorkspace}"`
      );
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe(1);
      expect(err.stderr).toContain('Missing required fields: summary');
    }
  });
});
