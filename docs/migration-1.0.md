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

Flash-mem 1.0 centralizes per-workspace persistence under `~/.flash-mem/workspaces/<workspace-id>/flashmem.sqlite` and removes repository-local `.sqlite` probing. To migrate an existing repository-local database from an earlier version:
1. Initialize or run any flash-mem tool in your workspace once to create the central workspace directory.
2. If you have an existing `.flash-mem/flashmem.sqlite` in your workspace, restore your memories via markdown export or copy the database:
   ```bash
   # Option A: Restore from markdown export
   flash-mem restore .

   # Option B: Copy existing database to central storage
   cp .flash-mem/flashmem.sqlite ~/.flash-mem/workspaces/<workspace-id>/flashmem.sqlite
   ```

## Backfill

Convert legacy memory entries to knowledge objects:

```bash
flash-mem migrate backfill .
```

Maps `category` → `knowledge_type`, sets `authority_level = 'provisional'`, reuses existing content hash for idempotent dedup, and refreshes the FTS index.

## Rollback

All schema changes are additive and older code continues reading existing tables without modification. Note that knowledge objects created after upgrading to 1.0 will not be accessible to pre-1.0 versions, as older code queries `memory_entries` exclusively.

## Compatibility Guarantees

- `search_memory` returns hybrid knowledge search results when query matches knowledge objects, and falls back to legacy search otherwise or when legacy filters (`category`, `tags`, `source`) are provided.
- `add_memory` still creates legacy memory entries.
- New `knowledge_*` MCP tools coexist with legacy tools.
