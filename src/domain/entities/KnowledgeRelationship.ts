import { z } from 'zod';

export const KnowledgeRelationshipSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  relType: z.string().min(1),
  createdAt: z.number().int().nonnegative()
});

export type KnowledgeRelationship = z.infer<typeof KnowledgeRelationshipSchema>;

export const KnowledgeRelationshipInputSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  relType: z.string().min(1)
});

export type KnowledgeRelationshipInput = z.infer<typeof KnowledgeRelationshipInputSchema>;