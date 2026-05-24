# ⚡ flash-mem

[![npm version](https://img.shields.io/npm/v/flash-mem.svg)](https://www.npmjs.com/package/flash-mem)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![smithery badge](https://smithery.ai/badge/flash-mem)](https://smithery.ai/server/flash-mem)
[![Made with ❤️ in Indonesia](https://img.shields.io/badge/Made_with_%E2%9D%A4%EF%B8%8F_in-Indonesia-red.svg)](https://github.com/galih/flash-mem)

`flash-mem` is a local-first engineering memory server and CLI tool for software teams and AI coding agents.

It stores durable project knowledge so agents can retrieve the right context before writing code. That includes project summaries, architecture decisions, conventions, bug patterns, and other stable engineering knowledge.

If you are using AI for vibe coding, spec-driven development, or as a pair-programming partner, `flash-mem` helps keep the model grounded in your actual codebase instead of guessing from scratch every session.

The name reflects the goal of fast retrieval, fast context, and fast iteration for engineering work.

## What It Is

`flash-mem` is a memory layer for engineering work, not a source-code mirror.

It is designed to help engineers and AI agents:
- remember durable project knowledge across sessions
- search architecture decisions and conventions quickly
- reduce repeated research and repeated mistakes
- keep retrieval-first workflows before code changes
- preserve context for agent-assisted development and SDD

For a deeper explanation of greenfield and brownfield workflows, see [Usage Guide](docs/usage.md).

For the tool list and aliases, see [Tool Surface](docs/tool-surface.md).

For a reusable review prompt to check whether flash-mem was used in a task, see [flash-mem Review Prompt](docs/flash-mem-review-prompt.md).

## Quick Start

1. Initialize the workspace:
```bash
flash-mem init .
```

2. Connect your IDE or agent through MCP so it can read and write project memory.

3. For brownfield work, refresh the markdown-backed project memory:
```bash
flash-mem rebuild-index . --yes
```

4. Search memory before making changes and write durable knowledge as you discover it.

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

`flash-mem` is fully compatible with standard Model Context Protocol (MCP) clients. See [docs/mcp-setup.md](docs/mcp-setup.md) for grouped setup examples covering global installation, development checkouts, direct path execution, and IDE-specific configurations.

### Tool Surface

`flash-mem` keeps a small public API and preserves older names as deprecated compatibility aliases.

Workflow order:
- Retrieval: `get_project_summary`, `search_memory`, `get_relevant_context`
- Writes: `add_memory`, `update_memory`, `delete_memory`
- Capture and maintenance: `capture_artifact_memory`, `export_markdown`, `rebuild_index`

Advanced / admin:
- `add_memory_relationship`
- `memory_index`
- `restore_backup`

Compatibility aliases:
- `memory_search` -> `search_memory`
- `memory_entry_create` -> `add_memory`
- `memory_entry_update` -> `update_memory`
- `memory_relationship_create` -> `add_memory_relationship`
- `memory_project_summary_get` -> `get_project_summary`
- `memory_project_summary_update` -> `update_project_summary`

`memory_index` is retained as a lower-level incremental ingestion tool. Use `rebuild_index` for a full workspace rescan.

### Minimal Agent Guide

Use the tools in this order:
1. Read `get_project_summary` to understand the high-level project state.
2. Run `search_memory` for keyword or semantic lookup across durable knowledge.
3. Use `get_relevant_context` when you want a compact, decision-oriented summary.
4. Write with `add_memory` when you have established durable knowledge.
5. Use `update_memory` for changes to an existing durable entry, and `delete_memory` only when removal is explicit and auditable.
6. Use `capture_artifact_memory` for turning a doc into durable knowledge.
7. Use `export_markdown` for backup or review, and `rebuild_index` for a full workspace rescan.

Example calls:
```json
{
  "name": "search_memory",
  "arguments": {
    "projectId": "project-id",
    "query": "sqlite transaction handling"
  }
}
```

```json
{
  "name": "add_memory",
  "arguments": {
    "projectId": "project-id",
    "title": "Use transactions for memory writes",
    "content": "Memory writes should stay transactional to avoid partial state.",
    "category": "convention",
    "source": "docs/architecture.md",
    "tags": ["transaction", "convention"]
  }
}
```

### Troubleshooting Automatic Initialization

By default, starting the MCP server in a new directory will automatically initialize a `.flash-mem` workspace for that specific project and inject the necessary Agent System Prompts (`.cursorrules`, `ANTIGRAVITY.md`, etc.). You generally do not need to run any initialization commands manually.

However, if you open a project (especially in a Remote SSH workspace) and the `.flash-mem` folder and instruction files are not created automatically, it means your IDE's MCP client failed to boot the server in the background (often because `node` isn't in the extension's `PATH` or the remote extension is misconfigured). 

In this case, you should initialize the project manually. Simply open the terminal in your workspace and run:

```bash
flash-mem init
```

This will instantly create the database and safely weave the necessary AI instruction files into your workspace to ensure your agent proactively uses the memory engine.


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
