import { z } from 'zod';
import { VALID_CATEGORIES } from './MemoryEntry';

export const ARTIFACT_MEMORY_SOURCE_TYPES = [
  'constitution',
  'spec',
  'plan',
  'tasks',
  'architecture_review',
  'security_review',
  'implementation_notes',
  'validation_report',
  'markdown_backup',
  'custom_markdown'
] as const;

export const ArtifactMemorySourceTypeSchema = z.enum(ARTIFACT_MEMORY_SOURCE_TYPES);
export type ArtifactMemorySourceType = z.infer<typeof ArtifactMemorySourceTypeSchema>;

export const ArtifactMemoryCaptureInputSchema = z.object({
  artifactPath: z.string().trim().min(1),
  sourceType: ArtifactMemorySourceTypeSchema.optional()
});

export type ArtifactMemoryCaptureInput = z.infer<typeof ArtifactMemoryCaptureInputSchema>;

export const ArtifactMemoryCandidateSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  category: z.enum(VALID_CATEGORIES),
  confidence: z.number().int().min(0).max(100),
  summary: z.string().trim().min(1).optional(),
  sourceType: ArtifactMemorySourceTypeSchema,
  artifactPath: z.string().trim().min(1)
});

export type ArtifactMemoryCandidate = z.infer<typeof ArtifactMemoryCandidateSchema>;

export const ArtifactMemoryCaptureEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1),
  category: z.enum(VALID_CATEGORIES),
  confidence: z.number().int().min(0).max(100).nullable().optional(),
  summary: z.string().trim().nullable().optional(),
  sourceType: ArtifactMemorySourceTypeSchema,
  artifactPath: z.string().trim().min(1)
});

export type ArtifactMemoryCaptureEntry = z.infer<typeof ArtifactMemoryCaptureEntrySchema>;

export const ArtifactMemoryCaptureResultSchema = z.object({
  status: z.enum(['captured', 'skipped', 'failed']),
  artifactPath: z.string().trim().min(1),
  sourceType: ArtifactMemorySourceTypeSchema,
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  createdCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  entries: z.array(ArtifactMemoryCaptureEntrySchema),
  reason: z.string().trim().optional()
});

export type ArtifactMemoryCaptureResult = z.infer<typeof ArtifactMemoryCaptureResultSchema>;