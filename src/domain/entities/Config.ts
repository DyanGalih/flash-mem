import { z } from 'zod';

export const VALID_AUTHORITY_LEVELS = [
  'authoritative',
  'inferred',
  'contributed',
  'legacy'
] as const;

export const ConfigSchema = z.object({
  version: z.string().default('2.0'),
  llmEnrich: z.boolean().default(false),
  llmEnrichModel: z.string().nullable().default(null),
  defaultAuthority: z.enum(VALID_AUTHORITY_LEVELS).default('inferred'),
  freshnessCheckDays: z.number().int().positive().default(90),
  retrieval: z.object({
    ftsEnabled: z.boolean().default(true),
    maxResults: z.number().int().positive().default(100),
    defaultLimit: z.number().int().positive().default(20),
    relationshipExpansionLevels: z.number().int().min(0).max(3).default(1),
    authorityBonus: z.object({
      authoritative: z.number().int().default(200),
      inferred: z.number().int().default(100),
      contributed: z.number().int().default(50),
      legacy: z.number().int().default(10),
    }).default({
      authoritative: 200,
      inferred: 100,
      contributed: 50,
      legacy: 10,
    }),
  }).default({
    ftsEnabled: true,
    maxResults: 100,
    defaultLimit: 20,
    relationshipExpansionLevels: 1,
    authorityBonus: {
      authoritative: 200,
      inferred: 100,
      contributed: 50,
      legacy: 10,
    },
  }),
  capture: z.object({
    dedupEnabled: z.boolean().default(true),
    secretScanEnabled: z.boolean().default(true),
    extractionRules: z.array(z.string()).default([]),
  }).default({
    dedupEnabled: true,
    secretScanEnabled: true,
    extractionRules: [],
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: Config = ConfigSchema.parse({});