# Architecture Guard Integration

## Discovery

The capture pipeline discovers policy files matching `.architecture-guard/**/*.{yaml,yml}` within the workspace root.

## Extraction

`ArchitectureGuardExtractor` parses each policy file deterministically:
- `requires:` rules → `constraint` knowledge objects
- `forbids:` rules → `constraint` knowledge objects
- `recommends:` rules → `decision` knowledge objects
- `warns:` rules → `risk` knowledge objects

Each extracted object is tagged with the policy `domain`, given `authorityLevel: definitive`, and carries `extractionRule: 'architecture-guard-policy'`.

## Capture Pipeline Flow

```
Discover policy files
  → read content
  → SecretScanner redaction
  → extract KnowledgeObjectInput[]
  → dedup via KnowledgeService (content hash)
  → persist
```

## Trigger

```bash
flash-mem migrate backfill .   # captures + backfills
# or via MCP:
#   capture_from_policy { project_path: ... }
```

## Idempotency

Re-running capture produces no duplicates: `KnowledgeService.create()` returns `null` when a matching content hash already exists.
