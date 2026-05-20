import { z } from 'zod';

export const ProjectMetadataSchema = z.object({
  name: z.string()
    .min(1, "Project name cannot be empty")
    .regex(/^[a-zA-Z0-9-_]+$/, "Project name must contain only alphanumeric characters, hyphens, or underscores"),
  initializedAt: z.string().datetime("initializedAt must be a valid ISO 8601 date string"),
  schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/, "schemaVersion must be a valid semver string")
});

export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;
