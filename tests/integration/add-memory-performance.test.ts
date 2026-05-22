import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { performance } from 'node:perf_hooks';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { MemoryEntryRepository } from '../../src/infrastructure/database/repositories/MemoryEntryRepository';
import { TagRepository } from '../../src/infrastructure/database/repositories/TagRepository';
import { RelationshipRepository } from '../../src/infrastructure/database/repositories/RelationshipRepository';
import { SourceDocumentRepository } from '../../src/infrastructure/database/repositories/SourceDocumentRepository';
import { SqliteTransactionRunner } from '../../src/infrastructure/database/SqliteTransactionRunner';
import { MemoryEntryService } from '../../src/application/services/MemoryEntryService';

describe('Add Memory Performance', () => {
  let db: any;
  let service: MemoryEntryService;
  let projectId: string;
  const testDbFile = path.resolve(__dirname, 'add-memory-performance-workspace', 'flashmem.sqlite');

  beforeEach(() => {
    fs.removeSync(path.dirname(testDbFile));
    db = createDatabaseConnection(testDbFile);
    new SchemaMigrationService(db).ensureCurrentSchema();

    const projectRepository = new ProjectRepository(db);
    const project = projectRepository.upsertByRootPath(path.dirname(testDbFile), 'add-memory-performance-workspace');
    projectId = project.id;

    service = new MemoryEntryService(
      projectRepository,
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

  it('validates and persists a memory entry within the local benchmark window', () => {
    service.createMemoryEntry({
      projectId,
      title: 'Warmup entry',
      content: 'Warmup content',
      category: 'project',
      source: 'benchmark'
    });

    const iterations = 10;
    const started = performance.now();
    let createdId = '';

    for (let i = 0; i < iterations; i++) {
      const created = service.createMemoryEntry({
        projectId,
        title: `Benchmark entry ${i}`,
        content: `Benchmark content ${i}`,
        category: 'project',
        source: 'benchmark',
        confidence: 80
      });

      expect(created).toBeDefined();
      createdId = created!.id;
    }

    const duration = performance.now() - started;
    const averageDuration = duration / iterations;

    expect(averageDuration).toBeLessThan(50);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM memory_entries WHERE id = ?`).get(createdId)?.count).toBe(1);
  });
});
