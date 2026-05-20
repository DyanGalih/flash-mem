import * as fs from 'fs-extra';
import * as path from 'path';
import { PathSanitizer } from './PathSanitizer';

export interface IndexingSourceInput {
  path: string;
  checksum: string;
  title: string;
  content: string;
  entryType: string;
  tags?: string[];
}

export interface SanitizedIndexingSourceInput extends IndexingSourceInput {
  path: string;
  title: string;
  content: string;
  tags?: string[];
}

export class IndexingInputGuard {
  private readonly ignorePatternCache = new Map<string, string[]>();

  public sanitizeSources(projectRoot: string, sources: IndexingSourceInput[]): SanitizedIndexingSourceInput[] {
    const resolvedRoot = PathSanitizer.resolveRoot(projectRoot);
    const ignorePatterns = this.loadIgnorePatterns(resolvedRoot);
    const sanitized: SanitizedIndexingSourceInput[] = [];

    for (const source of sources) {
      const absolutePath = this.resolveSourcePath(resolvedRoot, source.path);
      const relativePath = this.toWorkspaceRelativePath(resolvedRoot, absolutePath);

      if (this.shouldIgnore(relativePath, ignorePatterns)) {
        continue;
      }

      sanitized.push({
        ...source,
        path: relativePath,
        title: this.redactSecrets(source.title),
        content: this.redactSecrets(source.content),
        tags: source.tags?.map((tag) => this.redactSecrets(tag))
      });
    }

    return sanitized;
  }

  public normalizeSourcePath(projectRoot: string, sourcePath: string): string {
    const resolvedRoot = PathSanitizer.resolveRoot(projectRoot);
    const absolutePath = this.resolveSourcePath(resolvedRoot, sourcePath);
    const relativePath = this.toWorkspaceRelativePath(resolvedRoot, absolutePath);
    if (this.shouldIgnore(relativePath, this.loadIgnorePatterns(resolvedRoot))) {
      throw new Error(`Ignored source path "${sourcePath}" cannot be indexed`);
    }
    return relativePath;
  }

  private resolveSourcePath(resolvedRoot: string, sourcePath: string): string {
    if (path.isAbsolute(sourcePath)) {
      const absolutePath = path.resolve(sourcePath);
      if (!PathSanitizer.isWithinRoot(resolvedRoot, absolutePath)) {
        throw new Error(`Directory traversal detected: Path "${sourcePath}" escapes the workspace root "${resolvedRoot}"`);
      }
      return absolutePath;
    }

    return PathSanitizer.sanitizeSubPath(resolvedRoot, sourcePath);
  }

  private toWorkspaceRelativePath(resolvedRoot: string, absolutePath: string): string {
    return path.relative(resolvedRoot, absolutePath).split(path.sep).join('/');
  }

  private loadIgnorePatterns(resolvedRoot: string): string[] {
    const cached = this.ignorePatternCache.get(resolvedRoot);
    if (cached) {
      return cached;
    }

    const gitignorePath = path.join(resolvedRoot, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      this.ignorePatternCache.set(resolvedRoot, []);
      return [];
    }

    const patterns = fs.readFileSync(gitignorePath, 'utf-8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('!'));

    this.ignorePatternCache.set(resolvedRoot, patterns);
    return patterns;
  }

  private shouldIgnore(relativePath: string, ignorePatterns: string[]): boolean {
    const normalizedPath = relativePath.split(path.sep).join('/');
    const segments = normalizedPath.split('/').filter(Boolean);

    if (segments.some((segment) => segment === '.env' || /^\.env\..+/.test(segment))) {
      return true;
    }

    if (segments.length >= 2 && segments[0] === '.git' && segments[1] === 'credentials') {
      return true;
    }

    if (segments.some((segment) => segment === '.npmrc' || segment === '.netrc')) {
      return true;
    }

    return ignorePatterns.some((pattern) => this.matchesIgnorePattern(normalizedPath, pattern));
  }

  private matchesIgnorePattern(relativePath: string, pattern: string): boolean {
    const normalizedPattern = pattern.split(path.sep).join('/').replace(/^\/+/, '');
    if (normalizedPattern.length === 0) {
      return false;
    }

    if (normalizedPattern.includes('*') || normalizedPattern.includes('?')) {
      return new RegExp(`^${this.escapeRegex(normalizedPattern).replace(/\\\*/g, '.*').replace(/\\\?/g, '.')}$`).test(relativePath);
    }

    if (normalizedPattern.endsWith('/')) {
      const prefix = normalizedPattern.slice(0, -1);
      return relativePath === prefix || relativePath.startsWith(`${prefix}/`);
    }

    return relativePath === normalizedPattern
      || relativePath.endsWith(`/${normalizedPattern}`)
      || relativePath.startsWith(`${normalizedPattern}/`);
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private redactSecrets(value: string): string {
    const patterns: Array<[RegExp, string]> = [
      [/-----BEGIN [^-]+PRIVATE KEY-----[\s\S]*?-----END [^-]+PRIVATE KEY-----/g, '[REDACTED_SECRET]'],
      [/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_SECRET]'],
      [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g, '[REDACTED_SECRET]'],
      [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, '[REDACTED_SECRET]'],
      [/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*([^\s'"`]+)\b/gi, '[REDACTED_SECRET]'],
      [/\b(?:YOUR|TEST|FAKE)[-_]?(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)\b/gi, '[REDACTED_SECRET]']
    ];

    let redacted = value;
    for (const [pattern, replacement] of patterns) {
      redacted = redacted.replace(pattern, replacement);
    }
    return redacted;
  }
}
