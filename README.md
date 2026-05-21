# flash-mem

A local-first engineering memory server and CLI tool designed for developers and AI agents. It stores key engineering knowledge, architectural decisions, and project conventions to enable context-aware coding and knowledge reuse.

## Installation

```bash
npm install -g flash-mem
```

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
* `--summary <string>`: Content or summary describing the memory entry.
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
* `--tags <items>`: Comma-separated list of tags (e.g., `sqlite,db`).
* `--confidence <number>`: Confidence score of the entry (0-100).
* `--related-files <items>`: Comma-separated list of relative file paths.
* `--project-path <path>`: Path to the workspace root directory (defaults to `.`).
* `-i, --interactive`: Interactively prompt for missing required fields via the terminal.
* `-j, --json`: Output the result as a structured JSON object.

#### Interactive Mode Example
If required fields (like `title`, `summary`, `category`, `source`) are not provided in the arguments, the `-i` or `--interactive` flag will prompt for them:
```bash
$ flash-mem add --interactive
Enter title (required): SQLite connection limits
Enter summary (required): Limit max SQLite connection pools to 1 to avoid file locks.
Enter category (project, framework, ...): decision
Enter source (required, e.g., cli, mcp, user): cli
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

## Security Features

* **Path Traversal Guard**: Prevents access to files or directories outside the specified workspace root.
* **Secret Scanner**: Automatically redacts high-entropy credentials (AWS keys, GitHub tokens, database URIs, etc.) from `title` and `content` fields before persistence.
