import { z } from 'zod';
import { WorkspaceManager } from "../WorkspaceManager";

const GetKnowledgeObjectInputSchema = z.object({
  project_path: z.string().min(1),
  id: z.string().min(1),
});

export function createGetKnowledgeObjectTool(manager: WorkspaceManager) {
  return {
    name: 'get_knowledge_object',
    description: 'Get a single knowledge object by ID',
    schema: GetKnowledgeObjectInputSchema,
    responseFormat: 'toon' as const,
    execute: (input: any) => {
      const validated = GetKnowledgeObjectInputSchema.parse(input);
      const bundle = manager.getBundle(validated.project_path);
      const service = (bundle as any).knowledgeObjectService;
      return service.get(validated.id);
    }
  };
}