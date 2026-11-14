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

      // Hybrid search when query provided, no legacy-only filters requested, and knowledge objects exist; fallback to legacy otherwise
      const hasLegacyFilters = Boolean(input.category || (input.tags && input.tags.length > 0) || input.tagOperator || input.source);
      const hybrid = (bundle as any).hybridSearchService;
      if (!hasLegacyFilters && hybrid && input.query) {
        try {
          const knowledgeResults = hybrid.search({
            query: input.query,
            projectId: bundle.project.id,
            minConfidence: input.minConfidence ?? null,
            includeContent: input.includeContent,
            limit: input.limit,
          });

          if (knowledgeResults.results.length > 0) {
            return {
              results: knowledgeResults.results,
              totalCount: knowledgeResults.totalCount,
              hasMore: knowledgeResults.hasMore,
            };
          }
        } catch {
          // Fall back to legacy search on hybrid failure
        }
      }

      return bundle.memorySearchService.search({
        ...input,
        projectId: bundle.project.id
      });
    }
  };
}