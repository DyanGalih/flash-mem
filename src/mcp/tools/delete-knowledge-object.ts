import { z } from 'zod';
import { WorkspaceManager } from "../WorkspaceManager";

const DeleteKnowledgeObjectInputSchema = z.object({
  project_path: z.string().min(1),
  id: z.string().min(1),
});

export function createDeleteKnowledgeObjectTool(manager: WorkspaceManager) {
  return {
    name: 'delete_knowledge_object',
    description: 'Soft delete a knowledge object',
    schema: DeleteKnowledgeObjectInputSchema,
    responseFormat: 'json' as const,
    execute: (input: any) => {
      const validated = DeleteKnowledgeObjectInputSchema.parse(input);
      const bundle = manager.getBundle(validated.project_path);
      const service = (bundle as any).knowledgeObjectService;

      const deleted = service.softDelete(validated.id);
      return { success: deleted };
    }
  };
}