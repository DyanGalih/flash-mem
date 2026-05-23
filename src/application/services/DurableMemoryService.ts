import * as path from 'path';
import { MemoryStoragePort } from '../ports/MemoryStoragePort';

export class DurableMemoryService {
  private readonly allowedRoots = ['docs/memory', '.specify'];
  private readonly workspaceRoot: string;

  constructor(
    workspaceRoot: string,
    private readonly storage: MemoryStoragePort
  ) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  private resolveSafePath(relativePath: string): string {
    const absolutePath = path.resolve(this.workspaceRoot, relativePath);
    if (!absolutePath.startsWith(this.workspaceRoot)) {
      throw new Error(`Path traversal blocked: ${relativePath}`);
    }

    const isAllowed = this.allowedRoots.some(root => 
      absolutePath.startsWith(path.resolve(this.workspaceRoot, root))
    );

    if (!isAllowed) {
      throw new Error(`Access denied. Must be within allowed roots: ${this.allowedRoots.join(', ')}`);
    }

    return absolutePath;
  }

  public async readDurableMemory(relativePath: string): Promise<string> {
    const safePath = this.resolveSafePath(relativePath);
    return await this.storage.read(safePath);
  }

  public async writeDurableMemory(relativePath: string, content: string): Promise<void> {
    const safePath = this.resolveSafePath(relativePath);
    await this.storage.write(safePath, content);
  }
}
