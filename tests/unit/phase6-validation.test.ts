import { describe, expect, it } from 'vitest';
import { precisionAtK, recallAtK, meanReciprocalRank } from '../../src/evaluation/metrics';
import { runBenchmark, BenchmarkQuery } from '../../src/evaluation/BenchmarkRunner';

const QUERIES: BenchmarkQuery[] = [
  { queryId: 'q1', query: 'sqlite migration', relevantIds: ['ko1', 'ko2'] },
  { queryId: 'q2', query: 'secret scanning', relevantIds: ['ko3'] },
  { queryId: 'q3', query: 'token efficiency', relevantIds: ['ko4', 'ko5'] },
];

function fakeSearch(query: string): string[] {
  const map: Record<string, string[]> = {
    'sqlite migration': ['ko1', 'ko2', 'ko9', 'ko10', 'ko11', 'ko12', 'ko13', 'ko14', 'ko15', 'ko16'],
    'secret scanning': ['ko3', 'ko9', 'ko10', 'ko11', 'ko12', 'ko13', 'ko14', 'ko15', 'ko16', 'ko17'],
    'token efficiency': ['ko4', 'ko5', 'ko9', 'ko10', 'ko11', 'ko12', 'ko13', 'ko14', 'ko15', 'ko16'],
  };
  return map[query] ?? [];
}

describe('Evaluation metrics', () => {
  it('precisionAtK computes correctly', () => {
    expect(precisionAtK(['a', 'b', 'c', 'd'], new Set(['a', 'b']), 4)).toBeCloseTo(0.5);
    expect(precisionAtK(['a', 'b'], new Set(['a', 'b']), 2)).toBe(1);
    expect(precisionAtK([], new Set(['a']), 5)).toBe(0);
  });

  it('recallAtK computes correctly', () => {
    expect(recallAtK(['a', 'b', 'c'], new Set(['a', 'b', 'd']), 3)).toBeCloseTo(2 / 3);
    expect(recallAtK(['x', 'y'], new Set(['a', 'b']), 10)).toBe(0);
    expect(recallAtK([], new Set(), 10)).toBe(0);
  });

  it('meanReciprocalRank computes correctly', () => {
    const results = [
      { queryId: 'q1', rankedIds: ['x', 'a', 'y'], relevant: new Set(['a']) },
      { queryId: 'q2', rankedIds: ['a', 'b'], relevant: new Set(['a']) },
    ];
    // 1/2 + 1/1 = 1.5 / 2 = 0.75
    expect(meanReciprocalRank(results)).toBeCloseTo(0.75);
  });
});

describe('BenchmarkRunner', () => {
  it('produces a report with precision, recall, and MRR', () => {
    const report = runBenchmark({
      search: fakeSearch,
      queries: QUERIES,
      precisionK: [5, 10],
      recallK: [10],
    });

    expect(report.precisionAtK[5]).toBeGreaterThan(0);
    expect(report.precisionAtK[10]).toBeGreaterThan(0);
    expect(report.recallAtK[10]).toBeGreaterThan(0);
    expect(report.mrr).toBeGreaterThan(0);
  });

  it('regression gate: precision@10 meets baseline threshold', () => {
    const report = runBenchmark({
      search: fakeSearch,
      queries: QUERIES,
      precisionK: [10],
      recallK: [10],
    });
    // q1: 2/10=0.2, q2: 1/10=0.1, q3: 2/10=0.2 => avg 0.166
    expect(report.precisionAtK[10]).toBeGreaterThanOrEqual(0.1);
  });
});