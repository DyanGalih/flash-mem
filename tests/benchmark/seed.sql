INSERT INTO projects (id, root_path, name, created_at, updated_at) VALUES ('bench', '/bench', 'benchmark', 1, 1);
INSERT OR REPLACE INTO schema_metadata (key, value, updated_at) VALUES ('schema_version', '2.0.0', 1);
INSERT OR REPLACE INTO schema_metadata (key, value, updated_at) VALUES ('fts5_enabled', 'enabled', 1);

INSERT INTO knowledge_objects (id, project_id, knowledge_type, title, content, authority_level, confidence, freshness_status, scope_level, capture_method, capture_tool, hash, created_at, updated_at) VALUES
('ko1', 'bench', 'decision', 'Use SQLite for storage', 'SQLite provides local-first storage with zero config', 'authoritative', 95, 'current', 'project', 'manual', 'flash-mem', 'hash1', 1, 1),
('ko2', 'bench', 'pattern', 'FTS5 full-text search pattern', 'Use FTS5 virtual tables with unicode61 tokenizer for search', 'inferred', 80, 'current', 'project', 'manual', 'flash-mem', 'hash2', 1, 1),
('ko3', 'bench', 'constraint', 'Secret scanning on capture', 'All capture paths must run through SecretScanner', 'authoritative', 100, 'current', 'project', 'manual', 'flash-mem', 'hash3', 1, 1),
('ko4', 'bench', 'convention', 'TOON for LLM responses', 'Use TOON format for token-efficient LLM responses', 'validated', 90, 'current', 'project', 'manual', 'flash-mem', 'hash4', 1, 1),
('ko5', 'bench', 'pattern', 'Relationship graph walk', 'Expand search results through typed relationships with decay', 'inferred', 70, 'current', 'project', 'manual', 'flash-mem', 'hash5', 1, 1),
('ko6', 'bench', 'decision', 'WAL mode for concurrency', 'Enable SQLite WAL mode for better concurrent access', 'authoritative', 85, 'current', 'project', 'manual', 'flash-mem', 'hash6', 1, 1),
('ko7', 'bench', 'dependency', 'better-sqlite3 dependency', 'Use better-sqlite3 for synchronous SQLite access', 'validated', 90, 'current', 'project', 'manual', 'flash-mem', 'hash7', 1, 1),
('ko8', 'bench', 'risk', 'FTS5 availability risk', 'FTS5 may be unavailable on some SQLite builds', 'inferred', 60, 'current', 'project', 'manual', 'flash-mem', 'hash8', 1, 1),
('ko9', 'bench', 'constraint', 'Additive migrations only', 'Schema changes must be additive, never destructive', 'authoritative', 100, 'current', 'project', 'manual', 'flash-mem', 'hash9', 1, 1),
('ko10', 'bench', 'convention', 'Project path required', 'All MCP tools require project_path parameter', 'authoritative', 95, 'current', 'project', 'manual', 'flash-mem', 'hash10', 1, 1),
('ko11', 'bench', 'decision', 'Zod for validation', 'Use Zod schemas at all trust boundaries', 'authoritative', 98, 'current', 'project', 'manual', 'flash-mem', 'hash11', 1, 1),
('ko12', 'bench', 'pattern', 'Repository pattern', 'Repositories wrap better-sqlite3 with prepared statements', 'validated', 88, 'current', 'project', 'manual', 'flash-mem', 'hash12', 1, 1),
('ko13', 'bench', 'integration', 'MCP stdio transport', 'Flash-mem communicates via MCP stdio transport', 'validated', 92, 'current', 'project', 'manual', 'flash-mem', 'hash13', 1, 1),
('ko14', 'bench', 'decision', 'Entries v2 unified view', 'entries_v2 VIEW unifies knowledge and memory entries', 'authoritative', 96, 'current', 'project', 'manual', 'flash-mem', 'hash14', 1, 1),
('ko15', 'bench', 'constraint', 'No external LLM dependency', 'Core pipeline must not require external LLM calls', 'authoritative', 99, 'current', 'project', 'manual', 'flash-mem', 'hash15', 1, 1),
('ko16', 'bench', 'pattern', 'Capture orchestrator', 'CaptureOrchestrator coordinates extraction, safety, dedup', 'inferred', 75, 'current', 'project', 'manual', 'flash-mem', 'hash16', 1, 1),
('ko17', 'bench', 'convention', 'Secret redaction warnings', 'Secret scan failures produce warnings, not blocks', 'validated', 82, 'current', 'project', 'manual', 'flash-mem', 'hash17', 1, 1),
('ko18', 'bench', 'decision', 'TOON never stored', 'TOON generated at query time, never persisted', 'authoritative', 97, 'current', 'project', 'manual', 'flash-mem', 'hash18', 1, 1),
('ko19', 'bench', 'dependency', 'fs-extra dependency', 'Use fs-extra for enhanced filesystem operations', 'validated', 80, 'current', 'project', 'manual', 'flash-mem', 'hash19', 1, 1),
('ko20', 'bench', 'constraint', 'Workspace-bound paths', 'Path sanitization enforced for all workspace paths', 'authoritative', 100, 'current', 'project', 'manual', 'flash-mem', 'hash20', 1, 1),
('ko21', 'bench', 'decision', 'Stale knowledge rule', 'Objects older than 90 days without validation are stale', 'validated', 85, 'stale', 'project', 'manual', 'flash-mem', 'hash21', 1, 1),
('ko22', 'bench', 'pattern', 'Deprecated authority rule', 'Superseded objects marked as deprecated authority', 'validated', 84, 'current', 'project', 'manual', 'flash-mem', 'hash22', 1, 1);
