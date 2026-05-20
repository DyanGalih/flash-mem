import { z } from 'zod';

export const SourceDocumentSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  path: z.string().min(1),
  checksum: z.string().min(1),
  lastIndexedAt: z.number().int().nonnegative().nullable().optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative()
});

export type SourceDocument = z.infer<typeof SourceDocumentSchema>;
