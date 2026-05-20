import { z } from 'zod';
import { MemorySearchService } from '../../application/services/MemorySearchService';

export const memorySearchInputSchema = z.object({
  projectId: z.string().min(1),
  query: z.string().min(1),
  limit: z.number().int().positive().max(100).optional()
});

export function createMemorySearchTool(service: MemorySearchService) {
  return {
    name: 'memory.search',
    schema: memorySearchInputSchema,
    execute: (input: z.infer<typeof memorySearchInputSchema>) => service.search(input.projectId, input.query, input.limit ?? 20)
  };
}
