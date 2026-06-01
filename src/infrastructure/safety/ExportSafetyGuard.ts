import * as fs from 'fs-extra';
import * as path from 'path';
import { PathSanitizer } from './PathSanitizer';
import { SecretScanner } from './SecretScanner';

export class ExportSafetyGuard {
  private static readonly DATE_DIRECTORY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
    const resolvedFilePath = PathSanitizer.sanitizeSubPath(exportRoot, fileName);
    if (!PathSanitizer.isWithinRoot(exportRoot, resolvedFilePath)) {
      throw new Error(`Directory traversal detected: Export file "${fileName}" escapes the export directory "${exportRoot}"`);
    }
    return resolvedFilePath;
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

  public resolveRetentionDays(defaultDays = 30): number {
    const envValue = process.env.FLASH_MEM_EXPORT_RETENTION_DAYS;
    if (!envValue) {
      return defaultDays;
    }

    const parsed = Number.parseInt(envValue, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return defaultDays;
    }

    return parsed;
  }

  public async pruneStaleExports(exportRoot: string, maxAgeDays = this.resolveRetentionDays()): Promise<string[]> {
    if (maxAgeDays < 0) {
      return [];
    }

    if (!(await fs.pathExists(exportRoot))) {
      return [];
    }

    const cutoff = Date.now() - (maxAgeDays * 86_400_000);
    const entries = await fs.readdir(exportRoot, { withFileTypes: true });
    const pruned: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || !ExportSafetyGuard.DATE_DIRECTORY_PATTERN.test(entry.name)) {
        continue;
      }

      const directoryTimestamp = Date.parse(`${entry.name}T00:00:00.000Z`);
      if (Number.isNaN(directoryTimestamp)) {
        continue;
      }

      if (directoryTimestamp >= cutoff) {
        continue;
      }

      const fullPath = PathSanitizer.sanitizeSubPath(exportRoot, entry.name);
      await fs.remove(fullPath);
      pruned.push(entry.name);
    }

    return pruned.sort((left, right) => left.localeCompare(right));
  }
}
