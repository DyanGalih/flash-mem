import { z } from 'zod';
import { IndexingService } from '../../application/services/IndexingService';
import { WorkspaceManager } from "../WorkspaceManager";

export const indexingInputSchema = z.object({
    project_path: z.string().min(1).describe("Absolute path to the workspace root"),
    projectId: z.string().min(1),
  sources: z.array(z.object({
    path: z.string().min(1),
    checksum: z.string().min(1),
    title: z.string().min(1),
    content: z.string().min(1),
    category: z.string().min(1),
    tags: z.array(z.string().min(1)).optional()
  })).default([])
});

export function createIndexingTool(manager: WorkspaceManager) {
  return {
    name: 'memory_index',
    description: 'Index source documents into project memory.',
    schema: indexingInputSchema,
    execute: (input: z.infer<typeof indexingInputSchema>) => {
      const service = manager.getBundle(input.project_path).indexingService;
      return service.indexSources(input.projectId, input.sources);
    }
  };
}
