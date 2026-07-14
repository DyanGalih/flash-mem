import * as fs from 'fs-extra';
import * as path from 'path';
import { IndexingInputGuard } from '../safety/IndexingInputGuard';
import { PathSanitizer } from '../safety/PathSanitizer';

export interface ArtifactDocument {
  absolutePath: string;
  relativePath: string;
  content: string;
}

export class ArtifactReader {
  constructor(private readonly indexingInputGuard = new IndexingInputGuard()) { }

  public read(workspaceRoot: string, artifactPath: string): ArtifactDocument {
    const resolvedRoot = PathSanitizer.resolveRoot(workspaceRoot);
    const relativePath = this.indexingInputGuard.normalizeSourcePath(resolvedRoot, artifactPath);
    const absolutePath = path.resolve(resolvedRoot, relativePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Artifact not found: "${artifactPath}"`);
    }

    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) {
      throw new Error(`Artifact is not a file: "${artifactPath}"`);
    }

    return {
      absolutePath,
      relativePath,
      content: fs.readFileSync(absolutePath, 'utf-8')
    };
  }

  public readCompatibilityArtifact(workspaceRoot: string, featurePath: string, artifactName: string): ArtifactDocument {
    // Dynamically handle configured artifact templates instead of hardcoding 'spec.md' or 'tasks.md'
    const fullPath = path.join(featurePath, artifactName);
    return this.read(workspaceRoot, fullPath);
  }
}