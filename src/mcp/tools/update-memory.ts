import { z } from 'zod';
import { MemoryEntryService } from '../../application/services/MemoryEntryService';
import { WorkspaceManager } from "../WorkspaceManager";

export const updateMemoryInputSchema = z.object({
    project_path: z.string().min(1).describe("Absolute path to the workspace root"),
    id: z.string().min(1),
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  confidence: z.number().int().min(0).max(100).nullable().optional(),
  related_files: z.array(z.string().min(1)).nullable().optional(),
  tags: z.array(z.string().min(1)).optional(),
  relationships: z.array(z.object({
    targetEntryId: z.string().min(1),
    relationshipType: z.string().min(1)
  })).optional()
});

export function createUpdateMemoryTool(manager: WorkspaceManager) {
  return {
    name: 'update_memory',
    description: 'Update an existing durable memory entry.',
    schema: updateMemoryInputSchema,
    execute: (input: z.infer<typeof updateMemoryInputSchema>) => {
      const service = manager.getBundle(input.project_path).memoryEntryService;
          const { id, related_files, ...rest } = input;
          const result = service.updateMemoryEntry(id, {
            ...rest,
            relatedFiles: related_files
          } as any);

          if (!result) {
            throw new Error(`Memory entry "${id}" not found`);
          }
          return result;
        }
  };
}
