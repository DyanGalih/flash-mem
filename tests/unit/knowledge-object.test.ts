import { describe, expect, it } from 'vitest';
import {
  KnowledgeObjectInputSchema,
  VALID_KNOWLEDGE_TYPES,
  VALID_AUTHORITY_LEVELS,
  VALID_FRESHNESS_STATUSES,
  VALID_SCOPE_LEVELS
} from '../../src/domain/entities/KnowledgeObject';
import { KnowledgeRelationshipInputSchema } from '../../src/domain/entities/KnowledgeRelationship';
import { AuthorityChainInputSchema } from '../../src/domain/entities/AuthorityChain';

describe('KnowledgeObject Schema', () => {
  const validInput = {
    projectId: 'proj-1',
    knowledgeType: 'decision',
    title: 'Use SHA256 for hash',
    content: 'We use SHA256 for content hashing.'
  };

  it('parses valid minimal input', () => {
    const parsed = KnowledgeObjectInputSchema.parse(validInput);
    expect(parsed.projectId).toBe('proj-1');
    expect(parsed.knowledgeType).toBe('decision');
    expect(parsed.authorityLevel).toBe('provisional');
    expect(parsed.freshnessStatus).toBe('current');
    expect(parsed.scopeLevel).toBe('project');
    expect(parsed.captureMethod).toBe('manual');
    expect(parsed.captureTool).toBe('flash-mem');
  });

  it('parses full input', () => {
    const full = {
      ...validInput,
      summary: 'Hash decision summary',
      authorityLevel: 'validated',
      authoritySource: 'review-2026',
      confidence: 95,
      freshnessStatus: 'stale',
      scopeLevel: 'cross-project',
      captureMethod: 'auto',
      captureTool: 'flash-mem-cli',
      tags: ['hash', 'crypto'],
      sourceDocumentPath: '/docs/decisions.md',
      sourceChecksum: 'abc123'
    };
    const parsed = KnowledgeObjectInputSchema.parse(full);
    expect(parsed.confidence).toBe(95);
    expect(parsed.tags).toEqual(['hash', 'crypto']);
    expect(parsed.authorityLevel).toBe('validated');
  });

  it('rejects missing title', () => {
    expect(() => KnowledgeObjectInputSchema.parse({
      projectId: 'proj-1',
      knowledgeType: 'decision',
      content: 'Some content'
    })).toThrow();
  });

  it('rejects invalid knowledgeType', () => {
    expect(() => KnowledgeObjectInputSchema.parse({
      ...validInput,
      knowledgeType: 'invalid_type'
    })).toThrow();
  });

  it('rejects invalid authorityLevel', () => {
    expect(() => KnowledgeObjectInputSchema.parse({
      ...validInput,
      authorityLevel: 'WRONG'
    })).toThrow();
  });

  it('rejects confidence outside 0-100', () => {
    expect(() => KnowledgeObjectInputSchema.parse({
      ...validInput,
      confidence: 150
    })).toThrow();
    expect(() => KnowledgeObjectInputSchema.parse({
      ...validInput,
      confidence: -1
    })).toThrow();
  });

  it('rejects empty title', () => {
    expect(() => KnowledgeObjectInputSchema.parse({
      ...validInput,
      title: '   '
    })).toThrow();
  });
});

describe('KnowledgeRelationship Schema', () => {
  it('parses valid input', () => {
    const parsed = KnowledgeRelationshipInputSchema.parse({
      sourceId: 'src-1',
      targetId: 'tgt-2',
      relType: 'refines'
    });
    expect(parsed.sourceId).toBe('src-1');
    expect(parsed.targetId).toBe('tgt-2');
    expect(parsed.relType).toBe('refines');
  });

  it('rejects empty sourceId', () => {
    expect(() => KnowledgeRelationshipInputSchema.parse({
      sourceId: '',
      targetId: 'tgt-2',
      relType: 'refines'
    })).toThrow();
  });
});

describe('AuthorityChain Schema', () => {
  it('parses valid input', () => {
    const parsed = AuthorityChainInputSchema.parse({
      objectId: 'know-1',
      changeReason: 'Updated authority level'
    });
    expect(parsed.objectId).toBe('know-1');
    expect(parsed.previousHash).toBeUndefined();
  });

  it('parses input with optional fields', () => {
    const parsed = AuthorityChainInputSchema.parse({
      objectId: 'know-1',
      previousHash: 'abcdefacef',
      changeReason: 'Content revision',
      changedBy: 'alice'
    });
    expect(parsed.previousHash).toBe('abcdefacef');
    expect(parsed.changedBy).toBe('alice');
  });

  it('rejects empty changeReason', () => {
    expect(() => AuthorityChainInputSchema.parse({
      objectId: 'know-1',
      changeReason: ''
    })).toThrow();
  });
});

describe('Computed hash', () => {
  it('produces deterministic SHA256 hash', () => {
    const { createHash } = require('node:crypto');
    const h1 = createHash('sha256').update('decisionSHA256 hash decisionprovisional').digest('hex');
    const h2 = createHash('sha256').update('decisionSHA256 hash decisionprovisional').digest('hex');
    expect(h1).toBe(h2);
    expect(h1.length).toBe(64);
  });
});