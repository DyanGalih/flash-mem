export class SecretScanner {
  public static readonly REDACTED_SECRET = '[REDACTED_SECRET]';

  public static readonly PATTERNS: Array<[RegExp, string]> = [
    [/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, SecretScanner.REDACTED_SECRET],
    [/\bAKIA[0-9A-Z]{16}\b/g, SecretScanner.REDACTED_SECRET],
    [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g, SecretScanner.REDACTED_SECRET],
    [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, SecretScanner.REDACTED_SECRET],
    [/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*([^\s'"`]+)\b/gi, SecretScanner.REDACTED_SECRET],
    [/\b(?:YOUR|TEST|FAKE)[-_]?(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)\b/gi, SecretScanner.REDACTED_SECRET],
    [/\b(?:jdbc:)?(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|s?ftp|ssh|sqlite):\/\/[^\s'"`]+/gi, SecretScanner.REDACTED_SECRET]
  ];

  /**
   * Scans a string and redacts any recognized secrets, credentials, and connection URIs.
   * @param value The string to sanitize
   */
  public static redact(value: string): string {
    if (!value) {
      return value;
    }
    let redacted = value;
    for (const [pattern, replacement] of SecretScanner.PATTERNS) {
      redacted = redacted.replace(pattern, replacement);
    }
    return redacted;
  }
}
