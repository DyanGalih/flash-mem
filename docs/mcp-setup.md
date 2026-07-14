# MCP Setup Guide

`flash-mem` is usually configured in two layers:

- one-time MCP server setup in the client or global config you use on that machine
- per-repository workspace bootstrap with `flash-mem init .`

Set up the MCP server once. After that, every new project only needs `flash-mem init .` to create the workspace-scoped memory files and prompt surfaces.

`flash-mem init .` writes the versioned agent-instruction files (`AGENTS.md`, `ANTIGRAVITY.md`, `CLAUDE.md`, `.cursor/rules/flash-mem.mdc`, and `.github/copilot-instructions.md`) so the same memory-first protocol is available in prompt surfaces. Interactive init supports multi-select, so you can create more than one agent file in a single run.

The JSON and TOML blocks below are the MCP server definitions themselves, not a universal file path. Each client decides where to store that definition, so the location and filename vary by IDE or agent.

## At A Glance

| Setup Type | Command | Best For |
| --- | --- | --- |
| Global install | `flash-mem mcp` | Everyday use after `npm install -g flash-mem` |
| Development checkout | `node /path/to/flash-mem/dist/infrastructure/cli/index.js mcp` | Active development and local testing |
| Direct path | `node /absolute/path/to/flash-mem/dist/infrastructure/cli/index.js mcp` | Debugging, automation, and explicit path control |

## Where To Store It

Use the same server entry in the client-specific config location for your tool. There is no single universal MCP filename across all IDEs and agents.

| Client | Where to store it | File name / notes |
| --- | --- | --- |
| Codex | `~/.codex/config.toml` | The repo-local `.codex/config.toml` is a template you can copy or symlink there. |
| Antigravity CLI | `~/.gemini/config/mcp_config.json` | Centralized global config on the machine. |
| Claude Desktop | Client MCP settings or config file | No separate global path is documented here; use Claude's client-managed config location with the standard `mcpServers` JSON shape. |
| Cursor | Client MCP settings or config file | The storage location is client-managed and may vary by version. |
| VS Code extensions | `.vscode/mcp.json` | Uses `servers` in the VS Code MCP file, not `mcpServers`; the exact file is editor-managed. |

If the client supports a repo-local helper file, that file is just a convenience copy of the same server definition. The repository itself does not impose a single universal MCP filename.

## 1. Global Installation

Use this when you have installed `flash-mem` globally and want to point your MCP client at the `flash-mem` command once for the machine or user account.

```bash
npm install -g flash-mem
```

### Claude Desktop

Claude Desktop uses its client-managed config location. This guide does not assume a separate global path for it; use the standard `mcpServers` shape there. If you need the exact file path, use the one shown by Claude Desktop for your OS or in the Claude docs.

```json
{
  "mcpServers": {
    "flash-mem": {
      "command": "flash-mem",
      "args": [
        "mcp"
      ],
      "env": {
      },
      "type": "local",
      "tools": [
        "*"
      ]
    }
  }
}
```

### VS Code Extensions

Use the global `flash-mem` command and register it once in the editor's MCP settings. This also applies if you are using a Claude extension inside VS Code; treat it as a VS Code extension and use `.vscode/mcp.json` with the `servers` key.

```json
{
  "servers": {
    "flash-mem": {
      "command": "flash-mem",
      "args": [
        "mcp"
      ],
      "env": {
      },
      "type": "local",
      "tools": [
        "*"
      ]
    }
  }
}
```

### Antigravity IDE

Configure Antigravity IDE once with the same global MCP server entry.

### Antigravity CLI

Antigravity CLI uses a centralized global configuration (`~/.gemini/config/mcp_config.json`). Configure it once on the machine, then run `flash-mem init .` in each new workspace.

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

Use the built CLI path and register it once in the client with the standard `mcpServers` shape.

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

Use the built CLI path and register it once in the editor's MCP settings. This also applies if you are using a Claude extension inside VS Code; treat it as a VS Code extension and use `.vscode/mcp.json` with the `servers` key.

```json
{
  "servers": {
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

### Codex

Codex uses `~/.codex/config.toml`. The snippet below is the repo-local template to copy or symlink into that file.
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

Configure Antigravity IDE once with the same built CLI path.

### Antigravity CLI

Antigravity CLI uses a centralized global configuration (`~/.gemini/config/mcp_config.json`). Point it at the built CLI once, then use `flash-mem init .` for each project.

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

### What `init` Creates

`flash-mem init .` scaffolds the project-local memory workspace inside the repository. The generated files live here:

```text
<project-root>/
  AGENTS.md
  ANTIGRAVITY.md
  CLAUDE.md
  .cursor/rules/flash-mem.mdc
  .github/copilot-instructions.md
  .flash-mem/
  src/
  docs/
```

Notes:

- `AGENTS.md` is the shared prompt surface for other AI agents and codifies the project memory protocol.
- `ANTIGRAVITY.md` is the prompt surface for Antigravity.
- `CLAUDE.md` is the prompt surface for Claude Code.
- `.cursor/rules/flash-mem.mdc` is the Cursor rule file written by init.
- `.github/copilot-instructions.md` is the GitHub Copilot instruction file written by init.
- `.codex/config.toml` is a repo-local Codex template; Codex still reads its active config from `~/.codex/config.toml`, so copy or symlink this file there if you want Codex to use it automatically.

If the agent-instruction files already exist, use `flash-mem update .` to refresh the protocol block in place without touching the surrounding content.

If your client expects a different MCP config location, set that up once in the client config and keep the workspace itself focused on `flash-mem init .`.

**JSON example for clients that use the standard MCP `mcpServers` JSON shape:**
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
