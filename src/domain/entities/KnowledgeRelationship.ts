import { z } from 'zod';

export const VALID_RELATIONSHIP_TYPES = [
  'supersedes',
  'depends_on',
  'conflicts_with',
  'refines',
  'explains',
  'applies_to',
  'related_to',
  'traces_to',
  'implements',
] as const;

export const KnowledgeRelationshipSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  relType: z.enum(VALID_RELATIONSHIP_TYPES),
  createdAt: z.number().int().nonnegative()
});

export type KnowledgeRelationship = z.infer<typeof KnowledgeRelationshipSchema>;

export const KnowledgeRelationshipInputSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  relType: z.enum(VALID_RELATIONSHIP_TYPES)
});

export type KnowledgeRelationshipInput = z.infer<typeof KnowledgeRelationshipInputSchema>;