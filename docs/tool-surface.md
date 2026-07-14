# Tool Surface

`flash-mem` keeps a small public API. The public MCP server exposes canonical tool names only; no compatibility aliases are registered by default.

## Workflow Order

- Retrieval: `get_project_summary`, `search_memory`, `get_relevant_context`
- Writes: `add_memory`, `update_memory`, `delete_memory`
- Capture and maintenance: `capture_artifact_memory`, `export_markdown`

## Advanced / Admin

- `add_memory_relationship`
- `memory_index`
- `restore_backup`

## AI Engineering Extensions

- `prepare_context`
- `memory_synthesis`
- `doc_synthesis`
- `token_report`
- `promote_shared_lesson`
- `sync_shared_lessons`
- `init_project`

## MCP Response Formats

- TOON: `get_project_summary`, `search_memory`, `get_relevant_context`, `prepare_context`, `token_report`
- Markdown: `memory_synthesis`, `doc_synthesis`, `generate_memory_synthesis`, `generate_doc_synthesis`
- JSON/plain text: write/admin tools

The public MCP server no longer registers the older legacy compatibility tool names, and it does not expose `memory_*` compatibility aliases either. New integrations should use the canonical tool names above.

Shared lessons are written to both `SHARED_LESSONS.md` at the workspace root and `docs/memory/SHARED_LESSONS.md` for review.

## Notes

- `memory_index` is retained as a lower-level incremental ingestion tool.
- `capture_artifact_memory` is the preferred refresh path for markdown artifacts.
- `rebuild_index` is reserved for rare full workspace rescans and still scans markdown files only.
- `update_project_summary` is available when the MCP server is started with project summary write access enabled.
