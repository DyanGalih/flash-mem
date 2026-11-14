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

## Knowledge Tools (Flash-mem 1.0)

- `search_knowledge` — hybrid FTS5 + lexical search with authority ranking (TOON)
- `get_knowledge_object` — fetch a single knowledge object by ID (TOON)
- `add_knowledge_object` — create a typed knowledge object (JSON)
- `update_knowledge_object` — update with provenance tracking (JSON)
- `delete_knowledge_object` — soft delete with audit trail (JSON)
- `capture_from_policy` — extract knowledge from Architecture Guard policies (JSON)
- `resolve_conflicts` — find knowledge objects with `conflicts_with` relationships (TOON)
- `validate_knowledge` — run freshness and authority checks (JSON)

## MCP Response Formats

- TOON: `get_project_summary`, `search_memory`, `get_relevant_context`, `prepare_context`, `token_report`, `search_knowledge`, `get_knowledge_object`, `resolve_conflicts`
- Markdown: `memory_synthesis`, `doc_synthesis`, `generate_memory_synthesis`, `generate_doc_synthesis`
- JSON/plain text: write/admin tools and `add_knowledge_object`, `update_knowledge_object`, `delete_knowledge_object`, `capture_from_policy`, `validate_knowledge`

The public MCP server no longer registers the older legacy compatibility tool names, and it does not expose `memory_*` compatibility aliases either. New integrations should use the canonical tool names above.

Shared lessons are written to both `SHARED_LESSONS.md` at the workspace root and `docs/memory/SHARED_LESSONS.md` for review.

## Notes

- `memory_index` is retained as a lower-level incremental ingestion tool.
- `capture_artifact_memory` is the preferred refresh path for markdown artifacts.
- `rebuild_index` is reserved for rare full workspace rescans and still scans markdown files only.
- `update_project_summary` is available when the MCP server is started with project summary write access enabled.
