# Release Notes

Lightweight user-facing notes for each release.

## Unreleased
- No unreleased changes yet.

## v0.2.2
- Added:
  - `prepare-context`, `synthesize-memory`, and `synthesize-docs` now support `--store` for direct flash-mem storage without writing markdown files.
  - Markdown written with `--write` can be indexed back into flash-mem automatically.
- Changed:
  - Agent instructions now treat flash-mem as the source of truth and prefer `capture_artifact_memory` after markdown changes.
  - `flash-mem init` and `flash-mem update` now refresh older instruction files with a newer protocol marker when the template changes.
- Fixed:
  - CLI and docs now match the memory-first workflow instead of relying on `rebuild-index` by default.

## v0.2.1
- Added:
  - Background markdown export scheduling.
  - Detached export launching.
  - Export safety checks that prune stale export directories.
  - Markdown restore improvements and richer export formatting.
- Changed:
  - Markdown exports are now written into dated subdirectories and grouped into smaller files when needed.
  - The CLI and MCP surfaces were updated for the export/safety workflow.
  - Memory and export services were refactored for the new export pipeline.
- Fixed:
  - Tests were updated around markdown export, restore, indexing, and safety behavior.
- Notes:
  - This release focused on turning markdown export into a safer background workflow.

## v0.2.0
- Added:
  - Initial 0.2.x baseline for the flash-mem CLI and MCP memory workflow.
- Changed:
  - Core memory commands, summaries, and project initialization were already established by this release line.
- Fixed:
  - N/A
- Notes:
  - If you need the detailed history before 0.2.0, use the Git tags and commit log.

## 0.1.x History
- Added:
  - Core workflow: workspace init, CLI/MCP integration, durable memory storage, and agent instruction scaffolding.
  - Later additions: workspace root resolution, `cwd` support, interactive MCP config selection, prompt improvements, and the `.mdc` Cursor rules format.
- Changed:
  - Docs and README updates clarified the retrieval-first workflow.
- Fixed:
  - Early compatibility and setup issues were tightened up as the 0.1.x line matured.
- Notes:
  - This repo does not show a `v0.1.0` Git tag, so this section summarizes the early 0.1.x history instead of listing a tag that does not exist.
