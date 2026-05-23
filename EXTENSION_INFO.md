# flash-mem Extension Info

This file is a source-derived feature summary of the `flash-mem` extension. It is based on runtime code, not README or docs.

## What This Extension Does

`flash-mem` is a local-first engineering memory server and CLI for a single workspace. It stores memory data in a local SQLite database, exposes the same memory operations through a CLI and an MCP server, and can export or restore the workspace state as markdown backups.

## Runtime Entry Points

- CLI entry: `src/infrastructure/cli/index.ts`
- MCP server: `src/mcp/server.ts`
- Database: local `better-sqlite3` with WAL enabled

## Main Features

- Initialize a workspace with local storage under `.flash-mem/`
- Add, update, delete, and search memory entries
- Index markdown sources into memory entries
- Rebuild the workspace index transactionally
- Export memory as markdown backups
- Restore memory from markdown backups
- Capture reusable memory from artifacts
- Retrieve relevant context for a query
- Store and retrieve one canonical project summary per project
- Use the same backend through CLI commands and MCP tools

## CLI Commands

### `init`

- Creates `.flash-mem/` and `.flash-mem/exports/`
- Writes `.flash-mem/index.json`
- Creates `.flash-mem/flashmem.sqlite`
- Uses project name detection from `package.json`, `Cargo.toml`, `pyproject.toml`, or folder name
- Updates `.gitignore` to ignore `.flash-mem/` when possible
- Supports plain text and `--json`

### `export markdown`

- Exports the current workspace to markdown backup files
- Writes into `.flash-mem/exports/`
- Requires an existing SQLite store
- Supports plain text and `--json`

### `rebuild-index`

- Rebuilds the memory index from markdown files in the workspace
- Refuses to run unless `--yes` is provided
- Walks the workspace, skips `.git`, `.flash-mem`, and `node_modules`
- Collects `.md` and `.markdown` files
- Computes checksums, derives titles from headings, and assigns categories from path hints
- Emits safety warnings when suspicious content is detected
- Supports plain text and `--json`

### `add`

- Adds a memory entry from CLI arguments
- Supports interactive prompting for missing required fields
- Supports `--json`
- Accepts tags, related files, confidence, category, source, title, and content
- Resolves the workspace root safely before database access
- Redacts secrets from title and content before persistence

### `search`

- Searches memory entries with query and filters
- Supports tags, tag operator, category, source, minimum confidence, limit, and full content mode
- Outputs either a table or JSON
- Falls back to JSON automatically when stdout is not a TTY
- Returns suggestions when no results are found

### `mcp`

- Starts the local MCP server over stdio
- Uses the workspace SQLite store
- Can enable project summary writes only when `FLASH_MEM_ENABLE_PROJECT_SUMMARY_WRITES=1`

### `restore-backup`

- Restores memory entries from markdown backup files
- Defaults to `.flash-mem/exports/` when no backup path is supplied
- Supports plain text and `--json`
- Emits warnings for skipped files, duplicates, and dangling relationships

## MCP Tools

### Project summary

- `get_project_summary`
- `update_project_summary`

Behavior:

- Summary lookup is workspace-bound and has no projectId argument
- Reading a summary is side-effect free
- Updating a summary is blocked unless write access is explicitly enabled by the server bootstrap
- Summary fields are compact and limited in length
- The summary shape is:
  - `projectName`
  - `purpose`
  - `techStack`
  - `architectureStyle`
  - `importantConventions`
  - `knownConstraints`
  - `securitySensitiveAreas`

### Memory CRUD and search

- `add_memory`
- `update_memory`
- `delete_memory`
- `search_memory`
- `memory.search`
- `memory-entry.create`
- `memory-entry.update`
- `memory.relationship.create`

Behavior:

- Create and update operations are validated with Zod
- Updates support field replacement and relationship changes
- Delete is a soft delete
- Search supports query, category, tags, tag operator, confidence, source, content inclusion, and limit

### Indexing and context

- `memory.index`
- `rebuild_index`
- `get_relevant_context`
- `capture_artifact_memory`
- `export_markdown`

Behavior:

- `memory.index` indexes already collected source objects into the database
- `rebuild_index` clears and recreates project data transactionally
- `get_relevant_context` returns ranked grouped context and a pre-rendered markdown response
- `capture_artifact_memory` extracts reusable knowledge from supported artifacts and deduplicates captures
- `export_markdown` writes the markdown backup set for the workspace

## Persistence Model

- `projects`
- `project_summaries`
- `memory_entries`
- `tags`
- `memory_entry_tags`
- `relationships`
- `source_documents`
- `indexing_runs`
- `schema_metadata`
- Compatibility tables:
  - `entries`
  - `entries_tags`

Important behavior:

- Project rows are keyed by workspace root path
- Project summaries are 1:1 with projects
- Memory entries store content hash, category, source, summary, confidence, related files, and optional source document linkage
- Tags are normalized and deduplicated per project
- Relationships are unique per source, target, and relationship type
- Source documents are unique per project and path
- Indexing runs track start, finish, status, source count, entry count, and schema version

## Safety And Validation

- Workspace and file paths are resolved through `PathSanitizer`
- Directory traversal is rejected for subpaths and source paths
- Secret scanning/redaction is applied to titles, content, tags, and exported markdown
- Ignore patterns are loaded from `.gitignore` and `.flash-mem-ignore`
- Sensitive paths like `.env`, `.npmrc`, `.netrc`, and `.git/credentials` are ignored by the indexing guard
- Inputs are validated with Zod at the MCP boundary
- Database access stays in repository classes
- Transactions are used for multi-step writes
- Export file names are sanitized before writing

## Markdown Backup Format

- Markdown exports are split into section files
- The export manifest tracks:
  - project identity
  - export root
  - generation time
  - total entry count
  - per-section counts
- Export sections:
  - `project-summary`
  - `decisions`
  - `patterns`
  - `bug-fixes`
  - `security-notes`
  - `conventions`
- Restore parses frontmatter, entry headings, tags, relationships, and source document references
- Restore keeps the first entry when duplicate IDs appear across files

## Data Rules Observed In Code

- Memory categories are constrained to the built-in set:
  - `project`
  - `framework`
  - `architecture`
  - `convention`
  - `decision`
  - `pattern`
  - `bug_fix`
  - `security_note`
  - `dependency`
  - `risk`
  - `constraint`
  - `integration`
- Project summary fields are capped at 1000 characters each and 4000 characters total
- Secret scanning rejects inputs over 2MB
- Search requires either a query or at least one filter
- Relevant context groups results into patterns, decisions, security notes, risks, and conventions

## Manual Review Notes

- The feature set is centered on local workspace memory management, not remote sync
- CLI and MCP share the same SQLite-backed core services
- The project summary feature is intentionally separate from general memory entries
- The codebase includes both export/restore workflows and artifact-to-memory capture workflows

