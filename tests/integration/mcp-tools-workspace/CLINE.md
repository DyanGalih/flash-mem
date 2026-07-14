<!-- flash-mem-protocol-start v10 -->
# flash-mem

## Goal
Keep durable project memory current and easy to retrieve.

## Pre-Flight Gate — MANDATORY
Before ANY of the following actions, you MUST call `get_project_summary` and `search_memory` first
(if flash-mem is unavailable, note it explicitly and continue with local files):
- Creating or updating an implementation plan
- Creating, updating, or reviewing specification documents or SDD framework artifacts
- Writing, modifying, or deleting source code
- Generating specifications, tasks, or technical plans
- Making architecture or design decisions
- Responding to debugging or incident questions

Do NOT skip this step. Do NOT proceed to file reads, code edits, or plan generation until flash-mem has been queried.
Exception: For trivially scoped changes (e.g., typo fixes, formatting, single-line comment edits) where no architectural or behavioral context is needed, the gate may be skipped.

## Rules
- Treat flash-mem as the source of truth for durable project memory.
- Search first (see Pre-Flight Gate above for the exhaustive trigger list).
- Prefer summaries, metadata, tags, confidence, and related files before loading full memory content.
- Store only durable knowledge: decisions, conventions, constraints, bugs, workflows.
- Use `update_memory` when refining an existing memory; use `add_memory` for genuinely new durable facts.
- Attach relationships when a memory depends on or explains another memory.
- Write immediately: use `add_memory` for new durable facts and `update_memory` for changes.
- If flash-mem retrieval is empty or incomplete, inspect the markdown file and do not skip `capture_artifact_memory`; if it contains durable knowledge, capture it before treating it as current context.
- If `capture_artifact_memory` still returns nothing useful, keep the markdown file as the backup artifact.
- Update summaries when architecture or shared conventions change.
- Prefer explicit deletion with audit trail.

## Memory Quality
- Capture validated outcomes and stable constraints, not transient status updates.
- Include confidence-aware summaries; avoid low-confidence assertions unless clearly marked for verification.
- Keep entries scoped and deduplicated: one durable concept per memory.
- Never store secrets, credentials, tokens, or private keys in memory content.

## Tools
- Read: `get_project_summary`, `search_memory`, `get_relevant_context`
- Write: `add_memory`, `update_memory`, `delete_memory`
- Maintain: `capture_artifact_memory`, `export_markdown`

## Workflow
1. Read summary.
2. Search memory.
3. Load full memory only when the summary is not enough.
4. Add or update durable memory.
5. Update summary when needed.

## Workflow By Intent
- Planning: read summary, search relevant memories, then constrain plans to validated decisions and conventions.
- Implementation: consult related memories first; record only validated architecture or behavior changes.
- Incident/Fix: capture root cause, fix pattern, and prevention guidance as durable memory.

## Maintenance
- Prefer `capture_artifact_memory` for markdown file changes and new markdown artifacts when the file contains durable knowledge, and never skip capture just because the file already exists.
- Keep the markdown file as the backup artifact only when capture returns nothing useful.
- Use `rebuild_index` only when you need a rare full markdown rescan.

## Do Not
- Do not write duplicate synthesis snapshots as separate durable memories.
- Do not dump broad low-confidence notes without verification markers.
- Do not overwrite unrelated memory content when a targeted update is sufficient.

## Forbidden Destructive Database Examples
The policy is framework-agnostic. It applies to any language, framework, ORM, migration tool, database CLI, script, test helper, container command, or CI job that can erase or reset data.
Forbidden examples include, but are not limited to:
- Generic SQL / Database CLI: DROP DATABASE, DROP SCHEMA, DROP TABLE, destructive TRUNCATE, destructive DELETE FROM ... without a safe scoped condition, schema reset scripts, database wipe/reset shell scripts
- Laravel / PHP: php artisan migrate:fresh, php artisan migrate:refresh, php artisan db:wipe
- Node.js / JavaScript / TypeScript: Prisma destructive reset commands (e.g. prisma migrate reset), TypeORM schema synchronization or drop behavior against non-test databases, Sequelize destructive sync behavior (e.g. sync({ force: true })), Knex or custom migration reset scripts that drop tables or schemas
- Ruby / Rails: rails db:drop, rails db:reset, rails db:migrate:reset
- Python / Django / SQLAlchemy / Alembic: commands or scripts that drop and recreate schemas, migration reset scripts that erase existing data, test or seed scripts that truncate persistent tables outside isolated test databases
- Java / JVM: Hibernate ddl-auto=create, create-drop, or equivalent destructive schema generation against persistent databases, Flyway or Liquibase clean/drop/reset actions against non-test databases
- .NET: Entity Framework database delete/reset commands against persistent databases, migration or seed scripts that drop, truncate, or recreate production-like schemas
- Containers / DevOps / CI: deleting persistent database volumes, running reset scripts against shared Docker Compose databases, CI/CD jobs that clean databases without proving the target is disposable, infrastructure scripts that replace or destroy persistent database resources

Use `flash-mem update` to refresh this block if it changes.
<!-- flash-mem-protocol-end -->