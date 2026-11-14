import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ConfigService } from '../../src/application/services/ConfigService';
import { CaptureDeduplicationGuard } from '../../src/infrastructure/safety/CaptureDeduplicationGuard';
import { KnowledgeRelationshipInputSchema, VALID_RELATIONSHIP_TYPES } from '../../src/domain/entities/KnowledgeRelationship';

const TEST_DIR = path.resolve(__dirname, 'config-service-workspace');

describe('ConfigService', () => {
  let configService: ConfigService;

  beforeEach(() => {
    fs.removeSync(TEST_DIR);
    configService = new ConfigService(TEST_DIR);
  });

  afterEach(() => {
    fs.removeSync(TEST_DIR);
  });

  it('returns defaults when no config file exists', () => {
    const config = configService.getConfig();
    expect(config).toBeDefined();
    expect(config.version).toBe('2.0');
    expect(config.llmEnrich).toBe(false);
    expect(config.defaultAuthority).toBe('inferred');
  });

  it('writes and reads config back (round-trip)', () => {
    const updated = configService.setConfig({ 
      llmEnrich: true, 
      defaultAuthority: 'authoritative',
      retrieval: { maxResults: 50 }
    });
    
    expect(updated.llmEnrich).toBe(true);
    expect(updated.defaultAuthority).toBe('authoritative');
    expect(updated.retrieval.maxResults).toBe(50);

    const readBack = configService.getConfig();
    expect(readBack.llmEnrich).toBe(true);
    expect(readBack.defaultAuthority).toBe('authoritative');
    expect(readBack.retrieval.maxResults).toBe(50);
  });

  it('preserves unspecified fields when updating', () => {
    configService.setConfig({ defaultAuthority: 'authoritative' });
    
    const config = configService.getConfig();
    expect(config.defaultAuthority).toBe('authoritative');
    expect(config.llmEnrich).toBe(false); // preserved default
    expect(config.retrieval.maxResults).toBe(100); // preserved default
  });

  it('resets config to defaults', () => {
    configService.setConfig({ llmEnrich: true, defaultAuthority: 'authoritative' });
    configService.resetConfig();
    
    const config = configService.getConfig();
    expect(config.llmEnrich).toBe(false);
    expect(config.defaultAuthority).toBe('inferred');
  });
});

describe('CaptureDeduplicationGuard', () => {
  let guard: CaptureDeduplicationGuard;

  beforeEach(() => {
    guard = new CaptureDeduplicationGuard();
  });

  it('produces stable legacy signature', () => {
    const input = { title: 'Test', content: 'Content', category: 'decision' };
    const sig1 = guard.signature(input);
    const sig2 = guard.signature(input);
    expect(sig1).toBe(sig2);
    expect(sig1.length).toBe(64);
  });

  it('produces different signatures for different inputs', () => {
    const sig1 = guard.signature({ title: 'A', content: 'Content', category: 'decision' });
    const sig2 = guard.signature({ title: 'B', content: 'Content', category: 'decision' });
    expect(sig1).not.toBe(sig2);
  });

  it('produces stable knowledge-mode signature', () => {
    const input = { 
      title: 'Test', 
      content: 'Content', 
      category: 'decision',
      knowledgeType: 'decision',
      source: 'manual',
      authorityLevel: 'provisional'
    };
    const sig1 = guard.signature(input);
    const sig2 = guard.signature(input);
    expect(sig1).toBe(sig2);
    expect(sig1.length).toBe(64);
  });

  it('produces different knowledge signatures for different knowledge metadata', () => {
    const base = { title: 'Test', content: 'Content', category: 'decision' };
    const sig1 = guard.signature({ ...base, knowledgeType: 'decision', source: 'manual', authorityLevel: 'provisional' });
    const sig2 = guard.signature({ ...base, knowledgeType: 'convention', source: 'manual', authorityLevel: 'provisional' });
    expect(sig1).not.toBe(sig2);
  });

  it('legacy and knowledge modes produce different signatures for same content', () => {
    const legacy = guard.signature({ title: 'Test', content: 'Content', category: 'decision' });
    const knowledge = guard.signature({ 
      title: 'Test', 
      content: 'Content', 
      category: 'decision',
      knowledgeType: 'decision',
      source: 'manual',
      authorityLevel: 'provisional'
    });
    expect(legacy).not.toBe(knowledge);
  });
});

describe('KnowledgeRelationship type validation', () => {
  it('accepts all valid relationship types', () => {
    for (const relType of VALID_RELATIONSHIP_TYPES) {
      const result = KnowledgeRelationshipInputSchema.parse({
        sourceId: 'src-1',
        targetId: 'tgt-1',
        relType
      });
      expect(result.relType).toBe(relType);
    }
  });

  it('rejects invalid relationship types', () => {
    expect(() => KnowledgeRelationshipInputSchema.parse({
      sourceId: 'src-1',
      targetId: 'tgt-1',
      relType: 'invalid_type'
    })).toThrow();
  });

  it('rejects empty relType', () => {
    expect(() => KnowledgeRelationshipInputSchema.parse({
      sourceId: 'src-1',
      targetId: 'tgt-1',
      relType: ''
    })).toThrow();
  });
});