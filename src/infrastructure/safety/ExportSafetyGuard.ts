import * as fs from 'fs-extra';
import * as path from 'path';
import { PathSanitizer } from './PathSanitizer';
import { SecretScanner } from './SecretScanner';

export class ExportSafetyGuard {
  public resolveExportRoot(workspaceRoot: string): string {
    const resolvedRoot = PathSanitizer.resolveRoot(workspaceRoot);
    return PathSanitizer.sanitizeSubPath(resolvedRoot, '.flash-mem/exports');
  }

  public async ensureExportDirectory(workspaceRoot: string): Promise<string> {
    const exportRoot = this.resolveExportRoot(workspaceRoot);
    await fs.ensureDir(exportRoot);
    return exportRoot;
  }

  public resolveExportFilePath(workspaceRoot: string, fileName: string): string {
    const exportRoot = this.resolveExportRoot(workspaceRoot);
    return PathSanitizer.sanitizeSubPath(exportRoot, fileName);
  }

  public redactSensitiveValues(value: string): string {
    return SecretScanner.redact(value);
  }

  public sanitizeFileName(fileName: string): string {
    const trimmed = fileName.trim();
    if (trimmed.includes('..') || path.isAbsolute(trimmed)) {
      throw new Error(`Invalid export file name "${fileName}"`);
    }

    return trimmed;
  }
}
