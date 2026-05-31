import { z } from 'zod';
import { ProjectSummaryService } from '../../application/services/ProjectSummaryService';

export const getProjectSummaryInputSchema = z.object({});

export function createGetProjectSummaryTool(service: ProjectSummaryService) {
  return {
    name: 'get_project_summary',
    description: 'Get the current project summary for the active workspace. Returns TOON text.',
    schema: getProjectSummaryInputSchema,
    responseFormat: 'toon' as const,
    execute: () => service.getProjectSummary()
  };
}
