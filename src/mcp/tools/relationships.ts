import { z } from 'zod';
import { RelationshipInputSchema } from '../../domain/entities/Relationship';
import { MemoryEntryService } from '../../application/services/MemoryEntryService';
import { WorkspaceManager } from "../WorkspaceManager";

export const relationshipInputSchema = z.object({
    project_path: z.string().min(1).describe("Absolute path to the workspace root"),
    projectId: z.string().min(1),
  sourceEntryId: z.string().min(1),
  relationship: RelationshipInputSchema
});

export function createAddMemoryRelationshipTool(manager: WorkspaceManager) {
  return {
    name: 'add_memory_relationship',
    description: 'Create a relationship from one memory entry to another.',
    schema: relationshipInputSchema,
    execute: (input: z.infer<typeof relationshipInputSchema>) => {
      const service = manager.getBundle(input.project_path).memoryEntryService;
      return service.updateMemoryEntry(input.sourceEntryId, {
          relationships: [input.relationship]
        });
    }
  };
}
