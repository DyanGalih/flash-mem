import { z } from 'zod';
import { MemorySearchService } from '../../application/services/MemorySearchService';

export const searchMemoryInputSchema = z.object({
  projectId: z.string().optional(),
  query: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string().min(1)).optional(),
  tagOperator: z.enum(['AND', 'OR']).optional(),
  minConfidence: z.number().int().min(0).max(100).nullable().optional(),
  source: z.string().optional(),
  includeContent: z.boolean().optional(),
  limit: z.number().int().positive().max(100).optional()
});

export function createSearchMemoryTool(service: MemorySearchService) {
  return {
    name: 'search_memory',
    description: 'Search memory entries in the active project by keyword and filters.',
    schema: searchMemoryInputSchema,
    execute: (input: z.infer<typeof searchMemoryInputSchema>) => service.search(input)
  };
}
