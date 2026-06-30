import * as path from 'path';
import { z } from 'zod';
import { DocSynthesisService } from '../../application/services/DocSynthesisService';
import { MemorySynthesisService } from '../../application/services/MemorySynthesisService';
import { MemorySearchService } from '../../application/services/MemorySearchService';
import { ProjectRepository } from '../../infrastructure/database/repositories/ProjectRepository';
import { SpecKitCompatibilityService } from '../../application/services/SpecKitCompatibilityService';
import { WorkspaceManager } from "../WorkspaceManager";

export const prepareContextInputSchema = z.object({
    project_path: z.string().min(1).describe("Absolute path to the workspace root"),
    workspaceRoot: z.string().min(1).optional(),
  featurePath: z.string().min(1).optional(),
  query: z.string().min(1).optional(),
  tokenBudget: z.number().int().positive().optional(),
  writeArtifacts: z.boolean().optional(),
  storeArtifacts: z.boolean().optional()
});

export const memorySynthesisInputSchema = z.object({
    project_path: z.string().min(1).describe("Absolute path to the workspace root"),
    workspaceRoot: z.string().min(1).optional(),
  featurePath: z.string().min(1).optional(),
  query: z.string().min(1).optional(),
  tokenBudget: z.number().int().positive().optional()
});

export const docSynthesisInputSchema = z.object({
    project_path: z.string().min(1).describe("Absolute path to the workspace root"),
    workspaceRoot: z.string().min(1).optional(),
  featurePath: z.string().min(1).optional(),
  limit: z.number().int().positive().optional(),
  writeArtifact: z.boolean().optional()
});

export const tokenReportInputSchema = z.object({
    project_path: z.string().min(1).describe("Absolute path to the workspace root"),
    workspaceRoot: z.string().min(1).optional(),
  featurePath: z.string().min(1).optional(),
  query: z.string().min(1).optional()
});

export const promoteSharedLessonInputSchema = z.object({
    project_path: z.string().min(1).describe("Absolute path to the workspace root"),
    workspaceRoot: z.string().min(1).optional(),
  topic: z.string().min(1),
  lesson: z.string().min(1),
  framework: z.string().min(1).optional(),
  language: z.string().min(1).optional()
});

export const syncSharedLessonsInputSchema = z.object({
    project_path: z.string().min(1).describe("Absolute path to the workspace root"),
    workspaceRoot: z.string().min(1).optional(),
  framework: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  limit: z.number().int().positive().optional()
});

export const speckitMemorySearchInputSchema = z.object({
    project_path: z.string().min(1).describe("Absolute path to the workspace root"),
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
    project_path: z.string().min(1).describe("Absolute path to the workspace root"),
    workspaceRoot: z.string().min(1).optional(),
  projectRoot: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  featurePath: z.string().min(1).optional(),
  feature: z.string().min(1).optional(),
  query: z.string().min(1).optional(),
  tokenBudget: z.number().int().positive().optional(),
  resultLimit: z.number().int().positive().optional()
});

export const speckitMemoryTokenReportInputSchema = z.object({
    project_path: z.string().min(1).describe("Absolute path to the workspace root"),
    workspaceRoot: z.string().min(1).optional(),
  projectRoot: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  featurePath: z.string().min(1).optional(),
  feature: z.string().min(1).optional(),
  query: z.string().min(1).optional(),
  tokenBudget: z.number().int().positive().optional()
});

export const speckitMemoryShareLessonInputSchema = z.object({
    project_path: z.string().min(1).describe("Absolute path to the workspace root"),
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
    project_path: z.string().min(1).describe("Absolute path to the workspace root"),
    workspaceRoot: z.string().min(1).optional(),
  projectRoot: z.string().min(1).optional(),
  framework: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  limit: z.number().int().positive().optional()
});

export const speckitMemoryInitProjectInputSchema = z.object({
    project_path: z.string().min(1).describe("Absolute path to the workspace root"),
    workspaceRoot: z.string().min(1).optional(),
  projectRoot: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  targetDirectory: z.string().min(1).optional(),
  language: z.string().min(1),
  framework: z.string().min(1).optional()
});

function resolveWorkspaceRoot(inputWorkspaceRoot: string | undefined, fallback: string, inputCwd?: string): string {
  const isHome = (p: string) => p === process.env.HOME || p === process.env.USERPROFILE;
  const envWorkspace = process.env.WORKSPACE_ROOT || process.env.cwd || process.env.CWD;
  const resolved = inputWorkspaceRoot ?? inputCwd ?? envWorkspace;
  if (resolved) {
    return resolved;
  }
  const cwd = process.cwd();
  if (!isHome(cwd)) {
    return cwd;
  }
  return fallback;
}

function resolveCompatibilityWorkspaceRoot(input: { workspaceRoot?: string; projectRoot?: string; path?: string; targetDirectory?: string; cwd?: string }, fallback: string): string {
  const isHome = (p: string) => p === process.env.HOME || p === process.env.USERPROFILE;
  const envWorkspace = process.env.WORKSPACE_ROOT || process.env.cwd || process.env.CWD;
  const resolved = input.workspaceRoot ?? input.projectRoot ?? input.cwd ?? input.path ?? input.targetDirectory ?? envWorkspace;
  if (resolved) {
    return resolved;
  }
  const cwd = process.cwd();
  if (!isHome(cwd)) {
    return cwd;
  }
  return fallback;
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

export function createPrepareContextTool(manager: WorkspaceManager) {
  return {
    name: 'prepare_context',
    description: 'Prepare a Spec Kit compatible context bundle for the active workspace. Returns TOON text.',
    schema: prepareContextInputSchema,
    responseFormat: 'toon' as const,
    execute: (input: z.infer<typeof prepareContextInputSchema>) => {
      const service = manager.getBundle(input.project_path).compatibilityService;
      return service.prepareContext({
            workspaceRoot: resolveWorkspaceRoot(input.workspaceRoot, input.project_path),
            featurePath: input.featurePath,
            query: input.query,
            tokenBudget: input.tokenBudget,
            writeArtifacts: input.writeArtifacts,
            storeArtifacts: input.storeArtifacts
          });
    }
  };
}

export function createMemorySynthesisTool(manager: WorkspaceManager) {
  return {
    name: 'memory_synthesis',
    description: 'Build a memory synthesis for a workspace or feature. Returns markdown text.',
    schema: memorySynthesisInputSchema,
    responseFormat: 'markdown' as const,
    execute: (input: z.infer<typeof memorySynthesisInputSchema>) => {
      const service = manager.getBundle(input.project_path).memorySynthesisService;
      return service.buildFeatureSynthesis({
            workspaceRoot: resolveWorkspaceRoot(input.workspaceRoot, input.project_path),
            query: input.query ?? input.featurePath,
            tokenBudget: input.tokenBudget,
            resultLimit: 4
          });
    }
  };
}

export function createSpeckitMemorySearchTool(manager: WorkspaceManager) {
  return {
    name: 'speckit_memory_search',
    description: 'Compatibility wrapper for Spec Kit memory search requests. Returns TOON text.',
    schema: speckitMemorySearchInputSchema,
    responseFormat: 'toon' as const,
    execute: (input: z.infer<typeof speckitMemorySearchInputSchema>) => {
      const service = manager.getBundle(input.project_path).memorySearchService;
          const projectId = manager.getBundle(input.project_path).project.id;
          const { workspaceRoot: _workspaceRoot, projectRoot: _projectRoot, ...rest } = input;
          return service.search({
            ...rest,
            projectId
          });
        }
  };
}

export function createSpeckitMemorySynthesizeTool(manager: WorkspaceManager) {
  return {
    name: 'speckit_memory_synthesize',
    description: 'Compatibility wrapper for Spec Kit memory synthesis requests. Returns markdown text.',
    schema: speckitMemorySynthesizeInputSchema,
    responseFormat: 'markdown' as const,
    execute: (input: z.infer<typeof speckitMemorySynthesizeInputSchema>) => {
      const service = manager.getBundle(input.project_path).memorySynthesisService;
          const workspaceRoot = resolveWorkspaceRoot(input.workspaceRoot ?? input.projectRoot, input.project_path, input.cwd);
          return service.buildFeatureSynthesis({
            workspaceRoot,
            query: input.query ?? resolveFeatureScope(input) ?? (path.basename(workspaceRoot) || 'workspace'),
            tokenBudget: input.tokenBudget,
            resultLimit: input.resultLimit ?? 4
          });
        }
  };
}

export function createSpeckitMemoryTokenReportTool(manager: WorkspaceManager) {
  return {
    name: 'speckit_memory_token_report',
    description: 'Compatibility wrapper for the Spec Kit token report workflow. Returns TOON text.',
    schema: speckitMemoryTokenReportInputSchema,
    responseFormat: 'toon' as const,
    execute: (input: z.infer<typeof speckitMemoryTokenReportInputSchema>) => {
      const service = manager.getBundle(input.project_path).compatibilityService;
          const prepared = prepareTokenReportContext(
            service,
            resolveWorkspaceRoot(input.workspaceRoot ?? input.projectRoot, input.project_path, input.cwd),
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

export function createSpeckitMemoryShareLessonTool(manager: WorkspaceManager) {
  return {
    name: 'speckit_memory_share_lesson',
    description: 'Compatibility wrapper for sharing a lesson into shared memory.',
    schema: speckitMemoryShareLessonInputSchema,
    execute: (input: z.infer<typeof speckitMemoryShareLessonInputSchema>) => {
      const service = manager.getBundle(input.project_path).compatibilityService;
          return service.shareLesson({
            workspaceRoot: resolveWorkspaceRoot(input.workspaceRoot ?? input.projectRoot, input.project_path),
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

export function createSpeckitMemorySyncSharedTool(manager: WorkspaceManager) {
  return {
    name: 'speckit_memory_sync_shared',
    description: 'Compatibility wrapper for syncing shared lessons into a review buffer.',
    schema: speckitMemorySyncSharedInputSchema,
    execute: (input: z.infer<typeof speckitMemorySyncSharedInputSchema>) => {
      const service = manager.getBundle(input.project_path).compatibilityService;
      return service.syncSharedLessons({
            workspaceRoot: resolveWorkspaceRoot(input.workspaceRoot ?? input.projectRoot, input.project_path),
            framework: input.framework,
            language: input.language,
            limit: input.limit
          });
    }
  };
}

export function createSpeckitMemoryInitProjectTool(manager: WorkspaceManager) {
  return {
    name: 'speckit_memory_init_project',
    description: 'Compatibility wrapper for initializing a Spec Kit memory project profile.',
    schema: speckitMemoryInitProjectInputSchema,
    execute: (input: z.infer<typeof speckitMemoryInitProjectInputSchema>) => {
      const service = manager.getBundle(input.project_path).compatibilityService;
          return service.initProject({
            workspaceRoot: resolveCompatibilityWorkspaceRoot(input, input.project_path),
            language: input.language,
            framework: input.framework
          });
        }
  };
}

export function createDocSynthesisTool(manager: WorkspaceManager) {
  return {
    name: 'doc_synthesis',
    description: 'Build a doc synthesis for a workspace or feature. Returns markdown text.',
    schema: docSynthesisInputSchema,
    responseFormat: 'markdown' as const,
    execute: (input: z.infer<typeof docSynthesisInputSchema>) => {
      const service = manager.getBundle(input.project_path).docSynthesisService;
      return service.buildDocSynthesis({
            workspaceRoot: resolveWorkspaceRoot(input.workspaceRoot, input.project_path),
            featurePath: input.featurePath,
            limit: input.limit
          });
    }
  };
}

export function createTokenReportTool(manager: WorkspaceManager) {
  return {
    name: 'token_report',
    description: 'Report token usage for a workspace or feature context. Returns TOON text.',
    schema: tokenReportInputSchema,
    responseFormat: 'toon' as const,
    execute: (input: z.infer<typeof tokenReportInputSchema>) => {
      const service = manager.getBundle(input.project_path).compatibilityService;
          const prepared = prepareTokenReportContext(
            service,
            resolveWorkspaceRoot(input.workspaceRoot, input.project_path),
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

export function createPromoteSharedLessonTool(manager: WorkspaceManager) {
  return {
    name: 'promote_shared_lesson',
    description: 'Promote a lesson into shared memory.',
    schema: promoteSharedLessonInputSchema,
    execute: (input: z.infer<typeof promoteSharedLessonInputSchema>) => {
      const service = manager.getBundle(input.project_path).compatibilityService;
      return service.promoteLesson({
            workspaceRoot: resolveWorkspaceRoot(input.workspaceRoot, input.project_path),
            topic: input.topic,
            lesson: input.lesson,
            framework: input.framework,
            language: input.language
          });
    }
  };
}

export function createSyncSharedLessonsTool(manager: WorkspaceManager) {
  return {
    name: 'sync_shared_lessons',
    description: 'Sync shared lessons into the local review file.',
    schema: syncSharedLessonsInputSchema,
    execute: (input: z.infer<typeof syncSharedLessonsInputSchema>) => {
      const service = manager.getBundle(input.project_path).compatibilityService;
      return service.syncSharedLessons({
            workspaceRoot: resolveWorkspaceRoot(input.workspaceRoot, input.project_path),
            framework: input.framework,
            language: input.language,
            limit: input.limit
          });
    }
  };
}
