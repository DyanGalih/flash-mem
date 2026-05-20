import * as fs from 'fs-extra';
import { ExportSafetyGuard } from '../safety/ExportSafetyGuard';

export interface MarkdownExportDocument {
  fileName: string;
  content: string;
}

export class MarkdownExportWriter {
  constructor(private readonly safetyGuard = new ExportSafetyGuard()) {}

  public async write(workspaceRoot: string, documents: MarkdownExportDocument[]): Promise<string> {
    const exportRoot = await this.safetyGuard.ensureExportDirectory(workspaceRoot);

    await Promise.all(documents.map(async (document) => {
      const filePath = this.safetyGuard.resolveExportFilePath(workspaceRoot, this.safetyGuard.sanitizeFileName(document.fileName));
      const content = this.safetyGuard.redactSensitiveValues(document.content);
      await fs.writeFile(filePath, content, 'utf8');
    }));

    return exportRoot;
  }
}
