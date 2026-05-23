import * as fs from 'fs-extra';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArtifactMemoryCaptureService } from '../../src/application/services/ArtifactMemoryCaptureService';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';
import { MemoryEntryRepository } from '../../src/infrastructure/database/repositories/MemoryEntryRepository';
import { ProjectRepository } from '../../src/infrastructure/database/repositories/ProjectRepository';
import { SourceDocumentRepository } from '../../src/infrastructure/database/repositories/SourceDocumentRepository';
import { SqliteTransactionRunner } from '../../src/infrastructure/database/SqliteTransactionRunner';
import { ArtifactReader } from '../../src/infrastructure/markdown/ArtifactReader';
import { CaptureDeduplicationGuard } from '../../src/infrastructure/safety/CaptureDeduplicationGuard';
import { PathSanitizer } from '../../src/infrastructure/safety/PathSanitizer';
import { SecretScanner } from '../../src/infrastructure/safety/SecretScanner';

describe('ArtifactMemoryCaptureService', () => {
  let db: any;
  let service: ArtifactMemoryCaptureService;
  const testDbFile = path.resolve(__dirname, 'artifact-memory-capture-workspace', 'flashmem.sqlite');
  const workspaceRoot = path.dirname(testDbFile);

  beforeEach(() => {
    fs.removeSync(path.dirname(testDbFile));
    fs.ensureDirSync(workspaceRoot);
    db = createDatabaseConnection(testDbFile);
    new SchemaMigrationService(db).ensureCurrentSchema();
    service = new ArtifactMemoryCaptureService(
      workspaceRoot,
      new ProjectRepository(db),
      new MemoryEntryRepository(db),
      new SourceDocumentRepository(db),
      new SqliteTransactionRunner(db),
      new ArtifactReader(),
      { resolveRoot: (root) => PathSanitizer.resolveRoot(root) },
      { redact: (value) => SecretScanner.redact(value) },
      new CaptureDeduplicationGuard()
    );
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    fs.removeSync(path.dirname(testDbFile));
  });

  it('captures supported markdown artifacts and deduplicates repeat captures', () => {
    const artifactPath = path.join(workspaceRoot, 'specs', 'capture-target.md');
    fs.ensureDirSync(path.dirname(artifactPath));
    fs.writeFileSync(
      artifactPath,
      '# Prompt Capture\n\nKeep boundary validation at the MCP layer.\n\n- Redact secrets before persistence.\n- Avoid duplicate storage.',
      'utf-8'
    );

    const first = service.captureArtifactMemory({
      artifactPath: 'specs/capture-target.md',
      sourceType: 'spec'
    });

    expect(first.status).toBe('captured');
    expect(first.createdCount).toBeGreaterThan(0);
    expect(first.entries[0]).toMatchObject({
      sourceType: 'spec',
      artifactPath: 'specs/capture-target.md'
    });

    const second = service.captureArtifactMemory({
      artifactPath: 'specs/capture-target.md',
      sourceType: 'spec'
    });

    expect(second.status).toBe('skipped');
    expect(second.createdCount).toBe(0);
    expect(second.skippedCount).toBeGreaterThan(0);
  });

  it('redacts secrets before persistence', () => {
    const artifactPath = path.join(workspaceRoot, 'specs', 'redaction-target.md');
    fs.ensureDirSync(path.dirname(artifactPath));
    fs.writeFileSync(
      artifactPath,
      '# Secret Capture\n\nThe token is ghp_1234567890abcdefghij12345678.',
      'utf-8'
    );

    const result = service.captureArtifactMemory({
      artifactPath: 'specs/redaction-target.md',
      sourceType: 'spec'
    });

    expect(result.status).toBe('captured');
    expect(result.entries[0].title).not.toContain('ghp_1234567890abcdefghij12345678');
  });
});