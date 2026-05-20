import { z } from 'zod';

export const IndexingRunSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  startedAt: z.number().int().nonnegative(),
  finishedAt: z.number().int().nonnegative().nullable().optional(),
  status: z.enum(['running', 'success', 'failed', 'partial']),
  sourceCount: z.number().int().nonnegative(),
  entryCount: z.number().int().nonnegative(),
  errorMessage: z.string().nullable().optional(),
  schemaVersion: z.string().min(1)
});

export type IndexingRun = z.infer<typeof IndexingRunSchema>;
