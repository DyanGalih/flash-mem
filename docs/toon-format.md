# TOON Format

## Role

TOON (Terse Object Notation) is the canonical LLM-facing serialization format for flash-mem. It is a **presentation** format — never stored in the database. TOON is generated at query time from normalized rows via `encodeToon()`.

## Architecture Position

```
MCP Client (LLM)  ←  TOON text  ←  MCP Server (encodeToon)
                                        │ structured data
                                        ▼
                                   Application Layer
                                        │ normalized rows
                                        ▼
                                   SQLite (normalized)
```

## Schema Versioning

Every TOON-encoded response carries a schema version field:

```
{ "v": "1.0", "type": "search_result", "results": [...] }
```

TOON schemas evolve via additive fields only. The codec is lenient to unknown fields.

## Token Efficiency Patterns

1. **Summary-first**: `search_memory` / `get_project_summary` return summaries, not full content.
2. **Field elision**: with `includeContent: false` (default), the `content` field is omitted entirely and `contentHash` is set to `"OMITTED"`.
3. **Result truncation**: large result sets truncated server-side with a `hasMore` flag.
4. **Category/type abbreviation**: knowledge types may use compact tokens in TOON output.

## Response Formats

| Format | Usage |
|--------|-------|
| `toon` | Read operations (search, get) |
| `json` | Write operations (add, update, delete, capture) |
| `markdown` | Synthesis and export flows |

## Example

Search result (summary-first, content elided):

```
{ "v": "1.0", "type": "search_result", "results": [
  { "id": "...", "title": "...", "knowledgeType": "decision", "authorityLevel": "definitive", "contentHash": "OMITTED", "score": 0.87 }
] }
```
