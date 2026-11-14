import { z } from 'zod';
import { WorkspaceManager } from "../WorkspaceManager";

const ValidateKnowledgeInputSchema = z.object({
  project_path: z.string().min(1),
});

export function createValidateKnowledgeTool(manager: WorkspaceManager) {
  return {
    name: 'validate_knowledge',
    description: 'Run freshness and authority checks on knowledge objects',
    schema: ValidateKnowledgeInputSchema,
    responseFormat: 'json' as const,
    execute: (input: any) => {
      const validated = ValidateKnowledgeInputSchema.parse(input);
      const bundle = manager.getBundle(validated.project_path);
      const service = (bundle as any).knowledgeObjectService;

      const objects = service.listByProject(bundle.project.id);
      const stale: string[] = [];
      const deprecated: string[] = [];

      for (const obj of objects) {
        if (obj.freshnessStatus === 'stale') stale.push(obj.id);
        if (obj.authorityLevel === 'deprecated') deprecated.push(obj.id);
      }

      return {
        total: objects.length,
        staleCount: stale.length,
        deprecatedCount: deprecated.length,
        staleIds: stale,
        deprecatedIds: deprecated,
        valid: stale.length === 0 && deprecated.length === 0,
      };
    }
  };
}