import Database from 'better-sqlite3';
import { IndexingRunRepository } from '../../infrastructure/database/repositories/IndexingRunRepository';
import { ProjectRepository } from '../../infrastructure/database/repositories/ProjectRepository';
import { SourceDocumentRepository } from '../../infrastructure/database/repositories/SourceDocumentRepository';
import { MemoryEntryService } from './MemoryEntryService';
import { SchemaMigrationService } from './SchemaMigrationService';
import { IndexingInputGuard } from '../../infrastructure/safety/IndexingInputGuard';

export interface IndexSourceInput {
  path: string;
  checksum: string;
  title: string;
  content: string;
  entryType: string;
  tags?: string[];
}

export class IndexingService {
  private readonly sourceDocumentRepository: SourceDocumentRepository;
  private readonly indexingRunRepository: IndexingRunRepository;
  private readonly projectRepository: ProjectRepository;
  private readonly memoryEntryService: MemoryEntryService;
  private readonly schemaMigrationService: SchemaMigrationService;
  private readonly indexingInputGuard: IndexingInputGuard;

  constructor(private readonly db: Database.Database) {
    this.sourceDocumentRepository = new SourceDocumentRepository(db);
    this.indexingRunRepository = new IndexingRunRepository(db);
    this.projectRepository = new ProjectRepository(db);
    this.memoryEntryService = new MemoryEntryService(db);
    this.schemaMigrationService = new SchemaMigrationService(db);
    this.indexingInputGuard = new IndexingInputGuard();
  }

  public beginRun(projectId: string, sourceCount = 0) {
    const project = this.resolveProject(projectId);
    return this.indexingRunRepository.createRun(project.id, this.schemaMigrationService.ensureCurrentSchema(), sourceCount);
  }

  public finishRun(runId: string, status: 'running' | 'success' | 'failed' | 'partial', entryCount: number, errorMessage: string | null = null): void {
    this.indexingRunRepository.finishRun(runId, status, entryCount, errorMessage);
  }

  public indexSources(projectId: string, sources: IndexSourceInput[]) {
    const project = this.resolveProject(projectId);
    const sanitizedSources = this.indexingInputGuard.sanitizeSources(project.rootPath, sources);
    const run = this.indexingRunRepository.createRun(project.id, this.schemaMigrationService.ensureCurrentSchema(), sanitizedSources.length);

    try {
      const transaction = this.db.transaction(() => {
        const processed = [];
        for (const source of sanitizedSources) {
          const doc = this.sourceDocumentRepository.upsert(project.id, source.path, source.checksum, Date.now());
          const entry = this.memoryEntryService.createMemoryEntry({
            projectId: project.id,
            title: source.title,
            content: source.content,
            entryType: source.entryType,
            tags: source.tags ?? [],
            relationships: [],
            sourceDocumentPath: source.path,
            sourceChecksum: source.checksum
          });
          processed.push({ doc, entry });
        }
        return processed;
      });

      const results = transaction();

      this.finishRun(run.id, 'success', results.length);
      return results;
    } catch (error: any) {
      this.finishRun(run.id, 'failed', 0, error?.message ?? 'Indexing failed');
      throw error;
    }
  }

  private resolveProject(projectId: string) {
    const project = this.projectRepository.findById(projectId);
    if (!project) {
      throw new Error(`Unknown project "${projectId}"`);
    }
    return project;
  }
}
