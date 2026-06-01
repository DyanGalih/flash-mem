import * as fs from 'fs-extra';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DocSynthesisService } from '../../src/application/services/DocSynthesisService';
import { MemoryEntryService } from '../../src/application/services/MemoryEntryService';
import { MemorySearchService } from '../../src/application/services/MemorySearchService';
import { MemorySynthesisService } from '../../src/application/services/MemorySynthesisService';
import { ProjectSummaryService } from '../../src/application/services/ProjectSummaryService';
import { RelevantContextService } from '../../src/application/services/RelevantContextService';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { SharedLessonService } from '../../src/application/services/SharedLessonService';
import { SpecKitCompatibilityService } from '../../src/application/services/SpecKitCompatibilityService';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { MemoryEntryRepository } from '../../src/infrastructure/database/repositories/MemoryEntryRepository';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { ProjectSummaryRepository } from '../../src/infrastructure/database/repositories/ProjectSummaryRepository';
import { RelationshipRepository } from '../../src/infrastructure/database/repositories/RelationshipRepository';
import { SharedLessonRepository } from '../../src/infrastructure/database/repositories/SharedLessonRepository';
import { SourceDocumentRepository } from '../../src/infrastructure/database/repositories/SourceDocumentRepository';
import { TagRepository } from '../../src/infrastructure/database/repositories/TagRepository';
import { SqliteTransactionRunner } from '../../src/infrastructure/database/SqliteTransactionRunner';

describe('SpecKitCompatibilityService', () => {
  let db: any;
  const testDbFile = path.resolve(__dirname, 'speckit-compatibility-workspace', 'flashmem.sqlite');
  const workspaceRoot = path.dirname(testDbFile);

  beforeEach(() => {
    fs.removeSync(path.dirname(testDbFile));
    fs.ensureDirSync(workspaceRoot);
    db = createDatabaseConnection(testDbFile);
    new SchemaMigrationService(db).ensureCurrentSchema();
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    fs.removeSync(path.dirname(testDbFile));
  });

  it('prepares memory and doc context and writes reviewable artifacts', () => {
    const projectRepo = new ProjectRepository(db);
    const project = projectRepo.upsertByRootPath(workspaceRoot, 'speckit-compatibility-workspace');
    const memoryEntryRepo = new MemoryEntryRepository(db);
    const tagRepo = new TagRepository(db);
    const relationshipRepo = new RelationshipRepository(db);
    const sourceDocumentRepo = new SourceDocumentRepository(db);
    const projectSummaryRepo = new ProjectSummaryRepository(db);
    const sharedLessonRepo = new SharedLessonRepository(db);
    const transactionRunner = new SqliteTransactionRunner(db);

    const entryService = new MemoryEntryService(
      projectRepo,
      memoryEntryRepo,
      tagRepo,
      relationshipRepo,
      sourceDocumentRepo,
      transactionRunner
    );
    const searchService = new MemorySearchService(memoryEntryRepo, tagRepo, projectRepo);
    const summaryService = new ProjectSummaryService(project.id, projectRepo, projectSummaryRepo);
    const contextService = new RelevantContextService(projectRepo, searchService);

    summaryService.updateProjectSummary({
      projectName: 'speckit-compatibility-workspace',
      purpose: 'Local-first memory synthesis for SDD',
      techStack: 'TypeScript, SQLite, MCP',
      architectureStyle: 'Layered local-first architecture',
      importantConventions: 'Read memory before implementation',
      knownConstraints: 'No network egress',
      securitySensitiveAreas: 'Path handling and secret redaction'
    });

    entryService.createMemoryEntry({
      projectId: project.id,
      title: 'Keep path sanitization at the boundary',
      content: 'Directory traversal checks stay in the safety layer.',
      category: 'security_note',
      source: 'docs/security.md'
    });
    entryService.createMemoryEntry({
      projectId: project.id,
      title: 'Prefer decision-oriented synthesis',
      content: 'Summaries should surface decisions, risks, and conventions first.',
      category: 'decision',
      source: 'docs/architecture.md'
    });

    fs.ensureDirSync(path.join(workspaceRoot, 'specs', 'feature-a'));
    fs.writeFileSync(
      path.join(workspaceRoot, 'specs', 'feature-a', 'spec.md'),
      '# Feature A\n\nBe memory-first before planning.',
      'utf-8'
    );

    const service = new SpecKitCompatibilityService(
      new MemorySynthesisService(projectRepo, summaryService, contextService),
      new DocSynthesisService(),
      new SharedLessonService(sharedLessonRepo)
    );

    const result = service.prepareContext({
      workspaceRoot,
      featurePath: 'specs/feature-a',
      query: 'memory-first',
      writeArtifacts: true
    });

    expect(result.memorySynthesis.markdown).toContain('# Memory Synthesis: memory-first');
    expect(result.memorySynthesis.markdown).toContain('## Project Summary');
    expect(result.docSynthesis.markdown).toContain('# Doc Synthesis');
    expect(result.tokenReport.baselineTokens).toBeGreaterThan(0);
    expect(result.tokenReport.cachedTokens).toBeGreaterThan(0);
    expect(result.memorySynthesisPath).toBeTruthy();
    expect(result.docSynthesisPath).toBeTruthy();
    expect(fs.existsSync(result.memorySynthesisPath as string)).toBe(true);
    expect(fs.existsSync(result.docSynthesisPath as string)).toBe(true);
  });

  it('promotes and syncs shared lessons into a review file', async () => {
    const sharedLessonRepo = new SharedLessonRepository(db);
    const service = new SharedLessonService(sharedLessonRepo);
    const frozenTime = new Date('2024-01-02T03:04:05.000Z');

    fs.ensureDirSync(path.join(workspaceRoot, '.flash-mem'));
    fs.writeJsonSync(path.join(workspaceRoot, '.flash-mem', 'project-profile.json'), {
      language: 'typescript',
      framework: 'nest',
      architectureStyle: 'layered',
      projectConventions: ['read memory first'],
      sharedMemoryEligible: true
    });

    const originalNow = Date.now;
    Date.now = () => frozenTime.getTime();
    try {
      await service.promoteLesson(
        'Path safety',
        'Use workspace-relative paths and reject traversal attempts.',
        'nest',
        'typescript',
        workspaceRoot
      );

      const result = await service.syncSharedLessons(workspaceRoot, {
        framework: 'nest',
        language: 'typescript',
        limit: 5
      });

      const expectedReviewMarkdown = [
        '# Shared Lessons Review Buffer',
        '',
        `- Workspace: \`${workspaceRoot}\``,
        '- Review context: framework=nest, language=typescript, lessons=1',
        '- Shared memory eligible: yes',
        '',
        '## Review Guidance',
        '- This file is temporary review space, not durable memory.',
        '- Copy useful items into durable memory with `add_memory` or `update_memory`.',
        '- Delete this file after review or after merging its useful lessons.',
        '',
        '## Lessons To Review',
        '',
        '### Path safety',
        '- Lesson: Use workspace-relative paths and reject traversal attempts.',
        '- Framework: nest',
        '- Language: typescript',
        `- Created: ${frozenTime.toISOString()}`,
        `- Updated: ${frozenTime.toISOString()}`,
        '',
        '## Next Step',
        '- Review the lessons above, promote durable items into memory, and remove this temporary buffer when done.',
        ''
      ].join('\n');

      expect(result.lessons.length).toBe(1);
      expect(result.markdown).toContain('Path safety');
      expect(fs.existsSync(result.filePath)).toBe(true);
      expect(result.reviewFilePath).toBe(path.join(workspaceRoot, 'docs', 'memory', 'SHARED_LESSONS.md'));
      expect(result.reviewMarkdown).toBe(expectedReviewMarkdown);
      expect(fs.existsSync(result.reviewFilePath)).toBe(true);
      expect(fs.readFileSync(result.reviewFilePath, 'utf-8')).toBe(expectedReviewMarkdown);
    } finally {
      Date.now = originalNow;
    }
  });

  it('shares reference lessons through the compatibility schema and persists them', async () => {
    const sharedLessonRepo = new SharedLessonRepository(db);
    const service = new SpecKitCompatibilityService(
      new MemorySynthesisService(),
      new DocSynthesisService(),
      new SharedLessonService(sharedLessonRepo)
    );

    const result = await service.shareLesson({
      workspaceRoot,
      id: 'lesson-compat-001',
      title: 'Language-aware sync',
      content: 'Use the provided language and framework when writing review buffers.',
      language: 'typescript',
      framework: 'nest',
      tags: ['compatibility', 'review']
    });

    expect(result.reference).toMatchObject({
      id: 'lesson-compat-001',
      title: 'Language-aware sync',
      language: 'typescript',
      framework: 'nest',
      tags: ['compatibility', 'review']
    });
    expect(result.sharedLesson.topic).toBe('Language-aware sync');
    expect(result.sharedLesson.lesson).toContain('ID: lesson-compat-001');
    expect(result.sharedLesson.lesson).toContain('Tags: compatibility, review');

    const persisted = await sharedLessonRepo.listMatchingLessons({
      framework: 'nest',
      language: 'typescript',
      limit: 5
    });

    expect(persisted).toHaveLength(1);
    expect(persisted[0].topic).toBe('Language-aware sync');
    expect(persisted[0].lesson).toContain('Use the provided language and framework');
  });

  it('initializes project profiles for compatibility workflows', async () => {
    const sharedLessonRepo = new SharedLessonRepository(db);
    const service = new SpecKitCompatibilityService(
      new MemorySynthesisService(),
      new DocSynthesisService(),
      new SharedLessonService(sharedLessonRepo)
    );

    const result = await service.initProject({
      workspaceRoot,
      language: 'typescript',
      framework: 'nest'
    });

    expect(result.initialization.success).toBe(true);
    expect(result.language).toBe('typescript');
    expect(result.framework).toBe('nest');
    expect(fs.existsSync(result.profilePath)).toBe(true);
    expect(fs.readFileSync(result.profilePath, 'utf-8')).toBe(
      [
        'project_profile:',
        '  language: typescript',
        '  framework: nest',
        '  shared_memory:',
        '    enabled: true',
        '    sync_channels:',
        '      - global',
        '      - typescript',
        '      - nest',
        ''
      ].join('\n')
    );
    expect(result.profilePath).toBe(path.join(workspaceRoot, '.specify', 'extensions', 'memory-md', 'config.yml'));
    expect(fs.existsSync(path.join(workspaceRoot, '.specify', 'extensions', 'memory-md', 'config.yml'))).toBe(true);
    expect(fs.existsSync(path.join(workspaceRoot, '.flash-mem', 'project-profile.json'))).toBe(true);
    expect(fs.readJsonSync(path.join(workspaceRoot, '.flash-mem', 'project-profile.json'))).toMatchObject({
      language: 'typescript',
      framework: 'nest'
    });
  });

  it('rejects blank required compatibility fields before writing artifacts', async () => {
    const sharedLessonRepo = new SharedLessonRepository(db);
    const service = new SpecKitCompatibilityService(
      new MemorySynthesisService(),
      new DocSynthesisService(),
      new SharedLessonService(sharedLessonRepo)
    );

    await expect(service.shareLesson({
      workspaceRoot,
      id: 'lesson-compat-003',
      title: '   ',
      content: 'Still invalid because the title is blank.',
      language: 'typescript'
    })).rejects.toThrow('Compatibility field "title" is required');

    await expect(service.initProject({
      workspaceRoot,
      language: '   '
    })).rejects.toThrow('Compatibility field "language" is required');
  });
});
