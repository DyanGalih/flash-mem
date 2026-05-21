import { z } from 'zod';
import { MemoryEntryInputSchema } from '../../domain/entities/MemoryEntry';
import { MemoryEntryService } from '../../application/services/MemoryEntryService';

export const addMemoryInputSchema = MemoryEntryInputSchema.omit({
  projectId: true,
  relatedFiles: true
}).extend({
  projectId: z.string().min(1).optional(),
  rootPath: z.string().min(1).optional(),
  projectName: z.string().min(1).optional(),
  related_files: z.array(z.string().min(1)).optional()
}).refine((value) => !!value.projectId || !!value.rootPath, {
  message: 'projectId or rootPath is required'
});

export function createAddMemoryTool(service: MemoryEntryService) {
  return {
    name: 'add_memory',
    schema: addMemoryInputSchema,
    execute: (input: z.infer<typeof addMemoryInputSchema>) => {
      const { related_files, ...rest } = input;
      return service.createMemoryEntry({
        ...rest,
        relatedFiles: related_files
      } as any);
    }
  };
}
