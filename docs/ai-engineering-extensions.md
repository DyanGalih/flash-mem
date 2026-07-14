# AI Engineering Extensions

`flash-mem` remains a local-first memory layer with a small canonical MCP surface.
The AI engineering additions below are the public tools now exposed for context prep, synthesis, shared lessons, and workspace initialization.

## Canonical Public Tools

- `prepare_context`
- `memory_synthesis`
- `doc_synthesis`
- `token_report`
- `promote_shared_lesson`
- `sync_shared_lessons`
- `init_project`

## Behavior Notes

- `prepare_context` can write markdown artifacts, and when `--write` is enabled those artifacts are indexed back into flash-mem as durable markdown content.
- `--store` stores generated markdown directly in flash-mem and skips creating markdown files on disk.
- `sync_shared_lessons` writes both the native root file and the review buffer at `docs/memory/SHARED_LESSONS.md`.
- `init_project` writes the standard flash-mem init artifacts plus the compatibility profile at `.specify/extensions/memory-md/config.yml`.

## Migration Note

Older legacy compatibility tool names were removed from the public MCP tool list to keep the surface smaller and less ambiguous.
If a downstream caller still depends on those names, migrate it to the canonical tools above.

## Workflow Guidance

For AI engineering workflow work, use this order:

1. `get_project_summary`
2. `search_memory`
3. `prepare_context`
4. `synthesize-memory` or `synthesize-docs` when you want a standalone artifact
5. `token-report` when you want a compact token comparison
6. `promote-lesson` or `sync-shared` when a lesson should be shared across projects

## Migration Note

Existing flash-mem users do not need to change their current workflow.
The new commands and tools are additive and optional.
If you already use `search_memory`, `add_memory`, and `capture_artifact_memory`, those paths still work unchanged.
The new AI engineering extensions simply provide richer orchestration, artifact writing, and shared-lesson support when you want them.
