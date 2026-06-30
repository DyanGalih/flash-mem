import { z } from 'zod';
import { MarkdownExportService } from '../../application/services/MarkdownExportService';
import { WorkspaceManager } from "../WorkspaceManager";

export const exportMarkdownInputSchema = z.object({
    project_path: z.string().min(1).describe("Absolute path to the workspace root"),
    workspaceRoot: z.string().min(1).default('.')
});

export function createExportMarkdownTool(manager: WorkspaceManager) {
  return {
    name: 'export_markdown',
    description: 'Export the workspace memory state to markdown backup files.',
    schema: exportMarkdownInputSchema,
    execute: (input: z.infer<typeof exportMarkdownInputSchema>) => {
      const service = manager.getBundle(input.project_path).markdownExportService;
      return service.exportWorkspace(input.workspaceRoot);
    }
  };
}
