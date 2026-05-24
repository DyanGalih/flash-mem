# Tool Surface

`flash-mem` keeps a small public API and preserves older names as deprecated compatibility aliases.

## Workflow Order

- Retrieval: `get_project_summary`, `search_memory`, `get_relevant_context`
- Writes: `add_memory`, `update_memory`, `delete_memory`
- Capture and maintenance: `capture_artifact_memory`, `export_markdown`, `rebuild_index`

## Advanced / Admin

- `add_memory_relationship`
- `memory_index`
- `restore_backup`

## Spec Kit Compatibility Helpers

- `prepare_context`
- `memory_synthesis`
- `doc_synthesis`
- `token_report`
- `promote_shared_lesson`
- `sync_shared_lessons`
- `speckit_memory_search`
- `speckit_memory_synthesize`
- `speckit_memory_share_lesson`
- `speckit_memory_sync_shared`
- `speckit_memory_init_project`
- `speckit_memory_token_report`

## Compatibility Aliases

- `memory_search` -> `search_memory`
- `memory_entry_create` -> `add_memory`
- `memory_entry_update` -> `update_memory`
- `memory_relationship_create` -> `add_memory_relationship`
- `memory_project_summary_get` -> `get_project_summary`
- `memory_project_summary_update` -> `update_project_summary`
- `generate_memory_synthesis` -> `memory_synthesis`
- `generate_doc_synthesis` -> `doc_synthesis`

Compatibility wrappers are used when the reference memory-hub contract needs argument normalization or an extra side effect. Flash-mem remains the canonical runtime and does not require the hub repo.

Wrapper classification:

- Migration-only wrappers: `speckit_memory_search`, `speckit_memory_synthesize`, `speckit_memory_token_report`
- Thin wrappers: `speckit_memory_share_lesson`, `speckit_memory_sync_shared`, `speckit_memory_init_project`

Migration-only wrappers are retained for prompt compatibility and can be deprecated after downstream callers move to the canonical names.

- `speckit_memory_search` normalizes `workspaceRoot` / `projectRoot`.
- `speckit_memory_synthesize` normalizes `feature` / `featurePath`.
- `speckit_memory_share_lesson` accepts `{ id, title, content, language, framework?, tags? }` and preserves the supplied id.
- `speckit_memory_sync_shared` writes both the native file and the review buffer.
- `speckit_memory_init_project` requires `language` and writes the reference `.specify/extensions/memory-md/config.yml` plus the native project profile JSON, including nested `project_profile.shared_memory` sync settings.
- `speckit_memory_token_report` normalizes memory-hub arguments and returns the compatibility payload.

New integrations should call the canonical flash-mem tool names directly. Use the compatibility wrappers only when downstream migration still depends on the reference naming contract.

Shared lessons are written to both `SHARED_LESSONS.md` at the workspace root and `docs/memory/SHARED_LESSONS.md` for review.

## Notes

- `memory_index` is retained as a lower-level incremental ingestion tool.
- `rebuild_index` is the command to use for a full workspace rescan, but the current implementation scans markdown files only.
- `update_project_summary` is available when the MCP server is started with project summary write access enabled.
