import { z } from 'zod';
import { ProjectSummaryService } from '../../application/services/ProjectSummaryService';
import { ProjectSummaryInputSchema } from '../../domain/entities/ProjectSummary';
import { WorkspaceManager } from "../WorkspaceManager";

export const updateProjectSummaryInputSchema = ProjectSummaryInputSchema.extend({
  project_path: z.string().min(1).describe("Absolute path to the workspace root")
});

export function createUpdateProjectSummaryTool(manager: WorkspaceManager) {
  return {
    name: 'update_project_summary',
    description: 'Update the current project summary for the active workspace. If the project summary already exists, you MUST ask the user for permission before calling this tool to update it.',
    schema: updateProjectSummaryInputSchema,
    execute: (input: z.infer<typeof updateProjectSummaryInputSchema>) => {
      const service = manager.getBundle(input.project_path).projectSummaryService;
      return service.updateProjectSummary(input);
    }
  };
}
