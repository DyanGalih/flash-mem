import { z } from 'zod';

export const ExportSectionKeySchema = z.enum([
  'project-summary',
  'decisions',
  'patterns',
  'bug-fixes',
  'security-notes',
  'conventions'
]);

export type ExportSectionKey = z.infer<typeof ExportSectionKeySchema>;

export const ExportSectionMetadataSchema = z.object({
  key: ExportSectionKeySchema,
  fileName: z.string().min(1),
  title: z.string().min(1),
  entryCount: z.number().int().nonnegative()
});

export type ExportSectionMetadata = z.infer<typeof ExportSectionMetadataSchema>;

export const ExportManifestSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  rootPath: z.string().min(1),
  exportRoot: z.string().min(1),
  generatedAt: z.number().int().nonnegative(),
  totalEntries: z.number().int().nonnegative(),
  sections: z.array(ExportSectionMetadataSchema).min(1)
});

export type ExportManifest = z.infer<typeof ExportManifestSchema>;
