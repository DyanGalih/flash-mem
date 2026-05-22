import { describe, it, expect } from 'vitest';
import { SecretScanner } from '../../src/infrastructure/safety/SecretScanner';

describe('SecretScanner', () => {
  it('redacts private keys', () => {
    const input = 'key: -----BEGIN PRIVATE KEY-----\nsomekey\n-----END PRIVATE KEY-----';
    expect(SecretScanner.redact(input)).toBe('key: [REDACTED_SECRET]');
  });

  it('redacts AWS keys', () => {
    const input = 'my AWS key is AKIA1234567890ABCDEF';
    expect(SecretScanner.redact(input)).toBe('my AWS key is [REDACTED_SECRET]');
  });

  it('redacts database connection URIs', () => {
    const mongodb = 'mongodb://user:pass@localhost:27017/db';
    const postgres = 'postgresql://admin:secret@host.com/dbname?ssl=true';
    const jdbc = 'jdbc:mysql://localhost:3306/db?user=root&password=password';
    
    expect(SecretScanner.redact(mongodb)).toBe('[REDACTED_SECRET]');
    expect(SecretScanner.redact(postgres)).toBe('[REDACTED_SECRET]');
    expect(SecretScanner.redact(jdbc)).toBe('[REDACTED_SECRET]');
  });

  it('does not modify normal text', () => {
    const input = 'This is some safe text with no secrets.';
    expect(SecretScanner.redact(input)).toBe(input);
  });

  describe('scanForSecrets', () => {
    it('returns warning metadata without leaking raw secrets', () => {
      const input = 'my AWS key is AKIA1234567890ABCDEF\nSome other text here';
      const warnings = SecretScanner.scanForSecrets(input);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toEqual({
        line: 1,
        category: 'AWS Access Key'
      });
    });

    it('accurately computes 1-indexed line numbers using newline offsets', () => {
      const input = 'line 1\nline 2 with database postgresql://user:pass@localhost:5432/db\nline 3';
      const warnings = SecretScanner.scanForSecrets(input);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toEqual({
        line: 2,
        category: 'Database Connection URI'
      });
    });

    it('detects multiple secrets in the same input and reports correct line numbers', () => {
      const input = 'token: ghp_1234567890abcdefghij12345678\nline 2\nSlack: xoxb-1234567890-abcdef';
      const warnings = SecretScanner.scanForSecrets(input);
      expect(warnings).toHaveLength(2);
      expect(warnings).toEqual(expect.arrayContaining([
        { line: 1, category: 'GitHub Token' },
        { line: 3, category: 'Slack Token' }
      ]));
    });

    it('throws an error if input exceeds 2MB size limit', () => {
      const largeInput = 'a'.repeat(2 * 1024 * 1024 + 1);
      expect(() => SecretScanner.scanForSecrets(largeInput)).toThrow('Content exceeds maximum size limit of 2MB');
      expect(() => SecretScanner.redact(largeInput)).toThrow('Content exceeds maximum size limit of 2MB');
    });

    it('returns empty array for empty inputs', () => {
      expect(SecretScanner.scanForSecrets('')).toEqual([]);
      expect(SecretScanner.scanForSecrets(undefined as any)).toEqual([]);
    });
  });
});
