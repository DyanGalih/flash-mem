import { z } from 'zod';
import { MemoryEntryInputSchema } from '../../domain/entities/MemoryEntry';
import { MemoryEntryService } from '../../application/services/MemoryEntryService';

export const createMemoryEntryInputSchema = MemoryEntryInputSchema;
export const updateMemoryEntryInputSchema = MemoryEntryInputSchema.partial().extend({
  tags: z.array(z.string().min(1)).optional(),
  relationships: z.array(z.object({
    targetEntryId: z.string().min(1),
    relationshipType: z.string().min(1)
  })).optional()
});

export function createMemoryEntryTool(service: MemoryEntryService) {
  return {
    name: 'memory-entry.create',
    schema: createMemoryEntryInputSchema,
    execute: (input: z.infer<typeof createMemoryEntryInputSchema>) => service.createMemoryEntry(input)
  };
}

export function updateMemoryEntryTool(service: MemoryEntryService) {
  return {
    name: 'memory-entry.update',
    schema: updateMemoryEntryInputSchema,
    execute: (input: z.infer<typeof updateMemoryEntryInputSchema> & { entryId: string }) => service.updateMemoryEntry(input.entryId, input)
  };
}
