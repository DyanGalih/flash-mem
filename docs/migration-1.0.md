# Migration Guide — Flash-mem 1.0

## Schema Changes

Schema v2.0 adds, without modifying existing tables:
- `knowledge_objects` — typed knowledge entries (primary store)
- `knowledge_rels` — typed relationships
- `authority_chain` — provenance/supersession history
- `knowledge_fts` — FTS5 virtual table for search
- `entries_v2` VIEW — UNION of `knowledge_objects` + `memory_entries`

`source_documents` gains `document_type` and `sections_json` columns.

Migration is applied automatically on connection via `SchemaMigrationService`:
- version < `1.1.0` → run `0001_memory_store`
- version < `2.0.0` → run `0002_knowledge_objects`

## Central Storage Migration

Flash-mem 1.0 centralizes per-workspace persistence under `~/.flash-mem/workspaces/<workspace-id>/flashmem.sqlite` (or `${FLASH_MEM_HOME}/workspaces/<workspace-id>/flashmem.sqlite` if `FLASH_MEM_HOME` is set) and removes repository-local `.sqlite` probing. To migrate an existing repository-local database from an earlier version:
1. Stop any running flash-mem processes or MCP servers to flush and checkpoint the WAL journal.
2. Initialize or run any flash-mem tool in your workspace once to create the central workspace directory.
3. If you have an existing `.flash-mem/flashmem.sqlite` in your workspace, restore your memories via markdown export or copy the database:
   ```bash
   # Option A: Restore from markdown export
   flash-mem restore .

   # Option B: Copy existing database to central storage
   STORAGE_ROOT="${FLASH_MEM_HOME:-$HOME/.flash-mem}"
   cp .flash-mem/flashmem.sqlite "$STORAGE_ROOT/workspaces/<workspace-id>/flashmem.sqlite"
   ```

## Backfill

Convert legacy memory entries to knowledge objects:

```bash
flash-mem migrate backfill .
```

Maps `category` → `knowledge_type`, sets `authority_level = 'provisional'`, reuses existing content hash for idempotent dedup, and refreshes the FTS index.

## Rollback

All schema changes are additive and older code continues reading existing tables without modification. Note that knowledge objects created after upgrading to 1.0 will not be accessible to pre-1.0 versions, as older code queries `memory_entries` exclusively.

To roll back to a pre-1.0 version that reads the repository-local database:
1. Stop any active flash-mem processes or MCP servers.
2. Back up your existing repository-local database if present:
   ```bash
   cp .flash-mem/flashmem.sqlite .flash-mem/flashmem.sqlite.bak
   ```
3. Copy the central database back to the repository-local location so changes made while running 1.0 (such as new `memory_entries`) are preserved:
   ```bash
   STORAGE_ROOT="${FLASH_MEM_HOME:-$HOME/.flash-mem}"
   cp "$STORAGE_ROOT/workspaces/<workspace-id>/flashmem.sqlite" .flash-mem/flashmem.sqlite
   ```

## Compatibility Guarantees

- `search_memory` returns hybrid knowledge search results when query matches knowledge objects, and falls back to legacy search otherwise or when legacy filters (`category`, `tags`, `source`) are provided.
- `add_memory` still creates legacy memory entries.
- New `knowledge_*` MCP tools coexist with legacy tools.
