import { z } from 'zod';
import { RelevantContextService } from '../../application/services/RelevantContextService';

export const getRelevantContextInputSchema = z.object({
  projectId: z.string().trim().min(1),
  query: z.string().trim().min(1),
  limit: z.number().int().positive().max(20).optional()
});

export function createGetRelevantContextTool(service: RelevantContextService) {
  return {
    name: 'get_relevant_context',
    schema: getRelevantContextInputSchema,
    execute: (input: z.infer<typeof getRelevantContextInputSchema>) =>
      service.getRelevantContext(input.projectId, input.query, input.limit ?? 5)
  };
}
