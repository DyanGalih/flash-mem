import * as path from 'path';
import { Project } from '../../domain/entities/Project';
import { SynthesisResult } from '../../domain/entities/SynthesisResult';
import { IProjectRepository } from '../../domain/repositories/interfaces';
import { ProjectSummaryService } from './ProjectSummaryService';
import { RelevantContextService } from './RelevantContextService';
import { TokenBudgetService } from './TokenBudgetService';

export interface MemorySynthesisOptions {
  workspaceRoot?: string;
  query?: string;
  tokenBudget?: number;
  resultLimit?: number;
}

export class MemorySynthesisService {
  constructor(
    private readonly projectRepository?: IProjectRepository,
    private readonly projectSummaryService?: ProjectSummaryService,
    private readonly relevantContextService?: RelevantContextService,
    private readonly tokenBudgetService: TokenBudgetService = new TokenBudgetService()
  ) { }

  public async generateSynthesis(featureId: string, tokenBudget: number, workspaceRoot = process.cwd()): Promise<SynthesisResult> {
    const synthesis = this.buildFeatureSynthesis({
      workspaceRoot,
      query: featureId,
      tokenBudget,
      resultLimit: 4
    });

    return {
      featureId,
      context: synthesis.markdown,
      architectureConstraints: synthesis.architectureConstraints,
      securityConstraints: synthesis.securityConstraints,
      decisions: synthesis.decisions,
      lessons: synthesis.lessons,
      tokenEstimate: synthesis.tokenEstimate
    };
  }

  public buildFeatureSynthesis(options: MemorySynthesisOptions): {
    markdown: string;
    tokenEstimate: number;
    decisions: string[];
    architectureConstraints: string[];
    securityConstraints: string[];
    lessons: string[];
  } {
    const workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd());
    const query = (options.query ?? path.basename(workspaceRoot)).trim();
    const tokenBudget = options.tokenBudget ?? 900;
    const resultLimit = options.resultLimit ?? 4;
    const project = this.resolveProject(workspaceRoot);
    const summaryResult = this.projectSummaryService?.getProjectSummary();
    const contextResult = this.relevantContextService
      ? this.relevantContextService.getRelevantContext(project.id, query, resultLimit)
      : null;

    const decisions: Array<{ title: string; summary: string; source?: string; isLowConfidence?: boolean }> = [...(contextResult?.context.relatedDecisions ?? [])];
    const architectureConstraints: Array<{ title: string; summary: string; source?: string; isLowConfidence?: boolean }> = [...(contextResult?.context.relatedPatterns ?? [])];
    const securityConstraints: Array<{ title: string; summary: string; source?: string; isLowConfidence?: boolean }> = [...(contextResult?.context.securityNotes ?? [])];
    const lessons: Array<{ title: string; summary: string; source?: string; isLowConfidence?: boolean }> = [
      ...(contextResult?.context.knownRisks ?? []),
      ...(contextResult?.context.relevantConventions ?? [])
    ];

    if (summaryResult?.status === 'ready') {
      decisions.push({
        title: `${summaryResult.project.name} summary`,
        summary: summaryResult.summary.purpose,
        source: 'project-summary'
      });
      architectureConstraints.push({
        title: 'Project architecture style',
        summary: summaryResult.summary.architectureStyle,
        source: 'project-summary'
      });
      securityConstraints.push({
        title: 'Security-sensitive areas',
        summary: summaryResult.summary.securitySensitiveAreas,
        source: 'project-summary'
      });
    }

    const markdown = this.renderMarkdown({
      project,
      query,
      summaryResult,
      contextResult,
      tokenBudget,
      resultLimit
    });

    const tokenEstimate = this.tokenBudgetService.estimateTokens(markdown);

    return {
      markdown,
      tokenEstimate,
      decisions: decisions.map((item) => `${item.title}: ${item.summary}`),
      architectureConstraints: architectureConstraints.map((item) => `${item.title}: ${item.summary}`),
      securityConstraints: securityConstraints.map((item) => `${item.title}: ${item.summary}`),
      lessons: lessons.map((item) => `${item.title}: ${item.summary}`)
    };
  }

  private resolveProject(workspaceRoot: string): Project {
    if (this.projectRepository) {
      return this.projectRepository.findByRootPath(workspaceRoot)
        ?? this.projectRepository.upsertByRootPath(workspaceRoot, path.basename(workspaceRoot));
    }

    return {
      id: workspaceRoot,
      rootPath: workspaceRoot,
      name: path.basename(workspaceRoot) || 'workspace',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  private renderMarkdown(input: {
    project: Project;
    query: string;
    summaryResult?: ReturnType<ProjectSummaryService['getProjectSummary']>;
    contextResult: ReturnType<RelevantContextService['getRelevantContext']> | null;
    tokenBudget: number;
    resultLimit: number;
  }): string {
    const sections: string[] = [
      `# Memory Synthesis: ${input.query}`,
      '',
      `- Project: ${input.project.name}`,
      `- Workspace: \`${input.project.rootPath}\``,
      `- Query: ${input.query}`,
      `- Token budget: ${input.tokenBudget}`,
      ''
    ];

    if (input.summaryResult?.status === 'ready') {
      const summary = input.summaryResult.summary;
      sections.push(
        '## Project Summary',
        `- Purpose: ${summary.purpose}`,
        `- Tech stack: ${summary.techStack}`,
        `- Architecture style: ${summary.architectureStyle}`,
        `- Conventions: ${summary.importantConventions}`,
        `- Constraints: ${summary.knownConstraints}`,
        `- Security areas: ${summary.securitySensitiveAreas}`,
        ''
      );
    }

    const addGroup = (title: string, items: Array<{ title: string; summary: string; source?: string; isLowConfidence?: boolean }>) => {
      sections.push(`## ${title}`);
      if (items.length === 0) {
        sections.push('- No matching items found.', '');
        return;
      }

      for (const item of items.slice(0, input.resultLimit)) {
        const summary = this.truncateWords(item.summary, 30);
        sections.push(`- **${item.title}** (${item.source ?? 'memory'})`);
        sections.push(`  ${summary}`);
        if (item.isLowConfidence) {
          sections.push('  Low confidence: verify before relying on this item.');
        }
      }
      sections.push('');
    };

    addGroup('Relevant Decisions', input.contextResult?.context.relatedDecisions ?? []);
    addGroup('Architecture Constraints', input.contextResult?.context.relatedPatterns ?? []);
    addGroup('Security Notes', input.contextResult?.context.securityNotes ?? []);
    addGroup('Risks and Watchpoints', input.contextResult?.context.knownRisks ?? []);
    addGroup('Conventions', input.contextResult?.context.relevantConventions ?? []);

    sections.push(
      '## Retrieval Notes',
      `- Result limit: ${input.resultLimit}`,
      `- Estimated tokens: ${this.tokenBudgetService.estimateTokens(sections.join('\n'))}`,
      `- Budget status: ${this.tokenBudgetService.checkBudget(this.tokenBudgetService.estimateTokens(sections.join('\n')), input.tokenBudget) ? 'within budget' : 'over budget'}`,
      ''
    );

    return sections.join('\n').trim() + '\n';
  }

  private truncateWords(value: string, maxWords: number): string {
    const words = value.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) {
      return value.trim();
    }
    return `${words.slice(0, maxWords).join(' ')}...`;
  }
}
