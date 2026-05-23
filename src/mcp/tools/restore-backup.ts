import { z } from 'zod';
import * as path from 'path';
import { MarkdownRestoreService } from '../../application/services/MarkdownRestoreService';
import { PathSanitizer } from '../../infrastructure/safety/PathSanitizer';

export const restoreBackupInputSchema = z.object({
  workspaceRoot: z.string().min(1).default('.'),
  backupDirectory: z.string().optional().describe('Absolute or relative path to the backup directory. Defaults to .flash-mem/exports inside workspaceRoot.')
});

export function createRestoreBackupTool(service: MarkdownRestoreService) {
  return {
    name: 'restore_backup',
    schema: restoreBackupInputSchema,
    execute: (input: z.infer<typeof restoreBackupInputSchema>) => {
      const backupDir = input.backupDirectory 
        ? path.resolve(process.cwd(), input.backupDirectory)
        : PathSanitizer.sanitizeSubPath(path.resolve(process.cwd(), input.workspaceRoot), '.flash-mem/exports');
        
      return service.restore(backupDir, input.workspaceRoot);
    }
  };
}
