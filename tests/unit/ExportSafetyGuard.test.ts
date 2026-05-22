import { describe, it, expect } from 'vitest';
import * as path from 'path';
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
});
