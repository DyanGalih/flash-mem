import { z } from 'zod';
import { MemorySearchService } from '../../application/services/MemorySearchService';

export const searchMemoryInputSchema = z.object({
  projectId: z.string().min(1),
  query: z.string().min(1),
  limit: z.number().int().positive().max(100).optional()
});

export function createSearchMemoryTool(service: MemorySearchService) {
  return {
    name: 'search_memory',
    schema: searchMemoryInputSchema,
    execute: (input: z.infer<typeof searchMemoryInputSchema>) => service.search(input.projectId, input.query, input.limit ?? 20)
  };
}
