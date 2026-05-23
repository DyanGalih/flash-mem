import * as fs from 'fs-extra';
import * as path from 'path';
import { ProjectMetadata, ProjectMetadataSchema } from '../../domain/entities/ProjectMetadata';
import { PathSanitizer } from '../../infrastructure/safety/PathSanitizer';
import { createDatabaseConnection } from '../../infrastructure/database/connection';
import { SchemaRepository } from '../../infrastructure/database/repositories/SchemaRepository';

export interface InitializationResult {
  success: boolean;
  path: string;
  metadata: ProjectMetadata;
}

export class InitializeProjectService {
  /**
   * Initializes a flash-mem workspace directory structure, metadata, database, and ignores.
   * @param targetDirectory The directory to initialize (relative or absolute).
   */
  public execute(targetDirectory: string): InitializationResult {
    const resolvedRoot = PathSanitizer.resolveRoot(targetDirectory);

    // Verify root folder exists
    if (!fs.existsSync(resolvedRoot)) {
      throw new Error(`Target directory "${targetDirectory}" does not exist`);
    }

    // Verify it is actually a directory (collisions edge case)
    const rootStat = fs.statSync(resolvedRoot);
    if (!rootStat.isDirectory()) {
      throw new Error(`Target path "${targetDirectory}" is not a directory`);
    }

    const flashMemDir = PathSanitizer.sanitizeSubPath(resolvedRoot, '.flash-mem');
    const exportsDir = PathSanitizer.sanitizeSubPath(resolvedRoot, '.flash-mem/exports');
    const indexJsonFile = PathSanitizer.sanitizeSubPath(resolvedRoot, '.flash-mem/index.json');
    const dbFile = PathSanitizer.sanitizeSubPath(resolvedRoot, '.flash-mem/flashmem.sqlite');

    // 1. Check Colliding File Name: if .flash-mem exists but is a regular file
    if (fs.existsSync(flashMemDir)) {
      const stat = fs.statSync(flashMemDir);
      if (!stat.isDirectory()) {
        throw new Error(`A regular file named ".flash-mem" already exists at the project root`);
      }
    }

    // 2. Create directory structures (FR-001, FR-002) with 0700 permissions (FR-013)
    fs.ensureDirSync(flashMemDir);
    this.setPermissions(flashMemDir, 0o700);

    fs.ensureDirSync(exportsDir);
    this.setPermissions(exportsDir, 0o700);

    // 3. Detect project name and handle metadata (FR-003, FR-005, FR-006)
    let metadata: ProjectMetadata;
    if (fs.existsSync(indexJsonFile)) {
      // Re-initialization (idempotency, FR-006): preserve existing metadata
      try {
        const raw = fs.readFileSync(indexJsonFile, 'utf-8');
        const parsed = JSON.parse(raw);
        metadata = ProjectMetadataSchema.parse(parsed);
      } catch (err) {
        // Fallback: recreate if corrupt
        metadata = this.buildFreshMetadata(resolvedRoot);
        this.writeMetadataFile(indexJsonFile, metadata);
      }
    } else {
      // Fresh init
      metadata = this.buildFreshMetadata(resolvedRoot);
      this.writeMetadataFile(indexJsonFile, metadata);
    }

    // 4. Initialize SQLite Database & tables (FR-004, FR-009)
    const db = createDatabaseConnection(dbFile);
    try {
      const schemaRepo = new SchemaRepository(db);
      schemaRepo.initializeSchema();
    } finally {
      db.close();
    }
    this.setPermissions(dbFile, 0o600);

    // 5. Update .gitignore if it exists (FR-010)
    const gitignorePath = path.join(resolvedRoot, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      this.updateGitignore(gitignorePath);
    }

    // 6. Automatically drop agent instruction files if they don't exist
    this.writeAgentInstructions(resolvedRoot);

    return {
      success: true,
      path: flashMemDir,
      metadata
    };
  }

  private writeAgentInstructions(resolvedRoot: string): void {
    const instructionContent = `# Engineering Memory Protocol (flash-mem)

You have access to the \`flash-mem\` MCP server which provides engineering memory for this project.

## Your Responsibilities:
1. **Proactive Context Retrieval:** Before writing code, planning, or answering architectural questions, ALWAYS call \`memory_search\` or \`get_relevant_context\` to check for existing conventions or constraints.
2. **Autonomous Memory Storage:** If you and the user establish a new rule, make an architectural decision, or fix a tricky bug, you MUST autonomously call \`add_memory\` to store it as a convention or finding. **Do not wait for the user to ask you to save it.**
3. **Project Summary:** Keep the project's architectural high-level state up to date using \`update_project_summary\` if the structure of the project fundamentally changes.

Never ignore these rules. Flash-mem is your primary source of truth for project-specific knowledge.`;

    const targetFiles = [
      '.cursorrules',
      'CLINE.md',
      'ANTIGRAVITY.md',
      'AGENTS.md',
    ];

    for (const filename of targetFiles) {
      const filePath = path.join(resolvedRoot, filename);
      try {
        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, instructionContent, 'utf-8');
        } else {
          const existingContent = fs.readFileSync(filePath, 'utf-8');
          if (!existingContent.includes('flash-mem')) {
            fs.appendFileSync(filePath, '\n\n' + instructionContent, 'utf-8');
          }
        }
      } catch (e) {}
    }

    const githubDir = path.join(resolvedRoot, '.github');
    try {
      fs.ensureDirSync(githubDir);
      const copilotFile = path.join(githubDir, 'copilot-instructions.md');
      if (!fs.existsSync(copilotFile)) {
        fs.writeFileSync(copilotFile, instructionContent, 'utf-8');
      } else {
        const existingContent = fs.readFileSync(copilotFile, 'utf-8');
        if (!existingContent.includes('flash-mem')) {
          fs.appendFileSync(copilotFile, '\n\n' + instructionContent, 'utf-8');
        }
      }
    } catch (e) {}
  }

  private setPermissions(targetPath: string, mode: number): void {
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(targetPath, mode);
      } catch (err: any) {
        throw new Error(`Write permission denied: Unable to set permissions on "${targetPath}". Reason: ${err.message}`);
      }
    }
  }

  private buildFreshMetadata(resolvedRoot: string): ProjectMetadata {
    const projectName = this.detectProjectName(resolvedRoot);
    const metadata: ProjectMetadata = {
      name: projectName,
      initializedAt: new Date().toISOString(),
      schemaVersion: '1.0.0'
    };
    return ProjectMetadataSchema.parse(metadata);
  }

  private writeMetadataFile(filePath: string, metadata: ProjectMetadata): void {
    try {
      fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), 'utf-8');
      this.setPermissions(filePath, 0o600);
    } catch (err: any) {
      throw new Error(`Write permission denied: Unable to write index.json metadata file. Reason: ${err.message}`);
    }
  }

  private detectProjectName(resolvedRoot: string): string {
    // 1. package.json
    const packageJsonPath = path.join(resolvedRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = fs.readJsonSync(packageJsonPath);
        if (pkg.name && typeof pkg.name === 'string') {
          return this.cleanProjectName(pkg.name);
        }
      } catch (e) {}
    }

    // 2. Cargo.toml
    const cargoTomlPath = path.join(resolvedRoot, 'Cargo.toml');
    if (fs.existsSync(cargoTomlPath)) {
      try {
        const content = fs.readFileSync(cargoTomlPath, 'utf-8');
        const match = content.match(/^\s*name\s*=\s*["']([^"']+)["']/m);
        if (match && match[1]) {
          return this.cleanProjectName(match[1]);
        }
      } catch (e) {}
    }

    // 3. pyproject.toml
    const pyprojectTomlPath = path.join(resolvedRoot, 'pyproject.toml');
    if (fs.existsSync(pyprojectTomlPath)) {
      try {
        const content = fs.readFileSync(pyprojectTomlPath, 'utf-8');
        const match = content.match(/^\s*name\s*=\s*["']([^"']+)["']/m);
        if (match && match[1]) {
          return this.cleanProjectName(match[1]);
        }
      } catch (e) {}
    }

    // Fallback: directory base name
    return this.cleanProjectName(path.basename(resolvedRoot));
  }

  private cleanProjectName(name: string): string {
    // Replace invalid characters with hyphens
    let cleaned = name.trim().replace(/[^a-zA-Z0-9-_]/g, '-');
    // Remove duplicate hyphens
    cleaned = cleaned.replace(/-+/g, '-');
    // Fallback if empty
    return cleaned || 'unnamed-project';
  }

  private updateGitignore(gitignorePath: string): void {
    try {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      const lines = gitignoreContent.split(/\r?\n/);
      const isIgnored = lines.some(line => {
        const trimmed = line.trim();
        return trimmed === '.flash-mem' || trimmed === '.flash-mem/';
      });

      if (!isIgnored) {
        // Add a newline if it doesn't end with one, then append
        const prefix = (gitignoreContent.length > 0 && !gitignoreContent.endsWith('\n')) ? '\n' : '';
        fs.appendFileSync(gitignorePath, `${prefix}.flash-mem/\n`, 'utf-8');
      }
    } catch (e) {}
  }
}
