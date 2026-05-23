import { z } from 'zod';

export const SynthesisResultSchema = z.object({
  featureId: z.string(),
  context: z.string(),
  architectureConstraints: z.array(z.string()),
  securityConstraints: z.array(z.string()),
  decisions: z.array(z.string()),
  lessons: z.array(z.string()),
  tokenEstimate: z.number().optional(),
});

export type SynthesisResult = z.infer<typeof SynthesisResultSchema>;
