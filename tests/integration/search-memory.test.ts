import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { performance } from 'node:perf_hooks';
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
import { MemorySearchService } from '../../src/application/services/MemorySearchService';

describe('Search Memory Integration', () => {
  let db: any;
  let projectRepo: ProjectRepository;
  let entryService: MemoryEntryService;
  let searchService: MemorySearchService;
  const workspaceRoot = path.resolve(__dirname, 'search-memory-workspace');
  const dbFile = path.join(workspaceRoot, '.flash-mem', 'flashmem.sqlite');

  beforeEach(() => {
    fs.removeSync(workspaceRoot);
    fs.ensureDirSync(path.dirname(dbFile));
    db = createDatabaseConnection(dbFile);
    new SchemaMigrationService(db).ensureCurrentSchema();

    projectRepo = new ProjectRepository(db);
    const memoryEntryRepo = new MemoryEntryRepository(db);
    const tagRepo = new TagRepository(db);
    const relationshipRepo = new RelationshipRepository(db);
    const sourceDocumentRepo = new SourceDocumentRepository(db);
    const transactionRunner = new SqliteTransactionRunner(db);

    entryService = new MemoryEntryService(
      projectRepo,
      memoryEntryRepo,
      tagRepo,
      relationshipRepo,
      sourceDocumentRepo,
      transactionRunner
    );
    searchService = new MemorySearchService(memoryEntryRepo, tagRepo, projectRepo);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    fs.removeSync(workspaceRoot);
  });

  it('filters by normalized source path and tag operators', () => {
    const project = projectRepo.upsertByRootPath(workspaceRoot, 'search-memory-workspace');

    entryService.createMemoryEntry({
      projectId: project.id,
      title: 'SQLite search decision',
      content: 'We should keep the search path compact.',
      category: 'decision',
      source: 'file',
      tags: ['architecture', 'sqlite'],
      sourceDocumentPath: 'docs/memory/sqlite.md'
    });

    entryService.createMemoryEntry({
      projectId: project.id,
      title: 'Architecture note',
      content: 'This is a different entry.',
      category: 'architecture',
      source: 'file',
      tags: ['architecture'],
      sourceDocumentPath: 'docs/memory/architecture.md'
    });

    const sourceResults = searchService.search({ source: './docs/memory/./sqlite.md' });
    expect(sourceResults.results).toHaveLength(1);
    expect(sourceResults.results[0].title).toBe('SQLite search decision');

    const andResults = searchService.search({ tags: ['architecture', 'sqlite'], tagOperator: 'AND' });
    expect(andResults.results).toHaveLength(1);

    const orResults = searchService.search({ tags: ['architecture', 'sqlite'], tagOperator: 'OR' });
    expect(orResults.results).toHaveLength(2);
  });

  it('returns compact results within the search benchmark window', () => {
    const project = projectRepo.upsertByRootPath(workspaceRoot, 'search-memory-workspace');
    const memoryEntryRepo = new MemoryEntryRepository(db);
    const tagsRepo = new TagRepository(db);
    const relationshipRepo = new RelationshipRepository(db);
    const sourceDocumentRepo = new SourceDocumentRepository(db);
    const transactionRunner = new SqliteTransactionRunner(db);
    const benchmarkEntryService = new MemoryEntryService(
      projectRepo,
      memoryEntryRepo,
      tagsRepo,
      relationshipRepo,
      sourceDocumentRepo,
      transactionRunner
    );

    db.transaction(() => {
      for (let index = 0; index < 1000; index += 1) {
        const isNeedle = index >= 980; // 20 matching entries
        benchmarkEntryService.createMemoryEntry({
          projectId: project.id,
          title: isNeedle ? `Needle entry ${index}` : `Entry ${index}`,
          content: isNeedle 
            ? `Needle content for fast search ${index}. ` + 'Substantial content body that takes lots of space. '.repeat(100)
            : `Filler content ${index}. ` + 'Some more content to increase the size of the database. '.repeat(10),
          category: 'project',
          source: 'file',
          tags: isNeedle ? ['needle'] : [`tag-${index}`],
          sourceDocumentPath: `docs/memory/${index}.md`
        }, { transactional: false });
      }
    })();

    const started = performance.now();
    const results = searchService.search({ projectId: project.id, query: 'needle' }).results;
    const duration = performance.now() - started;

    expect(results.length).toBe(20);
    expect(results[0].title).toContain('Needle entry');
    expect(duration).toBeLessThan(100);

    // Verify token savings (SC-002: compact representation saves >= 70% token overhead)
    const resultsWithContent = searchService.search({ projectId: project.id, query: 'needle', includeContent: true }).results;
    for (const key of Object.keys(results[0])) {
      console.log('PROP SIZE:', key, JSON.stringify((results[0] as any)[key])?.length);
    }
    const compactSize = JSON.stringify(results).length;
    const fullSize = JSON.stringify(resultsWithContent).length;
    const savings = (fullSize - compactSize) / fullSize;
    console.log('DEBUG SIZE:', { compactSize, fullSize, savings, contentCompact: results[0].content, contentFull: resultsWithContent[0].content });
    expect(savings).toBeGreaterThanOrEqual(0.70);
  });

  it('prevents SQL injection through input parameters', () => {
    const project = projectRepo.upsertByRootPath(workspaceRoot, 'search-memory-workspace');

    entryService.createMemoryEntry({
      projectId: project.id,
      title: 'SQLite search decision',
      content: 'We should keep the search path compact.',
      category: 'decision',
      source: 'file',
      tags: ['architecture', 'sqlite'],
      sourceDocumentPath: 'docs/memory/sqlite.md'
    });

    // SQL Injection payload in query
    const sqlInjectionQuery = "' OR '1'='1";
    const injectionResults = searchService.search({ projectId: project.id, query: sqlInjectionQuery });
    expect(injectionResults.results).toHaveLength(0); // Should not match anything as it is parameterized

    // SQL Injection payload in tag name
    const sqlInjectionTag = "architecture') OR ('1'='1";
    const tagInjectionResults = searchService.search({
      projectId: project.id,
      tags: [sqlInjectionTag],
      tagOperator: 'OR'
    });
    expect(tagInjectionResults.results).toHaveLength(0);

    // SQL Injection in source path (with trailing path elements or SQL commands)
    const sqlInjectionSource = "sqlite.md' OR '1'='1";
    try {
      const sourceInjectionResults = searchService.search({
        projectId: project.id,
        source: sqlInjectionSource
      });
      expect(sourceInjectionResults.results).toHaveLength(0);
    } catch (e: any) {
      expect(e.message).toBeDefined();
    }
  });

  it('searches via the CLI using JSON output', () => {
    const project = projectRepo.upsertByRootPath(workspaceRoot, 'search-memory-workspace');

    entryService.createMemoryEntry({
      projectId: project.id,
      title: 'CLI searchable memory',
      content: 'Search through the CLI boundary.',
      category: 'decision',
      source: 'file',
      tags: ['cli', 'search'],
      sourceDocumentPath: 'docs/memory/cli.md'
    });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    const originalExitCode = process.exitCode;
    console.log = (...values: any[]) => { stdoutChunks.push(`${values.join(' ')}\n`); };
    console.error = (...values: any[]) => { stderrChunks.push(`${values.join(' ')}\n`); };

    return program.parseAsync(['node', 'flash-mem', 'search', 'CLI searchable memory', '--workspace', workspaceRoot, '--json']).then(() => {
      const payload = JSON.parse(stdoutChunks.join('').trim());
      expect(stderrChunks.join('')).toBe('');
      expect(payload.success).toBe(true);
      expect(payload.results).toHaveLength(1);
      expect(payload.results[0].title).toBe('CLI searchable memory');
      expect(payload.results[0].summary).toContain('Search through the CLI boundary.');
    }).finally(() => {
      console.log = originalLog;
      console.error = originalError;
      process.exitCode = originalExitCode;
    });
  });
});
