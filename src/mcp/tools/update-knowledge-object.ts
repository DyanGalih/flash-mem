import { z } from 'zod';
import { WorkspaceManager } from "../WorkspaceManager";

const UpdateKnowledgeObjectInputSchema = z.object({
  project_path: z.string().min(1),
  id: z.string().min(1),
  title: z.string().optional(),
  content: z.string().optional(),
  knowledge_type: z.string().optional(),
  summary: z.string().nullable().optional(),
  authority_level: z.string().optional(),
  confidence: z.number().int().min(0).max(100).nullable().optional(),
  change_reason: z.string().min(1),
});

export function createUpdateKnowledgeObjectTool(manager: WorkspaceManager) {
  return {
    name: 'update_knowledge_object',
    description: 'Update a knowledge object with provenance tracking',
    schema: UpdateKnowledgeObjectInputSchema,
    responseFormat: 'json' as const,
    execute: (input: any) => {
      const validated = UpdateKnowledgeObjectInputSchema.parse(input);
      const bundle = manager.getBundle(validated.project_path);
      const service = (bundle as any).knowledgeObjectService;

      const updated = service.update(
        validated.id,
        {
          title: validated.title,
          content: validated.content,
          knowledgeType: validated.knowledge_type,
          summary: validated.summary,
          authorityLevel: validated.authority_level,
          confidence: validated.confidence,
        },
        validated.change_reason
      );

      return { success: updated !== null, object: updated };
    }
  };
}