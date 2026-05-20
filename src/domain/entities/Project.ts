import { z } from 'zod';

export const ProjectSchema = z.object({
  id: z.string().min(1),
  rootPath: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative()
});

export type Project = z.infer<typeof ProjectSchema>;
