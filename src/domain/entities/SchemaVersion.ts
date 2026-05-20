import { z } from 'zod';

export const SchemaVersionSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
  updatedAt: z.number().int().nonnegative()
});

export type SchemaVersion = z.infer<typeof SchemaVersionSchema>;
