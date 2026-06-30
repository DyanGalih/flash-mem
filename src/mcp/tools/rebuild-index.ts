import { z } from 'zod';
import { WorkspaceIndexingService } from '../../application/services/WorkspaceIndexingService';
import { WorkspaceManager } from "../WorkspaceManager";

export const rebuildIndexInputSchema = z.object({
    project_path: z.string().min(1).describe("Absolute path to the workspace root"),
    workspaceRoot: z.string().min(1).default('.')
});

export function createRebuildIndexTool(manager: WorkspaceManager) {
  return {
    name: 'rebuild_index',
    description: 'Rebuild the workspace memory index from source documents.',
    schema: rebuildIndexInputSchema,
    execute: (input: z.infer<typeof rebuildIndexInputSchema>) => {
      const service = manager.getBundle(input.project_path).workspaceIndexingService;
      return service.rebuildIndex(input.workspaceRoot);
    }
  };
}
