# Epic 1 — Knowledge Schema & Migration Tasks

## Task 1.1 — Create 0002 migration file

**File**: `src/infrastructure/database/migrations/0002_knowledge_objects.ts`

- [x] Add `knowledge_objects` table (all columns per spec, indexes)
- [x] Add `knowledge_rels` table (indexes)
- [x] Add `authority_chain` table (indexes)
- [x] Add `ALTER TABLE source_documents ADD COLUMN document_type`, `sections_json` with existence checks
- [x] Add `CREATE VIRTUAL TABLE knowledge_fts` with try/catch
- [x] Add `CREATE VIEW entries_v2`
- [x] Add FTS rebuild function
- [x] Update `schema_metadata.schema_version = '2.0.0'`
- [x] Export `initializeKnowledgeObjectSchema(db)` and `MIGRATION_0002_SCHEMA_VERSION`

**Verification**: `npm run build` compiles without errors.

## Task 1.2 — Update SchemaMigrationService

**File**: `src/application/services/SchemaMigrationService.ts`

- [x] Read current version from `schema_metadata`
- [x] Apply 0001 if version < `'1.1.0'`
- [x] Apply 0002 if version < `'2.0.0'`

**Verification**: Fresh DB gets both migrations, existing v1.x DB gets only 0002.

## Task 1.3 — Unit test: migration idempotency

**File**: `tests/unit/0002_knowledge_objects.test.ts`

- [x] Create in-memory DB
- [x] Run 0002 twice
- [x] Assert no errors, schema_version = '2.0.0'

## Task 1.4 — Integration test: v1.x → v2.0 migration

**File**: `tests/integration/0002_knowledge_objects.test.ts`

- [x] Create v1.x DB with 0001 + sample data (insert project, memory_entry)
- [x] Run SchemaMigrationService (which applies 0002)
- [x] Assert: `knowledge_objects`, `knowledge_rels`, `authority_chain` exist
- [x] Assert: `source_documents` has `document_type`, `sections_json` columns
- [x] Assert: `schema_metadata.schema_version = '2.0.0'`
- [x] Assert: `entries_v2` returns the sample memory_entry row
- [x] Assert: `knowledge_fts` exists or `fts5_enabled = 'disabled'`

## Task 1.5 — Integration test: FTS5 graceful fallback

**File**: `tests/integration/0002_knowledge_objects.test.ts` (same file)

- [x] Mock/bodge FTS5 creation failure
- [x] Assert `fts5_enabled = 'disabled'`, migration completes without error
