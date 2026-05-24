import * as fs from 'fs-extra';
import * as path from 'path';
import { TokenBudgetService } from './TokenBudgetService';

export interface DocSummaryItem {
  path: string;
  title: string;
  summary: string;
}

export interface DocSynthesisOptions {
  workspaceRoot?: string;
  featurePath?: string;
  limit?: number;
}

export class DocSynthesisService {
  constructor(private readonly tokenBudgetService: TokenBudgetService = new TokenBudgetService()) {}

  public async retrieveAndSynthesizeDocs(featureId: string, workspaceRoot = process.cwd()): Promise<string> {
    const synthesis = this.buildDocSynthesis({
      workspaceRoot,
      featurePath: featureId
    });
    return synthesis.markdown;
  }

  public buildDocSynthesis(options: DocSynthesisOptions): {
    markdown: string;
    sourceFiles: string[];
    tokenEstimate: number;
    items: DocSummaryItem[];
  } {
    const workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd());
    const featurePath = options.featurePath ? path.resolve(workspaceRoot, options.featurePath) : workspaceRoot;
    const limit = options.limit ?? 8;
    const candidates = this.collectMarkdownFiles(workspaceRoot, featurePath);
    const items = candidates.slice(0, limit).map((filePath) => this.summarizeFile(workspaceRoot, filePath));
    const markdown = this.renderMarkdown(workspaceRoot, featurePath, items);

    return {
      markdown,
      sourceFiles: items.map((item) => item.path),
      tokenEstimate: this.tokenBudgetService.estimateTokens(markdown),
      items
    };
  }

  private collectMarkdownFiles(workspaceRoot: string, featurePath: string): string[] {
    const collected = new Set<string>();
    const roots = [
      featurePath,
      path.join(workspaceRoot, 'docs'),
      path.join(workspaceRoot, 'specs'),
      path.join(workspaceRoot, '.specify'),
      workspaceRoot
    ];

    for (const root of roots) {
      if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
        continue;
      }

      this.scanDirectory(workspaceRoot, root, collected);
    }

    return [...collected].sort((left, right) => left.localeCompare(right));
  }

  private scanDirectory(workspaceRoot: string, currentDir: string, collected: Set<string>): void {
    for (const item of fs.readdirSync(currentDir)) {
      if (item === '.git' || item === '.flash-mem' || item === 'node_modules' || item === 'dist' || item === 'coverage') {
        continue;
      }

      const absolute = path.join(currentDir, item);
      const stat = fs.statSync(absolute);
      if (stat.isDirectory()) {
        this.scanDirectory(workspaceRoot, absolute, collected);
        continue;
      }

      if (!stat.isFile() || (!item.endsWith('.md') && !item.endsWith('.markdown'))) {
        continue;
      }

      collected.add(path.relative(workspaceRoot, absolute).replace(/\\/g, '/'));
    }
  }

  private summarizeFile(workspaceRoot: string, relativePath: string): DocSummaryItem {
    const absolutePath = path.join(workspaceRoot, relativePath);
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const title = this.extractTitle(content, relativePath);
    const summary = this.extractSummary(content);
    return {
      path: relativePath,
      title,
      summary
    };
  }

  private extractTitle(content: string, relativePath: string): string {
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('# ')) {
        return trimmed.slice(2).trim();
      }
    }
    return path.basename(relativePath, path.extname(relativePath));
  }

  private extractSummary(content: string): string {
    const text = this.markdownToText(content);
    if (!text) {
      return 'No textual summary available.';
    }
    return this.truncateWords(text, 40);
  }

  private renderMarkdown(workspaceRoot: string, featurePath: string, items: DocSummaryItem[]): string {
    const lines: string[] = [
      '# Doc Synthesis',
      '',
      `- Workspace: \`${workspaceRoot}\``,
      `- Feature path: \`${path.relative(workspaceRoot, featurePath).replace(/\\/g, '/') || '.'}\``,
      `- Documents reviewed: ${items.length}`,
      ''
    ];

    if (items.length === 0) {
      lines.push('No markdown documents were found for the requested scope.', '');
      return lines.join('\n');
    }

    for (const item of items) {
      lines.push(
        `## ${item.title}`,
        `- Source: \`${item.path}\``,
        `- Summary: ${item.summary}`,
        ''
      );
    }

    lines.push(
      '## Retrieval Notes',
      `- Estimated tokens: ${this.tokenBudgetService.estimateTokens(lines.join('\n'))}`,
      ''
    );

    return lines.join('\n').trim() + '\n';
  }

  private markdownToText(markdown: string): string {
    return markdown
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[#>*_`~-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private truncateWords(value: string, maxWords: number): string {
    const words = value.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) {
      return value.trim();
    }
    return `${words.slice(0, maxWords).join(' ')}...`;
  }
}
