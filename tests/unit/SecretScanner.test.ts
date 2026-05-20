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
});
