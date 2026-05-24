import * as path from 'path';
import { z } from 'zod';
import { DocSynthesisService } from '../../application/services/DocSynthesisService';
import { MemorySynthesisService } from '../../application/services/MemorySynthesisService';
import { MemorySearchService } from '../../application/services/MemorySearchService';
import { ProjectRepository } from '../../infrastructure/database/repositories/ProjectRepository';
import { SpecKitCompatibilityService } from '../../application/services/SpecKitCompatibilityService';

export const prepareContextInputSchema = z.object({
  workspaceRoot: z.string().min(1).optional(),
  featurePath: z.string().min(1).optional(),
  query: z.string().min(1).optional(),
  tokenBudget: z.number().int().positive().optional(),
  writeArtifacts: z.boolean().optional()
});

export const memorySynthesisInputSchema = z.object({
  workspaceRoot: z.string().min(1).optional(),
  featurePath: z.string().min(1).optional(),
  query: z.string().min(1).optional(),
  tokenBudget: z.number().int().positive().optional()
});

export const docSynthesisInputSchema = z.object({
  workspaceRoot: z.string().min(1).optional(),
  featurePath: z.string().min(1).optional(),
  limit: z.number().int().positive().optional(),
  writeArtifact: z.boolean().optional()
});

export const tokenReportInputSchema = z.object({
  workspaceRoot: z.string().min(1).optional(),
  featurePath: z.string().min(1).optional(),
  query: z.string().min(1).optional()
});

export const promoteSharedLessonInputSchema = z.object({
  workspaceRoot: z.string().min(1).optional(),
  topic: z.string().min(1),
  lesson: z.string().min(1),
  framework: z.string().min(1).optional(),
  language: z.string().min(1).optional()
});

export const syncSharedLessonsInputSchema = z.object({
  workspaceRoot: z.string().min(1).optional(),
  framework: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  limit: z.number().int().positive().optional()
});

export const speckitMemorySearchInputSchema = z.object({
  workspaceRoot: z.string().min(1).optional(),
  projectRoot: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  query: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string().min(1)).optional(),
  tagOperator: z.enum(['AND', 'OR']).optional(),
  minConfidence: z.number().int().min(0).max(100).nullable().optional(),
  source: z.string().optional(),
  includeContent: z.boolean().optional(),
  limit: z.number().int().positive().max(100).optional()
});

export const speckitMemorySynthesizeInputSchema = z.object({
  workspaceRoot: z.string().min(1).optional(),
  projectRoot: z.string().min(1).optional(),
  featurePath: z.string().min(1).optional(),
  feature: z.string().min(1).optional(),
  query: z.string().min(1).optional(),
  tokenBudget: z.number().int().positive().optional(),
  resultLimit: z.number().int().positive().optional()
});

export const speckitMemoryTokenReportInputSchema = z.object({
  workspaceRoot: z.string().min(1).optional(),
  projectRoot: z.string().min(1).optional(),
  featurePath: z.string().min(1).optional(),
  feature: z.string().min(1).optional(),
  query: z.string().min(1).optional(),
  tokenBudget: z.number().int().positive().optional()
});

export const speckitMemoryShareLessonInputSchema = z.object({
  workspaceRoot: z.string().min(1).optional(),
  projectRoot: z.string().min(1).optional(),
  id: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  language: z.string().min(1),
  framework: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).optional()
});

export const speckitMemorySyncSharedInputSchema = z.object({
  workspaceRoot: z.string().min(1).optional(),
  projectRoot: z.string().min(1).optional(),
  framework: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  limit: z.number().int().positive().optional()
});

export const speckitMemoryInitProjectInputSchema = z.object({
  workspaceRoot: z.string().min(1).optional(),
  projectRoot: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  targetDirectory: z.string().min(1).optional(),
  language: z.string().min(1),
  framework: z.string().min(1).optional()
});

function resolveWorkspaceRoot(inputWorkspaceRoot: string | undefined, fallback: string): string {
  return inputWorkspaceRoot ?? fallback;
}

function resolveCompatibilityWorkspaceRoot(input: { workspaceRoot?: string; projectRoot?: string; path?: string; targetDirectory?: string }, fallback: string): string {
  return input.workspaceRoot ?? input.projectRoot ?? input.path ?? input.targetDirectory ?? fallback;
}

function resolveFeatureScope(input: { featurePath?: string; feature?: string }): string | undefined {
  return input.featurePath ?? input.feature;
}

function prepareTokenReportContext(
  service: SpecKitCompatibilityService,
  workspaceRoot: string,
  featurePath: string | undefined,
  query: string | undefined,
  tokenBudget: number | undefined
) {
  return service.prepareContext({
    workspaceRoot,
    featurePath,
    query,
    tokenBudget
  });
}

function resolveProjectId(input: { projectId?: string; workspaceRoot?: string; projectRoot?: string }, projectRepository: ProjectRepository, fallbackWorkspaceRoot: string): string {
  if (input.projectId) {
    return input.projectId;
  }

  const workspaceRoot = resolveCompatibilityWorkspaceRoot(input, fallbackWorkspaceRoot);
  const existing = projectRepository.findByRootPath(workspaceRoot);
  return (existing ?? projectRepository.upsertByRootPath(workspaceRoot, path.basename(workspaceRoot) || 'workspace')).id;
}

export function createPrepareContextTool(service: SpecKitCompatibilityService, defaultWorkspaceRoot: string) {
  return {
    name: 'prepare_context',
    schema: prepareContextInputSchema,
    execute: (input: z.infer<typeof prepareContextInputSchema>) =>
      service.prepareContext({
        workspaceRoot: resolveWorkspaceRoot(input.workspaceRoot, defaultWorkspaceRoot),
        featurePath: input.featurePath,
        query: input.query,
        tokenBudget: input.tokenBudget,
        writeArtifacts: input.writeArtifacts
      })
  };
}

export function createMemorySynthesisTool(service: MemorySynthesisService, defaultWorkspaceRoot: string) {
  return {
    name: 'memory_synthesis',
    schema: memorySynthesisInputSchema,
    execute: (input: z.infer<typeof memorySynthesisInputSchema>) =>
      service.buildFeatureSynthesis({
        workspaceRoot: resolveWorkspaceRoot(input.workspaceRoot, defaultWorkspaceRoot),
        query: input.query ?? input.featurePath,
        tokenBudget: input.tokenBudget,
        resultLimit: 4
      })
  };
}

export function createSpeckitMemorySearchTool(service: MemorySearchService, projectRepository: ProjectRepository, defaultWorkspaceRoot: string) {
  return {
    name: 'speckit_memory_search',
    schema: speckitMemorySearchInputSchema,
    execute: (input: z.infer<typeof speckitMemorySearchInputSchema>) => {
      const projectId = resolveProjectId(input, projectRepository, defaultWorkspaceRoot);
      const { workspaceRoot: _workspaceRoot, projectRoot: _projectRoot, ...rest } = input;
      return service.search({
        ...rest,
        projectId
      });
    }
  };
}

export function createSpeckitMemorySynthesizeTool(service: MemorySynthesisService, defaultWorkspaceRoot: string) {
  return {
    name: 'speckit_memory_synthesize',
    schema: speckitMemorySynthesizeInputSchema,
    execute: (input: z.infer<typeof speckitMemorySynthesizeInputSchema>) => {
      const workspaceRoot = resolveWorkspaceRoot(input.workspaceRoot ?? input.projectRoot, defaultWorkspaceRoot);
      return service.buildFeatureSynthesis({
        workspaceRoot,
        query: input.query ?? resolveFeatureScope(input) ?? (path.basename(workspaceRoot) || 'workspace'),
        tokenBudget: input.tokenBudget,
        resultLimit: input.resultLimit ?? 4
      });
    }
  };
}

export function createSpeckitMemoryTokenReportTool(service: SpecKitCompatibilityService, defaultWorkspaceRoot: string) {
  return {
    name: 'speckit_memory_token_report',
    schema: speckitMemoryTokenReportInputSchema,
    execute: (input: z.infer<typeof speckitMemoryTokenReportInputSchema>) => {
      const prepared = prepareTokenReportContext(
        service,
        resolveWorkspaceRoot(input.workspaceRoot ?? input.projectRoot, defaultWorkspaceRoot),
        resolveFeatureScope(input),
        input.query,
        input.tokenBudget
      );

      return {
        workspaceRoot: prepared.workspaceRoot,
        featurePath: prepared.featurePath,
        query: prepared.query,
        tokenReport: prepared.tokenReport,
        memorySynthesis: prepared.memorySynthesis,
        docSynthesis: prepared.docSynthesis
      };
    }
  };
}

export function createSpeckitMemoryShareLessonTool(service: SpecKitCompatibilityService, defaultWorkspaceRoot: string) {
  return {
    name: 'speckit_memory_share_lesson',
    schema: speckitMemoryShareLessonInputSchema,
    execute: (input: z.infer<typeof speckitMemoryShareLessonInputSchema>) => {
      return service.shareLesson({
        workspaceRoot: resolveWorkspaceRoot(input.workspaceRoot ?? input.projectRoot, defaultWorkspaceRoot),
        id: input.id,
        title: input.title,
        content: input.content,
        language: input.language,
        framework: input.framework,
        tags: input.tags
      });
    }
  };
}

export function createSpeckitMemorySyncSharedTool(service: SpecKitCompatibilityService, defaultWorkspaceRoot: string) {
  return {
    name: 'speckit_memory_sync_shared',
    schema: speckitMemorySyncSharedInputSchema,
    execute: (input: z.infer<typeof speckitMemorySyncSharedInputSchema>) =>
      service.syncSharedLessons({
        workspaceRoot: resolveWorkspaceRoot(input.workspaceRoot ?? input.projectRoot, defaultWorkspaceRoot),
        framework: input.framework,
        language: input.language,
        limit: input.limit
      })
  };
}

export function createSpeckitMemoryInitProjectTool(service: SpecKitCompatibilityService, defaultWorkspaceRoot: string) {
  return {
    name: 'speckit_memory_init_project',
    schema: speckitMemoryInitProjectInputSchema,
    execute: (input: z.infer<typeof speckitMemoryInitProjectInputSchema>) => {
      return service.initProject({
        workspaceRoot: resolveCompatibilityWorkspaceRoot(input, defaultWorkspaceRoot),
        language: input.language,
        framework: input.framework
      });
    }
  };
}

export function createDocSynthesisTool(service: DocSynthesisService, defaultWorkspaceRoot: string) {
  return {
    name: 'doc_synthesis',
    schema: docSynthesisInputSchema,
    execute: (input: z.infer<typeof docSynthesisInputSchema>) =>
      service.buildDocSynthesis({
        workspaceRoot: resolveWorkspaceRoot(input.workspaceRoot, defaultWorkspaceRoot),
        featurePath: input.featurePath,
        limit: input.limit
      })
  };
}

export function createTokenReportTool(service: SpecKitCompatibilityService, defaultWorkspaceRoot: string) {
  return {
    name: 'token_report',
    schema: tokenReportInputSchema,
    execute: (input: z.infer<typeof tokenReportInputSchema>) => {
      const prepared = prepareTokenReportContext(
        service,
        resolveWorkspaceRoot(input.workspaceRoot, defaultWorkspaceRoot),
        input.featurePath,
        input.query,
        undefined
      );
      return {
        workspaceRoot: prepared.workspaceRoot,
        featurePath: prepared.featurePath,
        query: prepared.query,
        tokenReport: prepared.tokenReport
      };
    }
  };
}

export function createPromoteSharedLessonTool(service: SpecKitCompatibilityService, defaultWorkspaceRoot: string) {
  return {
    name: 'promote_shared_lesson',
    schema: promoteSharedLessonInputSchema,
    execute: (input: z.infer<typeof promoteSharedLessonInputSchema>) =>
      service.promoteLesson({
        workspaceRoot: resolveWorkspaceRoot(input.workspaceRoot, defaultWorkspaceRoot),
        topic: input.topic,
        lesson: input.lesson,
        framework: input.framework,
        language: input.language
      })
  };
}

export function createSyncSharedLessonsTool(service: SpecKitCompatibilityService, defaultWorkspaceRoot: string) {
  return {
    name: 'sync_shared_lessons',
    schema: syncSharedLessonsInputSchema,
    execute: (input: z.infer<typeof syncSharedLessonsInputSchema>) =>
      service.syncSharedLessons({
        workspaceRoot: resolveWorkspaceRoot(input.workspaceRoot, defaultWorkspaceRoot),
        framework: input.framework,
        language: input.language,
        limit: input.limit
      })
  };
}
