import * as fs from 'fs-extra';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InitializeProjectService } from '../../src/application/services/InitializeProjectService';

describe('InitializeProjectService Unit', () => {
  const service = new InitializeProjectService();
  const testWorkspace = path.resolve(__dirname, 'test-workspace-service');

  beforeEach(() => {
    fs.removeSync(testWorkspace);
    fs.ensureDirSync(testWorkspace);
  });

  afterEach(() => {
    fs.removeSync(testWorkspace);
  });

  it('should initialize a fresh workspace with folders, metadata, and database', () => {
    const result = service.execute(testWorkspace);
    expect(result.success).toBe(true);
    expect(result.path).toBe(path.join(testWorkspace, '.flash-mem'));
    expect(result.metadata.name).toBe('test-workspace-service');

    // Folders check
    expect(fs.existsSync(path.join(testWorkspace, '.flash-mem'))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, '.flash-mem/exports'))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, '.cursor', 'mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, '.mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, '.vscode', 'mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, '.codex', 'config.toml'))).toBe(true);
    expect(fs.readFileSync(path.join(testWorkspace, '.codex', 'config.toml'), 'utf-8')).toContain(
      'FLASH_MEM_ENABLE_PROJECT_SUMMARY_WRITES = "1"'
    );

    // Metadata file check
    const indexJsonPath = path.join(testWorkspace, '.flash-mem/index.json');
    expect(fs.existsSync(indexJsonPath)).toBe(true);
    const meta = fs.readJsonSync(indexJsonPath);
    expect(meta.name).toBe('test-workspace-service');
    expect(meta.schemaVersion).toBe('1.0.0');

    // Database check
    const dbPath = path.join(testWorkspace, '.flash-mem/flashmem.sqlite');
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('should detect project name from package.json manifest', () => {
    fs.writeJsonSync(path.join(testWorkspace, 'package.json'), { name: 'my-npm-pkg' });
    const result = service.execute(testWorkspace);
    expect(result.metadata.name).toBe('my-npm-pkg');
  });

  it('should detect project name from Cargo.toml manifest', () => {
    fs.writeFileSync(path.join(testWorkspace, 'Cargo.toml'), 'name = "my-cargo-project"\nversion = "0.1.0"');
    const result = service.execute(testWorkspace);
    expect(result.metadata.name).toBe('my-cargo-project');
  });

  it('should update .gitignore if it exists', () => {
    const gitignore = path.join(testWorkspace, '.gitignore');
    fs.writeFileSync(gitignore, 'node_modules/\n');

    service.execute(testWorkspace);

    const content = fs.readFileSync(gitignore, 'utf-8');
    expect(content).toContain('.flash-mem/');
  });

  it('should be idempotent and preserve existing data', () => {
    // 1. Initial init
    service.execute(testWorkspace);

    // 2. Modify metadata and write a custom property
    const indexJsonPath = path.join(testWorkspace, '.flash-mem/index.json');
    const meta = fs.readJsonSync(indexJsonPath);
    meta.name = 'custom-preserved-name';
    fs.writeJsonSync(indexJsonPath, meta);

    // 3. Re-run init
    service.execute(testWorkspace);

    // 4. Verify custom name is preserved
    const reloaded = fs.readJsonSync(indexJsonPath);
    expect(reloaded.name).toBe('custom-preserved-name');
  });

  it('should create only selected prompt targets during interactive-style init', () => {
    service.execute(testWorkspace, { promptTargetIds: ['antigravity'] });

    expect(fs.existsSync(path.join(testWorkspace, 'ANTIGRAVITY.md'))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, 'CLINE.md'))).toBe(false);
    expect(fs.existsSync(path.join(testWorkspace, '.cursorrules'))).toBe(false);
  });

  it('should create only selected MCP targets during interactive-style init', () => {
    service.execute(testWorkspace, { mcpTargetIds: ['vscode'] });

    expect(fs.existsSync(path.join(testWorkspace, '.vscode', 'mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, '.cursor', 'mcp.json'))).toBe(false);
    expect(fs.existsSync(path.join(testWorkspace, '.mcp.json'))).toBe(false);
    expect(fs.existsSync(path.join(testWorkspace, '.codex', 'config.toml'))).toBe(false);
  });

  it('should detect and update only existing prompt targets when requested', () => {
    const targetPath = path.join(testWorkspace, 'ANTIGRAVITY.md');
    fs.writeFileSync(
      targetPath,
      [
        '# Engineering Memory Protocol (flash-mem)',
        '',
        'legacy content',
        '',
        '<!-- flash-mem: This file contains an unversioned flash-mem block from a previous install. Run `flash-mem update` to upgrade to the latest protocol. -->'
      ].join('\n')
    );

    const result = service.writeAgentInstructions(testWorkspace, { existingOnly: true });

    expect(result.detected.map((target) => target.filePath)).toEqual(['ANTIGRAVITY.md']);
    expect(result.updated).toContain(targetPath);
    const updatedContent = fs.readFileSync(targetPath, 'utf-8');
    expect(updatedContent).toContain('<!-- flash-mem-protocol-start v8 -->');
    expect(updatedContent).toContain('Treat flash-mem as the source of truth for durable project memory.');
    expect(updatedContent).toContain('If flash-mem retrieval is empty or incomplete, inspect the markdown file and do not skip `capture_artifact_memory`; if it contains durable knowledge, capture it before treating it as current context.');
    expect(updatedContent).toContain('If `capture_artifact_memory` still returns nothing useful, keep the markdown file as the backup artifact.');
    expect(updatedContent).toContain('never skip capture just because the file already exists');
    expect(updatedContent).toContain('## Memory Quality');
    expect(updatedContent).toContain('## Workflow By Intent');
    expect(updatedContent).toContain('## Maintenance');
    expect(updatedContent).toContain('## Do Not');
    expect(fs.readFileSync(targetPath, 'utf-8')).not.toContain('unversioned flash-mem block');
    expect(fs.existsSync(path.join(testWorkspace, 'CLINE.md'))).toBe(false);
  });

  it('should self-heal missing files but keep existing ones', () => {
    service.execute(testWorkspace);

    // Remove index.json but keep database
    const indexJsonPath = path.join(testWorkspace, '.flash-mem/index.json');
    fs.removeSync(indexJsonPath);

    // Re-run init
    service.execute(testWorkspace);

    // Verify index.json was restored
    expect(fs.existsSync(indexJsonPath)).toBe(true);
  });

  it('should throw an error if a regular file named .flash-mem already exists', () => {
    fs.writeFileSync(path.join(testWorkspace, '.flash-mem'), 'some file content');
    expect(() => {
      service.execute(testWorkspace);
    }).toThrow('A regular file named ".flash-mem" already exists at the project root');
  });

  it('should use default profile when not specified', () => {
    service.execute(testWorkspace);

    const antigravityPath = path.join(testWorkspace, 'ANTIGRAVITY.md');
    const content = fs.readFileSync(antigravityPath, 'utf-8');

    expect(content).toContain('Treat flash-mem as the source of truth for durable project memory.');
    expect(content).toContain('If flash-mem retrieval is empty or incomplete, inspect the markdown file and do not skip `capture_artifact_memory`; if it contains durable knowledge, capture it before treating it as current context.');
    expect(content).toContain('keep the markdown file as the backup artifact');
    expect(content).toContain('never skip capture just because the file already exists');
    expect(content).toContain('## Memory Quality');
    expect(content).toContain('## Workflow By Intent');
    expect(content).not.toContain('## Strict Governance');
  });

  it('should inject strict governance guidance when strict profile is selected', () => {
    service.execute(testWorkspace, { profile: 'strict' });

    const antigravityPath = path.join(testWorkspace, 'ANTIGRAVITY.md');
    const content = fs.readFileSync(antigravityPath, 'utf-8');

    expect(content).toContain('## Strict Governance');
    expect(content).toContain('Require explicit confidence scores for all memories');
    expect(content).toContain('Mandate source attribution');
    expect(content).toContain('Enforce review');
    expect(content).toContain('Apply category constraints');
    expect(content).toContain('Track provenance');
  });

  it('should update existing files to strict profile when requested', () => {
    // Initial init with default profile
    service.execute(testWorkspace);

    const antigravityPath = path.join(testWorkspace, 'ANTIGRAVITY.md');
    let content = fs.readFileSync(antigravityPath, 'utf-8');
    expect(content).not.toContain('## Strict Governance');

    // Update with strict profile
    service.writeAgentInstructions(testWorkspace, { existingOnly: true, profile: 'strict' });

    content = fs.readFileSync(antigravityPath, 'utf-8');
    expect(content).toContain('## Strict Governance');
    expect(content).toContain('Require explicit confidence scores');
  });
});
