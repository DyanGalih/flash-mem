import * as fs from 'fs-extra';
import { spawn } from 'node:child_process';
import * as path from 'path';
import { BackgroundMarkdownExportLauncher } from '../../application/services/BackgroundMarkdownExportScheduler';

export interface DetachedMarkdownExportLauncherOptions {
  enabled?: boolean;
}

export class DetachedMarkdownExportLauncher implements BackgroundMarkdownExportLauncher {
  constructor(private readonly options: DetachedMarkdownExportLauncherOptions = {}) { }

  public launch(workspaceRoot: string): void {
    if (this.options.enabled === false) {
      return;
    }

    const cliEntryPoint = path.resolve(__dirname, '../cli/index.js');
    if (!fs.existsSync(cliEntryPoint)) {
      process.stderr.write(`Warning: background export skipped because CLI entrypoint was not found at "${cliEntryPoint}"\n`);
      return;
    }

    const child = spawn(process.execPath, [cliEntryPoint, 'export', 'markdown', workspaceRoot, '--json'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });

    child.unref();
  }
}