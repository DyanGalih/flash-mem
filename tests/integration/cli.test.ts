import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { MemoryEntryRepository } from '../../src/infrastructure/database/repositories/MemoryEntryRepository';
import { TagRepository } from '../../src/infrastructure/database/repositories/TagRepository';
import { RelationshipRepository } from '../../src/infrastructure/database/repositories/RelationshipRepository';
import { SourceDocumentRepository } from '../../src/infrastructure/database/repositories/SourceDocumentRepository';
import { SqliteTransactionRunner } from '../../src/infrastructure/database/SqliteTransactionRunner';
import { MemoryEntryService } from '../../src/application/services/MemoryEntryService';

const execAsync = promisify(exec);

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
});

