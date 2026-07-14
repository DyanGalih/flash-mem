import { z } from 'zod';
import { WorkspaceManager } from "../WorkspaceManager";

export const searchMemoryInputSchema = z.object({
    project_path: z.string().min(1).describe("Absolute path to the workspace root"),
  query: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string().min(1)).optional(),
  tagOperator: z.enum(['AND', 'OR']).optional(),
  minConfidence: z.number().int().min(0).max(100).nullable().optional(),
  source: z.string().optional(),
  includeContent: z.boolean().optional(),
  limit: z.number().int().positive().max(100).optional()
});

export function createSearchMemoryTool(manager: WorkspaceManager) {
  return {
    name: 'search_memory',
    description: 'Search memory entries in the active project by keyword and filters. Returns TOON text.',
    schema: searchMemoryInputSchema,
    responseFormat: 'toon' as const,
    execute: (input: z.infer<typeof searchMemoryInputSchema>) => {
      const bundle = manager.getBundle(input.project_path);
      return bundle.memorySearchService.search({
        ...input,
        projectId: bundle.project.id
      });
    }
  };
}
