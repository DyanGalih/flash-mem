import { z } from 'zod';
import { RelevantContextService } from '../../application/services/RelevantContextService';
import { WorkspaceManager } from "../WorkspaceManager";

export const getRelevantContextInputSchema = z.object({
    project_path: z.string().min(1).describe("Absolute path to the workspace root"),
    projectId: z.string().trim().min(1),
  query: z.string().trim().min(1),
  limit: z.number().int().positive().max(20).optional()
});

export function createGetRelevantContextTool(manager: WorkspaceManager) {
  return {
    name: 'get_relevant_context',
    description: 'Fetch the most relevant context snippets for a project query. Returns TOON text.',
    schema: getRelevantContextInputSchema,
    responseFormat: 'toon' as const,
    execute: (input: z.infer<typeof getRelevantContextInputSchema>) => {
      const service = manager.getBundle(input.project_path).relevantContextService;
      return service.getRelevantContext(input.projectId, input.query, input.limit ?? 5);
    }
  };
}
