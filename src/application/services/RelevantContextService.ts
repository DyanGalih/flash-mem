import { MemorySearchService } from './MemorySearchService';
import { ProjectSummaryService, ProjectSummaryResult } from './ProjectSummaryService';

export interface RelevantContextResult {
  project: ProjectSummaryResult['project'];
  query: string;
  matches: Array<{
    id: string;
    title: string;
    content: string;
    category: string;
    updatedAt: number;
    tags: string[];
    relationships: number;
    score: number;
  }>;
}

export class RelevantContextService {
  constructor(
    private readonly projectSummaryService: ProjectSummaryService,
    private readonly memorySearchService: MemorySearchService
  ) {}

  public getRelevantContext(projectId: string, query: string, limit = 5): RelevantContextResult {
    const summary = this.projectSummaryService.getProjectSummary(projectId);
    const matches = this.memorySearchService.search(projectId, query, limit).map((match) => ({
      id: match.id,
      title: match.title,
      content: match.content,
      category: match.category,
      updatedAt: match.updatedAt,
      tags: match.tags,
      relationships: match.relationships.length,
      score: match.score
    }));

    return {
      project: summary.project,
      query: query.trim(),
      matches
    };
  }
}
