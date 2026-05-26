import { z } from 'zod';
import { WorkspaceIndexingService } from '../../application/services/WorkspaceIndexingService';

export const rebuildIndexInputSchema = z.object({
  workspaceRoot: z.string().min(1).default('.')
});

export function createRebuildIndexTool(service: WorkspaceIndexingService) {
  return {
    name: 'rebuild_index',
    description: 'Rebuild the workspace memory index from source documents.',
    schema: rebuildIndexInputSchema,
    execute: (input: z.infer<typeof rebuildIndexInputSchema>) => service.rebuildIndex(input.workspaceRoot)
  };
}
