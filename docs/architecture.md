# Flash-mem 1.0 — Architecture

## Layer Diagram

```
┌──────────────────────────────────────────────────┐
│  MCP Server Layer                                 │
│  (Stdio transport, tool registry, TOON adapter)  │
├──────────────────────────────────────────────────┤
│  Application Services Layer                       │
│  (KnowledgeService, CaptureOrchestrator,          │
│   HybridSearchService, SchemaMigrationService)    │
├──────────────────────────────────────────────────┤
│  Domain Layer                                     │
│  (KnowledgeObject, KnowledgeRelationship,         │
│   AuthorityChain, ExtractionRule, Config)         │
├──────────────────────────────────────────────────┤
│  Infrastructure Layer                             │
│  (SQLite + FTS5, migrations, safety guards,       │
│   extractors, markdown export/import)             │
└──────────────────────────────────────────────────┘
```

## Data Flow

```
┌──────────┐    ┌──────────────┐    ┌─────────────┐
│ Source   │───>│ Capture      │───>│ Knowledge   │
│ Artifact │    │ Pipeline     │    │ Objects     │
│ (.yaml)  │    │ (Extractors) │    │ (SQLite)    │
└──────────┘    └──────────────┘    └──────┬──────┘
                                           │
                                           v
┌──────────┐    ┌──────────────┐    ┌─────────────┐
│ Agent    │<───│ MCP Server   │<───│ Hybrid      │
│ Response │    │ (TOON → LLM) │    │ Retrieval   │
└──────────┘    └──────────────┘    │ Engine      │
                                    └─────────────┘
```

## Knowledge Model

`KnowledgeObject` supersedes `MemoryEntry`:
- typed by `knowledgeType` (10 types: decision, constraint, convention, pattern, risk, dependency, integration, specification, lesson, insight)
- carries `authorityLevel` (definitive, validated, provisional, deprecated)
- `freshnessStatus`, `scopeLevel`, `confidence`, provenance metadata
- linked via typed relationships (`supersedes`, `depends_on`, `refines`, `explains`, etc.)

## Retrieval Pipeline

```
Query → HybridSearchService
  ├── FTS5 BM25 search on knowledge_fts
  ├── Lexical fallback (LIKE + tag)
  ├── Authority-aware ranking (ftsScore*1000 + metadata*10 + confidence + recency + authorityBonus)
  └── Relationship graph walk (1 level, decay 0.5)
        → TOON projection → MCP response
```

## Schema ERD (Summary)

- `projects` (1) → (N) `knowledge_objects`
- `knowledge_objects` (1) → (N) `knowledge_rels`
- `knowledge_objects` (1) → (N) `authority_chain`
- `knowledge_objects` → `knowledge_fts` (FTS5 index)
- `memory_entries` preserved for legacy; `entries_v2` VIEW unifies both
