import { createHash } from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ExportSafetyGuard } from '../safety/ExportSafetyGuard';

export interface MarkdownExportDocument {
  fileName: string;
  content: string;
}

export interface MarkdownExportWriteResult {
  exportRoot: string;
  written: number;
  skipped: number;
}

export class MarkdownExportWriter {
  constructor(private readonly safetyGuard = new ExportSafetyGuard()) { }

  public async write(workspaceRoot: string, documents: MarkdownExportDocument[]): Promise<MarkdownExportWriteResult> {
    const exportRoot = await this.safetyGuard.ensureExportDirectory(workspaceRoot);
    let written = 0;
    let skipped = 0;

    for (const document of documents) {
      const filePath = this.safetyGuard.resolveExportFilePath(workspaceRoot, this.safetyGuard.sanitizeFileName(document.fileName));
      const content = this.safetyGuard.redactSensitiveValues(document.content);
      const nextHash = this.hashContent(content);

      if (await fs.pathExists(filePath)) {
        const existingContent = await fs.readFile(filePath, 'utf8');
        const existingHash = this.hashContent(existingContent);
        if (existingHash === nextHash) {
          skipped += 1;
          continue;
        }
      }

      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, content, 'utf8');
      written += 1;
    }

    return {
      exportRoot,
      written,
      skipped
    };
  }

  private hashContent(content: string): string {
    const normalized = content
      .replace(/^generated_at: ".*"$/m, 'generated_at: "<normalized>"')
      .replace(/^- Generated at: .*$/m, '- Generated at: <normalized>');
    return createHash('sha256').update(normalized).digest('hex');
  }
}
