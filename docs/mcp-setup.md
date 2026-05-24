# MCP Setup Guide

`flash-mem` can be run in three common ways:

- as a globally installed command
- from a local development checkout
- from a direct absolute path to the built CLI

The MCP configuration format changes slightly depending on whether you are using a desktop app like Claude or an IDE extension like VS Code, Antigravity, Cline, Roo Code, or Codex.

## At A Glance

| Setup Type | Command | Workspace Argument | Best For |
| --- | --- | --- | --- |
| Global install | `flash-mem mcp` | Pass explicitly for Claude, omit for IDEs that manage the workspace | Everyday use after `npm install -g flash-mem` |
| Development checkout | `node /path/to/flash-mem/dist/infrastructure/cli/index.js mcp` | Pass explicitly for Claude, omit for IDEs that manage the workspace | Active development and local testing |
| Direct path | `node /absolute/path/to/flash-mem/dist/infrastructure/cli/index.js mcp` | Pass explicitly or omit depending on your host app | Debugging, automation, and explicit path control |

## 1. Global Installation

Use this when you have installed `flash-mem` globally and want MCP to call the `flash-mem` command directly.

```bash
npm install -g flash-mem
```

### Claude Desktop

Claude Desktop usually targets one workspace at a time, so pass the workspace path explicitly.

```json
{
  "mcpServers": {
    "flash-mem": {
      "command": "flash-mem",
      "args": [
        "mcp",
        "/path/to/your/workspace"
      ],
      "env": {
        "FLASH_MEM_ENABLE_PROJECT_SUMMARY_WRITES": "1"
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
        "FLASH_MEM_ENABLE_PROJECT_SUMMARY_WRITES": "1"
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

Use the built CLI path and pass the workspace path explicitly.

```json
{
  "mcpServers": {
    "flash-mem": {
      "command": "node",
      "args": [
        "/absolute/path/to/flash-mem/dist/infrastructure/cli/index.js",
        "mcp",
        "/path/to/your/workspace"
      ],
      "env": {
        "FLASH_MEM_ENABLE_PROJECT_SUMMARY_WRITES": "1"
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

**JSON example for Antigravity, Cline, and Roo Code:**
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
        "FLASH_MEM_ENABLE_PROJECT_SUMMARY_WRITES": "1"
      }
    }
  }
}
```

## 3. Direct Absolute Path

Use this when you want to bypass the package manager and call the built CLI directly.

```bash
node /absolute/path/to/flash-mem/dist/infrastructure/cli/index.js mcp /path/to/your/workspace
```

This is the most explicit option and is useful when debugging path or environment issues.

## Which One Should I Use?

- Use **global installation** when you want the simplest `flash-mem` command in your PATH.
- Use **development checkout** when you are actively changing the source code.
- Use **direct absolute path** when you want maximum control or need to debug the exact binary being executed.

## Important Notes

- For Claude Desktop, pass the workspace path explicitly unless your host app already manages workspace switching for you.
- For IDE extensions, omit the workspace path when the extension already provides the current working directory.
- Keep `FLASH_MEM_ENABLE_PROJECT_SUMMARY_WRITES=1` set when you want the agent to update project summaries.
