import { z } from 'zod';
import { RelationshipInputSchema } from '../../domain/entities/Relationship';
import { MemoryEntryService } from '../../application/services/MemoryEntryService';

export const relationshipInputSchema = z.object({
  projectId: z.string().min(1),
  sourceEntryId: z.string().min(1),
  relationship: RelationshipInputSchema
});

export function createAddMemoryRelationshipTool(service: MemoryEntryService) {
  return {
    name: 'add_memory_relationship',
    schema: relationshipInputSchema,
    execute: (input: z.infer<typeof relationshipInputSchema>) => service.updateMemoryEntry(input.sourceEntryId, {
      relationships: [input.relationship]
    })
  };
}
