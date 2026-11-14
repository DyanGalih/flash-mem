import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { PathSanitizer } from './PathSanitizer';

export interface WorkspaceStorageInfo {
  workspaceId: string;
  workspaceDir: string;
  dbPath: string;
  metadataPath: string;
}

export interface WorkspaceMetadata {
  rootPath: string;
  name: string;
  createdAt: number;
  lastAccessedAt: number;
}

export class WorkspaceStorageResolver {
  /**
   * Resolves the root directory where centralized flash-mem workspace databases are stored.
   * Can be overridden by FLASH_MEM_HOME environment variable for testing or custom environments.
   */
  public static getCentralStorageRoot(): string {
    const customHome = process.env.FLASH_MEM_HOME;
    if (customHome && customHome.trim().length > 0) {
      return path.resolve(customHome);
    }
    return path.join(os.homedir(), '.flash-mem');
  }

  /**
   * Resolves the central workspaces directory: ~/.flash-mem/workspaces
   */
  public static getWorkspacesDirectory(): string {
    return path.join(this.getCentralStorageRoot(), 'workspaces');
  }

  /**
   * Deterministically computes a unique workspace ID based on the canonical workspace path.
   * Format: <sanitized-basename>-<shortHash>
   * @param canonicalRoot Normalized canonical workspace root path
   */
  public static computeWorkspaceId(canonicalRoot: string): string {
    const resolvedRoot = PathSanitizer.resolveRoot(canonicalRoot);
    const realRoot = fs.existsSync(resolvedRoot) ? fs.realpathSync.native(resolvedRoot) : resolvedRoot;
    const rawBase = path.basename(realRoot).toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'workspace';
    const slug = rawBase.slice(0, 32);
    const hash = crypto.createHash('sha256').update(realRoot).digest('hex').slice(0, 8);
    return `${slug}-${hash}`;
  }

  /**
   * Resolves paths for a workspace's central storage without creating files.
   * @param workspaceRootInput The input workspace root path
   */
  public static resolveWorkspaceStorage(workspaceRootInput: string): WorkspaceStorageInfo {
    const resolvedRoot = PathSanitizer.resolveRoot(workspaceRootInput);
    const realRoot = fs.existsSync(resolvedRoot) ? fs.realpathSync.native(resolvedRoot) : resolvedRoot;
    const workspaceId = this.computeWorkspaceId(realRoot);
    const workspaceDir = path.join(this.getWorkspacesDirectory(), workspaceId);
    const dbPath = path.join(workspaceDir, 'flashmem.sqlite');
    const metadataPath = path.join(workspaceDir, 'workspace.json');

    return {
      workspaceId,
      workspaceDir,
      dbPath,
      metadataPath,
    };
  }

  /**
   * Ensures the central workspace directory exists with 0700 permissions and initializes/updates workspace.json.
   * @param workspaceRootInput The input workspace root path
   */
  public static ensureWorkspaceStorageInitialized(workspaceRootInput: string): WorkspaceStorageInfo {
    const info = this.resolveWorkspaceStorage(workspaceRootInput);
    const resolvedRoot = PathSanitizer.resolveRoot(workspaceRootInput);
    const realRoot = fs.existsSync(resolvedRoot) ? fs.realpathSync.native(resolvedRoot) : resolvedRoot;

    if (!fs.existsSync(info.workspaceDir)) {
      fs.ensureDirSync(info.workspaceDir);
      try {
        fs.chmodSync(info.workspaceDir, 0o700);
      } catch {
        // Platform or permission fallback
      }
    }

    const now = Date.now();
    let metadata: WorkspaceMetadata;

    if (fs.existsSync(info.metadataPath)) {
      try {
        metadata = fs.readJsonSync(info.metadataPath);
        metadata.lastAccessedAt = now;
      } catch {
        metadata = {
          rootPath: realRoot,
          name: path.basename(realRoot),
          createdAt: now,
          lastAccessedAt: now,
        };
      }
    } else {
      metadata = {
        rootPath: realRoot,
        name: path.basename(realRoot),
        createdAt: now,
        lastAccessedAt: now,
      };
    }

    fs.writeJsonSync(info.metadataPath, metadata, { spaces: 2 });
    return info;
  }
}
