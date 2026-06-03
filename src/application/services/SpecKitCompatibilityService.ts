import * as fs from 'fs-extra';
import * as path from 'path';
import { InitializeProjectService } from './InitializeProjectService';
import { MemorySynthesisService } from './MemorySynthesisService';
import { DocSynthesisService } from './DocSynthesisService';
import { SharedLessonService, SharedLessonSyncResult } from './SharedLessonService';
import { TokenBudgetService } from './TokenBudgetService';
import { MarkdownArtifactIngestionResult, MarkdownArtifactIngestionService } from './MarkdownArtifactIngestionService';
import { PathSanitizer } from '../../infrastructure/safety/PathSanitizer';
import { ProjectProfileRepository } from '../../infrastructure/database/repositories/ProjectProfileRepository';
import { ProjectProfile } from '../../domain/entities/ProjectProfile';
import { SharedLesson } from '../../domain/entities/SharedLesson';

export interface TokenReport {
  baselineTokens: number;
  cachedTokens: number;
  savedTokens: number;
  savedPercent: number;
  baselineSources: string[];
  cachedArtifacts: string[];
}

export interface PrepareContextResult {
  workspaceRoot: string;
  featurePath: string;
  query: string;
  memorySynthesis: ReturnType<MemorySynthesisService['buildFeatureSynthesis']>;
  docSynthesis: ReturnType<DocSynthesisService['buildDocSynthesis']>;
  tokenReport: TokenReport;
  memorySynthesisPath: string | null;
  docSynthesisPath: string | null;
  indexedArtifacts: MarkdownArtifactIngestionResult | null;
}

export interface SharedLessonCompatibilityInput {
  id: string;
  title: string;
  content: string;
  language: string;
  framework?: string;
  tags?: string[];
  workspaceRoot?: string;
}

export interface SharedLessonCompatibilityResult {
  reference: {
    id: string;
    title: string;
    content: string;
    language: string;
    framework: string | null;
    tags: string[];
  };
  sharedLesson: SharedLesson;
  storage: {
    topic: string;
    lesson: string;
  };
}

export interface InitializeProjectCompatibilityResult {
  workspaceRoot: string;
  language: string;
  framework: string | null;
  initialization: ReturnType<InitializeProjectService['execute']>;
  profile: ProjectProfile;
  profilePath: string;
  profileStatus: 'created' | 'updated';
}

export class SpecKitCompatibilityService {
  constructor(
    private readonly memorySynthesisService: MemorySynthesisService,
    private readonly docSynthesisService: DocSynthesisService,
    private readonly sharedLessonService: SharedLessonService,
    private readonly tokenBudgetService: TokenBudgetService = new TokenBudgetService(),
    private readonly initializeProjectService: InitializeProjectService = new InitializeProjectService(),
    private readonly projectProfileRepositoryFactory: (workspaceRoot: string) => ProjectProfileRepository = (workspaceRoot) => new ProjectProfileRepository(workspaceRoot),
    private readonly markdownArtifactIngestionService?: MarkdownArtifactIngestionService
  ) {}

  public prepareContext(input: {
    workspaceRoot: string;
    featurePath?: string;
    query?: string;
    tokenBudget?: number;
    writeArtifacts?: boolean;
    storeArtifacts?: boolean;
  }): PrepareContextResult {
    const workspaceRoot = PathSanitizer.resolveRoot(input.workspaceRoot);
    const featurePath = input.featurePath
      ? PathSanitizer.sanitizeSubPath(workspaceRoot, input.featurePath)
      : workspaceRoot;
    const query = (input.query ?? path.basename(featurePath)).trim();

    const memorySynthesis = this.memorySynthesisService.buildFeatureSynthesis({
      workspaceRoot,
      query,
      tokenBudget: input.tokenBudget
    });
    const docSynthesis = this.docSynthesisService.buildDocSynthesis({
      workspaceRoot,
      featurePath
    });

    const tokenReport = this.buildTokenReport({
      workspaceRoot,
      memorySynthesis,
      docSynthesis
    });

    let memorySynthesisPath: string | null = null;
    let docSynthesisPath: string | null = null;
    let indexedArtifacts: MarkdownArtifactIngestionResult | null = null;

    if (input.writeArtifacts && input.storeArtifacts) {
      throw new Error('Use either writeArtifacts or storeArtifacts, not both.');
    }

    if (input.writeArtifacts) {
      memorySynthesisPath = PathSanitizer.sanitizeSubPath(featurePath, 'memory-synthesis.md');
      docSynthesisPath = PathSanitizer.sanitizeSubPath(featurePath, 'doc-synthesis.md');
      fs.ensureDirSync(featurePath);
      fs.writeFileSync(memorySynthesisPath, memorySynthesis.markdown, 'utf-8');
      fs.writeFileSync(docSynthesisPath, docSynthesis.markdown, 'utf-8');
      indexedArtifacts = this.markdownArtifactIngestionService?.ingestMarkdownArtifacts(workspaceRoot, [
        { artifactPath: memorySynthesisPath, content: memorySynthesis.markdown, source: 'file' },
        { artifactPath: docSynthesisPath, content: docSynthesis.markdown, source: 'file' }
      ]) ?? null;
    } else if (input.storeArtifacts) {
      const featureKey = this.toFeatureKey(workspaceRoot, featurePath);
      const memoryArtifactPath = PathSanitizer.sanitizeSubPath(workspaceRoot, path.join('.flash-mem', 'context', featureKey, 'memory-synthesis.md'));
      const docArtifactPath = PathSanitizer.sanitizeSubPath(workspaceRoot, path.join('.flash-mem', 'context', featureKey, 'doc-synthesis.md'));
      indexedArtifacts = this.markdownArtifactIngestionService?.ingestMarkdownArtifacts(workspaceRoot, [
        { artifactPath: memoryArtifactPath, content: memorySynthesis.markdown, source: 'synthesis' },
        { artifactPath: docArtifactPath, content: docSynthesis.markdown, source: 'synthesis' }
      ]) ?? null;
    }

    return {
      workspaceRoot,
      featurePath,
      query,
      memorySynthesis,
      docSynthesis,
      tokenReport,
      memorySynthesisPath,
      docSynthesisPath,
      indexedArtifacts
    };
  }

  private toFeatureKey(workspaceRoot: string, featurePath: string): string {
    const relative = path.relative(workspaceRoot, featurePath).split(path.sep).join('/');
    return relative.length > 0 ? relative : 'root';
  }

  public buildTokenReport(input: {
    workspaceRoot: string;
    memorySynthesis: ReturnType<MemorySynthesisService['buildFeatureSynthesis']>;
    docSynthesis: ReturnType<DocSynthesisService['buildDocSynthesis']>;
  }): TokenReport {
    const baselineTokens = input.docSynthesis.sourceFiles.reduce((sum, filePath) => {
      const absolutePath = path.resolve(input.workspaceRoot, filePath);
      if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
        return sum;
      }

      return sum + this.tokenBudgetService.estimateTokens(fs.readFileSync(absolutePath, 'utf-8'));
    }, 0);
    const cachedTokens = input.memorySynthesis.tokenEstimate + input.docSynthesis.tokenEstimate;
    const savedTokens = Math.max(0, baselineTokens - cachedTokens);
    const savedPercent = baselineTokens > 0 ? (savedTokens / baselineTokens) * 100 : 0;

    return {
      baselineTokens,
      cachedTokens,
      savedTokens,
      savedPercent,
      baselineSources: input.docSynthesis.sourceFiles,
      cachedArtifacts: ['memory-synthesis.md', 'doc-synthesis.md']
    };
  }

  public async promoteLesson(input: {
    topic: string;
    lesson: string;
    framework?: string;
    language?: string;
    workspaceRoot?: string;
  }) {
    return this.sharedLessonService.promoteLesson(
      input.topic,
      input.lesson,
      input.framework,
      input.language,
      input.workspaceRoot
    );
  }

  public async shareLesson(input: SharedLessonCompatibilityInput): Promise<SharedLessonCompatibilityResult> {
    const workspaceRoot = PathSanitizer.resolveRoot(input.workspaceRoot ?? process.cwd());
    const normalizedId = this.normalizeRequiredField(input.id, 'id');
    const normalizedTitle = this.normalizeRequiredField(input.title, 'title');
    const normalizedContent = this.normalizeRequiredField(input.content, 'content');
    const normalizedLanguage = this.normalizeRequiredField(input.language, 'language');
    const normalizedFramework = input.framework?.trim() ? input.framework.trim() : null;
    const normalizedTags = (input.tags ?? []).map((tag) => tag.trim()).filter(Boolean);
    const lessonBody = this.renderCompatibilitySharedLessonBody({
      id: normalizedId,
      title: normalizedTitle,
      content: normalizedContent,
      language: normalizedLanguage,
      framework: normalizedFramework,
      tags: normalizedTags
    });

    const sharedLesson = await this.sharedLessonService.promoteLessonWithId(
      normalizedId,
      normalizedTitle,
      lessonBody,
      normalizedFramework ?? undefined,
      normalizedLanguage,
      workspaceRoot
    );

    return {
      reference: {
        id: normalizedId,
        title: normalizedTitle,
        content: normalizedContent,
        language: normalizedLanguage,
        framework: normalizedFramework,
        tags: normalizedTags
      },
      sharedLesson,
      storage: {
        topic: normalizedTitle,
        lesson: lessonBody
      }
    };
  }

  public async initProject(input: {
    workspaceRoot: string;
    language: string;
    framework?: string;
  }): Promise<InitializeProjectCompatibilityResult> {
    const workspaceRoot = PathSanitizer.resolveRoot(input.workspaceRoot);
    const initialization = this.initializeProjectService.execute(workspaceRoot);
    const repository = this.projectProfileRepositoryFactory(workspaceRoot);
    const existingProfile = await repository.readProfile();
    const normalizedLanguage = this.normalizeRequiredField(input.language, 'language');
    const normalizedFramework = input.framework?.trim() ? input.framework.trim() : null;
    const profile: ProjectProfile = {
      language: normalizedLanguage,
      framework: normalizedFramework ?? existingProfile?.framework ?? 'unknown',
      architectureStyle: existingProfile?.architectureStyle ?? 'unspecified',
      projectConventions: existingProfile?.projectConventions ?? [],
      sharedMemoryEligible: existingProfile?.sharedMemoryEligible ?? false
    };

    await repository.writeProfile(profile);

    const compatibilityConfigPath = path.join(workspaceRoot, '.specify', 'extensions', 'memory-md', 'config.yml');
    const compatibilityConfig = this.renderCompatibilityConfig({
      language: normalizedLanguage,
      framework: normalizedFramework ?? profile.framework ?? 'unknown',
      syncChannels: [
        'global',
        normalizedLanguage,
        normalizedFramework ?? profile.framework ?? 'unknown'
      ]
    });
    fs.ensureDirSync(path.dirname(compatibilityConfigPath));
    fs.writeFileSync(compatibilityConfigPath, compatibilityConfig, 'utf-8');
    fs.writeFileSync(path.join(workspaceRoot, 'config.yml'), compatibilityConfig, 'utf-8');

    return {
      workspaceRoot,
      language: normalizedLanguage,
      framework: normalizedFramework,
      initialization,
      profile,
      profilePath: compatibilityConfigPath,
      profileStatus: existingProfile ? 'updated' : 'created'
    };
  }

  public async syncSharedLessons(input: {
    workspaceRoot: string;
    framework?: string;
    language?: string;
    limit?: number;
  }): Promise<SharedLessonSyncResult> {
    return this.sharedLessonService.syncSharedLessons(input.workspaceRoot, {
      framework: input.framework,
      language: input.language,
      limit: input.limit
    });
  }

  private renderCompatibilitySharedLessonBody(input: {
    id: string;
    title: string;
    content: string;
    language: string;
    framework: string | null;
    tags: string[];
  }): string {
    const lines = [
      `ID: ${input.id}`,
      `Title: ${input.title}`,
      `Language: ${input.language}`,
      `Framework: ${input.framework ?? 'n/a'}`,
      `Tags: ${input.tags.length > 0 ? input.tags.join(', ') : 'none'}`,
      '',
      input.content
    ];

    return lines.join('\n').trim() + '\n';
  }

  private normalizeRequiredField(value: string, fieldName: string): string {
    const normalized = value.trim();
    if (!normalized) {
      throw new Error(`Compatibility field "${fieldName}" is required`);
    }

    return normalized;
  }

  private renderCompatibilityConfig(input: {
    language: string;
    framework: string;
    syncChannels: string[];
  }): string {
    const syncChannels = input.syncChannels.map((channel) => `      - ${channel}`).join('\n');
    return [
      'project_profile:',
      `  language: ${input.language}`,
      `  framework: ${input.framework}`,
      '  shared_memory:',
      '    enabled: true',
      '    sync_channels:',
      syncChannels,
      ''
    ].join('\n');
  }
}
