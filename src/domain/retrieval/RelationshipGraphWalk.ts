import { KnowledgeRelationship } from '../entities/KnowledgeRelationship';

export interface GraphWalkConfig {
  maxDepth: number;
  decayFactor: number;
}

export const DEFAULT_GRAPH_WALK_CONFIG: GraphWalkConfig = {
  maxDepth: 1,
  decayFactor: 0.5,
};

export interface GraphWalkResult<T> {
  node: T;
  depth: number;
  score: number;
}

function getRelatedIds(
  sourceId: string,
  getRelationships: (id: string) => KnowledgeRelationship[]
): { relatedId: string; score: number }[] {
  const rels = getRelationships(sourceId);
  return rels.map((rel) => ({
    relatedId: rel.sourceId === sourceId ? rel.targetId : rel.sourceId,
    score: 1,
  }));
}

export function graphWalk<T>(
  seeds: { id: string; score: number }[],
  getRelationships: (id: string) => KnowledgeRelationship[],
  config: GraphWalkConfig = DEFAULT_GRAPH_WALK_CONFIG
): Map<string, { score: number; depth: number }> {
  const visited = new Map<string, { score: number; depth: number }>();
  const queue: { id: string; depth: number; parentScore: number }[] = [];

  for (const seed of seeds) {
    visited.set(seed.id, { score: seed.score, depth: 0 });
    queue.push({ id: seed.id, depth: 0, parentScore: seed.score });
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    if (current.depth >= config.maxDepth) continue;

    const related = getRelatedIds(current.id, getRelationships);
    for (const rel of related) {
      if (visited.has(rel.relatedId)) continue;
      const decayedScore = current.parentScore * config.decayFactor;
      visited.set(rel.relatedId, { score: decayedScore, depth: current.depth + 1 });
      queue.push({ id: rel.relatedId, depth: current.depth + 1, parentScore: decayedScore });
    }
  }

  return visited;
}