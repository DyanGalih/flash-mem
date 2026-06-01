import * as fs from 'fs-extra';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryEntryService } from '../../src/application/services/MemoryEntryService';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { MemoryEntryRepository } from '../../src/infrastructure/database/repositories/MemoryEntryRepository';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { RelationshipRepository } from '../../src/infrastructure/database/repositories/RelationshipRepository';
import { SourceDocumentRepository } from '../../src/infrastructure/database/repositories/SourceDocumentRepository';
import { TagRepository } from '../../src/infrastructure/database/repositories/TagRepository';
import { SqliteTransactionRunner } from '../../src/infrastructure/database/SqliteTransactionRunner';

describe('MemoryEntryService', () => {
  let db: any;
  let service: MemoryEntryService;
  let exportScheduler: { schedule: ReturnType<typeof vi.fn> };
  const testDbFile = path.resolve(__dirname, 'memory-entry-workspace', 'flashmem.sqlite');

  beforeEach(() => {
    fs.removeSync(path.dirname(testDbFile));
    db = createDatabaseConnection(testDbFile);
    new SchemaMigrationService(db).ensureCurrentSchema();
    exportScheduler = { schedule: vi.fn() };
    service = new MemoryEntryService(
      new ProjectRepository(db),
      new MemoryEntryRepository(db),
      new TagRepository(db),
      new RelationshipRepository(db),
      new SourceDocumentRepository(db),
      new SqliteTransactionRunner(db),
      exportScheduler as any
    );
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    fs.removeSync(path.dirname(testDbFile));
  });

  it('creates, updates, and deletes memory entries with normalized tags', () => {
    const project = new ProjectRepository(db).upsertByRootPath(path.dirname(testDbFile), 'memory-entry-workspace');

    const created = service.createMemoryEntry({
      projectId: project.id,
      title: 'Initial memory',
      content: 'Remember the initial design',
      category: 'project',
      source: 'test',
      tags: ['SQLite', 'Memory']
    });

    expect(created?.title).toBe('Initial memory');
    expect(created?.category).toBe('project');
    expect(created?.source).toBe('test');

    const updated = service.updateMemoryEntry(created!.id, {
      title: 'Updated memory',
      tags: ['sqlite']
    });

    expect(updated?.title).toBe('Updated memory');
    expect(service.deleteMemoryEntry(created!.id)).toBe(true);
  });

  it('schedules a background export after create, update, and delete', () => {
    const project = new ProjectRepository(db).upsertByRootPath(path.dirname(testDbFile), 'memory-entry-workspace');

    const created = service.createMemoryEntry({
      projectId: project.id,
      title: 'Export me',
      content: 'Export after mutation',
      category: 'project',
      source: 'test'
    });

    expect(exportScheduler.schedule).toHaveBeenCalledWith(path.dirname(testDbFile));

    service.updateMemoryEntry(created!.id, {
      title: 'Export me again'
    });

    expect(exportScheduler.schedule).toHaveBeenCalledTimes(2);

    expect(service.deleteMemoryEntry(created!.id)).toBe(true);
    expect(exportScheduler.schedule).toHaveBeenCalledTimes(3);
  });

  it('supports confidence and relatedFiles properties', () => {
    const project = new ProjectRepository(db).upsertByRootPath(path.dirname(testDbFile), 'memory-entry-workspace');

    const created = service.createMemoryEntry({
      projectId: project.id,
      title: 'Test memory',
      content: 'Some context',
      category: 'pattern',
      source: 'test',
      confidence: 85,
      relatedFiles: ['src/index.ts']
    });

    expect(created?.confidence).toBe(85);
    expect(created?.relatedFiles).toEqual(['src/index.ts']);

    const updated = service.updateMemoryEntry(created!.id, {
      confidence: 90,
      relatedFiles: ['src/app.ts']
    });

    expect(updated?.confidence).toBe(90);
    expect(updated?.relatedFiles).toEqual(['src/app.ts']);
  });

  it('prevents directory traversal in relatedFiles paths', () => {
    const project = new ProjectRepository(db).upsertByRootPath(path.dirname(testDbFile), 'memory-entry-workspace');

    expect(() => {
      service.createMemoryEntry({
        projectId: project.id,
        title: 'Trapped memory',
        content: 'Content',
        category: 'project',
        source: 'test',
        relatedFiles: ['../../etc/passwd']
      });
    }).toThrow(/Directory traversal detected/);

    const created = service.createMemoryEntry({
      projectId: project.id,
      title: 'Valid memory',
      content: 'Content',
      category: 'project',
      source: 'test',
      relatedFiles: ['src/index.ts']
    });

    expect(() => {
      service.updateMemoryEntry(created!.id, {
        relatedFiles: ['/etc/passwd']
      });
    }).toThrow(/Directory traversal detected/);
  });

  it('performs secret redaction on title and content', () => {
    const project = new ProjectRepository(db).upsertByRootPath(path.dirname(testDbFile), 'memory-entry-workspace');

    const created = service.createMemoryEntry({
      projectId: project.id,
      title: 'AWS key AKIA1234567890123456',
      content: 'The secret is AKIA1234567890123456',
      category: 'project',
      source: 'test'
    });

    expect(created?.title).toContain('[REDACTED_SECRET]');
    expect(created?.content).toContain('[REDACTED_SECRET]');
    expect(created?.title).not.toContain('AKIA1234567890123456');
    expect(created?.content).not.toContain('AKIA1234567890123456');
  });

  describe('extractSummary', () => {
    it('extracts summary correctly', () => {
      // Plain text single line
      expect(MemoryEntryService.extractSummary('Hello world')).toBe('Hello world');

      // Multi-line markdown header and paragraph
      const md = '# Header Title\n\nThis is the first paragraph.\n\nThis is the second paragraph.';
      expect(MemoryEntryService.extractSummary(md)).toBe('Header Title - This is the first paragraph.');

      // Just header
      expect(MemoryEntryService.extractSummary('# Header Title')).toBe('Header Title');

      // Long paragraph truncation
      const longText = 'a'.repeat(400);
      const summary = MemoryEntryService.extractSummary(longText);
      expect(summary.length).toBe(300);
      expect(summary.endsWith('...')).toBe(true);
    });
  });
});
