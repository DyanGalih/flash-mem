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
    description: 'Fetch the most relevant context snippets for a project query.',
    schema: getRelevantContextInputSchema,
    execute: (input: z.infer<typeof getRelevantContextInputSchema>) =>
      service.getRelevantContext(input.projectId, input.query, input.limit ?? 5)
  };
}
