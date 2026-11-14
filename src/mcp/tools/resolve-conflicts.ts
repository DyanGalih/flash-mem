import { z } from 'zod';
import { WorkspaceManager } from "../WorkspaceManager";

const ResolveConflictsInputSchema = z.object({
  project_path: z.string().min(1),
});

export function createResolveConflictsTool(manager: WorkspaceManager) {
  return {
    name: 'resolve_conflicts',
    description: 'Find knowledge objects with conflicts_with relationships',
    schema: ResolveConflictsInputSchema,
    responseFormat: 'toon' as const,
    execute: (input: any) => {
      const validated = ResolveConflictsInputSchema.parse(input);
      const bundle = manager.getBundle(validated.project_path);
      const repo = (bundle as any).knowledgeRelationshipRepo;

      const objects = (bundle as any).knowledgeObjectService.listByProject(bundle.project.id);
      const conflicts = [];

      for (const obj of objects) {
        const rels = repo.listForSource(obj.id);
        const conflicting = rels.filter((r: any) => r.relType === 'conflicts_with');
        for (const rel of conflicting) {
          const target = (bundle as any).knowledgeObjectService.get(rel.targetId);
          if (target) {
            conflicts.push({ source: obj, target });
          }
        }
      }

      return { conflicts };
    }
  };
}