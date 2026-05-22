import * as path from 'path';
import { MemorySearchService } from './MemorySearchService';
import { ProjectSummaryService, ProjectSummaryResult } from './ProjectSummaryService';
import { MemoryEntryService } from './MemoryEntryService';
import { PathSanitizer } from '../../infrastructure/safety/PathSanitizer';

export interface CompactMemoryEntry {
  id: string;
  title: string;
  summary: string;
  category: string;
  confidence: number | null;
  isLowConfidence: boolean;
  source: string;
}

export interface RelevantContextResult {
  project: {
    id: string;
    name: string;
    rootPath: string;
    createdAt: number;
    updatedAt: number;
  };
  query: string;
  context: {
    relatedPatterns: CompactMemoryEntry[];
    relatedDecisions: CompactMemoryEntry[];
    securityNotes: CompactMemoryEntry[];
    knownRisks: CompactMemoryEntry[];
    relevantConventions: CompactMemoryEntry[];
  };
  markdown: string;
}

export class RelevantContextService {
  constructor(
    private readonly projectSummaryService: ProjectSummaryService,
    private readonly memorySearchService: MemorySearchService
  ) {}

  public getRelevantContext(projectId: string, query: string, limit = 5): RelevantContextResult {
    // 1. Validate query
    if (!query || !query.trim()) {
      throw new Error('Search query cannot be empty or whitespace-only.');
    }

    // 2. Fetch project metadata (also validates projectId)
    const summary = this.projectSummaryService.getProjectSummary(projectId);
    const absoluteRoot = PathSanitizer.resolveRoot(summary.project.rootPath);

    // 3. Retrieve matches with a higher candidate limit to ensure we have enough items to distribute
    const searchResult = this.memorySearchService.search({
      projectId,
      query: query.trim(),
      limit: 100,
      includeContent: true
    });

    const isProjectSpecific = (cat: string) =>
      ['decision', 'convention', 'architecture', 'security_note'].includes(cat);

    const isGeneric = (cat: string) =>
      ['framework', 'dependency', 'integration'].includes(cat);

    // 4. Map search matches to the formatted candidate structure
    const candidates = searchResult.results.map((match) => {
      // Resolve absolute paths to relative root to avoid disclosing directory structures
      const absoluteSource = path.isAbsolute(match.source)
        ? match.source
        : path.resolve(absoluteRoot, match.source);
      let relativeSource = path.relative(absoluteRoot, absoluteSource).replace(/\\/g, '/');
      if (relativeSource.startsWith('..')) {
        relativeSource = path.basename(absoluteSource);
      }

      const confidence = (match.confidence === null || match.confidence === undefined)
        ? 100
        : match.confidence;

      const summaryText = (match.summary && match.summary.trim())
        ? match.summary.trim()
        : MemoryEntryService.extractSummary(match.content);

      return {
        id: match.id,
        title: match.title,
        summary: summaryText,
        category: match.category,
        confidence: match.confidence === undefined ? null : match.confidence, // Preserve original confidence value (nullable)
        isLowConfidence: confidence < 60,
        source: relativeSource,
        score: match.score,
        updatedAt: match.updatedAt
      };
    });

    // 5. Rank candidates: score DESC, project-specific category priority, updatedAt DESC
    candidates.sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (Math.abs(scoreDiff) > 1e-5) {
        return scoreDiff;
      }

      const aProj = isProjectSpecific(a.category);
      const bProj = isProjectSpecific(b.category);
      if (aProj && !bProj) return -1;
      if (!aProj && bProj) return 1;

      const aGen = isGeneric(a.category);
      const bGen = isGeneric(b.category);
      if (!aGen && bGen) return -1;
      if (aGen && !bGen) return 1;

      return b.updatedAt - a.updatedAt;
    });

    // 6. Group candidates into five specific categories, adhering to limits
    const context = {
      relatedPatterns: [] as CompactMemoryEntry[],
      relatedDecisions: [] as CompactMemoryEntry[],
      securityNotes: [] as CompactMemoryEntry[],
      knownRisks: [] as CompactMemoryEntry[],
      relevantConventions: [] as CompactMemoryEntry[]
    };

    const getGroupKey = (category: string) => {
      switch (category) {
        case 'pattern':
        case 'framework':
        case 'dependency':
        case 'integration':
          return 'relatedPatterns';
        case 'decision':
        case 'architecture':
        case 'project':
          return 'relatedDecisions';
        case 'security_note':
          return 'securityNotes';
        case 'risk':
        case 'constraint':
        case 'bug_fix':
          return 'knownRisks';
        case 'convention':
          return 'relevantConventions';
        default:
          return null;
      }
    };

    for (const cand of candidates) {
      const key = getGroupKey(cand.category);
      if (key && context[key].length < limit) {
        context[key].push({
          id: cand.id,
          title: cand.title,
          summary: cand.summary,
          category: cand.category,
          confidence: cand.confidence,
          isLowConfidence: cand.isLowConfidence,
          source: cand.source
        });
      }
    }

    // 7. Render pre-formatted Markdown
    let markdown = `# Relevant Context: "${query.trim()}"\n\n`;

    const groupsConfig = [
      { name: 'Related Patterns', key: 'relatedPatterns' },
      { name: 'Related Decisions', key: 'relatedDecisions' },
      { name: 'Security Notes', key: 'securityNotes' },
      { name: 'Known Risks', key: 'knownRisks' },
      { name: 'Relevant Conventions', key: 'relevantConventions' }
    ] as const;

    for (const group of groupsConfig) {
      markdown += `## ${group.name}\n`;
      const entries = context[group.key];
      if (entries.length === 0) {
        markdown += `*No matches found.*\n\n`;
      } else {
        for (const entry of entries) {
          markdown += `- **${entry.title}** (\`${entry.source}\`)\n  ${entry.summary}`;
          if (entry.isLowConfidence) {
            const confText = entry.confidence !== null ? `${entry.confidence}%` : 'unknown';
            markdown += `\n  ⚠️ *Low Confidence (Confidence: ${confText})*`;
          }
          markdown += '\n';
        }
        markdown += '\n';
      }
    }

    return {
      project: {
        id: summary.project.id,
        name: summary.project.name,
        rootPath: summary.project.rootPath,
        createdAt: summary.project.createdAt,
        updatedAt: summary.project.updatedAt
      },
      query: query.trim(),
      context,
      markdown: markdown.trim() + '\n'
    };
  }
}
