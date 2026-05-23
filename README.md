# flash-mem

A local-first engineering memory server and CLI tool designed for developers and AI agents. It stores key engineering knowledge, architectural decisions, and project conventions to enable context-aware coding and knowledge reuse.

## Installation

### Global Installation
```bash
npm install -g flash-mem
```

### Development Setup (from source)
1. Clone the repository and install dependencies:
```bash
git clone https://github.com/galih/flash-mem.git
cd flash-mem
npm install
```

2. Build the project:
```bash
npm run build
```

3. Link the package globally for development:
```bash
npm link
```

## MCP Configuration

`flash-mem` is fully compatible with standard Model Context Protocol (MCP) clients.

### 1. Claude Desktop

To use `flash-mem` with Claude Desktop, add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "flash-mem": {
      "command": "node",
      "args": [
        "/path/to/flash-mem/dist/infrastructure/cli/index.js",
        "mcp",
        "/path/to/your/default/workspace"
      ],
      "env": {
        "FLASH_MEM_ENABLE_PROJECT_SUMMARY_WRITES": "1"
      }
    }
  }
}
```
*Note: Replace the paths with your actual absolute paths. Supplying a specific workspace path makes Claude Desktop always target that directory.*

### 2. VS Code Extensions (Antigravity, Cline, Roo Code, Codex)

VS Code extensions are designed to handle **multiple projects and multiple workspaces**. 

**DO NOT define a workspace path in the `args` array!** By intentionally omitting the `/path/to/your/workspace` argument, `flash-mem` will automatically inherit the current working directory from the extension. This allows a single MCP configuration to seamlessly manage `.flash-mem` memory databases across all your different projects without any manual adjustments.

Depending on your specific extension, add the following to your MCP configuration file:

**For extensions using TOML (e.g., Antigravity):**
```toml
[mcp_servers.flash_mem]
command = "node"
args = [
  "/absolute/path/to/flash-mem/dist/infrastructure/cli/index.js",
  "mcp"
]
enabled = true
```

**For extensions using JSON (e.g., Cline, Roo Code):**
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

*Note: Starting the MCP server in a new directory will automatically initialize a `.flash-mem` workspace for that specific project. You do not need to run any initialization commands manually.*


## Security & Safety Features

### 1. Source Path Isolation & Traversal Protection
* **Path Traversal Guard**: All input and output paths are strictly validated against the workspace root boundaries using path resolution checks (`PathSanitizer.resolveRoot` and `PathSanitizer.isWithinRoot`). Attempting directory traversals (e.g. `../outside.md` or absolute paths outside the root) will throw a validation error.

### 2. Ignored Files & Folders (`.flash-mem-ignore`)
To prevent indexing or storing files containing sensitive information:
* **Default Ignored Paths**: The system automatically ignores `.env`, `.env.*`, `.git/credentials`, `.npmrc`, and `.netrc`.
* **Custom Ignored Paths**: Developers can create a `.flash-mem-ignore` file (and/or use `.gitignore`) in the workspace root to define custom glob patterns.

**Example `.flash-mem-ignore`:**
```text
# Exclude temporary workspace files
temp/
*.log
*.key
```

### 3. In-Place Secret Scanner & Redaction
Any indexed content is scanned for high-entropy credentials. If a match is found, it is replaced in-place with `[REDACTED_SECRET]` before being persisted or exported.
Supported patterns include:
* **Private Keys**: `-----BEGIN * PRIVATE KEY----- ...`
* **AWS Access Keys**: `AKIA...` (16 uppercase alphanumeric characters)
* **GitHub Tokens**: `ghp_...`, `gho_...`, `ghu_...`, etc.
* **Slack Tokens**: `xoxb-...`, `xoxa-...`, etc.
* **Database Connection URIs**: URIs prefixing `mongodb://`, `postgresql://`, `mysql://`, `redis://`, `sqlite://`, etc.
* **Generic Credentials**: Identifiers like `api_key`, `token`, `secret`, or `password` followed by `:` or `=`.

### 4. Telemetry & Safety Warnings
When secrets are detected, the system generates non-sensitive telemetry warning metadata. These warnings never leak the actual secret values.

#### MCP Tool Call & CLI JSON Output Format
In MCP JSON-RPC responses and CLI commands run with `--json`, safety warnings are returned as an array under `warnings`:
```json
{
  "success": true,
  "warnings": [
    {
      "filePath": "docs/db.md",
      "line": 1,
      "category": "Database Connection URI"
    }
  ]
}
```

#### CLI Plain Text Output Format
For CLI commands, if warnings are present and `--json` is not specified, a summary block is output directly to `stderr`:
```text
Safety warnings detected during indexing:
  - docs/db.md:1 - Database Connection URI
```
