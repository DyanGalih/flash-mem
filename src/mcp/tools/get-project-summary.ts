import { z } from 'zod';
import { ProjectSummaryService } from '../../application/services/ProjectSummaryService';

export const getProjectSummaryInputSchema = z.object({
  projectId: z.string().min(1)
});

export function createGetProjectSummaryTool(service: ProjectSummaryService) {
  return {
    name: 'get_project_summary',
    schema: getProjectSummaryInputSchema,
    execute: (input: z.infer<typeof getProjectSummaryInputSchema>) => service.getProjectSummary(input.projectId)
  };
}
