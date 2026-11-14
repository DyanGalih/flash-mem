export function precisionAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  const topK = retrieved.slice(0, k);
  if (topK.length === 0) return 0;
  const hits = topK.filter((id) => relevant.has(id)).length;
  return hits / k;
}

export function recallAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  const topK = retrieved.slice(0, k);
  if (relevant.size === 0) return 0;
  const hits = topK.filter((id) => relevant.has(id)).length;
  return hits / relevant.size;
}

export function meanReciprocalRank(results: Array<{ queryId: string; rankedIds: string[]; relevant: Set<string> }>): number {
  if (results.length === 0) return 0;
  let sum = 0;
  for (const result of results) {
    const rankIndex = result.rankedIds.findIndex((id) => result.relevant.has(id));
    sum += rankIndex >= 0 ? 1 / (rankIndex + 1) : 0;
  }
  return sum / results.length;
}