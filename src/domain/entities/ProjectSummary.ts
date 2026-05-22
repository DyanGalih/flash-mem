import { z } from 'zod';

export const PROJECT_SUMMARY_FIELD_MAX_LENGTH = 1000;
export const PROJECT_SUMMARY_TOTAL_MAX_LENGTH = 4000;

export const ProjectSummaryInputSchema = z.object({
  projectName: z.string().trim().min(1).max(PROJECT_SUMMARY_FIELD_MAX_LENGTH),
  purpose: z.string().trim().min(1).max(PROJECT_SUMMARY_FIELD_MAX_LENGTH),
  techStack: z.string().trim().min(1).max(PROJECT_SUMMARY_FIELD_MAX_LENGTH),
  architectureStyle: z.string().trim().min(1).max(PROJECT_SUMMARY_FIELD_MAX_LENGTH),
  importantConventions: z.string().trim().min(1).max(PROJECT_SUMMARY_FIELD_MAX_LENGTH),
  knownConstraints: z.string().trim().min(1).max(PROJECT_SUMMARY_FIELD_MAX_LENGTH),
  securitySensitiveAreas: z.string().trim().min(1).max(PROJECT_SUMMARY_FIELD_MAX_LENGTH)
});

export type ProjectSummaryInput = z.infer<typeof ProjectSummaryInputSchema>;

export const ProjectSummarySchema = ProjectSummaryInputSchema.extend({
  projectId: z.string().min(1),
  lastUpdatedAt: z.number().int().nonnegative()
});

export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;
