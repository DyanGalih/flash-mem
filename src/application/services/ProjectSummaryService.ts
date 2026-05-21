import { MemoryEntry } from '../../domain/entities/MemoryEntry';
import {
  IProjectRepository,
  IMemoryEntryRepository,
  ITagRepository,
  IRelationshipRepository,
  ISourceDocumentRepository
} from '../../domain/repositories/interfaces';

export interface ProjectSummaryEntry {
  id: string;
  title: string;
  category: string;
  updatedAt: number;
  tags: string[];
  relationships: number;
}

export interface ProjectSummaryResult {
  project: {
    id: string;
    name: string;
    rootPath: string;
    createdAt: number;
    updatedAt: number;
  };
  counts: {
    memoryEntries: number;
    tags: number;
    relationships: number;
    sourceDocuments: number;
  };
  recentEntries: ProjectSummaryEntry[];
}

export class ProjectSummaryService {
  constructor(
    private readonly projectRepository: IProjectRepository,
    private readonly memoryEntryRepository: IMemoryEntryRepository,
    private readonly tagRepository: ITagRepository,
    private readonly relationshipRepository: IRelationshipRepository,
    private readonly sourceDocumentRepository: ISourceDocumentRepository
  ) {}

  public getProjectSummary(projectId: string): ProjectSummaryResult {
    const project = this.projectRepository.findById(projectId);
    if (!project) {
      throw new Error(`Unknown project "${projectId}"`);
    }

    const entries = this.memoryEntryRepository.listByProject(projectId);
    const recentEntries = entries.slice(0, 5).map((entry) => this.toSummaryEntry(entry));
    const tags = new Set<string>();
    let relationshipCount = 0;

    for (const entry of entries) {
      for (const tag of this.tagRepository.listForEntry(entry.id)) {
        tags.add(tag.name);
      }
      relationshipCount += this.relationshipRepository.listForSourceEntry(entry.id).length;
    }

    return {
      project: {
        id: project.id,
        name: project.name,
        rootPath: project.rootPath,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt
      },
      counts: {
        memoryEntries: entries.length,
        tags: tags.size,
        relationships: relationshipCount,
        sourceDocuments: this.sourceDocumentRepository.listByProject(projectId).length
      },
      recentEntries
    };
  }

  private toSummaryEntry(entry: MemoryEntry): ProjectSummaryEntry {
    return {
      id: entry.id,
      title: entry.title,
      category: entry.category,
      updatedAt: entry.updatedAt,
      tags: this.tagRepository.listForEntry(entry.id).map((tag) => tag.name),
      relationships: this.relationshipRepository.listForSourceEntry(entry.id).length
    };
  }
}
