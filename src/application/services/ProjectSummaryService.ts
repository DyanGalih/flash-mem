import { Project } from '../../domain/entities/Project';
import {
  ProjectSummary,
  ProjectSummaryInput,
  ProjectSummaryInputSchema,
  PROJECT_SUMMARY_TOTAL_MAX_LENGTH
} from '../../domain/entities/ProjectSummary';
import {
  IProjectRepository,
  IProjectSummaryRepository
} from '../../domain/repositories/interfaces';

export interface ProjectSummaryReadyResult {
  status: 'ready';
  project: Project;
  summary: Omit<ProjectSummary, 'projectId'>;
}

export interface ProjectSummaryMissingResult {
  status: 'missing';
  message: string;
}

export type ProjectSummaryResult = ProjectSummaryReadyResult | ProjectSummaryMissingResult;

export interface ProjectSummaryUpdateResult {
  status: 'updated';
  project: Project;
  summary: Omit<ProjectSummary, 'projectId'>;
}

export class ProjectSummaryService {
  constructor(
    private readonly projectId: string,
    private readonly projectRepository: IProjectRepository,
    private readonly summaryRepository: IProjectSummaryRepository
  ) {}

  public getProjectSummary(): ProjectSummaryResult {
    const project = this.resolveProject();
    const summary = this.summaryRepository.findByProjectId(project.id);

    if (!summary) {
      return {
        status: 'missing',
        message: 'Project summary has not been configured yet.'
      };
    }

    return {
      status: 'ready',
      project,
      summary: this.toPublicSummary(summary)
    };
  }

  public updateProjectSummary(input: ProjectSummaryInput): ProjectSummaryUpdateResult {
    const summaryInput = ProjectSummaryInputSchema.parse(input);
    this.ensureCompact(summaryInput);
    const project = this.resolveProject();
    const summary = this.summaryRepository.upsert(project.id, summaryInput);

    return {
      status: 'updated',
      project,
      summary: this.toPublicSummary(summary)
    };
  }

  private resolveProject(): Project {
    const project = this.projectRepository.findById(this.projectId);
    if (!project) {
      throw new Error(`Unknown project "${this.projectId}"`);
    }
    return project;
  }

  private ensureCompact(summary: ProjectSummaryInput): void {
    const totalLength = Object.values(summary).reduce((sum, value) => sum + value.trim().length, 0);
    if (totalLength > PROJECT_SUMMARY_TOTAL_MAX_LENGTH) {
      throw new Error(`Project summary must not exceed ${PROJECT_SUMMARY_TOTAL_MAX_LENGTH} characters in total`);
    }
  }

  private toPublicSummary(summary: ProjectSummary): Omit<ProjectSummary, 'projectId'> {
    const { projectId: _projectId, ...publicSummary } = summary;
    return publicSummary;
  }
}
