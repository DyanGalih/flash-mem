import * as fs from 'fs-extra';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KnowledgeObjectRepository } from '../../src/infrastructure/database/repositories/KnowledgeObjectRepository';
import { KnowledgeRelationshipRepository } from '../../src/infrastructure/database/repositories/KnowledgeRelationshipRepository';
import { AuthorityChainRepository } from '../../src/infrastructure/database/repositories/AuthorityChainRepository';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { createDatabaseConnection } from '../../src/infrastructure/database/connection';

const TEST_DIR = path.resolve(__dirname, 'knowledge-domain-workspace');

function createFreshDb(): any {
  fs.removeSync(TEST_DIR);
  const dbPath = path.join(TEST_DIR, 'flashmem.sqlite');
  const db = createDatabaseConnection(dbPath);

  const migration = db.transaction(() => {
    db.prepare(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, root_path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`).run();
    db.prepare(`INSERT OR IGNORE INTO projects (id, root_path, name, created_at, updated_at) VALUES ('p1', '/test', 'test', 0, 0)`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS schema_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`).run();
  });
  migration();

  const svc = new SchemaMigrationService(db);
  svc.ensureCurrentSchema();

  return db;
}

describe('KnowledgeObjectRepository', () => {
  let db: any;
  let repo: KnowledgeObjectRepository;

  beforeEach(() => {
    db = createFreshDb();
    repo = new KnowledgeObjectRepository(db);
  });

  afterEach(() => {
    db.close();
    fs.removeSync(TEST_DIR);
  });

  it('creates and retrieves a knowledge object', () => {
    const obj = repo.create({
      projectId: 'p1',
      knowledgeType: 'decision',
      title: 'Use SHA256',
      content: 'Hashing policy.'
    });

    expect(obj.id).toBeTruthy();
    expect(obj.hash).toHaveLength(64);
    expect(obj.authorityLevel).toBe('provisional');

    const found = repo.findById(obj.id);
    expect(found).toBeTruthy();
    expect(found!.title).toBe('Use SHA256');
  });

  it('findByHash returns matching object', () => {
    const obj = repo.create({
      projectId: 'p1',
      knowledgeType: 'decision',
      title: 'Use SHA256',
      content: 'Hashing policy.'
    });

    const found = repo.findByHash('p1', obj.hash);
    expect(found).toBeTruthy();
    expect(found!.id).toBe(obj.id);
  });

  it('softDelete marks as deleted', () => {
    const obj = repo.create({
      projectId: 'p1',
      knowledgeType: 'decision',
      title: 'Use SHA256',
      content: 'Hashing policy.'
    });

    const deleted = repo.softDelete(obj.id);
    expect(deleted).toBe(true);

    const all = repo.listByProject('p1');
    expect(all).toHaveLength(0);

    const byId = repo.findById(obj.id);
    expect(byId!.deletedAt).toBeGreaterThan(0);
  });

  it('update recalculates hash and freshness', () => {
    const obj = repo.create({
      projectId: 'p1',
      knowledgeType: 'decision',
      title: 'Use SHA256',
      content: 'Hashing policy.'
    });

    const originalHash = obj.hash;
    const updated = repo.update(obj.id, {
      content: 'Revised hashing policy.',
      authorityLevel: 'validated'
    });

    expect(updated).toBeTruthy();
    expect(updated!.hash).not.toBe(originalHash);
    expect(updated!.authorityLevel).toBe('validated');
    expect(updated!.freshnessValidatedAt).toBeGreaterThan(0);
  });

  it('listByProject excludes deleted', () => {
    repo.create({ projectId: 'p1', knowledgeType: 'decision', title: 'K1', content: 'C1' });
    const k2 = repo.create({ projectId: 'p1', knowledgeType: 'convention', title: 'K2', content: 'C2' });
    repo.softDelete(k2.id);

    const list = repo.listByProject('p1');
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('K1');
  });
});

describe('KnowledgeRelationshipRepository', () => {
  let db: any;
  let repo: KnowledgeRelationshipRepository;
  let knowledgeRepo: KnowledgeObjectRepository;

  beforeEach(() => {
    db = createFreshDb();
    db.pragma('foreign_keys = OFF');
    repo = new KnowledgeRelationshipRepository(db);
    knowledgeRepo = new KnowledgeObjectRepository(db);
  });

  afterEach(() => {
    db.close();
    fs.removeSync(TEST_DIR);
  });

  it('upsert completes', () => {
    const srcObj = knowledgeRepo.create({ projectId: 'p1', knowledgeType: 'decision', title: 'Src', content: 'C' });
    const tgtObj = knowledgeRepo.create({ projectId: 'p1', knowledgeType: 'convention', title: 'Tgt', content: 'C2' });

    const rel = repo.upsert('p1', srcObj.id, {
      sourceId: srcObj.id,
      targetId: tgtObj.id,
      relType: 'refines'
    });

    expect(rel.id).toBeTruthy();
    expect(rel.relType).toBe('refines');

    const list = repo.listForSource(srcObj.id);
    expect(list).toHaveLength(1);
    expect(list[0].targetId).toBe(tgtObj.id);
  });
});

describe('AuthorityChainRepository', () => {
  let db: any;
  let repo: AuthorityChainRepository;
  let knowledgeRepo: KnowledgeObjectRepository;

  beforeEach(() => {
    db = createFreshDb();
    db.pragma('foreign_keys = OFF');
    repo = new AuthorityChainRepository(db);
    knowledgeRepo = new KnowledgeObjectRepository(db);
  });

  afterEach(() => {
    db.close();
    fs.removeSync(TEST_DIR);
  });

  it('appends and lists authority chain', () => {
    const obj = knowledgeRepo.create({ projectId: 'p1', knowledgeType: 'decision', title: 'K', content: 'Content' });

    const entry = repo.append('p1', {
      objectId: obj.id,
      previousHash: 'abcdefacef',
      changeReason: 'Updated content'
    });

    expect(entry.id).toBeTruthy();
    expect(entry.changeReason).toBe('Updated content');

    const chain = repo.listForKnowledge(obj.id);
    expect(chain).toHaveLength(1);
    expect(chain[0].previousHash).toBe('abcdefacef');
  });
});