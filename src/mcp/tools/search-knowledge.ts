import { z } from 'zod';
import { WorkspaceManager } from "../WorkspaceManager";

const SearchKnowledgeInputSchema = z.object({
  project_path: z.string().min(1),
  query: z.string().min(1),
  knowledge_type: z.string().optional(),
  min_confidence: z.number().int().min(0).max(100).optional(),
  limit: z.number().int().positive().max(100).optional(),
  include_content: z.boolean().optional(),
});

export function createSearchKnowledgeTool(manager: WorkspaceManager) {
  return {
    name: 'search_knowledge',
    description: 'Search knowledge objects with hybrid FTS5 + lexical search, authority-aware ranking, and graph walk expansion',
    schema: SearchKnowledgeInputSchema,
    responseFormat: 'toon' as const,
    execute: (input: any) => {
      const validated = SearchKnowledgeInputSchema.parse(input);
      const bundle = manager.getBundle(validated.project_path);
      const service = (bundle as any).hybridSearchService;
      
      const results = service.search({
        query: validated.query,
        projectId: bundle.project.id,
        knowledgeType: validated.knowledge_type,
        minConfidence: validated.min_confidence ?? null,
        limit: validated.limit,
        includeContent: validated.include_content,
      });

      return results;
    }
  };
}