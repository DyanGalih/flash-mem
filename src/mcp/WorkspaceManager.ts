import Database from 'better-sqlite3';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ArtifactMemoryCaptureService } from '../application/services/ArtifactMemoryCaptureService';
import { BackgroundMarkdownExportScheduler, resolveBackgroundMarkdownExportDelayMs } from '../application/services/BackgroundMarkdownExportScheduler';
import { DocSynthesisService } from '../application/services/DocSynthesisService';
import { IndexingService } from '../application/services/IndexingService';
import { MarkdownArtifactIngestionService } from '../application/services/MarkdownArtifactIngestionService';
import { MarkdownExportService } from '../application/services/MarkdownExportService';
import { MarkdownRestoreService } from '../application/services/MarkdownRestoreService';
import { MemoryEntryService } from '../application/services/MemoryEntryService';
import { MemorySearchService } from '../application/services/MemorySearchService';
import { MemorySynthesisService } from '../application/services/MemorySynthesisService';
import { ProjectSummaryService } from '../application/services/ProjectSummaryService';
import { RelevantContextService } from '../application/services/RelevantContextService';
import { SchemaMigrationService } from '../application/services/SchemaMigrationService';
import { SharedLessonService } from '../application/services/SharedLessonService';
import { AiEngineeringExtensionsService } from '../application/services/AiEngineeringExtensionsService';
import { TokenBudgetService } from '../application/services/TokenBudgetService';
import { WorkspaceIndexingService } from '../application/services/WorkspaceIndexingService';
import { ConfigService } from '../application/services/ConfigService';
import { HybridSearchService } from '../application/services/HybridSearchService';
import { CaptureOrchestrator } from '../application/services/CaptureOrchestrator';
import { ExtractionRuleRegistry } from '../domain/entities/ExtractionRule';
import { KnowledgeService } from '../application/services/KnowledgeService';
import { KnowledgeObjectRepository } from '../infrastructure/database/repositories/KnowledgeObjectRepository';
import { KnowledgeRelationshipRepository } from '../infrastructure/database/repositories/KnowledgeRelationshipRepository';
import { AuthorityChainRepository } from '../infrastructure/database/repositories/AuthorityChainRepository';
import { Project } from '../domain/entities/Project';
import { DetachedMarkdownExportLauncher } from '../infrastructure/background/DetachedMarkdownExportLauncher';
import { createDatabaseConnection } from '../infrastructure/database/connection';
import { getGlobalHubDatabase } from '../infrastructure/database/global';
import { IndexingRunRepository } from '../infrastructure/database/repositories/IndexingRunRepository';
import { MemoryEntryRepository } from '../infrastructure/database/repositories/MemoryEntryRepository';
import { ProjectRepository } from '../infrastructure/database/repositories/ProjectRepository';
import { ProjectSummaryRepository } from '../infrastructure/database/repositories/ProjectSummaryRepository';
import { RelationshipRepository } from '../infrastructure/database/repositories/RelationshipRepository';
import { SharedLessonRepository } from '../infrastructure/database/repositories/SharedLessonRepository';
import { SourceDocumentRepository } from '../infrastructure/database/repositories/SourceDocumentRepository';
import { TagRepository } from '../infrastructure/database/repositories/TagRepository';
import { SqliteTransactionRunner } from '../infrastructure/database/SqliteTransactionRunner';
import { ArtifactReader } from '../infrastructure/markdown/ArtifactReader';
import { CaptureDeduplicationGuard } from '../infrastructure/safety/CaptureDeduplicationGuard';
import { PathSanitizer } from '../infrastructure/safety/PathSanitizer';
import { SecretScanner } from '../infrastructure/safety/SecretScanner';
import { WorkspaceStorageResolver } from '../infrastructure/safety/WorkspaceStorageResolver';

export interface WorkspaceBundle {
  workspaceRoot: string;
  db: Database.Database;
  project: Project;
  memoryEntryService: MemoryEntryService;
  memorySearchService: MemorySearchService;
  artifactMemoryCaptureService: ArtifactMemoryCaptureService;
  indexingService: IndexingService;
  markdownArtifactIngestionService: MarkdownArtifactIngestionService;
  markdownExportService: MarkdownExportService;
  markdownRestoreService: MarkdownRestoreService;
  projectSummaryService: ProjectSummaryService;
  relevantContextService: RelevantContextService;
  memorySynthesisService: MemorySynthesisService;
  docSynthesisService: DocSynthesisService;
  sharedLessonService: SharedLessonService;
  compatibilityService: AiEngineeringExtensionsService;
  workspaceIndexingService: WorkspaceIndexingService;
  configService: ConfigService;
  knowledgeRelationshipRepo: KnowledgeRelationshipRepository;
  captureOrchestrator: CaptureOrchestrator;
  hybridSearchService: HybridSearchService;
  knowledgeObjectService: KnowledgeService;
}

export class WorkspaceManager {
  private bundles = new Map<string, WorkspaceBundle>();

  public getBundle(workspaceRootInput: string): WorkspaceBundle {
    const workspaceRoot = PathSanitizer.resolveRoot(workspaceRootInput);
    if (this.bundles.has(workspaceRoot)) {
      return this.bundles.get(workspaceRoot)!;
    }

    if (!fs.existsSync(workspaceRoot) || !fs.statSync(workspaceRoot).isDirectory()) {
      throw new Error(`Workspace path "${workspaceRoot}" does not exist or is not a directory`);
    }

    const storageInfo = WorkspaceStorageResolver.ensureWorkspaceStorageInitialized(workspaceRoot);
    const db = createDatabaseConnection(storageInfo.dbPath);
    const schemaMigrationService = new SchemaMigrationService(db);
    schemaMigrationService.ensureCurrentSchema();

    const projectRepository = new ProjectRepository(db);
    const project = projectRepository.upsertByRootPath(workspaceRoot, path.basename(workspaceRoot));
    const memoryEntryRepository = new MemoryEntryRepository(db);
    const projectSummaryRepository = new ProjectSummaryRepository(db);
    const tagRepository = new TagRepository(db);
    const relationshipRepository = new RelationshipRepository(db);
    const sourceDocumentRepository = new SourceDocumentRepository(db);
    const indexingRunRepository = new IndexingRunRepository(db);
    const transactionRunner = new SqliteTransactionRunner(db);
    const backgroundExportScheduler = new BackgroundMarkdownExportScheduler(
      new DetachedMarkdownExportLauncher({ enabled: process.env.VITEST !== 'true' && process.env.FLASH_MEM_DISABLE_BACKGROUND_EXPORT !== '1' }),
      resolveBackgroundMarkdownExportDelayMs()
    );

    const memoryEntryService = new MemoryEntryService(
      projectRepository,
      memoryEntryRepository,
      tagRepository,
      relationshipRepository,
      sourceDocumentRepository,
      transactionRunner,
      backgroundExportScheduler
    );
    const memorySearchService = new MemorySearchService(memoryEntryRepository, tagRepository, projectRepository);
    const artifactMemoryCaptureService = new ArtifactMemoryCaptureService(
      workspaceRoot,
      projectRepository,
      memoryEntryRepository,
      sourceDocumentRepository,
      transactionRunner,
      new ArtifactReader(),
      { resolveRoot: (root) => PathSanitizer.resolveRoot(root) },
      { redact: (value) => SecretScanner.redact(value) },
      new CaptureDeduplicationGuard()
    );

    const indexingService = new IndexingService(
      projectRepository,
      sourceDocumentRepository,
      indexingRunRepository,
      memoryEntryService,
      schemaMigrationService,
      transactionRunner
    );
    const markdownArtifactIngestionService = new MarkdownArtifactIngestionService(projectRepository, indexingService);
    const markdownExportService = new MarkdownExportService(
      projectRepository,
      projectSummaryRepository,
      memoryEntryRepository,
      tagRepository,
      relationshipRepository,
      sourceDocumentRepository,
      schemaMigrationService
    );
    const markdownRestoreService = new MarkdownRestoreService(
      projectRepository,
      memoryEntryRepository,
      tagRepository,
      relationshipRepository,
      sourceDocumentRepository,
      schemaMigrationService,
      transactionRunner,
      backgroundExportScheduler
    );
    const projectSummaryService = new ProjectSummaryService(
      project.id,
      projectRepository,
      projectSummaryRepository
    );
    const relevantContextService = new RelevantContextService(
      projectRepository,
      memorySearchService
    );
    const memorySynthesisService = new MemorySynthesisService(
      projectRepository,
      projectSummaryService,
      relevantContextService
    );
    const docSynthesisService = new DocSynthesisService();
    const sharedLessonRepository = new SharedLessonRepository(db);
    const globalDb = getGlobalHubDatabase();
    const globalSharedLessonRepository = new SharedLessonRepository(globalDb);
    const sharedLessonService = new SharedLessonService(sharedLessonRepository, globalSharedLessonRepository);
    const compatibilityService = new AiEngineeringExtensionsService(
      memorySynthesisService,
      docSynthesisService,
      sharedLessonService,
      new TokenBudgetService(),
      undefined,
      undefined,
      markdownArtifactIngestionService
    );
    const workspaceIndexingService = new WorkspaceIndexingService(
      indexingService,
      projectRepository
    );
    const configService = new ConfigService(workspaceRoot);

    const knowledgeObjectRepo = new KnowledgeObjectRepository(db);
    const knowledgeRelationshipRepo = new KnowledgeRelationshipRepository(db);
    const authorityChainRepo = new AuthorityChainRepository(db);
    const knowledgeService = new KnowledgeService(knowledgeObjectRepo, knowledgeRelationshipRepo, authorityChainRepo, transactionRunner);
    const registry = new ExtractionRuleRegistry();
    const captureOrchestrator = new CaptureOrchestrator(registry, knowledgeService);
    const hybridSearchService = new HybridSearchService(knowledgeObjectRepo, knowledgeRelationshipRepo);

    const bundle: WorkspaceBundle = {
      workspaceRoot,
      db,
      project,
      memoryEntryService,
      memorySearchService,
      artifactMemoryCaptureService,
      indexingService,
      markdownArtifactIngestionService,
      markdownExportService,
      markdownRestoreService,
      projectSummaryService,
      relevantContextService,
      memorySynthesisService,
      docSynthesisService,
      sharedLessonService,
      compatibilityService,
      workspaceIndexingService,
      configService,
      captureOrchestrator,
      hybridSearchService,
      knowledgeObjectService: knowledgeService,
      knowledgeRelationshipRepo,
    };

    this.bundles.set(workspaceRoot, bundle);
    return bundle;
  }

  public closeAll() {
    for (const bundle of this.bundles.values()) {
      try {
        bundle.db.close();
      } catch (e) {
        console.error(`Error closing DB for ${bundle.workspaceRoot}:`, e);
      }
    }
    this.bundles.clear();
  }
}
