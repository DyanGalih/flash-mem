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

To use `flash-mem` as an MCP server with tools like Claude Desktop, add the following to your `claude_desktop_config.json`:

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

Replace `/path/to/flash-mem/` with the absolute path to your cloned repository, and `/path/to/your/default/workspace` with the directory you want to manage.

*Note: Starting the MCP server will automatically initialize a `.flash-mem` workspace in the specified directory if one does not already exist. You do not need to run `flash-mem init` manually.*

## CLI Commands

### 1. Initialize Workspace

Initialize a new `.flash-mem` workspace in the target directory (defaults to current directory).

```bash
flash-mem init [path] [options]
```

**Options:**
* `-j, --json`: Output structured JSON instead of plain text.

---

### 2. Add Memory Entry

Add a new memory entry to the workspace database.

```bash
flash-mem add [options]
```

**Options:**
* `--title <string>`: Title of the memory entry (e.g., "Use SQLite for Database").
* `--content <string>`: Content/body describing the memory entry.
* `--category <string>`: The category of the memory. Must be one of the 12 schema-validated values:
  * `project`
  * `framework`
  * `architecture`
  * `convention`
  * `decision`
  * `pattern`
  * `bug_fix`
  * `security_note`
  * `dependency`
  * `risk`
  * `constraint`
  * `integration`
* `--source <string>`: The source of the memory (e.g., `cli`, `mcp`, `user`).
* `--tag <string>`: Repeatable tag flag (e.g., `--tag sqlite --tag db`).
* `--confidence <number>`: Confidence score of the entry (0-100).
* `--related-file <string>`: Repeatable related-file flag for relative paths.
* `--project-path <path>`: Path to the workspace root directory. When omitted, the CLI resolves the nearest Git repository root from the current working directory and falls back to the current working directory if no Git root exists.
* `-i, --interactive`: Interactively prompt for missing required fields via the terminal.
* `-j, --json`: Output the result as a structured JSON object.

#### Interactive Mode Example
If required fields (like `title`, `content`, `category`, `source`) are not provided in the arguments, the `-i` or `--interactive` flag will prompt for them:
```bash
$ flash-mem add --interactive
Enter title (required): SQLite connection limits
Enter content (required): Limit max SQLite connection pools to 1 to avoid file locks.
Enter category (project, framework, ...): decision
Enter source (required, e.g., cli, mcp, user): cli
Enter tags (comma-separated, optional): sqlite,db
Enter confidence (0-100, default 50): 50
Enter related files (comma-separated, optional): src/db.ts
Enter project path (optional, defaults to current repo):
Memory entry added successfully! ID: 1
```

---

### 3. Rebuild Index

Perform a complete transactional rebuild of the workspace memory index from markdown files.

```bash
flash-mem rebuild-index [path] [options]
```

**Options:**
* `-j, --json`: Output structured JSON.
* `--yes`: Confirm and skip warning validation for the destructive operation.

---

### 4. Export Markdown Backups

Export memory entries as markdown backup files.

```bash
flash-mem export markdown [path] [options]
```

**Options:**
* `-j, --json`: Output structured JSON.

---

### 5. Restore Backup

Restore memory entries from exported markdown backup files back into the database.

```bash
flash-mem restore-backup [path] [options]
```

**Options:**
* `-j, --json`: Output structured JSON.
* `--workspace <path>`: The workspace root to restore into (defaults to `.`).

---

### 6. Start MCP Server

Start the local MCP server over stdio to integrate with AI interfaces (such as Claude/Gemini).

```bash
flash-mem mcp [path]
```

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
