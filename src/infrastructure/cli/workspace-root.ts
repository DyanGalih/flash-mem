import * as fs from 'fs-extra';
import * as path from 'path';
import { PathSanitizer } from '../../infrastructure/safety/PathSanitizer';

export function findNearestGitRoot(startDir: string = process.cwd()): string | null {
  let current = path.resolve(startDir);

  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

export function resolveWorkspaceRootForAdd(projectPath?: string, cwd: string = process.cwd()): string {
  const fallbackRoot = findNearestGitRoot(cwd) ?? cwd;
  const normalizedProjectPath = projectPath?.trim();
  const candidatePath = !normalizedProjectPath
    ? fallbackRoot
    : path.isAbsolute(normalizedProjectPath)
      ? normalizedProjectPath
      : path.resolve(fallbackRoot, normalizedProjectPath);

  const resolvedRoot = PathSanitizer.resolveRoot(candidatePath);
  if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) {
    throw new Error(`Workspace path "${resolvedRoot}" does not exist or is not a directory`);
  }

  return resolvedRoot;
}