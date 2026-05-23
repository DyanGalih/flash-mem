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

  // Increment this version number whenever the agent instruction template changes.
  // Existing files with an older version marker will be automatically updated.
  private static readonly PROTOCOL_VERSION = 2;
  private static readonly PROTOCOL_START_MARKER = '<!-- flash-mem-protocol-start';
  private static readonly PROTOCOL_END_MARKER = '<!-- flash-mem-protocol-end -->';

  /**
   * Injects or updates the Engineering Memory Protocol block in all known agent
   * instruction files. Safe to call on re-init: it replaces a stale versioned
   * block without touching the surrounding content.
   */
  public writeAgentInstructions(resolvedRoot: string): { updated: string[]; skipped: string[] } {
    const version = InitializeProjectService.PROTOCOL_VERSION;
    const startMarker = `${InitializeProjectService.PROTOCOL_START_MARKER} v${version} -->`;
    const endMarker = InitializeProjectService.PROTOCOL_END_MARKER;

    const block = [
      startMarker,
      `# Engineering Memory Protocol (flash-mem)`,
      ``,
      `You are an AI agent working in a project backed by **flash-mem** — a durable engineering memory system.`,
      ``,
      `## Primary goal`,
      `Store and retrieve stable project knowledge so agents can avoid repeating research, architecture mistakes, and historical bugs.`,
      ``,
      `## Core operating rules`,
      `1. **Retrieval first** - Before planning or writing code, ALWAYS call \`search_memory\` or \`get_relevant_context\` to check for existing conventions or constraints.`,
      `2. **Durable only** - Store only durable knowledge: architecture decisions, conventions, bug patterns, workflow rules, and project summaries. Do not store transient notes, task chatter, or throwaway implementation details.`,
      `3. **Write discipline** - When new durable knowledge is established, call \`add_memory\` immediately. Do NOT wait for the user to ask. Include category, tags, source, and rationale.`,
      `4. **Summary hygiene** - Call \`update_project_summary\` if the project architecture meaningfully changes.`,
      `5. **Safety** - Deletions must be explicit and auditable. Prefer \`update_memory\` over rewriting when meaning is evolving.`,
      ``,
      `## Tool reference`,
      `- \`get_project_summary\` — retrieve the high-level project state`,
      `- \`search_memory\` — keyword/semantic search across durable memories`,
      `- \`get_relevant_context\` — compact, decision-oriented context for the current task`,
      `- \`add_memory\` — create a new durable memory entry`,
      `- \`update_memory\` — modify an existing entry`,
      `- \`delete_memory\` — remove with audit trail`,
      `- \`capture_artifact_memory\` — convert a doc/artifact into durable memory`,
      `- \`export_markdown\` / \`rebuild_index\` — backup and maintenance`,
      ``,
      `## If the MCP connection is not working`,
      `Run the following command in the project root to manually re-inject this prompt and re-initialize the workspace:`,
      `\`\`\`bash`,
      `flash-mem inject-prompts`,
      `\`\`\``,
      `If \`flash-mem\` is not globally installed, use the full path:`,
      `\`\`\`bash`,
      `node /path/to/flash-mem/dist/infrastructure/cli/index.js inject-prompts`,
      `\`\`\``,
      endMarker
    ].join('\n');

    const staleVersionPattern = new RegExp(
      `${InitializeProjectService.PROTOCOL_START_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} v(\\d+) -->.*?${endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      's'
    );

    const targetFiles = [
      '.cursorrules',
      'CLINE.md',
      'ANTIGRAVITY.md',
      'AGENTS.md',
    ];

    const updated: string[] = [];
    const skipped: string[] = [];

    const processFile = (filePath: string) => {
      try {
        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, block, 'utf-8');
          updated.push(filePath);
          return;
        }

        const existingContent = fs.readFileSync(filePath, 'utf-8');
        const staleMatch = staleVersionPattern.exec(existingContent);

        if (staleMatch) {
          // Replace stale versioned block with the current version
          const existingVersion = parseInt(staleMatch[1], 10);
          if (existingVersion < version) {
            const newContent = existingContent.replace(staleVersionPattern, block);
            fs.writeFileSync(filePath, newContent, 'utf-8');
            updated.push(filePath);
          } else {
            skipped.push(filePath);
          }
        } else if (!existingContent.includes('flash-mem')) {
          // No flash-mem mention at all — append the block
          const prefix = existingContent.length > 0 && !existingContent.endsWith('\n') ? '\n' : '';
          fs.appendFileSync(filePath, prefix + '\n' + block, 'utf-8');
          updated.push(filePath);
        } else {
          // Has flash-mem content but no version marker (pre-versioning install)
          // Append a comment directing the user to run inject-prompts manually
          const upgradeNote = `\n\n<!-- flash-mem: This file contains an unversioned flash-mem block from a previous install. Run \`flash-mem inject-prompts\` to upgrade to the latest protocol. -->`;
          if (!existingContent.includes('flash-mem: This file contains an unversioned')) {
            fs.appendFileSync(filePath, upgradeNote, 'utf-8');
          }
          skipped.push(filePath);
        }
      } catch (e) {
        skipped.push(filePath);
      }
    };

    for (const filename of targetFiles) {
      processFile(path.join(resolvedRoot, filename));
    }

    const githubDir = path.join(resolvedRoot, '.github');
    try {
      fs.ensureDirSync(githubDir);
      processFile(path.join(githubDir, 'copilot-instructions.md'));
    } catch (e) {}

    return { updated, skipped };
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
