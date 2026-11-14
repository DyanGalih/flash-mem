import { describe, expect, it } from 'vitest';
import { computeScore } from '../../src/domain/scoring/AuthorityAwareRanking';
import { computeMetadataScore } from '../../src/application/services/HybridSearchService';
import { graphWalk } from '../../src/domain/retrieval/RelationshipGraphWalk';
import { KnowledgeRelationship } from '../../src/domain/entities/KnowledgeRelationship';

describe('AuthorityAwareRanking', () => {
  it('authoritative bonus compensates for lower BM25 within close range', () => {
    // Score = ftsScore*1000 + metadataScore*10 + confidence + recency + authorityBonus
    // authoritative(0.5, today) = 500 + 0 + 0 + 100 + 200 = 800
    // inferred(0.5, today) = 500 + 0 + 0 + 100 + 100 = 700
    const authoritative = {
      ftsScore: 0.5,
      metadataScore: 0,
      confidence: null,
      updatedAt: Date.now(),
      authorityLevel: 'authoritative',
    };
    const inferred = {
      ftsScore: 0.5,
      metadataScore: 0,
      confidence: null,
      updatedAt: Date.now(),
      authorityLevel: 'inferred',
    };
    expect(computeScore(authoritative)).toBeGreaterThan(computeScore(inferred));
  });

  it('higher BM25 score increases composite score', () => {
    const high = computeScore({ ftsScore: 1, metadataScore: 0, confidence: null, updatedAt: Date.now(), authorityLevel: 'inferred' });
    const low = computeScore({ ftsScore: 0, metadataScore: 0, confidence: null, updatedAt: Date.now(), authorityLevel: 'inferred' });
    expect(high).toBeGreaterThan(low);
  });

  it('recency penalty reduces score for older results', () => {
    const recent = computeScore({ ftsScore: 0, metadataScore: 0, confidence: null, updatedAt: Date.now(), authorityLevel: 'inferred' });
    const old = computeScore({ ftsScore: 0, metadataScore: 0, confidence: null, updatedAt: Date.now() - 86400000 * 200, authorityLevel: 'inferred' });
    expect(recent).toBeGreaterThan(old);
  });
});

describe('computeMetadataScore', () => {
  it('returns 100 for exact match', () => {
    expect(computeMetadataScore('decision', 'decision')).toBe(100);
  });

  it('returns 80 for substring match', () => {
    expect(computeMetadataScore('architecture_decision', 'architecture')).toBe(80);
  });

  it('returns 0 for no match', () => {
    expect(computeMetadataScore('decision', 'testing')).toBe(0);
  });
});

describe('RelationshipGraphWalk', () => {
  const relationships: KnowledgeRelationship[] = [
    { id: 'r1', projectId: 'p1', sourceId: 'a', targetId: 'b', relType: 'depends_on', createdAt: 1 },
    { id: 'r2', projectId: 'p1', sourceId: 'b', targetId: 'c', relType: 'refines', createdAt: 2 },
    { id: 'r3', projectId: 'p1', sourceId: 'a', targetId: 'd', relType: 'related_to', createdAt: 3 },
  ];

  function getRels(id: string): KnowledgeRelationship[] {
    return relationships.filter(r => r.sourceId === id || r.targetId === id);
  }

  it('walks one level by default', () => {
    const seeds = [{ id: 'a', score: 100 }];
    const result = graphWalk(seeds, getRels);
    expect(result.has('a')).toBe(true);
    expect(result.has('b')).toBe(true);
    expect(result.has('d')).toBe(true);
    expect(result.size).toBe(3);
  });

  it('walks multiple levels with maxDepth', () => {
    const seeds = [{ id: 'a', score: 100 }];
    const result = graphWalk(seeds, getRels, { maxDepth: 2, decayFactor: 0.5 });
    expect(result.has('c')).toBe(true);
    expect(result.get('c')!.depth).toBe(2);
  });

  it('applies decay factor to expanded nodes', () => {
    const seeds = [{ id: 'a', score: 100 }];
    const result = graphWalk(seeds, getRels, { maxDepth: 1, decayFactor: 0.5 });
    // b and d should have score = 100 * 0.5 = 50
    expect(result.get('b')!.score).toBe(50);
    expect(result.get('d')!.score).toBe(50);
  });

  it('prevents infinite loops via visited-set', () => {
    const cyclicRels: KnowledgeRelationship[] = [
      { id: 'r1', projectId: 'p1', sourceId: 'a', targetId: 'b', relType: 'depends_on', createdAt: 1 },
      { id: 'r2', projectId: 'p1', sourceId: 'b', targetId: 'a', relType: 'related_to', createdAt: 2 },
    ];
    const seeds = [{ id: 'a', score: 100 }];
    const result = graphWalk(seeds, (id) => cyclicRels.filter(r => r.sourceId === id || r.targetId === id), { maxDepth: 3, decayFactor: 0.5 });
    expect(result.has('a')).toBe(true);
    expect(result.has('b')).toBe(true);
    expect(result.size).toBe(2);
  });

  it('handles empty seed list', () => {
    const result = graphWalk([], getRels);
    expect(result.size).toBe(0);
  });
});