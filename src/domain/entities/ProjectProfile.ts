import { z } from 'zod';

export const ProjectProfileSchema = z.object({
  language: z.string(),
  framework: z.string(),
  architectureStyle: z.string(),
  projectConventions: z.array(z.string()),
  sharedMemoryEligible: z.boolean().default(false),
});

export type ProjectProfile = z.infer<typeof ProjectProfileSchema>;
