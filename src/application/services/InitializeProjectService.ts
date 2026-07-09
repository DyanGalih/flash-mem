import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { ProjectMetadata, ProjectMetadataSchema } from '../../domain/entities/ProjectMetadata';
import { createDatabaseConnection } from '../../infrastructure/database/connection';
import { SchemaRepository } from '../../infrastructure/database/repositories/SchemaRepository';
import { PathSanitizer } from '../../infrastructure/safety/PathSanitizer';

const PROTOCOL_START_MARKER_TEXT = '<!-- flash-mem-protocol-start';
const PROTOCOL_END_MARKER_TEXT = '<!-- flash-mem-protocol-end -->';

export type MemoryProtocolProfile = 'default' | 'strict';

export type AgentInstructionTargetId = 'antigravity' | 'agents' | 'cursor' | 'cline' | 'copilot' | 'codex';

export interface AgentInstructionTargetDefinition {
  id: AgentInstructionTargetId;
  label: string;
  filePath: string;
  kind: string;
}

export interface WriteAgentInstructionsOptions {
  targetIds?: AgentInstructionTargetId[];
  existingOnly?: boolean;
  profile?: MemoryProtocolProfile;
}

export interface WriteAgentInstructionsResult {
  updated: string[];
  skipped: string[];
  detected: AgentInstructionTargetDefinition[];
}

export const AGENT_INSTRUCTION_TARGETS: AgentInstructionTargetDefinition[] = [
  { id: 'antigravity', label: 'Antigravity', filePath: '.agents/AGENTS.md', kind: 'antigravity' },
  { id: 'cursor', label: 'Cursor', filePath: '.cursor/rules/flash-mem.mdc', kind: 'cursor' },
  { id: 'copilot', label: 'GitHub Copilot', filePath: '.github/copilot-instructions.md', kind: 'copilot' },
  { id: 'codex', label: 'Codex', filePath: 'AGENTS.md', kind: 'agent' },
  { id: 'cline', label: 'Cline', filePath: 'CLINE.md', kind: 'cline' },
  { id: 'agents', label: 'Other AI Agents', filePath: 'AGENTS.md', kind: 'agent' }
];



function buildAgentInstructionBlock(version: number, profile: MemoryProtocolProfile = 'default'): string {
  const startMarker = `${PROTOCOL_START_MARKER_TEXT} v${version} -->`;

  const baseContent = [
    startMarker,
    `# flash-mem`,
    ``,
    `## Goal`,
    `Keep durable project memory current and easy to retrieve.`,
    ``,
    `## Pre-Flight Gate — MANDATORY`,
    `Before ANY of the following actions, you MUST call \`get_project_summary\` and \`search_memory\` first`,
    `(if flash-mem is unavailable, note it explicitly and continue with local files):`,
    `- Creating or updating an implementation plan`,
    `- Writing, modifying, or deleting source code`,
    `- Generating specifications, tasks, or technical plans`,
    `- Making architecture or design decisions`,
    `- Responding to debugging or incident questions`,
    ``,
    `Do NOT skip this step. Do NOT proceed to file reads, code edits, or plan generation until flash-mem has been queried.`,
    `Exception: For trivially scoped changes (e.g., typo fixes, formatting, single-line comment edits) where no architectural or behavioral context is needed, the gate may be skipped.`,
    ``,
    `## Rules`,
    `- Treat flash-mem as the source of truth for durable project memory.`,
    `- Search first (see Pre-Flight Gate above for the exhaustive trigger list).`,
    `- Prefer summaries, metadata, tags, confidence, and related files before loading full memory content.`,
    `- Store only durable knowledge: decisions, conventions, constraints, bugs, workflows.`,
    `- Use \`update_memory\` when refining an existing memory; use \`add_memory\` for genuinely new durable facts.`,
    `- Attach relationships when a memory depends on or explains another memory.`,
    `- Write immediately: use \`add_memory\` for new durable facts and \`update_memory\` for changes.`,
    `- If flash-mem retrieval is empty or incomplete, inspect the markdown file and do not skip \`capture_artifact_memory\`; if it contains durable knowledge, capture it before treating it as current context.`,
    `- If \`capture_artifact_memory\` still returns nothing useful, keep the markdown file as the backup artifact.`,
    `- Update summaries when architecture or shared conventions change.`,
    `- Prefer explicit deletion with audit trail.`,
    ``,
    `## Memory Quality`,
    `- Capture validated outcomes and stable constraints, not transient status updates.`,
    `- Include confidence-aware summaries; avoid low-confidence assertions unless clearly marked for verification.`,
    `- Keep entries scoped and deduplicated: one durable concept per memory.`,
    `- Never store secrets, credentials, tokens, or private keys in memory content.`,
    ``,
    `## Tools`,
    `- Read: \`get_project_summary\`, \`search_memory\`, \`get_relevant_context\``,
    `- Write: \`add_memory\`, \`update_memory\`, \`delete_memory\``,
    `- Maintain: \`capture_artifact_memory\`, \`export_markdown\``,
    ``,
    `## Workflow`,
    `1. Read summary.`,
    `2. Search memory.`,
    `3. Load full memory only when the summary is not enough.`,
    `4. Add or update durable memory.`,
    `5. Update summary when needed.`,
    ``,
    `## Workflow By Intent`,
    `- Planning: read summary, search relevant memories, then constrain plans to validated decisions and conventions.`,
    `- Implementation: consult related memories first; record only validated architecture or behavior changes.`,
    `- Incident/Fix: capture root cause, fix pattern, and prevention guidance as durable memory.`,
    ``,
    `## Maintenance`,
    `- Prefer \`capture_artifact_memory\` for markdown file changes and new markdown artifacts when the file contains durable knowledge, and never skip capture just because the file already exists.`,
    `- Keep the markdown file as the backup artifact only when capture returns nothing useful.`,
    `- Use \`rebuild_index\` only when you need a rare full markdown rescan.`,
    ``,
    `## Do Not`,
    `- Do not write duplicate synthesis snapshots as separate durable memories.`,
    `- Do not dump broad low-confidence notes without verification markers.`,
    `- Do not overwrite unrelated memory content when a targeted update is sufficient.`,
    ``,
    `## Forbidden Destructive Database Examples`,
    `The policy is framework-agnostic. It applies to any language, framework, ORM, migration tool, database CLI, script, test helper, container command, or CI job that can erase or reset data.`,
    `Forbidden examples include, but are not limited to:`,
    `- Generic SQL / Database CLI: DROP DATABASE, DROP SCHEMA, DROP TABLE, destructive TRUNCATE, destructive DELETE FROM ... without a safe scoped condition, schema reset scripts, database wipe/reset shell scripts`,
    `- Laravel / PHP: php artisan migrate:fresh, php artisan migrate:refresh, php artisan db:wipe`,
    `- Node.js / JavaScript / TypeScript: Prisma destructive reset commands (e.g. prisma migrate reset), TypeORM schema synchronization or drop behavior against non-test databases, Sequelize destructive sync behavior (e.g. sync({ force: true })), Knex or custom migration reset scripts that drop tables or schemas`,
    `- Ruby / Rails: rails db:drop, rails db:reset, rails db:migrate:reset`,
    `- Python / Django / SQLAlchemy / Alembic: commands or scripts that drop and recreate schemas, migration reset scripts that erase existing data, test or seed scripts that truncate persistent tables outside isolated test databases`,
    `- Java / JVM: Hibernate ddl-auto=create, create-drop, or equivalent destructive schema generation against persistent databases, Flyway or Liquibase clean/drop/reset actions against non-test databases`,
    `- .NET: Entity Framework database delete/reset commands against persistent databases, migration or seed scripts that drop, truncate, or recreate production-like schemas`,
    `- Containers / DevOps / CI: deleting persistent database volumes, running reset scripts against shared Docker Compose databases, CI/CD jobs that clean databases without proving the target is disposable, infrastructure scripts that replace or destroy persistent database resources`
  ];

  if (profile === 'strict') {
    baseContent.push(
      ``,
      `## Strict Governance`,
      `- Require explicit confidence scores for all memories; reject unscored entries.`,
      `- Mandate source attribution; every memory must reference its origin (file path, URL, or meeting note).`,
      `- Enforce review: flag memories without validation status or review timestamp.`,
      `- Apply category constraints: reject memories that do not fit defined taxonomy.`,
      `- Track provenance: maintain audit trail for memory updates and deletions.`
    );
  }

  baseContent.push(
    ``,
    `Use ` + '`flash-mem update`' + ` to refresh this block if it changes.`,
    PROTOCOL_END_MARKER_TEXT
  );

  return baseContent.join('\n');
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
  public execute(targetDirectory: string, options: { promptTargetIds?: AgentInstructionTargetId[], profile?: MemoryProtocolProfile } = {}): InitializationResult {
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
    this.writeAgentInstructions(resolvedRoot, { targetIds: options.promptTargetIds, profile: options.profile });


    return {
      success: true,
      path: flashMemDir,
      metadata
    };
  }

  // Increment this version number whenever the agent instruction template changes.
  // Existing files with an older version marker will be automatically updated.
  private static readonly PROTOCOL_VERSION = 9;
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
    const profile = options.profile ?? 'default';
    const block = buildAgentInstructionBlock(version, profile);

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
          const shouldUpdate =
            existingVersion < version || // Version upgrade
            (existingVersion === version && options.profile !== undefined); // Same version but explicit profile change

          if (shouldUpdate) {
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
      } catch (e) { }
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
      } catch (e) { }
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
      } catch (e) { }
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
    } catch (e) { }
  }
}
