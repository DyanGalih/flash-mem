import * as fs from 'fs-extra';
import * as path from 'path';
import { ProjectMetadata, ProjectMetadataSchema } from '../../domain/entities/ProjectMetadata';
import { PathSanitizer } from '../../infrastructure/safety/PathSanitizer';
import { createDatabaseConnection } from '../../infrastructure/database/connection';
import { SchemaRepository } from '../../infrastructure/database/repositories/SchemaRepository';

const PROTOCOL_START_MARKER_TEXT = '<!-- flash-mem-protocol-start';
const PROTOCOL_END_MARKER_TEXT = '<!-- flash-mem-protocol-end -->';

export type AgentInstructionTargetId = 'antigravity' | 'agents' | 'cursor' | 'cline' | 'copilot';

export interface AgentInstructionTargetDefinition {
  id: AgentInstructionTargetId;
  label: string;
  filePath: string;
  kind: string;
}

export interface WriteAgentInstructionsOptions {
  targetIds?: AgentInstructionTargetId[];
  existingOnly?: boolean;
}

export interface WriteAgentInstructionsResult {
  updated: string[];
  skipped: string[];
  detected: AgentInstructionTargetDefinition[];
}

export const AGENT_INSTRUCTION_TARGETS: AgentInstructionTargetDefinition[] = [
  { id: 'antigravity', label: 'Antigravity', filePath: 'ANTIGRAVITY.md', kind: 'antigravity' },
  { id: 'agents', label: 'AGENTS', filePath: 'AGENTS.md', kind: 'agent' },
  { id: 'cursor', label: 'Cursor', filePath: '.cursorrules', kind: 'cursor' },
  { id: 'cline', label: 'Cline', filePath: 'CLINE.md', kind: 'cline' },
  { id: 'copilot', label: 'GitHub Copilot', filePath: '.github/copilot-instructions.md', kind: 'copilot' }
];

function buildAgentInstructionBlock(version: number): string {
  const startMarker = `${PROTOCOL_START_MARKER_TEXT} v${version} -->`;

  return [
    startMarker,
    `# flash-mem`,
    ``,
    `## Goal`,
    `Keep durable project memory current and easy to retrieve.`,
    ``,
    `## Rules`,
    `- Search first: read \`get_project_summary\` and \`search_memory\` before changing code.`,
    `- Store only durable knowledge: decisions, conventions, constraints, bugs, workflows.`,
    `- Write immediately: use \`add_memory\` for new durable facts and \`update_memory\` for changes.`,
    `- Update summaries when architecture or shared conventions change.`,
    `- Prefer explicit deletion with audit trail.`,
    ``,
    `## Tools`,
    `- Read: \`get_project_summary\`, \`search_memory\`, \`get_relevant_context\``,
    `- Write: \`add_memory\`, \`update_memory\`, \`delete_memory\``,
    `- Maintain: \`capture_artifact_memory\`, \`export_markdown\`, \`rebuild_index\``,
    ``,
    `## Workflow`,
    `1. Read summary.`,
    `2. Search memory.`,
    `3. Add or update durable memory.`,
    `4. Update summary when needed.`,
    ``,
    `Use ` + '`flash-mem update`' + ` to refresh this block if it changes.`,
    PROTOCOL_END_MARKER_TEXT
  ].join('\n');
}

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
  public execute(targetDirectory: string, options: { promptTargetIds?: AgentInstructionTargetId[] } = {}): InitializationResult {
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
    this.writeAgentInstructions(resolvedRoot, { targetIds: options.promptTargetIds });

    return {
      success: true,
      path: flashMemDir,
      metadata
    };
  }

  // Increment this version number whenever the agent instruction template changes.
  // Existing files with an older version marker will be automatically updated.
  private static readonly PROTOCOL_VERSION = 3;
  private static readonly PROTOCOL_START_MARKER = PROTOCOL_START_MARKER_TEXT;
  private static readonly PROTOCOL_END_MARKER = PROTOCOL_END_MARKER_TEXT;

  /**
   * Injects or updates the Engineering Memory Protocol block in all known agent
   * instruction files. Safe to call on re-init: it replaces a stale versioned
   * block without touching the surrounding content.
   */
  public getAgentInstructionTargets(resolvedRoot: string): Array<AgentInstructionTargetDefinition & { absolutePath: string; exists: boolean }> {
    return AGENT_INSTRUCTION_TARGETS.map((definition) => {
      const absolutePath = path.join(resolvedRoot, definition.filePath);
      return {
        ...definition,
        absolutePath,
        exists: fs.existsSync(absolutePath)
      };
    });
  }

  public writeAgentInstructions(
    resolvedRoot: string,
    options: WriteAgentInstructionsOptions = {}
  ): WriteAgentInstructionsResult {
    const version = InitializeProjectService.PROTOCOL_VERSION;
    const endMarker = InitializeProjectService.PROTOCOL_END_MARKER;
    const block = buildAgentInstructionBlock(version);

    const staleVersionPattern = new RegExp(
      `${InitializeProjectService.PROTOCOL_START_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} v(\\d+) -->.*?${endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      's'
    );


    const targetDefinitions = options.targetIds
      ? AGENT_INSTRUCTION_TARGETS.filter((definition) => options.targetIds?.includes(definition.id))
      : AGENT_INSTRUCTION_TARGETS;

    const targetFiles = options.existingOnly
      ? targetDefinitions.filter((definition) => fs.existsSync(path.join(resolvedRoot, definition.filePath)))
      : targetDefinitions;

    const updated: string[] = [];
    const skipped: string[] = [];
    const detected = this.getAgentInstructionTargets(resolvedRoot).filter((target) => target.exists);

    const processFile = (filePath: string) => {
      try {
        if (!fs.existsSync(filePath)) {
          fs.ensureDirSync(path.dirname(filePath));
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
          // Replace the existing prompt file with the current canonical block.
          fs.writeFileSync(filePath, block, 'utf-8');
          updated.push(filePath);
        }
      } catch (e) {
        skipped.push(filePath);
      }
    };

    for (const filename of targetFiles) {
      processFile(path.join(resolvedRoot, filename.filePath));
    }

    return { updated, skipped, detected };
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
