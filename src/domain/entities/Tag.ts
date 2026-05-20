import { z } from 'zod';

export const TagSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.number().int().nonnegative()
});

export type Tag = z.infer<typeof TagSchema>;
