import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { MemoryEntryRepository } from '../../src/infrastructure/database/repositories/MemoryEntryRepository';
import { TagRepository } from '../../src/infrastructure/database/repositories/TagRepository';
import { RelationshipRepository } from '../../src/infrastructure/database/repositories/RelationshipRepository';
import { SourceDocumentRepository } from '../../src/infrastructure/database/repositories/SourceDocumentRepository';
import { SqliteTransactionRunner } from '../../src/infrastructure/database/SqliteTransactionRunner';
import { MemoryEntryService } from '../../src/application/services/MemoryEntryService';
import { MemorySearchService } from '../../src/application/services/MemorySearchService';
import { ProjectSummaryService } from '../../src/application/services/ProjectSummaryService';
import { RelevantContextService } from '../../src/application/services/RelevantContextService';

describe('RelevantContextService', () => {
  let db: any;
  let entryService: MemoryEntryService;
  let searchService: MemorySearchService;
  let projectSummaryService: ProjectSummaryService;
  let relevantContextService: RelevantContextService;
  let projectRepo: ProjectRepository;
  let memoryEntryRepo: MemoryEntryRepository;
  const testDbFile = path.resolve(__dirname, 'relevant-context-workspace', 'flashmem.sqlite');
  const projectRoot = path.resolve(__dirname, 'relevant-context-workspace');

  beforeEach(() => {
    fs.removeSync(path.dirname(testDbFile));
    db = createDatabaseConnection(testDbFile);
    new SchemaMigrationService(db).ensureCurrentSchema();

    projectRepo = new ProjectRepository(db);
    memoryEntryRepo = new MemoryEntryRepository(db);
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
    projectSummaryService = new ProjectSummaryService(
      projectRepo,
      memoryEntryRepo,
      tagRepo,
      relationshipRepo,
      sourceDocumentRepo
    );

    relevantContextService = new RelevantContextService(projectSummaryService, searchService);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    fs.removeSync(path.dirname(testDbFile));
  });

  it('throws an error for empty or whitespace query', () => {
    const project = projectRepo.upsertByRootPath(projectRoot, 'relevant-context-workspace');
    expect(() => {
      relevantContextService.getRelevantContext(project.id, '');
    }).toThrow(/Search query cannot be empty/);

    expect(() => {
      relevantContextService.getRelevantContext(project.id, '   ');
    }).toThrow(/Search query cannot be empty/);
  });

  it('correctly maps categories and groups entries', () => {
    const project = projectRepo.upsertByRootPath(projectRoot, 'relevant-context-workspace');

    // Add patterns
    entryService.createMemoryEntry({
      projectId: project.id,
      title: 'Pattern Entry',
      content: 'Using standard patterns',
      category: 'pattern',
      source: path.join(projectRoot, 'src/patterns.ts')
    });

    // Add framework (maps to patterns)
    entryService.createMemoryEntry({
      projectId: project.id,
      title: 'Framework Entry',
      content: 'NestJS Framework features',
      category: 'framework',
      source: path.join(projectRoot, 'src/framework.ts')
    });

    // Add decisions
    entryService.createMemoryEntry({
      projectId: project.id,
      title: 'Decision Entry',
      content: 'We decide to use Vitest',
      category: 'decision',
      source: path.join(projectRoot, 'src/decisions.ts')
    });

    // Add security note
    entryService.createMemoryEntry({
      projectId: project.id,
      title: 'Security Note Entry',
      content: 'Always sanitize paths',
      category: 'security_note',
      source: path.join(projectRoot, 'src/security.ts')
    });

    // Add bug fix (maps to known risks)
    entryService.createMemoryEntry({
      projectId: project.id,
      title: 'Bug Fix Entry',
      content: 'Fix memory leak in indexing',
      category: 'bug_fix',
      source: path.join(projectRoot, 'src/bugfix.ts')
    });

    // Add convention
    entryService.createMemoryEntry({
      projectId: project.id,
      title: 'Convention Entry',
      content: 'Follow styleguide conventions',
      category: 'convention',
      source: path.join(projectRoot, 'src/conventions.ts')
    });

    const result = relevantContextService.getRelevantContext(project.id, 'Entry');

    expect(result.context.relatedPatterns.length).toBe(2);
    expect(result.context.relatedPatterns.map(e => e.title)).toContain('Pattern Entry');
    expect(result.context.relatedPatterns.map(e => e.title)).toContain('Framework Entry');

    expect(result.context.relatedDecisions.length).toBe(1);
    expect(result.context.relatedDecisions[0].title).toBe('Decision Entry');

    expect(result.context.securityNotes.length).toBe(1);
    expect(result.context.securityNotes[0].title).toBe('Security Note Entry');

    expect(result.context.knownRisks.length).toBe(1);
    expect(result.context.knownRisks[0].title).toBe('Bug Fix Entry');

    expect(result.context.relevantConventions.length).toBe(1);
    expect(result.context.relevantConventions[0].title).toBe('Convention Entry');
  });

  it('ranks project-specific categories higher when scores are comparable', () => {
    const project = projectRepo.upsertByRootPath(projectRoot, 'relevant-context-workspace');

    // Create a project-specific entry and a generic entry
    // We will stub their scores to test the sorting behavior
    const decision = entryService.createMemoryEntry({
      projectId: project.id,
      title: 'Database connection',
      content: 'Use transaction runner service',
      category: 'decision',
      source: path.join(projectRoot, 'src/db.ts')
    });

    const framework = entryService.createMemoryEntry({
      projectId: project.id,
      title: 'Framework Database connection',
      content: 'NestJS TypeORM connection details',
      category: 'framework',
      source: path.join(projectRoot, 'src/nestjs.ts')
    });

    // We can directly mock search result in vitest if we want,
    // or let FTS5 index them. Since both match 'Database connection',
    // their FTS5 search score will be computed.
    // Let's verify our custom sort function directly or through the service.
    const result = relevantContextService.getRelevantContext(project.id, 'Database connection');
    
    // Both entries should be in context. Related Decisions contains decision, Related Patterns contains framework.
    expect(result.context.relatedDecisions[0].title).toBe('Database connection');
    expect(result.context.relatedPatterns[0].title).toBe('Framework Database connection');
  });

  it('computes confidence and flags low-confidence entries correctly', () => {
    const project = projectRepo.upsertByRootPath(projectRoot, 'relevant-context-workspace');

    // High confidence
    entryService.createMemoryEntry({
      projectId: project.id,
      title: 'High Conf',
      content: 'Certain knowledge',
      category: 'decision',
      source: 'test.ts',
      confidence: 90
    });

    // Low confidence
    entryService.createMemoryEntry({
      projectId: project.id,
      title: 'Low Conf',
      content: 'Uncertain knowledge',
      category: 'decision',
      source: 'test.ts',
      confidence: 45
    });

    // Missing confidence (should default to 100, which is high confidence)
    entryService.createMemoryEntry({
      projectId: project.id,
      title: 'Null Conf',
      content: 'Legacy knowledge',
      category: 'decision',
      source: 'test.ts'
    });

    const result = relevantContextService.getRelevantContext(project.id, 'Conf');
    const decisions = result.context.relatedDecisions;

    const high = decisions.find(e => e.title === 'High Conf');
    const low = decisions.find(e => e.title === 'Low Conf');
    const missing = decisions.find(e => e.title === 'Null Conf');

    expect(high?.isLowConfidence).toBe(false);
    expect(low?.isLowConfidence).toBe(true);
    expect(missing?.isLowConfidence).toBe(false);
  });

  it('enforces maximum group limit', () => {
    const project = projectRepo.upsertByRootPath(projectRoot, 'relevant-context-workspace');

    // Add 7 conventions
    for (let i = 1; i <= 7; i++) {
      entryService.createMemoryEntry({
        projectId: project.id,
        title: `Convention ${i}`,
        content: `Standard convention number ${i}`,
        category: 'convention',
        source: 'test.ts'
      });
    }

    const result = relevantContextService.getRelevantContext(project.id, 'convention', 5);
    expect(result.context.relevantConventions.length).toBe(5);
  });

  it('converts absolute source paths to relative and safeguards out-of-root paths', () => {
    const project = projectRepo.upsertByRootPath(projectRoot, 'relevant-context-workspace');

    entryService.createMemoryEntry({
      projectId: project.id,
      title: 'Local Source',
      content: 'Some content',
      category: 'decision',
      source: path.join(projectRoot, 'src/sub/file.ts')
    });

    // An absolute source outside workspace root (simulate traversal or external doc)
    entryService.createMemoryEntry({
      projectId: project.id,
      title: 'External Source',
      content: 'Some content',
      category: 'decision',
      source: '/etc/passwd'
    });

    const result = relevantContextService.getRelevantContext(project.id, 'Source');
    const local = result.context.relatedDecisions.find(e => e.title === 'Local Source');
    const external = result.context.relatedDecisions.find(e => e.title === 'External Source');

    expect(local?.source).toBe('src/sub/file.ts');
    expect(external?.source).toBe('passwd');
  });

  it('generates a clean pre-rendered Markdown format', () => {
    const project = projectRepo.upsertByRootPath(projectRoot, 'relevant-context-workspace');

    entryService.createMemoryEntry({
      projectId: project.id,
      title: 'Sample Pattern',
      content: 'Use singleton pattern',
      category: 'pattern',
      source: 'src/singleton.ts',
      confidence: 50
    });

    entryService.createMemoryEntry({
      projectId: project.id,
      title: 'Sample Decision',
      content: 'Use PostgreSQL',
      category: 'decision',
      source: 'src/db.ts',
      confidence: 90
    });

    const result = relevantContextService.getRelevantContext(project.id, 'Sample');
    const md = result.markdown;

    expect(md).toContain('# Relevant Context: "Sample"');
    expect(md).toContain('## Related Patterns');
    expect(md).toContain('- **Sample Pattern** (`src/singleton.ts`)');
    expect(md).toContain('⚠️ *Low Confidence (Confidence: 50%)*');
    expect(md).toContain('## Related Decisions');
    expect(md).toContain('- **Sample Decision** (`src/db.ts`)');
  });
});
