# Epic 1 — Knowledge Schema & Migration Plan

## Approach

Single migration file (mirrors 0001 pattern) plus SchemaMigrationService stepping update. Smallest correct change: additive DDL only, FTS5 graceful, version-gated.

## Implementation Order

### Step 1 — Migration file
**File**: `src/infrastructure/database/migrations/0002_knowledge_objects.ts`

- `CREATE TABLE IF NOT EXISTS knowledge_objects` — all columns per spec §5.3
- `CREATE TABLE IF NOT EXISTS knowledge_rels`
- `CREATE TABLE IF NOT EXISTS authority_chain`
- `CREATE INDEX` on each new table (project+type, hash unique, source_id, target_id, etc.)
- `ALTER TABLE source_documents ADD COLUMN` document_type, sections_json (with column existence check)
- `CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(...)` — try/catch same as 0001, `unicode61 remove_diacritics 2`
- `CREATE VIEW IF NOT EXISTS entries_v2` — UNION per spec shape
- `UPDATE schema_metadata SET value = '2.0.0'`
- Export `MIGRATION_0002_SCHEMA_VERSION = '2.0.0'`
- Export `initializeKnowledgeObjectSchema(db)` function
- FTS5 rebuild function `rebuildKnowledgeFts(db)` — mirrors `rebuildMemoryEntriesFts`

### Step 2 — SchemaMigrationService version gating
**File**: `src/application/services/SchemaMigrationService.ts`

- Read `schema_metadata.schema_version`
- If < `'1.1.0'`: call `initializeMemoryStoreSchema()` (existing)
- If < `'2.0.0'`: call `initializeKnowledgeObjectSchema(db)` (new)
- Return final version

### Step 3 — Tests
**Files**: `tests/unit/0002_knowledge_objects.test.ts`, `tests/integration/0002_knowledge_objects.test.ts`

- Unit: run 0002 twice, assert no error
- Integration: create v1.x DB (run 0001), migrate to v2.0, assert tables exist, schema_version = '2.0.0', entries_v2 returns known rows
- Integration: FTS5 fallback (simulate failure, check fts5_enabled = 'disabled')
- Integration: source_documents column addition, verify columns exist

## Risks

- **Migration ordering**: Ensure 0001 runs before 0002 on fresh DB. SchemaMigrationService stepping handles this.
- **FTS5 transaction**: Same as 0001 pattern — try/catch inside transaction absorbs failure.

## Verification

```
npm run build && npm test
```
