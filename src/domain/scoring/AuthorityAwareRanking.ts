export interface RankableResult {
  ftsScore: number;
  metadataScore: number;
  confidence: number | null;
  updatedAt: number;
  authorityLevel: string;
}

export const AUTHORITY_BONUS: Record<string, number> = {
  definitive: 200,
  validated: 150,
  authoritative: 200,
  inferred: 100,
  contributed: 50,
  legacy: 10,
  provisional: 50,
  deprecated: 0,
};

export function computeScore(result: RankableResult): number {
  const authorityBonus = AUTHORITY_BONUS[result.authorityLevel] ?? 50;
  const confidenceScore = result.confidence ?? 0;
  const daysSinceUpdate = (Date.now() - result.updatedAt) / 86400000;
  const recencyScore = Math.max(0, 100 - daysSinceUpdate);

  return (
    result.ftsScore * 1000 +
    result.metadataScore * 10 +
    confidenceScore +
    recencyScore +
    authorityBonus
  );
}

export interface AuthorityAwareRankingInput {
  results: RankableResult[];
}

export function rankByAuthority(input: AuthorityAwareRankingInput): RankableResult[] {
  return [...input.results].sort((a, b) => computeScore(b) - computeScore(a));
}