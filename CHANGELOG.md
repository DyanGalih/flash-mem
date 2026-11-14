# Changelog

## [Unreleased]

### Added
- Centralized per-workspace SQLite persistence under `~/.flash-mem/workspaces/<workspace-id>/flashmem.sqlite`.
- Deterministic path mapping via `<basename>-<shortHash>` from canonical `project_path`.
- On-demand auto-initialization of workspace databases and schemas upon first MCP/CLI tool invocation.

### Changed
- Zero in-repo `.sqlite` file detection: project repositories remain clean with no `.sqlite` database files probed or created.

## [1.0.0] — 2026-07-30

### Added
- Knowledge object domain: typed entries, relationships, authority chain, freshness/scope tracking.
- Schema v2.0 migration (`knowledge_objects`, `knowledge_rels`, `authority_chain`, `knowledge_fts`, `entries_v2` VIEW).
- Deterministic capture pipeline: `CaptureOrchestrator`, extraction rule registry, Architecture Guard and Spec Kit extractors.
- Hybrid retrieval engine: `HybridSearchService`, authority-aware ranking, relationship graph walk.
- New MCP tools: `search_knowledge`, `get_knowledge_object`, `add_knowledge_object`, `update_knowledge_object`, `delete_knowledge_object`, `capture_from_policy`.
- `flash-mem migrate backfill` CLI command.
- Workspace config service (`.flash-mem/config.json`).
- Agent instruction protocol block v11.
- Repository analyzer: framework/language detection, doc discovery.
- Evaluation harness: Precision@K, Recall@K, MRR metrics + benchmark runner.
- Documentation: architecture, migration guide, TOON format, Architecture Guard integration.

### Changed
- `CaptureDeduplicationGuard` supports knowledge-mode signatures (legacy behavior preserved).
- Knowledge relationship types validated against explicit taxonomy.

### Backward Compatibility
- All legacy MCP tools unchanged.
- `search_memory` returns legacy + knowledge results via `entries_v2`.
- `memory_entries` table preserved; migration is additive only.
