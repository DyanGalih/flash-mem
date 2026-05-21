import { z } from 'zod';
import { MemoryEntryService } from '../../application/services/MemoryEntryService';

export const deleteMemoryInputSchema = z.object({
  id: z.string().min(1)
});

export function createDeleteMemoryTool(service: MemoryEntryService) {
  return {
    name: 'delete_memory',
    schema: deleteMemoryInputSchema,
    execute: (input: z.infer<typeof deleteMemoryInputSchema>) => {
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
