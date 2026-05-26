import { z } from 'zod';
import { ProjectSummaryService } from '../../application/services/ProjectSummaryService';

export const getProjectSummaryInputSchema = z.object({});

export function createGetProjectSummaryTool(service: ProjectSummaryService) {
  return {
    name: 'get_project_summary',
    description: 'Get the current project summary for the active workspace.',
    schema: getProjectSummaryInputSchema,
    execute: () => service.getProjectSummary()
  };
}
