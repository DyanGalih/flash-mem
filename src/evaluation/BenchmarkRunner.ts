import { precisionAtK, recallAtK, meanReciprocalRank } from './metrics';

export interface BenchmarkQuery {
  queryId: string;
  query: string;
  relevantIds: string[];
}

export interface BenchmarkRunOptions {
  search: (query: string) => string[];
  queries: BenchmarkQuery[];
  precisionK?: number[];
  recallK?: number[];
}

export interface BenchmarkReport {
  precisionAtK: Record<number, number>;
  recallAtK: Record<number, number>;
  mrr: number;
}

export function runBenchmark(options: BenchmarkRunOptions): BenchmarkReport {
  const precisionKs = options.precisionK ?? [5, 10, 20];
  const recallKs = options.recallK ?? [10, 20];

  const precisionScores: Record<number, number> = {};
  const recallScores: Record<number, number> = {};
  const mrrResults: Array<{ queryId: string; rankedIds: string[]; relevant: Set<string> }> = [];

  for (const k of precisionKs) {
    let sum = 0;
    for (const q of options.queries) {
      const retrieved = options.search(q.query);
      sum += precisionAtK(retrieved, new Set(q.relevantIds), k);
    }
    precisionScores[k] = sum / options.queries.length;
  }

  for (const k of recallKs) {
    let sum = 0;
    for (const q of options.queries) {
      const retrieved = options.search(q.query);
      sum += recallAtK(retrieved, new Set(q.relevantIds), k);
    }
    recallScores[k] = sum / options.queries.length;
  }

  for (const q of options.queries) {
    mrrResults.push({
      queryId: q.queryId,
      rankedIds: options.search(q.query),
      relevant: new Set(q.relevantIds),
    });
  }

  return {
    precisionAtK: precisionScores,
    recallAtK: recallScores,
    mrr: meanReciprocalRank(mrrResults),
  };
}