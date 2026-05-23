import { describe, expect, it } from 'vitest';
import { ArtifactMemoryExtractionService } from '../../src/application/services/ArtifactMemoryExtractionService';

describe('ArtifactMemoryExtractionService', () => {
  it('infers source types from artifact names', () => {
    const service = new ArtifactMemoryExtractionService();

    expect(service.inferSourceType('specs/feature/spec.md')).toBe('spec');
    expect(service.inferSourceType('specs/feature/plan.md')).toBe('plan');
    expect(service.inferSourceType('docs/security-review.md')).toBe('security_review');
    expect(service.inferSourceType('docs/custom-note.md')).toBe('implementation_notes');
  });

  it('extracts candidates and categories from markdown content', () => {
    const service = new ArtifactMemoryExtractionService();
    const candidates = service.extractCandidates(
      '# Architecture\n\nKeep the MCP boundary thin.\n\n## Security\n\nRedact secrets before persistence.',
      'spec',
      'specs/feature/spec.md'
    );

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]).toMatchObject({
      sourceType: 'spec',
      artifactPath: 'specs/feature/spec.md'
    });
    expect(['architecture', 'security_note', 'integration']).toContain(candidates[0].category);
  });
});