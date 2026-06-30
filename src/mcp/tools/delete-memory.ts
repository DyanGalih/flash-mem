import { z } from 'zod';
import { MemoryEntryService } from '../../application/services/MemoryEntryService';
import { WorkspaceManager } from "../WorkspaceManager";

export const deleteMemoryInputSchema = z.object({
    project_path: z.string().min(1).describe("Absolute path to the workspace root"),
    id: z.string().min(1)
});

export function createDeleteMemoryTool(manager: WorkspaceManager) {
  return {
    name: 'delete_memory',
    description: 'Delete a durable memory entry by id.',
    schema: deleteMemoryInputSchema,
    execute: (input: z.infer<typeof deleteMemoryInputSchema>) => {
      const service = manager.getBundle(input.project_path).memoryEntryService;
          const success = service.deleteMemoryEntry(input.id);
          if (!success) {
            throw new Error(`Memory entry "${input.id}" not found`);
          }
          return {
            id: input.id,
            deletedAt: Date.now()
          };
        }
  };
}
