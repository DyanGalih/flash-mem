import { z } from 'zod';
import { ProjectSummaryService } from '../../application/services/ProjectSummaryService';
import { ProjectSummaryInputSchema } from '../../domain/entities/ProjectSummary';

export const updateProjectSummaryInputSchema = ProjectSummaryInputSchema;

export interface UpdateProjectSummaryToolOptions {
  canWriteProjectSummary?: boolean;
}

export function createUpdateProjectSummaryTool(
  service: ProjectSummaryService,
  options: UpdateProjectSummaryToolOptions = {}
) {
  return {
    name: 'update_project_summary',
    schema: updateProjectSummaryInputSchema,
    execute: (input: z.infer<typeof updateProjectSummaryInputSchema>) => {
      if (!options.canWriteProjectSummary) {
        throw new Error('Authorization error: project summary updates are disabled for this MCP server instance.');
      }

      return service.updateProjectSummary(input);
    }
  };
}
