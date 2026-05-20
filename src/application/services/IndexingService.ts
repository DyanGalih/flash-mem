import Database from 'better-sqlite3';
import {
  IProjectRepository,
  ISourceDocumentRepository,
  IIndexingRunRepository
} from '../../domain/repositories/interfaces';
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
  constructor(
    private readonly db: Database.Database,
    private readonly projectRepository: IProjectRepository,
    private readonly sourceDocumentRepository: ISourceDocumentRepository,
    private readonly indexingRunRepository: IIndexingRunRepository,
    private readonly memoryEntryService: MemoryEntryService,
    private readonly schemaMigrationService: SchemaMigrationService,
    private readonly indexingInputGuard: IndexingInputGuard = new IndexingInputGuard()
  ) {}

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

  public rebuildIndex(projectId: string, sources: IndexSourceInput[]) {
    const project = this.resolveProject(projectId);
    const sanitizedSources = this.indexingInputGuard.sanitizeSources(project.rootPath, sources);
    const run = this.indexingRunRepository.createRun(project.id, this.schemaMigrationService.ensureCurrentSchema(), sanitizedSources.length);

    try {
      const transaction = this.db.transaction(() => {
        // Clear all entries and relations under project to perform a clean rebuild
        this.db.prepare(`
          DELETE FROM entries 
          WHERE id IN (SELECT id FROM memory_entries WHERE project_id = ?)
        `).run(project.id);

        this.db.prepare(`
          DELETE FROM entries_tags
          WHERE entry_id NOT IN (SELECT id FROM entries)
        `).run();

        this.db.prepare(`DELETE FROM memory_entries WHERE project_id = ?`).run(project.id);
        this.db.prepare(`DELETE FROM tags WHERE project_id = ?`).run(project.id);
        this.db.prepare(`DELETE FROM relationships WHERE project_id = ?`).run(project.id);
        this.db.prepare(`DELETE FROM source_documents WHERE project_id = ?`).run(project.id);

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
      this.finishRun(run.id, 'failed', 0, error?.message ?? 'Index rebuild failed');
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
