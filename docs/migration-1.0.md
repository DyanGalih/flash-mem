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

## Backfill

Convert legacy memory entries to knowledge objects:

```bash
flash-mem migrate backfill .
```

Maps `category` → `knowledge_type`, sets `authority_level = 'legacy'`, reuses existing content hash for idempotent dedup.

## Rollback

No action needed. All changes are additive:
- Old code ignores new tables.
- `entries_v2` VIEW reads both old and new.
- No `DROP TABLE` or destructive `ALTER` was performed.

## Compatibility Guarantees

- `search_memory` returns legacy + knowledge results via `entries_v2`.
- `add_memory` still creates legacy memory entries.
- New `knowledge_*` MCP tools coexist with legacy tools.
