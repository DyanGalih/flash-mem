import { z } from 'zod';

export const VALID_KNOWLEDGE_TYPES = [
  'specification',
  'decision',
  'constraint',
  'convention',
  'pattern',
  'risk',
  'dependency',
  'integration',
  'lesson',
  'insight'
] as const;

export const VALID_AUTHORITY_LEVELS = [
  'definitive',
  'validated',
  'provisional',
  'deprecated'
] as const;

export const VALID_FRESHNESS_STATUSES = [
  'current',
  'stale',
  'unknown'
] as const;

export const VALID_SCOPE_LEVELS = [
  'project',
  'cross-project',
  'global'
] as const;

export const KnowledgeObjectSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  knowledgeType: z.enum(VALID_KNOWLEDGE_TYPES),
  title: z.string().trim().min(1),
  content: z.string().trim(),
  summary: z.string().trim().optional().nullable(),
  authorityLevel: z.enum(VALID_AUTHORITY_LEVELS),
  authoritySource: z.string().optional().nullable(),
  authorityVerifiedAt: z.number().int().nonnegative().optional().nullable(),
  confidence: z.number().int().min(0).max(100).optional().nullable(),
  freshnessStatus: z.enum(VALID_FRESHNESS_STATUSES),
  freshnessValidatedAt: z.number().int().nonnegative().optional().nullable(),
  scopeLevel: z.enum(VALID_SCOPE_LEVELS),
  scopeProjects: z.string().optional().nullable(),
  scopePaths: z.string().optional().nullable(),
  captureMethod: z.string().min(1),
  captureTool: z.string().min(1),
  extractionRule: z.string().optional().nullable(),
  hash: z.string().min(1),
  sourceDocId: z.string().min(1).optional().nullable(),
  tagsHash: z.string().optional().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().optional().nullable()
});

export type KnowledgeObject = z.infer<typeof KnowledgeObjectSchema>;

export const KnowledgeObjectInputSchema = z.object({
  projectId: z.string().min(1),
  knowledgeType: z.enum(VALID_KNOWLEDGE_TYPES),
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  summary: z.string().trim().optional(),
  authorityLevel: z.enum(VALID_AUTHORITY_LEVELS).default('provisional'),
  authoritySource: z.string().optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  freshnessStatus: z.enum(VALID_FRESHNESS_STATUSES).default('current'),
  scopeLevel: z.enum(VALID_SCOPE_LEVELS).default('project'),
  scopeProjects: z.string().optional(),
  scopePaths: z.string().optional(),
  captureMethod: z.string().min(1).default('manual'),
  captureTool: z.string().min(1).default('flash-mem'),
  extractionRule: z.string().optional(),
  tags: z.array(z.string().min(1)).default([]),
  sourceDocumentPath: z.string().optional(),
  sourceChecksum: z.string().optional()
});

export type KnowledgeObjectInput = z.input<typeof KnowledgeObjectInputSchema>;