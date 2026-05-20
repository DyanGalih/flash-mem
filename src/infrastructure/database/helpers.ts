import { randomUUID } from 'node:crypto';

export function createId(): string {
  return randomUUID();
}

export function now(): number {
  return Date.now();
}

export function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeProjectPath(value: string): string {
  return value.trim();
}
