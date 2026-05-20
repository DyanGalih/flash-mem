import { z } from 'zod';
import { IndexingService } from '../../application/services/IndexingService';

export const indexingInputSchema = z.object({
  projectId: z.string().min(1),
  sources: z.array(z.object({
    path: z.string().min(1),
    checksum: z.string().min(1),
    title: z.string().min(1),
    content: z.string().min(1),
    entryType: z.string().min(1),
    tags: z.array(z.string().min(1)).optional()
  })).default([])
});

export function createIndexingTool(service: IndexingService) {
  return {
    name: 'memory.index',
    schema: indexingInputSchema,
    execute: (input: z.infer<typeof indexingInputSchema>) => service.indexSources(input.projectId, input.sources)
  };
}
