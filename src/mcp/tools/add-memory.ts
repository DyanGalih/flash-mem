import { z } from 'zod';
import { MemoryEntryInputSchema } from '../../domain/entities/MemoryEntry';
import { MemoryEntryService } from '../../application/services/MemoryEntryService';
import { WorkspaceManager } from "../WorkspaceManager";

export const addMemoryInputSchema = MemoryEntryInputSchema.omit({
  projectId: true,
  relatedFiles: true
}).extend({ project_path: z.string().min(1).describe("Absolute path to the workspace root"), 
  projectId: z.string().min(1).optional(),
  rootPath: z.string().min(1).optional(),
  projectName: z.string().min(1).optional(),
  related_files: z.array(z.string().min(1)).optional()
});

export function createAddMemoryTool(manager: WorkspaceManager) {
  return {
    name: 'add_memory',
    description: 'Create a new durable memory entry for the current project.',
    schema: addMemoryInputSchema,
    execute: (input: z.infer<typeof addMemoryInputSchema>) => {
      const service = manager.getBundle(input.project_path).memoryEntryService;
          const { related_files, ...rest } = input;
          return service.createMemoryEntry({
            ...rest,
            rootPath: input.project_path,
            relatedFiles: related_files
          } as any);
        }
  };
}
