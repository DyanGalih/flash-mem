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
  profile?: MemoryProtocolProfile;
}

export interface WriteAgentInstructionsResult {
  updated: string[];
  skipped: string[];
  detected: AgentInstructionTargetDefinition[];
}

export const AGENT_INSTRUCTION_TARGETS: AgentInstructionTargetDefinition[] = [
  { id: 'antigravity', label: 'Antigravity', filePath: 'ANTIGRAVITY.md', kind: 'antigravity' },
  { id: 'agents', label: 'Other AI Agents', filePath: 'AGENTS.md', kind: 'agent' },
  { id: 'cursor', label: 'Cursor', filePath: '.cursor/rules/flash-mem.mdc', kind: 'cursor' },
  { id: 'cline', label: 'Cline', filePath: 'CLINE.md', kind: 'cline' },
  { id: 'copilot', label: 'GitHub Copilot', filePath: '.github/copilot-instructions.md', kind: 'copilot' }
];

export type McpTargetId = 'cursor' | 'copilot' | 'vscode' | 'codex' | 'antigravity-cli';

export interface McpTargetDefinition {
  id: McpTargetId;
  label: string;
  filePath: string;
}

export const MCP_TARGETS: McpTargetDefinition[] = [
  { id: 'cursor', label: 'Cursor', filePath: '.cursor/mcp.json' },
  { id: 'copilot', label: 'GitHub Copilot', filePath: '.mcp.json' },
  { id: 'vscode', label: 'VS Code / Antigravity IDE', filePath: '.vscode/mcp.json' },
  { id: 'codex', label: 'Codex', filePath: '.codex/config.toml' },
  { id: 'antigravity-cli', label: 'Antigravity CLI (Global)', filePath: '~/.gemini/config/mcp_config.json' }
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
    `## Rules`,
    `- Search first: read \`get_project_summary\` and \`search_memory\` before planning, drafting, or changing code.`,
    `- Prefer summaries, metadata, tags, confidence, and related files before loading full memory content.`,
    `- Store only durable knowledge: decisions, conventions, constraints, bugs, workflows.`,
    `- Use \`update_memory\` when refining an existing memory; use \`add_memory\` for genuinely new durable facts.`,
    `- Attach relationships when a memory depends on or explains another memory.`,
    `- Write immediately: use \`add_memory\` for new durable facts and \`update_memory\` for changes.`,
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
    `- Maintain: \`capture_artifact_memory\`, \`export_markdown\`, \`rebuild_index\``,
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
    `## Do Not`,
    `- Do not write duplicate synthesis snapshots as separate durable memories.`,
    `- Do not dump broad low-confidence notes without verification markers.`,
    `- Do not overwrite unrelated memory content when a targeted update is sufficient.`
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
  public execute(targetDirectory: string, options: { promptTargetIds?: AgentInstructionTargetId[], mcpTargetIds?: McpTargetId[], profile?: MemoryProtocolProfile } = {}): InitializationResult {
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
    this.writeProjectMcpConfigs(resolvedRoot, { targetIds: options.mcpTargetIds });

    return {
      success: true,
      path: flashMemDir,
      metadata
    };
  }

  // Increment this version number whenever the agent instruction template changes.
  // Existing files with an older version marker will be automatically updated.
  private static readonly PROTOCOL_VERSION = 5;
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

  private writeProjectMcpConfigs(resolvedRoot: string, options: { targetIds?: McpTargetId[] } = {}): void {
    const allTargets = [
      {
        id: "cursor",
        filePath: ".cursor/mcp.json",
        content: this.renderCursorMcpConfig(resolvedRoot)
      },
      {
        id: "copilot",
        filePath: ".mcp.json",
        content: this.renderCopilotMcpConfig(resolvedRoot)
      },
      {
        id: "vscode",
        filePath: ".vscode/mcp.json",
        content: this.renderVscodeMcpConfig(resolvedRoot)
      },
      {
        id: "codex",
        filePath: ".codex/config.toml",
        content: this.renderCodexConfigTemplate(resolvedRoot)
      }
    ];

    const targets = options.targetIds
      ? allTargets.filter(t => options.targetIds!.includes(t.id as McpTargetId))
      : allTargets;

    // Modify Antigravity global config directly if selected or if not restricted
    if (!options.targetIds || options.targetIds.includes('antigravity-cli')) {
      this.updateAntigravityGlobalConfig(resolvedRoot);
    }

    for (const target of targets) {
      const filePath = path.join(resolvedRoot, target.filePath);
      if (fs.existsSync(filePath)) {
        continue;
      }

      fs.ensureDirSync(path.dirname(filePath));
      fs.writeFileSync(filePath, target.content, "utf-8");
      this.setPermissions(filePath, 0o600);
    }
  }

  private renderCursorMcpConfig(resolvedRoot: string): string {
    return this.renderLocalMcpJson({
      rootKey: "mcpServers",
      resolvedRoot,
      includeType: false,
      includeTools: false
    });
  }

  private renderCopilotMcpConfig(resolvedRoot: string): string {
    return this.renderLocalMcpJson({
      rootKey: "mcpServers",
      resolvedRoot,
      includeType: true,
      includeTools: true
    });
  }

  private renderVscodeMcpConfig(resolvedRoot: string): string {
    return this.renderLocalMcpJson({
      rootKey: "servers",
      resolvedRoot,
      includeType: true,
      includeTools: true
    });
  }

  private updateAntigravityGlobalConfig(resolvedRoot: string): void {
    const geminiConfigPath = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json');
    if (!fs.existsSync(geminiConfigPath)) {
      return; // Do nothing if Antigravity is not installed or configured yet
    }

    try {
      const raw = fs.readFileSync(geminiConfigPath, 'utf-8');
      const config = JSON.parse(raw);

      if (!config.mcpServers) {
        config.mcpServers = {};
      }

      config.mcpServers['flash-mem'] = {
        command: "flash-mem",
        args: [
          "mcp",
          resolvedRoot
        ],
        env: {
          "FLASH_MEM_ENABLE_PROJECT_SUMMARY_WRITES": "1"
        }
      };

      fs.writeFileSync(geminiConfigPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    } catch (err) {
      // Fail silently for global config updates to not break init on permission issues
    }
  }

  private renderLocalMcpJson(options: {
    rootKey: "mcpServers" | "servers";
    resolvedRoot: string;
    includeType: boolean;
    includeTools: boolean;
  }): string {
    const serverConfig: Record<string, unknown> = {
      command: "flash-mem",
      args: ["mcp", options.resolvedRoot],
      env: {
        FLASH_MEM_ENABLE_PROJECT_SUMMARY_WRITES: "1"
      }
    };

    if (options.includeType) {
      serverConfig.type = "local";
    }

    if (options.includeTools) {
      serverConfig.tools = ["*"];
    }

    return JSON.stringify({
      [options.rootKey]: {
        "flash-mem": serverConfig
      }
    }, null, 2) + "\n";
  }

  private renderCodexConfigTemplate(resolvedRoot: string): string {
    return [
      "# Project-local Codex MCP template.",
      "# Copy or symlink this file to ~/.codex/config.toml to activate it.",
      "",
      "[mcp_servers.flash_mem]",
      "command = \"flash-mem\"",
      "args = [\"mcp\", " + JSON.stringify(resolvedRoot) + "]",
      "env = { FLASH_MEM_ENABLE_PROJECT_SUMMARY_WRITES = \"1\" }",
      "enabled = true",
      ""
    ].join("\n");
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
