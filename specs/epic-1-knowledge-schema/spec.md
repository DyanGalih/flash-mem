# Epic 1 — Knowledge Schema & Migration

## References

- **Source**: `flash-mem-1.0-upgrade.md` §5.2, §5.3, §5.4, §5.5, §5.6, §5.7, §11.2, §11.5
- **Constitution**: `.specify/memory/architecture_constitution.md`
- **Discovery**: `specs/epic-1-knowledge-schema/discovery-summary.md`

## Scope

Additive schema v2.0 migration introducing knowledge object storage alongside existing v1.x tables. No existing table is altered destructively. No data is moved or transformed (backfill deferred to Epic 5).

## Deliverables

1. **Migration file**: `src/infrastructure/database/migrations/0002_knowledge_objects.ts`
2. **Migration runner update**: `SchemaMigrationService.ts` version-gated stepping
3. **Tables created**:
   - `knowledge_objects` (all columns per §5.3, indexes)
   - `knowledge_rels` (all columns per §5.3, indexes)
   - `authority_chain` (all columns per §5.3, indexes)
   - `knowledge_fts` (FTS5 virtual table, `unicode61 remove_diacritics 2`)
4. **Extended table**:
   - `ALTER TABLE source_documents ADD COLUMN document_type TEXT`
   - `ALTER TABLE source_documents ADD COLUMN sections_json TEXT`
5. **VIEW**: `CREATE VIEW entries_v2` (UNION of `knowledge_objects` + `memory_entries`)
6. **Schema version**: `UPDATE schema_metadata SET value = '2.0.0'`

### entries_v2 Shape

```sql
CREATE VIEW entries_v2 AS
  SELECT
    id, project_id, title, content,
    knowledge_type AS category,
    authority_level AS source,
    confidence,
    summary,
    NULL AS related_files,
    source_doc_id AS source_document_id,
    'knowledge_object' AS entry_source,
    created_at, updated_at, deleted_at
  FROM knowledge_objects
  WHERE deleted_at IS NULL
  UNION ALL
  SELECT
    id, project_id, title, content,
    category, source, confidence, summary,
    related_files, source_document_id,
    'memory_entry' AS entry_source,
    created_at, updated_at, deleted_at
  FROM memory_entries
  WHERE deleted_at IS NULL;
```

## Constraints

- **P0 - Additive only**: All DDL uses `CREATE ... IF NOT EXISTS` or `ALTER TABLE ADD COLUMN` with existence checks.
- **P0 - No domain imports**: Migration lives in infrastructure layer. No domain entity types imported.
- **FTS5 graceful**: Mirror existing try/catch pattern from `0001_memory_store.ts`. `fts5_enabled` metadata flag set to `'enabled'` or `'disabled'`.
- **Idempotent**: Running migration on v2.0 DB produces no errors, no duplicate rows.
- **Sync**: All schema operations synchronous via `better-sqlite3` transaction.

## SchemaMigrationService Changes

Current: calls `initializeMemoryStoreSchema()` unconditionally.
New: version-gated stepping (auto-apply on connection):
1. Read current version from `schema_metadata`.
2. If version < `'1.1.0'`: run `initializeMemoryStoreSchema()` (0001).
3. If version < `'2.0.0'`: run `0002_knowledge_objects` migration.
4. Return final version.

## Clarifications

### Session 2026-07-25
- Q: Should 0002 migration apply automatically on connection (current pattern) or only via explicit CLI command? → A: Auto-apply via version-gated SchemaMigrationService.

## Out of Scope

- `KnowledgeObject` domain entity (Epic 2)
- Backfill from `memory_entries` to `knowledge_objects` (Epic 5)
- Relationship graph queries or services (Epic 5)
- FTS5 search service changes (Epic 6)
- MCP/CLI tool changes (Epic 7)

## Tests

1. **Unit**: Migration idempotency — run 0002 twice, verify no errors.
2. **Integration**: v1.x DB → migrate → verify all new tables exist, `schema_version` is `'2.0.0'`, `entries_v2` returns `memory_entry` rows.
3. **Integration**: FTS5 fallback — simulate FTS5 creation failure, verify `fts5_enabled = 'disabled'`.
4. **Integration**: `source_documents` columns added — verify `document_type` and `sections_json` exist.
