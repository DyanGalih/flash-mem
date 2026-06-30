import { z } from 'zod';
import { ProjectSummaryService } from '../../application/services/ProjectSummaryService';
import { WorkspaceManager } from "../WorkspaceManager";

export const getProjectSummaryInputSchema = z.object({
    project_path: z.string().min(1).describe("Absolute path to the workspace root")
});

export function createGetProjectSummaryTool(manager: WorkspaceManager) {
  return {
    name: 'get_project_summary',
    description: 'Get the current project summary for the active workspace. Returns TOON text.',
    schema: getProjectSummaryInputSchema,
    responseFormat: 'toon' as const,
    execute: (input: any) => {
      const service = manager.getBundle(input.project_path).projectSummaryService;
      return service.getProjectSummary();
    }
  };
}
