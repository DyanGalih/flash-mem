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

describe('MemoryEntryService', () => {
  let db: any;
  let service: MemoryEntryService;
  const testDbFile = path.resolve(__dirname, 'memory-entry-workspace', 'flashmem.sqlite');

  beforeEach(() => {
    fs.removeSync(path.dirname(testDbFile));
    db = createDatabaseConnection(testDbFile);
    new SchemaMigrationService(db).ensureCurrentSchema();
    service = new MemoryEntryService(
      new ProjectRepository(db),
      new MemoryEntryRepository(db),
      new TagRepository(db),
      new RelationshipRepository(db),
      new SourceDocumentRepository(db),
      new SqliteTransactionRunner(db)
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
});
