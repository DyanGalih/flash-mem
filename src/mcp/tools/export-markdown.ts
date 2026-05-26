import { z } from 'zod';
import { MarkdownExportService } from '../../application/services/MarkdownExportService';

export const exportMarkdownInputSchema = z.object({
  workspaceRoot: z.string().min(1).default('.')
});

export function createExportMarkdownTool(service: MarkdownExportService) {
  return {
    name: 'export_markdown',
    description: 'Export the workspace memory state to markdown backup files.',
    schema: exportMarkdownInputSchema,
    execute: (input: z.infer<typeof exportMarkdownInputSchema>) => service.exportWorkspace(input.workspaceRoot)
  };
}
