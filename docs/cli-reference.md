# Flash-Mem CLI Reference

> [!NOTE]
> `flash-mem` is designed to be fully automated via the MCP Server. The commands below are provided strictly for debugging, CI/CD scripts, or legacy workflows.
>
> For MCP setup examples by installation type and IDE, see [MCP Setup Guide](docs/mcp-setup.md).

## CLI Commands

### 1. Initialize Workspace

Initialize a new `.flash-mem` workspace in the target directory (defaults to current directory) and scaffold the versioned agent-instruction files plus the local MCP config bundle for the supported editors and clients.

```bash
flash-mem init [path] [options]
```

**Options:**
* `-a, --all`: Skip interactive prompt and create instruction files for all supported agents.
* `-i, --interactive`: Interactively choose which prompt files to create (default in TTY).
* `-p, --profile <mode>`: Memory protocol profile: `default` or `strict` (default: `default`).
  * `default`: Concise guidance suitable for most teams
  * `strict`: Additional governance rules for formal memory management (explicit confidence, source attribution, review enforcement, category constraints, provenance tracking)
* `-j, --json`: Output structured JSON instead of plain text.

If you already have prompt files in place, use `flash-mem update [path]` or the `inject-prompts` alias to refresh the embedded protocol block without touching the surrounding content.

---

### Update Agent Instruction Files

Refresh existing agent-instruction files in place without overwriting the surrounding repository content.

```bash
flash-mem update [path] [options]
```

**Options:**
* `-p, --profile <mode>`: Memory protocol profile: `default` or `strict` (default: `default`). Use this to switch between profiles.
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
This is a fallback path; prefer `capture_artifact_memory` after markdown changes.

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

### 6. Prepare Context

Generate memory synthesis, doc synthesis, and a token report for a feature or workspace.

```bash
flash-mem prepare-context [path] [options]
```

**Options:**
* `--feature <path>`: Feature path relative to the workspace root.
* `--query <string>`: Override the synthesis query.
* `--token-budget <number>`: Token budget for the memory synthesis output.
* `--write`: Write `memory-synthesis.md` and `doc-synthesis.md` into the feature folder.
  * When `--write` is set, the generated markdown artifacts are also indexed back into flash-mem as durable markdown content.
* `--store`: Store the generated markdown directly in flash-mem without creating files.
* `-j, --json`: Output structured JSON.

---

### 7. Spec Kit-Compatible Helpers

These commands are additive and opt-in:

```bash
flash-mem synthesize-memory [path] [options]
flash-mem synthesize-docs [path] [options]
flash-mem token-report [path] [options]
flash-mem promote-lesson [options]
flash-mem sync-shared [path] [options]
```

**Notes:**
 * `synthesize-memory` and `synthesize-docs` can write standalone artifacts with `--write`.
 * When `--write` is used, the generated markdown file is also indexed back into flash-mem as durable content.
 * `--store` skips filesystem writes and stores the generated markdown directly in flash-mem.
* `token-report` shows a compact baseline/cached/saved token comparison.
* `promote-lesson` stores an approved lesson in shared memory.
* `sync-shared` writes the native `SHARED_LESSONS.md` file and a temporary review buffer at `docs/memory/SHARED_LESSONS.md`.

---

### 8. Start MCP Server

Start the local MCP server over stdio to integrate with AI interfaces (such as Claude/Gemini).

```bash
flash-mem mcp [path]
```
