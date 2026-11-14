import { KnowledgeObject } from '../../domain/entities/KnowledgeObject';
import { KnowledgeRelationship } from '../../domain/entities/KnowledgeRelationship';
import { KnowledgeSearchOptions, IKnowledgeObjectRepository, IKnowledgeRelationshipRepository } from '../../domain/repositories/interfaces';
import { computeScore } from '../../domain/scoring/AuthorityAwareRanking';
import { graphWalk, DEFAULT_GRAPH_WALK_CONFIG } from '../../domain/retrieval/RelationshipGraphWalk';

export interface KnowledgeSearchResultItem extends KnowledgeObject {
  tags: string[];
  relationships: KnowledgeRelationship[];
  score: number;
  expandedFromGraphWalk: boolean;
}

export interface KnowledgeSearchResponse {
  results: KnowledgeSearchResultItem[];
  totalCount: number;
  hasMore: boolean;
}

export function computeMetadataScore(knowledgeType: string | undefined, query: string | undefined): number {
  if (!query) return 0;
  if (!knowledgeType) return 0;

  const queryLower = query.toLowerCase();
  const typeLower = knowledgeType.toLowerCase();

  if (typeLower === queryLower) return 100;
  if (typeLower.includes(queryLower)) return 80;
  return 0;
}

export class HybridSearchService {
  constructor(
    private readonly knowledgeRepo: IKnowledgeObjectRepository,
    private readonly relationshipRepo: IKnowledgeRelationshipRepository
  ) {}

  public search(options: KnowledgeSearchOptions): KnowledgeSearchResponse {
    const limit = options.limit ?? 20;

    const results = this.knowledgeRepo.search({ ...options, limit: limit * 2 });

    if (results.length === 0) {
      return { results: [], totalCount: 0, hasMore: false };
    }

    const ranked: KnowledgeSearchResultItem[] = results.map((r) => {
      const metadataScore = computeMetadataScore(r.knowledgeType, options.query);
      const score = computeScore({
        ftsScore: r.score,
        metadataScore,
        confidence: r.confidence ?? null,
        updatedAt: r.updatedAt,
        authorityLevel: r.authorityLevel,
      });
      return { ...r, score, expandedFromGraphWalk: false, tags: r.tags ?? [], relationships: r.relationships ?? [] };
    });

  ranked.sort((a, b) => b.score - a.score);

  // Graph walk expansion from top result
  const topResults = ranked.slice(0, 3);
  const expanded = graphWalk(
    topResults.map((r) => ({ id: r.id, score: r.score })),
    (id: string) => this.relationshipRepo.listForSource(id),
    DEFAULT_GRAPH_WALK_CONFIG
  );

  for (const [id, info] of expanded) {
    if (ranked.some((r) => r.id === id)) continue;
    const obj = this.knowledgeRepo.findById(id);
    if (obj && !obj.deletedAt) {
      if (options.knowledgeType && obj.knowledgeType !== options.knowledgeType) continue;
      if (options.minConfidence !== null && options.minConfidence !== undefined && (obj.confidence ?? 0) < options.minConfidence) continue;
      ranked.push({
        ...obj,
        tags: [],
        relationships: [],
        score: info.score,
        expandedFromGraphWalk: true,
      });
    }
  }

  ranked.sort((a, b) => b.score - a.score);

    const hasMore = ranked.length > limit;
    const sliced = ranked.slice(0, limit);

    return {
      results: sliced,
      totalCount: sliced.length,
      hasMore,
    };
  }
}