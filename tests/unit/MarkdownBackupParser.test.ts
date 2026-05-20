import { describe, it, expect } from 'vitest';
import { MarkdownBackupParser } from '../../src/infrastructure/markdown/MarkdownBackupParser';
import { SecretScanner } from '../../src/infrastructure/safety/SecretScanner';

// --- Helpers ---

function buildSectionFile(entries: Array<{
  id: string;
  title: string;
  type?: string;
  tags?: string[];
  updated?: string;
  source?: string;
  content: string;
  relationships?: Array<{ type: string; target: string }>;
}>): string {
  const frontmatter = [
    '---',
    'title: "Test Section"',
    'project: "test-project"',
    'section: "decisions"',
    'workspace_root: "/workspace"',
    '---'
  ].join('\n');

  const body = entries
    .map((e) => {
      const lines = [
        `## ${e.title}`,
        `- ID: ${e.id}`,
        `- Type: ${e.type ?? 'decision'}`,
        `- Tags: ${e.tags && e.tags.length > 0 ? e.tags.map((t) => `\`${t}\``).join(', ') : 'none'}`,
        `- Updated: ${e.updated ?? '2026-05-20T00:00:00.000Z'}`,
        `- Source: ${e.source ?? 'not recorded'}`,
        '',
        ...e.content.split('\n').map((l) => `> ${l}`),
        ''
      ];

      if (e.relationships && e.relationships.length > 0) {
        lines.push('', '### Relationships');
        for (const rel of e.relationships) {
          lines.push(`- ${rel.type} -> \`${rel.target}\``);
        }
      }

      lines.push('');
      return lines.join('\n');
    })
    .join('\n');

  return `${frontmatter}\n\n# Test Section\n\n${body}`;
}

// --- Tests ---

describe('MarkdownBackupParser', () => {
  const parser = new MarkdownBackupParser();

  describe('frontmatter parsing', () => {
    it('extracts projectName and workspaceRoot from frontmatter', () => {
      const md = buildSectionFile([{
        id: 'e1',
        title: 'Entry One',
        content: 'Some content'
      }]);
      const result = parser.parse(md, 'test.md');
      expect(result.projectName).toBe('test-project');
      expect(result.workspaceRoot).toBe('/workspace');
    });

    it('returns empty result with warning when frontmatter is missing', () => {
      const md = '# No frontmatter here\n\n## Entry\n- ID: e1\n> content\n';
      const result = parser.parse(md, 'bad.md');
      expect(result.entries).toHaveLength(0);
      expect(result.warnings.some((w) => w.includes('frontmatter'))).toBe(true);
    });

    it('returns warning when frontmatter delimiter is unclosed', () => {
      const md = '---\ntitle: "Test"\nproject: "p1"\n# No closing delimiter\n## Entry\n';
      const result = parser.parse(md, 'unclosed.md');
      expect(result.entries).toHaveLength(0);
      expect(result.warnings.some((w) => w.includes('Unclosed'))).toBe(true);
    });
  });

  describe('entry parsing', () => {
    it('parses a single valid entry correctly', () => {
      const md = buildSectionFile([{
        id: 'abc-123',
        title: 'Use SQLite',
        type: 'decision',
        tags: ['sqlite', 'arch'],
        content: 'We chose SQLite for local storage.',
        updated: '2026-05-20T12:00:00.000Z'
      }]);

      const result = parser.parse(md, 'decisions.md');
      expect(result.entries).toHaveLength(1);
      const entry = result.entries[0];
      expect(entry.id).toBe('abc-123');
      expect(entry.title).toBe('Use SQLite');
      expect(entry.entryType).toBe('decision');
      expect(entry.tags).toEqual(['sqlite', 'arch']);
      expect(entry.content).toBe('We chose SQLite for local storage.');
      expect(entry.updatedAt).toBe(Date.parse('2026-05-20T12:00:00.000Z'));
    });

    it('parses multiple entries from a single file', () => {
      const md = buildSectionFile([
        { id: 'e1', title: 'Entry One', content: 'First decision' },
        { id: 'e2', title: 'Entry Two', content: 'Second decision' }
      ]);
      const result = parser.parse(md, 'decisions.md');
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].id).toBe('e1');
      expect(result.entries[1].id).toBe('e2');
    });

    it('skips entries missing the ID field and emits warning', () => {
      const md = [
        '---',
        'title: "Test"',
        'project: "p"',
        'section: "decisions"',
        'workspace_root: "/w"',
        '---',
        '',
        '## Entry Without ID',
        '- Type: decision',
        '- Tags: none',
        '- Updated: 2026-05-20T00:00:00.000Z',
        '- Source: not recorded',
        '',
        '> Some content',
        ''
      ].join('\n');

      const result = parser.parse(md, 'no-id.md');
      expect(result.entries).toHaveLength(0);
      expect(result.warnings.some((w) => w.includes('"ID"'))).toBe(true);
    });

    it('skips entries with no parseable content and emits warning', () => {
      const md = [
        '---',
        'title: "Test"',
        'project: "p"',
        'section: "decisions"',
        'workspace_root: "/w"',
        '---',
        '',
        '## Entry With No Content',
        '- ID: empty-1',
        '- Type: decision',
        '- Tags: none',
        '- Updated: 2026-05-20T00:00:00.000Z',
        '- Source: not recorded',
        ''
      ].join('\n');

      const result = parser.parse(md, 'empty.md');
      expect(result.entries).toHaveLength(0);
      expect(result.warnings.some((w) => w.includes('no parseable content'))).toBe(true);
    });

    it('handles entries with no tags gracefully', () => {
      const md = buildSectionFile([{
        id: 'tagless-1',
        title: 'No Tags Entry',
        tags: [],
        content: 'Content without tags.'
      }]);
      const result = parser.parse(md, 'test.md');
      expect(result.entries[0].tags).toEqual([]);
    });

    it('parses source document path correctly', () => {
      const md = buildSectionFile([{
        id: 'src-1',
        title: 'Entry With Source',
        content: 'Has a source.',
        source: '`docs/memory/DECISIONS.md`'
      }]);
      const result = parser.parse(md, 'test.md');
      expect(result.entries[0].sourceDocumentPath).toBe('docs/memory/DECISIONS.md');
    });

    it('sets sourceDocumentPath to null when source is "not recorded"', () => {
      const md = buildSectionFile([{
        id: 'no-src-1',
        title: 'No Source',
        content: 'Content.',
        source: 'not recorded'
      }]);
      const result = parser.parse(md, 'test.md');
      expect(result.entries[0].sourceDocumentPath).toBeNull();
    });
  });

  describe('relationship parsing', () => {
    it('parses relationships from a section file entry', () => {
      const md = buildSectionFile([{
        id: 'e1',
        title: 'Entry One',
        content: 'Source entry.',
        relationships: [
          { type: 'relates-to', target: 'e2' },
          { type: 'depends-on', target: 'e3' }
        ]
      }]);

      const result = parser.parse(md, 'test.md');
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].relationships).toHaveLength(2);
      expect(result.entries[0].relationships[0]).toEqual({
        relationshipType: 'relates-to',
        targetEntryId: 'e2'
      });
      expect(result.entries[0].relationships[1]).toEqual({
        relationshipType: 'depends-on',
        targetEntryId: 'e3'
      });
    });

    it('returns empty relationships array when no relationships are present', () => {
      const md = buildSectionFile([{
        id: 'lonely-1',
        title: 'Lonely Entry',
        content: 'No relationships.'
      }]);
      const result = parser.parse(md, 'test.md');
      expect(result.entries[0].relationships).toEqual([]);
    });
  });

  describe('security — secret redaction', () => {
    it('redacts secrets from entry content', () => {
      const sensitiveContent = 'Token: ghp_1234567890abcdefghij12345678';
      const md = buildSectionFile([{
        id: 'sec-1',
        title: 'Sensitive Entry',
        content: sensitiveContent
      }]);

      const result = parser.parse(md, 'test.md');
      expect(result.entries[0].content).toBe(SecretScanner.redact(sensitiveContent));
      expect(result.entries[0].content).not.toContain('ghp_');
    });

    it('redacts secrets from entry title', () => {
      const sensitiveTitle = 'My API token: AKIAIOSFODNN7EXAMPLE123';
      const md = buildSectionFile([{
        id: 'sec-2',
        title: sensitiveTitle,
        content: 'Normal content.'
      }]);

      const result = parser.parse(md, 'test.md');
      expect(result.entries[0].title).not.toContain('AKIA');
    });
  });

  describe('invalid date handling', () => {
    it('uses current time when Updated field is not a valid date', () => {
      const before = Date.now();
      const md = [
        '---',
        'title: "Test"',
        'project: "p"',
        'section: "decisions"',
        'workspace_root: "/w"',
        '---',
        '',
        '## Entry Bad Date',
        '- ID: bd-1',
        '- Type: decision',
        '- Tags: none',
        '- Updated: not-a-date',
        '- Source: not recorded',
        '',
        '> Content.',
        ''
      ].join('\n');

      const result = parser.parse(md, 'test.md');
      const after = Date.now();
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].updatedAt).toBeGreaterThanOrEqual(before);
      expect(result.entries[0].updatedAt).toBeLessThanOrEqual(after);
      expect(result.warnings.some((w) => w.includes('unparseable Updated date'))).toBe(true);
    });
  });
});
