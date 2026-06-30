import { exec } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryEntryService } from '../../src/application/services/MemoryEntryService';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { WorkspaceManager } from '../../src/mcp/WorkspaceManager';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { MemoryEntryRepository } from '../../src/infrastructure/database/repositories/MemoryEntryRepository';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { RelationshipRepository } from '../../src/infrastructure/database/repositories/RelationshipRepository';
import { SourceDocumentRepository } from '../../src/infrastructure/database/repositories/SourceDocumentRepository';
import { TagRepository } from '../../src/infrastructure/database/repositories/TagRepository';
import { SqliteTransactionRunner } from '../../src/infrastructure/database/SqliteTransactionRunner';
import { ExportSafetyGuard } from '../../src/infrastructure/safety/ExportSafetyGuard';
import { createMcpServer } from '../../src/mcp/server';

function execCli(args: string, options: { cwd?: string } = {}): Promise<{ stdout: string; stderr: string; code: number }> {
  const cliScript = path.resolve(__dirname, '../../dist/infrastructure/cli/index.js');
  const env = { ...process.env };
  delete env.VITEST;
  delete env.VITEST_WORKER_ID;
  return new Promise((resolve) => {
    exec(`node "${cliScript}" ${args}`, { cwd: options.cwd, env }, (error, stdout, stderr) => {
      resolve({
        stdout,
        stderr,
        code: error ? (error.code ?? 1) : 0
      });
    });
  });
}

describe('Safety and Secret Filtering Integration', () => {
  const testWorkspace = path.resolve(__dirname, 'safety-integration-workspace');
  const dbFile = path.join(testWorkspace, '.flash-mem', 'flashmem.sqlite');

  beforeEach(() => {
    fs.removeSync(testWorkspace);
    fs.ensureDirSync(testWorkspace);
  });

  afterEach(() => {
    fs.removeSync(testWorkspace);
  });

  describe('MCP Safety Integration (T015)', () => {
    it('redacts secrets and returns warnings in memory.index tool call', async () => {
      const db = createDatabaseConnection(dbFile);
      new SchemaMigrationService(db).ensureCurrentSchema();

      const projectRepo = new ProjectRepository(db);
      const project = projectRepo.upsertByRootPath(testWorkspace, 'safety-integration-workspace');
      const manager = new WorkspaceManager();
      const server = createMcpServer({ manager });

      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'memory_index',
          arguments: {
            project_path: testWorkspace,
            sources: [
              {
                path: 'docs/credentials.md',
                checksum: 'hash123',
                title: 'Credentials',
                content: 'My secret token is ghp_1234567890abcdefghij12345678\nAnd my password = supersecret.',
                category: 'security_note'
              }
            ]
          }
        }
      }) as any;

      if (response.error) {
        console.error('memory.index tool call failed error detail:', JSON.stringify(response.error, null, 2));
      }

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      const payload = JSON.parse(response.result.content[0].text);
      expect(payload.results).toHaveLength(1);
      expect(payload.results[0].entry).toBeDefined();

      // Verify that warnings are returned in the response payload
      expect(payload.warnings).toBeDefined();
      expect(payload.warnings).toHaveLength(2);
      expect(payload.warnings).toEqual(expect.arrayContaining([
        expect.objectContaining({
          filePath: 'docs/credentials.md',
          line: 1,
          category: 'GitHub Token'
        }),
        expect.objectContaining({
          filePath: 'docs/credentials.md',
          line: 2,
          category: 'Generic Credential'
        })
      ]));

      // Verify redacted content is actually stored in database
      const row = db.prepare(`SELECT * FROM memory_entries WHERE title = 'Credentials'`).get() as any;
      db.close();

      expect(row).toBeDefined();
      expect(row.content).not.toContain('ghp_1234567890abcdefghij12345678');
      expect(row.content).toContain('[REDACTED_SECRET]');
    });

    it('returns warnings in rebuild_index tool call', async () => {
      const db = createDatabaseConnection(dbFile);
      new SchemaMigrationService(db).ensureCurrentSchema();

      const projectRepo = new ProjectRepository(db);
      projectRepo.upsertByRootPath(testWorkspace, 'safety-integration-workspace');
      const manager = new WorkspaceManager();
      const server = createMcpServer({ manager });

      // Create a file with secret in the workspace
      const secretFile = path.join(testWorkspace, 'docs', 'secrets.md');
      fs.ensureDirSync(path.dirname(secretFile));
      fs.writeFileSync(secretFile, '# Security\nAWS_KEY = AKIA1234567890ABCDEF');

      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'rebuild_index',
          arguments: {
            project_path: testWorkspace
          }
        }
      }) as any;

      db.close();

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      const payload = JSON.parse(response.result.content[0].text);
      expect(payload.warnings).toBeDefined();
      expect(payload.warnings).toHaveLength(1);
      expect(payload.warnings[0]).toEqual(expect.objectContaining({
        filePath: 'docs/secrets.md',
        line: 2,
        category: 'AWS Access Key'
      }));
    });
  });

  describe('CLI Safety Integration (T015)', () => {
    it('outputs warnings to stderr in plain text mode', async () => {
      // Init project
      const initResult = await execCli(`init "${testWorkspace}"`);
      if (initResult.code !== 0) {
        console.error('init failed stdout:', initResult.stdout, 'stderr:', initResult.stderr);
      }

      // Write a file with a secret
      const secretFile = path.join(testWorkspace, 'docs', 'db.md');
      fs.ensureDirSync(path.dirname(secretFile));
      fs.writeFileSync(secretFile, 'DB_URL = postgresql://user:pass@localhost:5432/mydb');

      const { stdout, stderr, code } = await execCli(`rebuild-index "${testWorkspace}" --yes`);
      if (code !== 0) {
        console.error('rebuild-index failed stdout:', stdout, 'stderr:', stderr, 'code:', code);
      }
      expect(code).toBe(0);
      expect(stdout).toContain('Index rebuilt successfully!');

      // Verify warnings printed to stderr
      expect(stderr).toContain('Safety warnings detected during indexing:');
      expect(stderr).toContain('docs/db.md:1 - Database Connection URI');
    });

    it('outputs warnings inside JSON payload when using --json', async () => {
      const initResult = await execCli(`init "${testWorkspace}"`);
      if (initResult.code !== 0) {
        console.error('init failed (json test) stdout:', initResult.stdout, 'stderr:', initResult.stderr);
      }

      const secretFile = path.join(testWorkspace, 'docs', 'db.md');
      fs.ensureDirSync(path.dirname(secretFile));
      fs.writeFileSync(secretFile, 'DB_URL = postgresql://user:pass@localhost:5432/mydb');

      const { stdout, stderr, code } = await execCli(`rebuild-index "${testWorkspace}" --yes --json`);
      if (code !== 0) {
        console.error('rebuild-index --json failed stdout:', stdout, 'stderr:', stderr, 'code:', code);
      }
      expect(code).toBe(0);
      expect(stderr).toBe('');

      const result = JSON.parse(stdout.trim());
      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toEqual(expect.objectContaining({
        filePath: 'docs/db.md',
        line: 1,
        category: 'Database Connection URI'
      }));
    });
  });

  describe('Export Safety & Traversal Integration (T019)', () => {
    it('blocks directory traversal attempts in ExportSafetyGuard', () => {
      const guard = new ExportSafetyGuard();

      // Check path resolution boundaries
      expect(() => guard.resolveExportFilePath(testWorkspace, '../escaped.md')).toThrow('Directory traversal detected');
      expect(() => guard.resolveExportFilePath(testWorkspace, '/absolute/path/outside')).toThrow('Directory traversal detected');
    });

    it('redacts secrets during export', async () => {
      // Init project
      const initResult = await execCli(`init "${testWorkspace}"`);
      if (initResult.code !== 0) {
        console.error('init failed (export test) stdout:', initResult.stdout, 'stderr:', initResult.stderr);
      }

      const db = createDatabaseConnection(dbFile);
      new SchemaMigrationService(db).ensureCurrentSchema();

      const projectRepo = new ProjectRepository(db);
      const project = projectRepo.upsertByRootPath(testWorkspace, 'safety-integration-workspace');

      // Create memory entries using MemoryEntryService
      const memory = new MemoryEntryService(
        projectRepo,
        new MemoryEntryRepository(db),
        new TagRepository(db),
        new RelationshipRepository(db),
        new SourceDocumentRepository(db),
        new SqliteTransactionRunner(db)
      );

      memory.createMemoryEntry({
        projectId: project.id,
        title: 'Config',
        content: 'Use port 8080 and API key api_key=supersecret.',
        category: 'decision',
        source: 'test',
        tags: ['config']
      });

      // Close test DB handle so CLI process can lock/access it
      db.close();

      // Run export CLI
      const { stdout, stderr, code } = await execCli(`export markdown "${testWorkspace}"`);
      if (code !== 0) {
        console.error('export failed stdout:', stdout, 'stderr:', stderr, 'code:', code);
      }
      expect(code).toBe(0);
      expect(stderr).toBe('');

      // Verify export folder is created and the file is redacted
      const exportDateKey = new Date().toISOString().slice(0, 10);
      const exportFile = path.join(testWorkspace, '.flash-mem', 'exports', exportDateKey, 'decisions.md');
      expect(fs.existsSync(exportFile)).toBe(true);

      const content = fs.readFileSync(exportFile, 'utf8');
      expect(content).not.toContain('supersecret');
      expect(content).toContain('[REDACTED_SECRET]');
    });
  });
});
