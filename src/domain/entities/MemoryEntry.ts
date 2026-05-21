import { z } from 'zod';

export const VALID_CATEGORIES = [
  'project',
  'framework',
  'architecture',
  'convention',
  'decision',
  'pattern',
  'bug_fix',
  'security_note',
  'dependency',
  'risk',
  'constraint',
  'integration'
] as const;

export const MemoryEntrySchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  contentHash: z.string().min(1),
  category: z.enum(VALID_CATEGORIES),
  source: z.string().min(1),
  confidence: z.number().int().min(0).max(100).nullable().optional(),
  relatedFiles: z.array(z.string().min(1)).nullable().optional(),
  sourceDocumentId: z.string().min(1).nullable().optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().nullable().optional()
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

export const MemoryEntryInputSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  category: z.enum(VALID_CATEGORIES),
  source: z.string().min(1),
  confidence: z.number().int().min(0).max(100).optional(),
  relatedFiles: z.array(z.string().min(1)).optional(),
  tags: z.array(z.string().min(1)).default([]),
  sourceDocumentPath: z.string().min(1).optional(),
  sourceChecksum: z.string().min(1).optional(),
  relationships: z.array(z.object({
    targetEntryId: z.string().min(1),
    relationshipType: z.string().min(1)
  })).default([])
});

export type MemoryEntryInput = z.input<typeof MemoryEntryInputSchema>;
