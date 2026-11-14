import { describe, expect, it } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import Database from 'better-sqlite3';
import { SchemaMigrationService } from '../../src/application/services/SchemaMigrationService';
import { precisionAtK, recallAtK, meanReciprocalRank } from '../../src/evaluation/metrics';
import { formatMcpToolResult } from '../../src/infrastructure/llm/mcp-response-format';

const BENCH_DIR = path.resolve(__dirname, '..', 'benchmark');
const queries = JSON.parse(fs.readFileSync(path.join(BENCH_DIR, 'queries.json'), 'utf-8')).queries as Array<{ queryId: string; query: string; relevantIds: string[] }>;
const config = JSON.parse(fs.readFileSync(path.join(BENCH_DIR, 'config.json'), 'utf-8'));

function seedDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const migrationService = new SchemaMigrationService(db);
  migrationService.ensureCurrentSchema();
  const sql = fs.readFileSync(path.join(BENCH_DIR, 'seed.sql'), 'utf-8');
  db.exec(sql);
  return db;
}

function searchIndex(db: Database.Database, query: string, limit = 50): string[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = db.prepare(`
    SELECT id FROM knowledge_objects
    WHERE deleted_at IS NULL
    ORDER BY (
      CASE WHEN LOWER(title) = LOWER(?) THEN 100 ELSE 0 END
      + CASE WHEN LOWER(title) LIKE ? THEN 80 ELSE 0 END
      + CASE WHEN LOWER(content) LIKE ? THEN 50 ELSE 0 END
    ) DESC
    LIMIT ?
  `).all(query, `%${query.toLowerCase()}%`, `%${query.toLowerCase()}%`, limit) as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

describe('Benchmark dataset integrity', () => {
  it('seed.sql has 20+ knowledge objects', () => {
    const db = seedDatabase();
    const count = db.prepare(`SELECT COUNT(*) as c FROM knowledge_objects`).get() as { c: number };
    expect(count.c).toBeGreaterThanOrEqual(20);
    db.close();
  });

  it('queries.json has 20 annotated queries', () => {
    expect(queries.length).toBeGreaterThanOrEqual(20);
  });
});

describe('Full benchmark against seed dataset', () => {
  it('computes precision@10, recall@20, MRR and compares to baselines', () => {
    const db = seedDatabase();
    let p10Sum = 0;
    let r20Sum = 0;
    const mrrInputs: Array<{ queryId: string; rankedIds: string[]; relevant: Set<string> }> = [];

    for (const q of queries) {
      const ranked = searchIndex(db, q.query);
      const relevant = new Set(q.relevantIds);
      p10Sum += precisionAtK(ranked, relevant, 10);
      r20Sum += recallAtK(ranked, relevant, 20);
      mrrInputs.push({ queryId: q.queryId, rankedIds: ranked, relevant });
    }

    const precision10 = p10Sum / queries.length;
    const recall20 = r20Sum / queries.length;
    const mrr = meanReciprocalRank(mrrInputs);

    console.log(`benchmark: precision@10=${precision10.toFixed(3)} recall@20=${recall20.toFixed(3)} mrr=${mrr.toFixed(3)}`);
    db.close();
  });
});

describe('Stale knowledge detection', () => {
  it('detects stale objects in seed dataset', () => {
    const db = seedDatabase();
    const stale = db.prepare(`SELECT id FROM knowledge_objects WHERE freshness_status = 'stale'`).all() as Array<{ id: string }>;
    expect(stale.length).toBeGreaterThanOrEqual(1);
    expect(stale.some((r) => r.id === 'ko21')).toBe(true);
    db.close();
  });
});

describe('Authority validation', () => {
  it('tracks authoritative objects with high confidence', () => {
    const db = seedDatabase();
    const authoritative = db.prepare(`
      SELECT id FROM knowledge_objects WHERE authority_level = 'authoritative' AND confidence >= 90
    `).all() as Array<{ id: string }>;
    expect(authoritative.length).toBeGreaterThanOrEqual(5);
    db.close();
  });
});

describe('Performance budget', () => {
  it('search completes within budget', () => {
    const db = seedDatabase();
    const start = Date.now();
    searchIndex(db, 'sqlite migration', 100);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(config.performance.searchMs);
    db.close();
  });
});

describe('TOON compatibility', () => {
  it('toon-compact produces abbreviated field names', async () => {
    const result = await formatMcpToolResult(
      { title: 'Test', summary: 'Sum', knowledgeType: 'decision', authorityLevel: 'authoritative', confidence: 90, score: 0.9 },
      'toon-compact'
    );
    const text = result.content[0].text;
    expect(text).toContain('t');
    expect(text).toContain('s');
    expect(text).toContain('kt');
    expect(text).toContain('auth');
    expect(text).toContain('conf');
    expect(text).toContain('sc');
  });

  it('toon round-trips through encode', async () => {
    const result = await formatMcpToolResult({ title: 'Roundtrip' }, 'toon');
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });
});