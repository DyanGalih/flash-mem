import { z } from 'zod';
import * as path from 'path';
import { MarkdownRestoreService } from '../../application/services/MarkdownRestoreService';
import { PathSanitizer } from '../../infrastructure/safety/PathSanitizer';
import { WorkspaceManager } from "../WorkspaceManager";

export const restoreBackupInputSchema = z.object({
    project_path: z.string().min(1).describe("Absolute path to the workspace root"),
    workspaceRoot: z.string().min(1).default('.'),
  backupDirectory: z.string().optional().describe('Absolute or relative path to the backup directory. Defaults to .flash-mem/exports inside workspaceRoot.')
});

export function createRestoreBackupTool(manager: WorkspaceManager) {
  return {
    name: 'restore_backup',
    description: 'Restore memory entries from markdown backup files.',
    schema: restoreBackupInputSchema,
    execute: (input: z.infer<typeof restoreBackupInputSchema>) => {
      const service = manager.getBundle(input.project_path).markdownRestoreService;
          const backupDir = input.backupDirectory 
            ? path.resolve(process.cwd(), input.backupDirectory)
            : PathSanitizer.sanitizeSubPath(path.resolve(process.cwd(), input.workspaceRoot), '.flash-mem/exports');
            
          return service.restore(backupDir, input.workspaceRoot);
        }
  };
}
