# MCP Setup Guide

`flash-mem` can be run in three common ways:

- as a globally installed command
- from a local development checkout
- from a direct absolute path to the built CLI

The MCP configuration format changes slightly depending on whether you are using a desktop app like Claude or an IDE extension like VS Code, Antigravity, Cline, Roo Code, or Codex.

When you run `flash-mem init .`, it also writes the versioned agent-instruction files (`AGENTS.md`, `ANTIGRAVITY.md`, `.cursor/rules/flash-mem.mdc`, `CLINE.md`, and `.github/copilot-instructions.md`) so the same memory-first protocol is available in prompt surfaces, not just MCP configs.

## At A Glance

| Setup Type | Command | Best For |
| --- | --- | --- |
| Global install | `flash-mem mcp` | Everyday use after `npm install -g flash-mem` |
| Development checkout | `node /path/to/flash-mem/dist/infrastructure/cli/index.js mcp` | Active development and local testing |
| Direct path | `node /absolute/path/to/flash-mem/dist/infrastructure/cli/index.js mcp` | Debugging, automation, and explicit path control |

## 1. Global Installation

Use this when you have installed `flash-mem` globally and want MCP to call the `flash-mem` command directly.

```bash
npm install -g flash-mem
```

### Claude Desktop

```json
{
  "mcpServers": {
    "flash-mem": {
      "command": "flash-mem",
      "args": [
        "mcp"
      ],
      "env": {
      }
    }
  }
}
```

### VS Code Extensions

Use the global `flash-mem` command and let the extension provide the current workspace automatically.

```json
{
  "mcpServers": {
    "flash-mem": {
      "command": "flash-mem",
      "args": [
        "mcp"
      ],
      "env": {
      }
    }
  }
}
```

### Antigravity IDE

Antigravity IDE automatically reads the `.vscode/mcp.json` file. The VS Code extension setup above works perfectly for Antigravity IDE without any global configuration.

### Antigravity CLI

Antigravity CLI uses a centralized global configuration (`~/.gemini/config/mcp_config.json`).
You do not need to configure this manually! Simply run `flash-mem init .` in your workspace, and it will automatically register your project in Antigravity's global configuration.

If you prefer to configure it manually, add the following to `~/.gemini/config/mcp_config.json`:
```json
{
  "mcpServers": {
    "flash-mem": {
      "command": "flash-mem",
      "args": [
        "mcp"
      ],
      "env": {
      }
    }
  }
}
```

## 2. Development Checkout

Use this when you are working from a cloned repository and want MCP to run the built local CLI.

```bash
cd /path/to/flash-mem
npm install
npm run build
```

### Claude Desktop

Use the built CLI path.

```json
{
  "mcpServers": {
    "flash-mem": {
      "command": "node",
      "args": [
        "/absolute/path/to/flash-mem/dist/infrastructure/cli/index.js",
        "mcp"
      ],
      "env": {
      }
    }
  }
}
```

### VS Code Extensions

Use the built CLI path and omit the workspace argument so the extension current directory is used.

**TOML example for Codex:**
```toml
[mcp_servers.flash_mem]
command = "node"
args = [
  "/absolute/path/to/flash-mem/dist/infrastructure/cli/index.js",
  "mcp"
]
enabled = true
```

### Antigravity IDE

Antigravity IDE automatically reads the `.vscode/mcp.json` file. The VS Code extension setup above works perfectly for Antigravity IDE. Running `flash-mem init .` will scaffold this file for you.

### Antigravity CLI

Antigravity CLI uses a centralized global configuration (`~/.gemini/config/mcp_config.json`).
You do not need to configure this manually! Simply run `flash-mem init .` in your workspace, and it will automatically register your project in Antigravity's global configuration using the local CLI path.

If you prefer to configure it manually, add the following to `~/.gemini/config/mcp_config.json`:
```json
{
  "mcpServers": {
    "flash-mem": {
      "command": "node",
      "args": [
        "/absolute/path/to/flash-mem/dist/infrastructure/cli/index.js",
        "mcp"
      ],
      "env": {
      }
    }
  }
}
```

### Where To Store It

`flash-mem init .` scaffolds the project-local MCP bundle inside the repository workspace. The generated files live here:

```text
<project-root>/
  AGENTS.md
  ANTIGRAVITY.md
  CLINE.md
  .cursor/rules/flash-mem.mdc
  .github/copilot-instructions.md
  .cursor/mcp.json
  .mcp.json
  .vscode/mcp.json
  .codex/config.toml
  .flash-mem/
  src/
  docs/
```

Notes:

- `AGENTS.md` is the shared prompt surface for other AI agents and codifies the project memory protocol.
- `ANTIGRAVITY.md` is the prompt surface for Antigravity.
- `.cursor/rules/flash-mem.mdc` is the Cursor rule file written by init.
- `CLINE.md` is the prompt surface for Cline.
- `.github/copilot-instructions.md` is the GitHub Copilot instruction file written by init.
- `.cursor/mcp.json` is for Cursor project-level MCP.
- `.mcp.json` is for GitHub Copilot project-level MCP.
- `.vscode/mcp.json` is for VS Code, Copilot, and Antigravity IDE setups that read the VS Code MCP format.
- `.codex/config.toml` is a repo-local Codex template; Codex still reads its active config from `~/.codex/config.toml`, so copy or symlink this file there if you want Codex to use it automatically.

If the agent-instruction files already exist, use `flash-mem update .` to refresh the protocol block in place without touching the surrounding content.

If your client expects a different project-local path, keep the file inside the repo workspace so each project can have its own isolated MCP config.

**JSON example for Cline and Roo Code:**
```json
{
  "mcpServers": {
    "flash-mem": {
      "command": "node",
      "args": [
        "/absolute/path/to/flash-mem/dist/infrastructure/cli/index.js",
        "mcp"
      ],
      "env": {
      }
    }
  }
}
```

## 3. Direct Absolute Path

Use this when you want to bypass the package manager and call the built CLI directly.

```bash
node /absolute/path/to/flash-mem/dist/infrastructure/cli/index.js mcp
```

This is the most explicit option and is useful when debugging path or environment issues.

## Which One Should I Use?

- Use **global installation** when you want the simplest `flash-mem` command in your PATH.
- Use **development checkout** when you are actively changing the source code.
- Use **direct absolute path** when you want maximum control or need to debug the exact binary being executed.

## Important Notes

- Treat each repository as its own workspace: run `flash-mem init .` in that repo so summaries and memory entries stay project-scoped.
