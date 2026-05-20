import { z } from 'zod';

export const RelationshipSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  sourceEntryId: z.string().min(1),
  targetEntryId: z.string().min(1),
  relationshipType: z.string().min(1),
  createdAt: z.number().int().nonnegative()
});

export type Relationship = z.infer<typeof RelationshipSchema>;

export const RelationshipInputSchema = z.object({
  targetEntryId: z.string().min(1),
  relationshipType: z.string().min(1)
});

export type RelationshipInput = z.infer<typeof RelationshipInputSchema>;
