import * as path from 'path';
import { IMemoryEntryRepository, ITagRepository, IProjectRepository, MemorySearchOptions } from '../../domain/repositories/interfaces';
import { MemoryEntry, VALID_CATEGORIES } from '../../domain/entities/MemoryEntry';
import { Relationship } from '../../domain/entities/Relationship';
import { IndexingInputGuard } from '../../infrastructure/safety/IndexingInputGuard';

export interface SearchResult {
  results: Array<MemoryEntry & { tags: string[]; relationships: Relationship[]; score: number }>;
  suggestions?: {
    categories: string[];
    tags: string[];
  };
  warning?: string;
}

export class MemorySearchService {
  private readonly indexingInputGuard = new IndexingInputGuard();

  constructor(
    private readonly entryRepository: IMemoryEntryRepository,
    private readonly tagRepository?: ITagRepository,
    private readonly projectRepository?: IProjectRepository
  ) {}

  public search(options: MemorySearchOptions): SearchResult {
    // 1. Validation checks
    if (options.category) {
      if (!VALID_CATEGORIES.includes(options.category as any)) {
        throw new Error(`Invalid category: "${options.category}". Valid categories are: ${VALID_CATEGORIES.join(', ')}`);
      }
    }

    if (options.minConfidence !== undefined && options.minConfidence !== null) {
      if (options.minConfidence < 0 || options.minConfidence > 100) {
        throw new Error(`Confidence score must be between 0 and 100. Got: ${options.minConfidence}`);
      }
    }

    if (options.tagOperator) {
      if (options.tagOperator !== 'AND' && options.tagOperator !== 'OR') {
        throw new Error(`Invalid tag operator: "${options.tagOperator}". Supported operators are: AND, OR`);
      }
    }

    // Check for empty keyword and empty filters
    const queryStr = options.query?.trim();
    const hasFilters = !!(
      options.category ||
      (options.tags && options.tags.length > 0) ||
      (options.minConfidence !== undefined && options.minConfidence !== null) ||
      options.source ||
      options.projectId
    );

    if (!queryStr && !hasFilters) {
      throw new Error('Please provide a search query or at least one filter.');
    }

    const normalizedSource = options.source ? this.normalizeSourceFilter(options.source, options.projectId) : undefined;

    // 2. Perform search
    const results = this.entryRepository.search({
      ...options,
      query: queryStr || undefined,
      source: normalizedSource
    });

    // 3. Suggestions on zero results
    if (results.length === 0) {
      const projId = options.projectId || undefined;
      const categories = this.entryRepository.listAllCategories(projId);
      const tags = this.tagRepository?.listAllTags(projId) ?? [];
      return {
        results,
        suggestions: {
          categories,
          tags
        }
      };
    }

    return { results };
  }

  private normalizeSourceFilter(source: string, projectId?: string | null): string {
    const trimmed = source.trim();
    if (!trimmed) {
      throw new Error('Source path cannot be empty.');
    }

    if (projectId && this.projectRepository) {
      const project = this.projectRepository.findById(projectId);
      if (!project) {
        throw new Error(`Unknown project "${projectId}"`);
      }
      return this.indexingInputGuard.normalizeSourcePath(project.rootPath, trimmed);
    }

    const normalized = path.posix.normalize(trimmed.replace(/\\/g, '/')).replace(/^\.\//, '');
    if (
      path.isAbsolute(trimmed) ||
      path.win32.isAbsolute(trimmed) ||
      normalized.startsWith('..') ||
      normalized === '..'
    ) {
      throw new Error(`Directory traversal detected in source path: "${source}"`);
    }

    return normalized;
  }
}
