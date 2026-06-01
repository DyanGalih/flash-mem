import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { ExportSafetyGuard } from '../../src/infrastructure/safety/ExportSafetyGuard';

describe('ExportSafetyGuard', () => {
  const guard = new ExportSafetyGuard();
  const workspaceRoot = path.resolve('/workspace/flash-mem');

  it('resolves export paths inside the workspace root', () => {
    expect(guard.resolveExportRoot(workspaceRoot)).toBe(path.join(workspaceRoot, '.flash-mem/exports'));
    expect(guard.resolveExportFilePath(workspaceRoot, 'project-summary.md')).toBe(
      path.join(workspaceRoot, '.flash-mem/exports/project-summary.md')
    );
  });

  it('redacts secrets and placeholder credentials from exported markdown', () => {
    const redacted = guard.redactSensitiveValues([
      'api_key=abc123',
      '-----BEGIN PRIVATE KEY-----',
      'secret=super-secret',
      'YOUR_API_KEY'
    ].join('\n'));

    expect(redacted).toContain('[REDACTED_SECRET]');
    expect(redacted).not.toContain('super-secret');
    expect(redacted).not.toContain('YOUR_API_KEY');
  });

  it('rejects traversal-like export file names', () => {
    expect(() => guard.sanitizeFileName('../escape.md')).toThrow('Invalid export file name');
  });

  it('detects and rejects traversal inside resolveExportFilePath', () => {
    expect(() => guard.resolveExportFilePath(workspaceRoot, '../outside.md')).toThrow('Directory traversal detected');
    expect(() => guard.resolveExportFilePath(workspaceRoot, '/absolute/path/outside.md')).toThrow('Directory traversal detected');
  });

  it('resolves retention days from env with sane fallback', () => {
    const original = process.env.FLASH_MEM_EXPORT_RETENTION_DAYS;
    process.env.FLASH_MEM_EXPORT_RETENTION_DAYS = '45';
    expect(guard.resolveRetentionDays()).toBe(45);

    process.env.FLASH_MEM_EXPORT_RETENTION_DAYS = 'invalid';
    expect(guard.resolveRetentionDays()).toBe(30);

    if (original === undefined) {
      delete process.env.FLASH_MEM_EXPORT_RETENTION_DAYS;
    } else {
      process.env.FLASH_MEM_EXPORT_RETENTION_DAYS = original;
    }
  });

  it('prunes only stale YYYY-MM-DD export directories', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-mem-export-guard-'));
    const exportRoot = path.join(tempRoot, '.flash-mem', 'exports');
    await fs.ensureDir(path.join(exportRoot, '2000-01-01'));
    await fs.ensureDir(path.join(exportRoot, '2999-01-01'));
    await fs.ensureDir(path.join(exportRoot, 'not-a-date'));

    const pruned = await guard.pruneStaleExports(exportRoot, 30);

    expect(pruned).toContain('2000-01-01');
    expect(pruned).not.toContain('2999-01-01');
    expect(await fs.pathExists(path.join(exportRoot, '2000-01-01'))).toBe(false);
    expect(await fs.pathExists(path.join(exportRoot, '2999-01-01'))).toBe(true);
    expect(await fs.pathExists(path.join(exportRoot, 'not-a-date'))).toBe(true);

    await fs.remove(tempRoot);
  });
});
