# Spec Kit Integration

`flash-mem` remains a local-first memory layer with its original CLI and MCP surface intact.
The additions below are opt-in compatibility helpers for spec-driven development and memory-first orchestration.

## Canonical Surfaces

These remain the primary `flash-mem` workflow:

- Retrieval: `get_project_summary`, `search_memory`, `get_relevant_context`
- Writes: `add_memory`, `update_memory`, `delete_memory`
- Capture and maintenance: `capture_artifact_memory`, `export_markdown`, `rebuild_index`

These names are still the source of truth for flash-mem-native usage. All compatibility helpers are additive and should delegate to these services rather than replacing them.

## Added Compatibility Helpers

CLI:

- `flash-mem prepare-context`
- `flash-mem synthesize-memory`
- `flash-mem synthesize-docs`
- `flash-mem token-report`
- `flash-mem promote-lesson`
- `flash-mem sync-shared`

MCP tools:

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

Compatibility aliases are also kept for older or alternate naming conventions:

- `memory_search` -> `search_memory`
- `memory_entry_create` -> `add_memory`
- `memory_entry_update` -> `update_memory`
- `memory_relationship_create` -> `add_memory_relationship`
- `memory_project_summary_get` -> `get_project_summary`
- `memory_project_summary_update` -> `update_project_summary`
- `generate_memory_synthesis` -> `memory_synthesis`
- `generate_doc_synthesis` -> `doc_synthesis`

Compatibility wrappers are used when the reference memory-hub contract needs argument normalization or an additional side effect. Flash-mem remains the canonical runtime and does not depend on the hub repo at runtime.

Wrapper classification:

- Migration-only wrappers: `speckit_memory_search`, `speckit_memory_synthesize`, `speckit_memory_token_report`
- Thin wrappers with extra schema or artifact handling: `speckit_memory_share_lesson`, `speckit_memory_sync_shared`, `speckit_memory_init_project`

Migration-only wrappers are kept for downstream prompt compatibility and can be deprecated later if the downstream callers move to the canonical flash-mem names.

- `speckit_memory_search` normalizes `workspaceRoot` / `projectRoot` into the canonical search path.
- `speckit_memory_synthesize` normalizes `feature` / `featurePath` and delegates to memory synthesis.
- `speckit_memory_share_lesson` accepts the memory-hub schema `{ id, title, content, language, framework?, tags? }`, preserves the caller-supplied `id`, and maps it into flash-mem shared lessons.
- `speckit_memory_sync_shared` writes both the native root file and the review buffer at `docs/memory/SHARED_LESSONS.md`.
- `speckit_memory_init_project` accepts the memory-hub schema `{ language, framework?, workspaceRoot?, projectRoot? }`, writes the standard flash-mem init artifacts, and also emits the reference memory-hub profile at `.specify/extensions/memory-md/config.yml` with `project_profile.shared_memory.enabled` and `project_profile.shared_memory.sync_channels`.
- `speckit_memory_token_report` normalizes memory-hub argument names and returns the compatibility report payload.

Shared lessons are written to two locations:

- Native flash-mem output: `SHARED_LESSONS.md` at the workspace root.
- Memory-hub review buffer: `docs/memory/SHARED_LESSONS.md`.

The review buffer is temporary by design. It includes a banner, review guidance, grouped lesson entries, and instructions to copy durable items into project memory and delete the file after review.

Schema split:

- Canonical flash-mem shared lesson promotion uses `promote_shared_lesson` with `topic` and `lesson`.
- Memory-hub shared lesson promotion uses `speckit_memory_share_lesson` with `id`, `title`, `content`, and `language`; the `id` is kept as the stored lesson id.
- Canonical flash-mem init uses `init` and existing workspace setup behavior.
- Memory-hub init uses `speckit_memory_init_project` with required `language` and optional `framework`; the wrapper returns the reference `.specify/extensions/memory-md/config.yml` profile artifact plus the native flash-mem profile JSON, with nested `project_profile.shared_memory` sync metadata.

Legacy note:

- The compatibility wrappers are retained for migration only. New flash-mem-native integrations should prefer the canonical `flash-mem` and MCP tool names above.

## Workflow Guidance

For Spec Kit-style work, use this order:

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
The new Spec Kit helpers simply provide richer orchestration, artifact writing, and shared-lesson support when you want them.
