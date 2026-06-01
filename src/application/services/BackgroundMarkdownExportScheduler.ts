import { PathSanitizer } from '../../infrastructure/safety/PathSanitizer';

export const DEFAULT_BACKGROUND_MARKDOWN_EXPORT_DELAY_MS = 100;
export const BACKGROUND_MARKDOWN_EXPORT_DELAY_ENV = 'FLASH_MEM_BACKGROUND_EXPORT_DELAY_MS';

export function resolveBackgroundMarkdownExportDelayMs(env: NodeJS.ProcessEnv = process.env): number {
  const rawValue = env[BACKGROUND_MARKDOWN_EXPORT_DELAY_ENV];
  if (!rawValue) {
    return DEFAULT_BACKGROUND_MARKDOWN_EXPORT_DELAY_MS;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    return DEFAULT_BACKGROUND_MARKDOWN_EXPORT_DELAY_MS;
  }

  return parsedValue;
}

export interface BackgroundMarkdownExportLauncher {
  launch(workspaceRoot: string): void;
}

export class BackgroundMarkdownExportScheduler {
  private readonly pendingTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly launcher: BackgroundMarkdownExportLauncher,
    private readonly delayMs = DEFAULT_BACKGROUND_MARKDOWN_EXPORT_DELAY_MS
  ) { }

  public schedule(workspaceRoot: string): void {
    const resolvedWorkspaceRoot = PathSanitizer.resolveRoot(workspaceRoot);

    const existingTimer = this.pendingTimers.get(resolvedWorkspaceRoot);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.pendingTimers.delete(resolvedWorkspaceRoot);

      try {
        this.launcher.launch(resolvedWorkspaceRoot);
      } catch (error: any) {
        const message = error?.message ?? 'Unknown error';
        process.stderr.write(`Warning: background export launch failed for "${resolvedWorkspaceRoot}": ${message}\n`);
      }
    }, this.delayMs);

    if (typeof timer.unref === 'function') {
      timer.unref();
    }

    this.pendingTimers.set(resolvedWorkspaceRoot, timer);
  }
}