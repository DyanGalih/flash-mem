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

## Compatibility Aliases

- `memory_search` -> `search_memory`
- `memory_entry_create` -> `add_memory`
- `memory_entry_update` -> `update_memory`
- `memory_relationship_create` -> `add_memory_relationship`
- `memory_project_summary_get` -> `get_project_summary`
- `memory_project_summary_update` -> `update_project_summary`

## Notes

- `memory_index` is retained as a lower-level incremental ingestion tool.
- `rebuild_index` is the command to use for a full workspace rescan, but the current implementation scans markdown files only.
- `update_project_summary` is available when the MCP server is started with project summary write access enabled.
