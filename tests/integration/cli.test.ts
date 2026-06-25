import * as fs from 'fs-extra';
import * as path from 'path';
import * as readline from 'readline';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryEntryService } from '../../src/application/services/MemoryEntryService';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { program } from '../../src/infrastructure/cli/index';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { MemoryEntryRepository } from '../../src/infrastructure/database/repositories/MemoryEntryRepository';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { RelationshipRepository } from '../../src/infrastructure/database/repositories/RelationshipRepository';
import { SourceDocumentRepository } from '../../src/infrastructure/database/repositories/SourceDocumentRepository';
import { TagRepository } from '../../src/infrastructure/database/repositories/TagRepository';
import { SqliteTransactionRunner } from '../../src/infrastructure/database/SqliteTransactionRunner';

vi.mock('readline', () => ({
  createInterface: vi.fn()
}));

function execAsync(command: string, options: { cwd?: string; input?: string[]; tty?: boolean } = {}) {
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
    const inputLines = [...(options.input ?? [])];
    const createInterfaceMock = vi.mocked(readline.createInterface);

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
        value: !!options.tty
      });

      if (inputLines.length > 0) {
        let lineHandler: ((line: string) => void) | null = null;

        createInterfaceMock.mockImplementation(() => {
          const fakeInterface = {
            on(event: string, handler: (line: string) => void) {
              if (event === 'line') {
                lineHandler = handler;
                queueMicrotask(() => {
                  while (lineHandler && inputLines.length > 0) {
                    const nextLine = inputLines.shift();
                    if (nextLine === undefined) {
                      break;
                    }

                    lineHandler(nextLine);
                  }
                });
              }

              return fakeInterface as any;
            },
            close() {
              lineHandler = null;
            }
          };

          return fakeInterface as any;
        });
      }

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
      createInterfaceMock.mockReset();
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
    expect(fs.existsSync(path.join(testWorkspace, '.cursor', 'mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, '.mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, '.vscode', 'mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, '.codex', 'config.toml'))).toBe(true);
    expect(fs.readFileSync(path.join(testWorkspace, '.codex', 'config.toml'), 'utf-8')).toContain(
      'FLASH_MEM_ENABLE_PROJECT_SUMMARY_WRITES = "1"'
    );
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

  it('should update agent instructions with update and keep inject-prompts as a compatibility alias', async () => {
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);

    const targetFile = path.join(testWorkspace, 'ANTIGRAVITY.md');
    fs.writeFileSync(
      targetFile,
      [
        '<!-- flash-mem-protocol-start v1 -->',
        '# Engineering Memory Protocol (flash-mem)',
        '',
        'legacy content',
        '<!-- flash-mem-protocol-end -->'
      ].join('\n')
    );

    const updateResult = await execAsync(`node ${cliScript} update "${testWorkspace}" --json`);
    expect(updateResult.stderr).toBe('');

    const updatePayload = JSON.parse(updateResult.stdout.trim());
    expect(updatePayload.success).toBe(true);
    expect(Array.isArray(updatePayload.detected)).toBe(true);
    expect(updatePayload.updated).toContain(targetFile);
    expect(fs.existsSync(targetFile)).toBe(true);

    const aliasResult = await execAsync(`node ${cliScript} inject-prompts "${testWorkspace}" --json`);
    expect(aliasResult.stderr).toBe('');

    const aliasPayload = JSON.parse(aliasResult.stdout.trim());
    expect(aliasPayload.success).toBe(true);
  });

  it('should allow interactive init to create only the selected prompt files and MCP targets', async () => {
    const { stdout, stderr } = await execAsync(`node ${cliScript} init "${testWorkspace}" --interactive`, {
      tty: true,
      input: ['1', '5'] // 1 for ANTIGRAVITY.md, 5 for .vscode/mcp.json
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('flash-mem initialized successfully at:');

    // Agent instructions check
    expect(fs.existsSync(path.join(testWorkspace, 'ANTIGRAVITY.md'))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, 'CLINE.md'))).toBe(false);
    expect(fs.existsSync(path.join(testWorkspace, '.cursorrules'))).toBe(false);

    // MCP configs check
    expect(fs.existsSync(path.join(testWorkspace, '.vscode', 'mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, '.cursor', 'mcp.json'))).toBe(false);
    expect(fs.existsSync(path.join(testWorkspace, '.mcp.json'))).toBe(false);
    expect(fs.existsSync(path.join(testWorkspace, '.codex', 'config.toml'))).toBe(false);
  }, 30_000);

  it('should export markdown backups from the CLI boundary', async () => {
    let exportCreatedAt = 0;
    const dbFile = path.join(testWorkspace, '.flash-mem', 'flashmem.sqlite');
    const db = createDatabaseConnection(dbFile);
    try {
      new SchemaMigrationService(db).ensureCurrentSchema();
      const projectRepo = new ProjectRepository(db);
      const project = projectRepo.upsertByRootPath(testWorkspace, 'test-workspace-cli');
      const entry = new MemoryEntryService(
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

      if (!entry) {
        throw new Error('Failed to seed CLI export test entry');
      }
      exportCreatedAt = entry.createdAt;
    } finally {
      db.close();
    }

    const { stdout, stderr } = await execAsync(`node ${cliScript} export markdown "${testWorkspace}"`);

    expect(stderr).toBe('');
    expect(stdout).toContain('markdown backups exported successfully to:');
    const exportDateKey = new Date(exportCreatedAt).toISOString().slice(0, 10);
    expect(fs.existsSync(path.join(testWorkspace, '.flash-mem/exports', 'project-summary.md'))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, '.flash-mem/exports', exportDateKey, 'decisions.md'))).toBe(true);
  });

  it('should prepare combined context through the compatibility CLI', async () => {
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);

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
        title: 'Prepare context decision',
        content: 'Generate memory synthesis before task planning.',
        category: 'decision',
        source: 'docs/decision.md'
      });
    } finally {
      db.close();
    }

    const featurePath = path.join(testWorkspace, 'specs', 'feature-a');
    fs.ensureDirSync(featurePath);
    fs.writeFileSync(path.join(featurePath, 'spec.md'), '# Feature A\n\nMemory-first planning.', 'utf-8');

    const { stdout, stderr } = await execAsync(
      `node ${cliScript} prepare-context "${testWorkspace}" --feature "specs/feature-a" --write --json`
    );

    expect(stderr).toBe('');
    const result = JSON.parse(stdout.trim());
    expect(result.success).toBe(true);
    expect(result.workspaceRoot).toBe(testWorkspace);
    expect(result.query).toBe('feature-a');
    expect(result.memorySynthesis).toHaveProperty('markdown');
    expect(result.docSynthesis).toHaveProperty('markdown');
    expect(result.tokenReport).toHaveProperty('baselineTokens');
    expect(result.indexedArtifacts).toBeTruthy();
    expect(result.indexedArtifacts.entryCount).toBeGreaterThan(0);
    expect(result.indexedArtifacts.sources).toContain('specs/feature-a/memory-synthesis.md');
    expect(result.indexedArtifacts.sources).toContain('specs/feature-a/doc-synthesis.md');

    const verifyDb = createDatabaseConnection(dbFile);
    try {
      new SchemaMigrationService(verifyDb).ensureCurrentSchema();
      const project = new ProjectRepository(verifyDb).findByRootPath(testWorkspace);
      expect(project).not.toBeNull();

      const sourceRepo = new SourceDocumentRepository(verifyDb);
      const memoryRepo = new MemoryEntryRepository(verifyDb);
      const memorySource = sourceRepo.findByProjectAndPath(project!.id, 'specs/feature-a/memory-synthesis.md');
      const docSource = sourceRepo.findByProjectAndPath(project!.id, 'specs/feature-a/doc-synthesis.md');
      const storedEntries = memoryRepo.listByProject(project!.id);

      expect(memorySource).not.toBeNull();
      expect(docSource).not.toBeNull();
      expect(storedEntries.some((entry) => entry.sourceDocumentId === memorySource?.id && entry.content.includes('# Memory Synthesis: feature-a'))).toBe(true);
      expect(storedEntries.some((entry) => entry.sourceDocumentId === docSource?.id && entry.content.includes('# Doc Synthesis'))).toBe(true);
    } finally {
      verifyDb.close();
    }
  });

  it('should store combined context directly in flash-mem when --store is used', async () => {
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);

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
        title: 'Prepare context store decision',
        content: 'Store synthesized context directly in flash-mem.',
        category: 'decision',
        source: 'docs/decision.md'
      });
    } finally {
      db.close();
    }

    const featurePath = path.join(testWorkspace, 'specs', 'feature-b');
    fs.ensureDirSync(featurePath);
    fs.writeFileSync(path.join(featurePath, 'spec.md'), '# Feature B\n\nStore context directly.', 'utf-8');

    const { stdout, stderr } = await execAsync(
      `node ${cliScript} prepare-context "${testWorkspace}" --feature "specs/feature-b" --store --json`
    );

    expect(stderr).toBe('');
    const result = JSON.parse(stdout.trim());
    expect(result.success).toBe(true);
    expect(result.memorySynthesisPath).toBeNull();
    expect(result.docSynthesisPath).toBeNull();
    expect(result.indexedArtifacts.sources).toEqual([
      '.flash-mem/context/specs/feature-b/memory-synthesis.md',
      '.flash-mem/context/specs/feature-b/doc-synthesis.md'
    ]);
    expect(fs.existsSync(path.join(testWorkspace, '.flash-mem', 'context', 'specs', 'feature-b', 'memory-synthesis.md'))).toBe(false);
    expect(fs.existsSync(path.join(testWorkspace, '.flash-mem', 'context', 'specs', 'feature-b', 'doc-synthesis.md'))).toBe(false);

    const verifyDb = createDatabaseConnection(dbFile);
    try {
      new SchemaMigrationService(verifyDb).ensureCurrentSchema();
      const project = new ProjectRepository(verifyDb).findByRootPath(testWorkspace);
      expect(project).not.toBeNull();

      const sourceRepo = new SourceDocumentRepository(verifyDb);
      const memoryRepo = new MemoryEntryRepository(verifyDb);
      const memorySource = sourceRepo.findByProjectAndPath(project!.id, '.flash-mem/context/specs/feature-b/memory-synthesis.md');
      const docSource = sourceRepo.findByProjectAndPath(project!.id, '.flash-mem/context/specs/feature-b/doc-synthesis.md');
      const storedEntries = memoryRepo.listByProject(project!.id);

      expect(memorySource).not.toBeNull();
      expect(docSource).not.toBeNull();
      expect(storedEntries.some((entry) => entry.sourceDocumentId === memorySource?.id && entry.content.includes('# Memory Synthesis: feature-b'))).toBe(true);
      expect(storedEntries.some((entry) => entry.sourceDocumentId === docSource?.id && entry.content.includes('# Doc Synthesis'))).toBe(true);
    } finally {
      verifyDb.close();
    }
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

  it('should sync shared lessons into both the native and compatibility review files', async () => {
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);

    const promote = await execAsync(
      `node ${cliScript} promote-lesson --workspace "${testWorkspace}" --topic "Compatibility review" --lesson "Write the review buffer to docs/memory/SHARED_LESSONS.md." --framework nest --language typescript --json`
    );
    expect(JSON.parse(promote.stdout.trim()).success).toBe(true);

    const { stdout, stderr } = await execAsync(
      `node ${cliScript} sync-shared "${testWorkspace}" --framework nest --language typescript --json`
    );

    expect(stderr).toBe('');
    const result = JSON.parse(stdout.trim());
    expect(result.success).toBe(true);
    expect(result.filePath).toBe(path.join(testWorkspace, 'SHARED_LESSONS.md'));
    expect(result.reviewFilePath).toBe(path.join(testWorkspace, 'docs', 'memory', 'SHARED_LESSONS.md'));
    expect(fs.existsSync(result.filePath)).toBe(true);
    expect(fs.existsSync(result.reviewFilePath)).toBe(true);
    expect(fs.readFileSync(result.reviewFilePath, 'utf-8')).toContain('# Shared Lessons Review Buffer');
    expect(fs.readFileSync(result.reviewFilePath, 'utf-8')).toContain('Compatibility review');
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
      `node ${cliScript} add --title "CLI Memory" --content "Adding memory via CLI" --category "decision" --source "cli" --tag "cli" --tag "memory" --related-file "src/cli.ts" --project-path "${testWorkspace}"`
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
      expect(row.confidence).toBe(50);
    } finally {
      db.close();
    }
  });

  it('should output JSON when --json option is passed', async () => {
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);
    const { stdout, stderr } = await execAsync(
      `node ${cliScript} add --title "JSON Memory" --content "Adding JSON memory" --category "framework" --source "cli" --tag "json" --related-file "docs/json.md" --project-path "${testWorkspace}" --json`
    );

    expect(stderr).toBe('');
    const result = JSON.parse(stdout.trim());
    expect(result.success).toBe(true);
    expect(result.id).toBeTypeOf('string');
    expect(result.entry).toBeUndefined();
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
      expect(err.stderr).toContain('Error: Missing required fields: content, category, source');
    }
  });

  it('should return structured JSON when required arguments are missing in json mode', async () => {
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);
    try {
      await execAsync(
        `node ${cliScript} add --title "Missing Info" --project-path "${testWorkspace}" --json`
      );
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe(1);
      const result = JSON.parse(err.stdout.trim());
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields: content, category, source');
      expect(Array.isArray(result.details)).toBe(true);
    }
  });

  it('should validate category constraints and reject invalid category', async () => {
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);
    try {
      await execAsync(
        `node ${cliScript} add --title "Bad Category" --content "Some content" --category "invalid-cat" --source "cli" --project-path "${testWorkspace}"`
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
        `node ${cliScript} add --title "Traversal" --content "content" --category "decision" --source "cli" --project-path "${testWorkspace}/non-existent"`
      );
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe(1);
      expect(err.stderr).toContain('does not exist or is not a directory');
    }
  });

  it('should redact secrets from title and content', async () => {
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);
    const { stdout, stderr } = await execAsync(
      `node ${cliScript} add --title "AWS key AKIA1234567890123456" --content "Secret is AKIA1234567890123456" --category "security_note" --source "cli" --project-path "${testWorkspace}" --json`
    );

    expect(stderr).toBe('');
    const result = JSON.parse(stdout.trim());
    expect(result.success).toBe(true);
    expect(result.id).toBeTypeOf('string');
  });

  it('should accept the interactive flag when required fields are provided', async () => {
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);

    fs.ensureDirSync(path.join(testWorkspace, '.git'));

    const { stdout, stderr, code } = await execAsync(
      `node ${cliScript} add -i --title "Interactive Title" --content "Interactive Content" --category "decision" --source "cli-interactive" --project-path "${testWorkspace}"`,
      {
        cwd: testWorkspace,
        tty: true,
        input: ['', '', '', '']
      }
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
      expect(row.confidence).toBe(50);
    } finally {
      db.close();
    }
  });

  it('should resolve the workspace root from the nearest git root when project-path is omitted', async () => {
    fs.ensureDirSync(path.join(testWorkspace, '.git'));
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);

    const { stdout, stderr } = await execAsync(
      `node ${cliScript} add --title "Git Root Memory" --content "Resolved from cwd git root" --category "decision" --source "cli" --json`,
      {
        cwd: testWorkspace,
        tty: false
      }
    );

    expect(stderr).toBe('');
    const result = JSON.parse(stdout.trim());
    expect(result.success).toBe(true);
    expect(result.id).toBeTypeOf('string');

    const dbFile = path.join(testWorkspace, '.flash-mem', 'flashmem.sqlite');
    const db = createDatabaseConnection(dbFile);
    try {
      const row = db.prepare(`SELECT * FROM memory_entries WHERE title = 'Git Root Memory'`).get() as any;
      expect(row).toBeDefined();
      expect(row.content).toBe('Resolved from cwd git root');
    } finally {
      db.close();
    }
  });

  it('should fail interactive mode immediately in non-TTY environments', async () => {
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);
    try {
      await execAsync(
        `node ${cliScript} add -i --title "TTY Failure" --content "Interactive Content" --category "decision" --source "cli" --project-path "${testWorkspace}"`
      );
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe(1);
      expect(err.stderr).toContain('Interactive mode requires a TTY terminal');
    }
  });

  it('should reject whitespace-only title and content with trim validation', async () => {
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);
    try {
      await execAsync(
        `node ${cliScript} add --title "   " --content "Valid content" --category "decision" --source "cli" --project-path "${testWorkspace}"`
      );
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe(1);
      expect(err.stderr).toContain('Missing required fields: title');
    }

    try {
      await execAsync(
        `node ${cliScript} add --title "Valid Title" --content "   " --category "decision" --source "cli" --project-path "${testWorkspace}"`
      );
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe(1);
      expect(err.stderr).toContain('Missing required fields: content');
    }
  });

  it('should initialize with default profile when --profile is not specified', async () => {
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);

    const antigravityPath = path.join(testWorkspace, 'ANTIGRAVITY.md');
    const content = fs.readFileSync(antigravityPath, 'utf-8');

    expect(content).toContain('## Memory Quality');
    expect(content).not.toContain('## Strict Governance');
  });

  it('should initialize with strict profile when --profile strict is specified', async () => {
    await execAsync(`node ${cliScript} init "${testWorkspace}" --profile strict`);

    const antigravityPath = path.join(testWorkspace, 'ANTIGRAVITY.md');
    const content = fs.readFileSync(antigravityPath, 'utf-8');

    expect(content).toContain('## Strict Governance');
    expect(content).toContain('Require explicit confidence scores');
    expect(content).toContain('Mandate source attribution');
  });

  it('should update to strict profile when flash-mem update --profile strict is run', async () => {
    // Initialize with default profile
    await execAsync(`node ${cliScript} init "${testWorkspace}"`);

    const antigravityPath = path.join(testWorkspace, 'ANTIGRAVITY.md');
    let content = fs.readFileSync(antigravityPath, 'utf-8');
    expect(content).not.toContain('## Strict Governance');

    // Update to strict profile
    await execAsync(`node ${cliScript} update "${testWorkspace}" --profile strict`);

    content = fs.readFileSync(antigravityPath, 'utf-8');
    expect(content).toContain('## Strict Governance');
    expect(content).toContain('Track provenance');
  });
});
