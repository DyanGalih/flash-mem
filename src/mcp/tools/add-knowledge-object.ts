import { WorkspaceManager } from '../WorkspaceManager';
import { z } from 'zod';

const AddKnowledgeObjectInputSchema = z.object({
  project_path: z.string().min(1),
  knowledge_type: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  summary: z.string().optional(),
  authority_level: z.string().optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  tags: z.array(z.string()).optional(),
});

export function createAddKnowledgeObjectTool(manager: WorkspaceManager) {
  return {
    name: 'add_knowledge_object',
    description: 'Create a new typed knowledge object with dedup and secret scanning',
    schema: AddKnowledgeObjectInputSchema,
    responseFormat: 'json' as const,
    execute: async (input: any) => {
      const validated = AddKnowledgeObjectInputSchema.parse(input);
      const bundle = manager.getBundle(validated.project_path);
      const captureOrchestrator = (bundle as any).captureOrchestrator;

      const created = captureOrchestrator.captureSingle({
        projectId: bundle.project.id,
        knowledgeType: validated.knowledge_type,
        title: validated.title,
        content: validated.content,
        summary: validated.summary,
        authorityLevel: (validated.authority_level ?? 'provisional') as any,
        confidence: validated.confidence,
        tags: validated.tags,
      });

      return {
        success: created !== null,
        alreadyExists: created === null,
      };
    }
  };
}