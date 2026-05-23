import * as fs from 'fs/promises';
import * as path from 'path';
import { MemoryStoragePort } from '../../application/ports/MemoryStoragePort';

export class FileMemoryStorageAdapter implements MemoryStoragePort {
  public async read(absolutePath: string): Promise<string> {
    return await fs.readFile(absolutePath, 'utf-8');
  }

  public async write(absolutePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content, 'utf-8');
  }

  public async exists(absolutePath: string): Promise<boolean> {
    try {
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }
}
