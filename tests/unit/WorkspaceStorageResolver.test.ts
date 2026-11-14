import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceStorageResolver } from '../../src/infrastructure/safety/WorkspaceStorageResolver';

describe('WorkspaceStorageResolver', () => {
  let tempHome: string;
  const originalFlashMemHome = process.env.FLASH_MEM_HOME;

  beforeEach(() => {
    tempHome = path.join(os.tmpdir(), `flash-mem-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`);
    fs.ensureDirSync(tempHome);
    process.env.FLASH_MEM_HOME = tempHome;
  });

  afterEach(() => {
    if (originalFlashMemHome) {
      process.env.FLASH_MEM_HOME = originalFlashMemHome;
    } else {
      delete process.env.FLASH_MEM_HOME;
    }
    fs.removeSync(tempHome);
  });

  it('deterministically computes identical workspace ID for identical paths', () => {
    const p1 = '/tmp/my-project';
    const p2 = '/tmp/my-project';
    const id1 = WorkspaceStorageResolver.computeWorkspaceId(p1);
    const id2 = WorkspaceStorageResolver.computeWorkspaceId(p2);

    expect(id1).toBe(id2);
    expect(id1.startsWith('my-project-')).toBe(true);
  });

  it('computes distinct workspace IDs for different projects', () => {
    const idA = WorkspaceStorageResolver.computeWorkspaceId('/tmp/project-alpha');
    const idB = WorkspaceStorageResolver.computeWorkspaceId('/tmp/project-beta');

    expect(idA).not.toBe(idB);
  });

  it('resolves correct paths under central workspaces directory', () => {
    const workspaceRoot = '/tmp/test-repo';
    const info = WorkspaceStorageResolver.resolveWorkspaceStorage(workspaceRoot);

    expect(info.workspaceDir.startsWith(path.join(tempHome, 'workspaces'))).toBe(true);
    expect(info.dbPath).toBe(path.join(info.workspaceDir, 'flashmem.sqlite'));
    expect(info.metadataPath).toBe(path.join(info.workspaceDir, 'workspace.json'));
  });

  it('initializes central workspace directory and writes workspace.json metadata', () => {
    const workspaceRoot = '/tmp/test-repo-init';
    const info = WorkspaceStorageResolver.ensureWorkspaceStorageInitialized(workspaceRoot);

    expect(fs.existsSync(info.workspaceDir)).toBe(true);
    expect(fs.existsSync(info.metadataPath)).toBe(true);

    const metadata = fs.readJsonSync(info.metadataPath);
    expect(metadata.rootPath).toBe(path.resolve(workspaceRoot));
    expect(metadata.name).toBe('test-repo-init');
    expect(typeof metadata.createdAt).toBe('number');
    expect(typeof metadata.lastAccessedAt).toBe('number');
  });

  it('does not touch or create any files in the workspace repository', () => {
    const workspaceRoot = path.join(tempHome, 'actual-repo');
    fs.ensureDirSync(workspaceRoot);

    WorkspaceStorageResolver.ensureWorkspaceStorageInitialized(workspaceRoot);

    // Repository directory itself must remain completely pristine
    const files = fs.readdirSync(workspaceRoot);
    expect(files).toEqual([]);
  });
});
