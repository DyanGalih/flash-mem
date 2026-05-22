import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { IndexingInputGuard } from '../../src/infrastructure/safety/IndexingInputGuard';

describe('IndexingInputGuard', () => {
  const tempDir = path.resolve(__dirname, '../../.tmp-indexing-guard-test');
  let guard: IndexingInputGuard;

  beforeEach(async () => {
    await fs.ensureDir(tempDir);
    guard = new IndexingInputGuard();
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('ignores default sensitive paths regardless of config files', () => {
    const sources = [
      { path: '.env', checksum: '123', title: 'Env', content: 'SECRET=123', category: 'project' },
      { path: '.env.production', checksum: '123', title: 'Env Prod', content: 'SECRET=123', category: 'project' },
      { path: '.git/credentials', checksum: '123', title: 'Creds', content: 'username=foo', category: 'project' },
      { path: '.npmrc', checksum: '123', title: 'Npmrc', content: '//registry=foo', category: 'project' },
      { path: '.netrc', checksum: '123', title: 'Netrc', content: 'machine foo', category: 'project' },
      { path: 'safe-file.md', checksum: '123', title: 'Safe', content: 'No secrets here', category: 'project' }
    ];

    const result = guard.sanitizeSources(tempDir, sources);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].path).toBe('safe-file.md');
  });

  it('loads and applies patterns from both .gitignore and .flash-mem-ignore', async () => {
    await fs.writeFile(path.join(tempDir, '.gitignore'), 'ignored-dir/\n*.log');
    await fs.writeFile(path.join(tempDir, '.flash-mem-ignore'), 'secrets-dir/\n*.key');

    const sources = [
      { path: 'ignored-dir/some-file.md', checksum: '123', title: '1', content: 'foo', category: 'project' },
      { path: 'some-file.log', checksum: '123', title: '2', content: 'foo', category: 'project' },
      { path: 'secrets-dir/another.md', checksum: '123', title: '3', content: 'foo', category: 'project' },
      { path: 'my-key.key', checksum: '123', title: '4', content: 'foo', category: 'project' },
      { path: 'safe.md', checksum: '123', title: '5', content: 'foo', category: 'project' }
    ];

    const result = guard.sanitizeSources(tempDir, sources);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].path).toBe('safe.md');
  });

  it('compiles safety warnings in sanitizeSources', () => {
    const sources = [
      {
        path: 'safe.md',
        checksum: '123',
        title: 'Document containing AWS key',
        content: 'This has an AWS key: AKIA1234567890ABCDEF in it.',
        category: 'project'
      }
    ];

    const result = guard.sanitizeSources(tempDir, sources);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].content).toBe('This has an AWS key: [REDACTED_SECRET] in it.');

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].filePath).toBe('safe.md');
    expect(result.warnings[0].line).toBe(1);
    expect(result.warnings[0].category).toBe('AWS Access Key');
  });

  it('throws error when trying to normalize an ignored path', async () => {
    await fs.writeFile(path.join(tempDir, '.flash-mem-ignore'), 'ignored-file.md');
    
    expect(() => guard.normalizeSourcePath(tempDir, 'ignored-file.md')).toThrow(/Ignored source path/);
    expect(guard.normalizeSourcePath(tempDir, 'allowed-file.md')).toBe('allowed-file.md');
  });
});
