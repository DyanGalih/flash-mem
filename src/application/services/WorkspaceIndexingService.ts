import * as fs from 'fs-extra';
import * as path from 'path';
import { createHash } from 'node:crypto';
import { IndexingService, IndexSourceInput } from './IndexingService';
import { IProjectRepository } from '../../domain/repositories/interfaces';
import { PathSanitizer } from '../../infrastructure/safety/PathSanitizer';
import { IndexingInputGuard, SafetyWarning } from '../../infrastructure/safety/IndexingInputGuard';

export interface WorkspaceRebuildResult {
  entryCount: number;
  sourceCount: number;
  sources: string[];
  warnings: SafetyWarning[];
}

export class WorkspaceIndexingService {
  private readonly indexingInputGuard = new IndexingInputGuard();

  constructor(
    private readonly indexingService: IndexingService,
    private readonly projectRepository: IProjectRepository
  ) {}

  public rebuildIndex(workspaceRoot: string): WorkspaceRebuildResult {
    const resolvedRoot = PathSanitizer.resolveRoot(workspaceRoot);
    if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) {
      throw new Error(`Workspace path "${workspaceRoot}" does not exist or is not a directory`);
    }

    const sources = this.collectMarkdownSources(resolvedRoot);
    const projectId = this.ensureProject(resolvedRoot);
    const { results, warnings } = this.indexingService.rebuildIndex(projectId, sources);

    return {
      entryCount: results.length,
      sourceCount: sources.length,
      sources: sources.map((source) => source.path),
      warnings
    };
  }

  private ensureProject(workspaceRoot: string): string {
    const project = this.projectRepository.upsertByRootPath(workspaceRoot, path.basename(workspaceRoot));
    return project.id;
  }

  private collectMarkdownSources(workspaceRoot: string): IndexSourceInput[] {
    const markdownFiles: string[] = [];

    const scan = (currentDir: string): void => {
      for (const item of fs.readdirSync(currentDir)) {
        if (item === '.git' || item === '.flash-mem' || item === 'node_modules') {
          continue;
        }

        const fullPath = path.join(currentDir, item);
        const relativePath = path.relative(workspaceRoot, fullPath);

        let normalizedPath: string;
        try {
          normalizedPath = this.indexingInputGuard.normalizeSourcePath(workspaceRoot, relativePath);
        } catch {
          continue;
        }

        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scan(fullPath);
          continue;
        }

        if (!stat.isFile() || (!item.endsWith('.md') && !item.endsWith('.markdown'))) {
          continue;
        }

        markdownFiles.push(normalizedPath);
      }
    };

    scan(workspaceRoot);

    return markdownFiles.map((relPath) => {
      const fullPath = path.join(workspaceRoot, relPath);
      const content = fs.readFileSync(fullPath, 'utf8');
      const checksum = createHash('sha256').update(content).digest('hex');

      const lines = content.split('\n');
      let title = path.basename(relPath, path.extname(relPath));
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('# ')) {
          title = trimmed.slice(2).trim();
          break;
        }
      }

      let category = 'project';
      if (relPath.includes('decision')) category = 'decision';
      else if (relPath.includes('pattern')) category = 'pattern';
      else if (relPath.includes('bug') || relPath.includes('fix')) category = 'bug_fix';
      else if (relPath.includes('security')) category = 'security_note';
      else if (relPath.includes('convention') || relPath.includes('style')) category = 'convention';

      return {
        path: relPath,
        checksum,
        title,
        content,
        category,
        source: 'file',
        tags: [category]
      };
    });
  }
}
