# Usage Guide

`flash-mem` is a local-first engineering memory layer for software teams and AI coding agents.

It stores durable project knowledge so an agent can retrieve the right context before writing code. The goal is not to replace review or create a full source mirror. The goal is to keep the important engineering context available across sessions.

## What It Is For

Use `flash-mem` to remember:

- project summaries
- architecture decisions
- conventions
- bug patterns
- security notes
- other durable engineering knowledge

This is especially useful when you want AI to behave like a long-term partner instead of a stateless chat session.

## Why Engineers Use It

- Faster onboarding because important decisions are written down
- Better AI-assisted coding because the agent can search prior context
- Less duplicated research and repeated mistakes
- More consistent implementation because conventions and constraints are easy to retrieve
- Safer iteration because secrets and ignored files are handled with guardrails

## Greenfield

Greenfield means you are starting a new project.

Recommended workflow:

1. Initialize the workspace with `flash-mem init .`
2. Add architecture decisions and conventions as soon as they are established
3. Keep the project summary short and current
4. Search memory before writing major new code

This works best when you want the agent to build context from day one.

## Memory Protocol Profiles

`flash-mem` supports two governance profiles for the injected memory protocol:

### Default Profile

The default profile provides concise, practical guidance suitable for most teams:

```bash
flash-mem init .
# or explicitly
flash-mem init . --profile default
```

This profile includes:
- Search-first workflow guidance
- Memory quality standards
- Intent-driven workflow patterns
- Anti-patterns to avoid

### Strict Profile

The strict profile adds additional governance rules for teams requiring formal memory management:

```bash
flash-mem init . --profile strict
```

Additional strict governance rules:
- Require explicit confidence scores for all memories
- Mandate source attribution for every memory entry
- Enforce review status and timestamps
- Apply category constraints to prevent taxonomy drift
- Track full provenance trail for updates and deletions

You can switch profiles at any time:

```bash
flash-mem update . --profile strict
```

This updates all existing agent instruction files to use the strict profile while preserving your memory data.

## Brownfield

Brownfield means you are working in an existing codebase.

Recommended workflow:

1. Initialize the workspace with `flash-mem init .`
2. Capture changed markdown artifacts with `flash-mem capture_artifact_memory` so flash-mem stays current
3. Add or update durable memory for architecture decisions, conventions, bug patterns, and key constraints
4. Refresh the project summary when the architecture changes
5. Search memory before making changes so the agent does not repeat old mistakes

Important:

- The current `capture_artifact_memory` command is best for markdown artifacts that changed recently.
- If flash-mem retrieval is empty or incomplete, inspect the markdown file and do not skip `capture_artifact_memory`; if it contains durable knowledge, capture it before treating it as current context.
- If capture still returns nothing useful, keep the markdown file itself as the backup artifact.
- Prefer `capture_artifact_memory` for markdown file changes and new markdown artifacts when the file contains durable knowledge, and never skip capture just because the file already exists.
- Use `rebuild-index` only when you need a rare full markdown rescan.
- For code-heavy projects, pair artifact capture with targeted memory writes or MCP source indexing for the files you want the agent to remember.

## Spec-Driven Development

When you are moving from spec to plan to implementation, use the compatibility helpers to keep the workflow memory-first:

1. Run `flash-mem prepare-context <workspace> --feature specs/<feature>` to generate a compact synthesis bundle.
2. Review `memory-synthesis.md` and `doc-synthesis.md` before planning or task generation.
3. Use `flash-mem token-report <workspace> --feature specs/<feature>` when you want a quick token budget comparison.
4. Promote reusable lessons with `flash-mem promote-lesson` and sync them later with `flash-mem sync-shared`.

## Practical Rule

- Greenfield: build memory as you design the system
- Brownfield: recover memory first, then extend it as you change the codebase
- Memory write operations now schedule markdown backup export in the background; manual `flash-mem export markdown` still works when you want an explicit snapshot.
- Set `FLASH_MEM_BACKGROUND_EXPORT_DELAY_MS` to change the debounce delay used before the background export worker launches.
- Markdown exports are sharded by export date into nested folders so individual files stay below the secret-scanning size limit.
