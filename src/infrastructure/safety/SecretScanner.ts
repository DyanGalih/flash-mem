export interface SecretScanWarning {
  line: number;
  category: string;
}

export class SecretScanner {
  public static readonly REDACTED_SECRET = '[REDACTED_SECRET]';

  public static readonly PATTERNS: Array<[RegExp, string, string]> = [
    [/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, SecretScanner.REDACTED_SECRET, 'Private Key'],
    [/\bAKIA[0-9A-Z]{16}\b/g, SecretScanner.REDACTED_SECRET, 'AWS Access Key'],
    [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g, SecretScanner.REDACTED_SECRET, 'GitHub Token'],
    [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, SecretScanner.REDACTED_SECRET, 'Slack Token'],
    [/\b(?:jdbc:)?(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|s?ftp|ssh|sqlite):\/\/[^\s'"`]+/gi, SecretScanner.REDACTED_SECRET, 'Database Connection URI'],
    [/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*([^\s'"`]+)\b/gi, SecretScanner.REDACTED_SECRET, 'Generic Credential'],
    [/\b(?:YOUR|TEST|FAKE)[-_]?(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)\b/gi, SecretScanner.REDACTED_SECRET, 'Generic Credential']
  ];

  /**
   * Scans a string and redacts any recognized secrets, credentials, and connection URIs.
   * Enforces a maximum file size check of 2MB and processes inputs using chunking.
   * @param value The string to sanitize
   */
  public static redact(value: string): string {
    if (!value) {
      return value;
    }
    if (value.length > 2 * 1024 * 1024) {
      throw new Error('Content exceeds maximum size limit of 2MB');
    }
    const offsets = SecretScanner.findSecretOffsets(value);
    if (offsets.length === 0) {
      return value;
    }

    // Sort matches by start ascending to merge overlapping intervals
    const sortedOffsets = [...offsets].sort((a, b) => a.start - b.start);
    const mergedOffsets: Array<{ start: number; end: number }> = [];
    for (const offset of sortedOffsets) {
      if (mergedOffsets.length === 0) {
        mergedOffsets.push({ start: offset.start, end: offset.end });
      } else {
        const last = mergedOffsets[mergedOffsets.length - 1];
        if (offset.start <= last.end) {
          last.end = Math.max(last.end, offset.end);
        } else {
          mergedOffsets.push({ start: offset.start, end: offset.end });
        }
      }
    }

    // Redact from right to left using merged offsets to keep absolute positions valid
    let redacted = value;
    const sortedMerged = [...mergedOffsets].sort((a, b) => b.start - a.start);
    for (const offset of sortedMerged) {
      redacted = redacted.substring(0, offset.start) + SecretScanner.REDACTED_SECRET + redacted.substring(offset.end);
    }
    return redacted;
  }

  /**
   * Scans a string for secret matches and returns safe warning metadata (line number and category).
   * It does not leak the raw secret text.
   * @param value The string to scan
   */
  public static scanForSecrets(value: string): SecretScanWarning[] {
    if (!value) {
      return [];
    }
    if (value.length > 2 * 1024 * 1024) {
      throw new Error('Content exceeds maximum size limit of 2MB');
    }
    const offsets = SecretScanner.findSecretOffsets(value);
    if (offsets.length === 0) {
      return [];
    }

    // Precompute line offsets to map character index to 1-indexed line number
    const lineOffsets: number[] = [0];
    for (let i = 0; i < value.length; i++) {
      if (value[i] === '\n') {
        lineOffsets.push(i + 1);
      }
    }

    const getLineNumber = (idx: number): number => {
      let low = 0;
      let high = lineOffsets.length - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (lineOffsets[mid] <= idx) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      return low;
    };

    return offsets.map((offset) => ({
      line: getLineNumber(offset.start),
      category: offset.category
    }));
  }

  /**
   * Internal helper to scan using 100KB chunks and 100-character overlap
   */
  private static findSecretOffsets(value: string): Array<{ start: number; end: number; category: string }> {
    const CHUNK_SIZE = 100 * 1024;
    const OVERLAP = 100;
    const matches: Array<{ start: number; end: number; category: string; priority: number }> = [];
    const seenMatches = new Set<string>();

    const L = value.length;
    for (let startIdx = 0; startIdx < L; startIdx += CHUNK_SIZE) {
      const chunkEnd = Math.min(L, startIdx + CHUNK_SIZE + OVERLAP);
      const chunkText = value.substring(startIdx, chunkEnd);

      let patternIdx = 0;
      for (const [pattern, _replacement, category] of SecretScanner.PATTERNS) {
        // Ensure global flag is set to avoid infinite loops with exec()
        const regex = pattern.global ? pattern : new RegExp(pattern.source, pattern.flags + 'g');
        regex.lastIndex = 0;

        let match;
        while ((match = regex.exec(chunkText)) !== null) {
          const matchIndexInChunk = match.index;
          const matchLength = match[0].length;

          if (matchLength === 0) {
            regex.lastIndex++;
            continue;
          }

          const absoluteStart = startIdx + matchIndexInChunk;
          const absoluteEnd = absoluteStart + matchLength;

          const key = `${absoluteStart}-${absoluteEnd}`;
          if (!seenMatches.has(key)) {
            seenMatches.add(key);
            matches.push({
              start: absoluteStart,
              end: absoluteEnd,
              category,
              priority: patternIdx
            });
          }
        }
        patternIdx++;
      }

      if (startIdx + CHUNK_SIZE >= L) {
        break;
      }
    }

    // Resolve overlapping matches by priority (lower priority index = higher precedence)
    const sorted = [...matches].sort((a, b) => a.priority - b.priority);
    const accepted: Array<{ start: number; end: number; category: string }> = [];

    for (const match of sorted) {
      const hasOverlap = accepted.some(acc => match.start < acc.end && acc.start < match.end);
      if (!hasOverlap) {
        accepted.push({
          start: match.start,
          end: match.end,
          category: match.category
        });
      }
    }

    // Return matches sorted by start position ascending
    return accepted.sort((a, b) => a.start - b.start);
  }
}
