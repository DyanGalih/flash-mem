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

## Brownfield

Brownfield means you are working in an existing codebase.

Recommended workflow:

1. Initialize the workspace with `flash-mem init .`
2. Run `flash-mem rebuild-index . --yes` to refresh markdown-backed memory
3. Add or update durable memory for architecture decisions, conventions, bug patterns, and key constraints
4. Refresh the project summary when the architecture changes
5. Search memory before making changes so the agent does not repeat old mistakes

Important:

- The current `rebuild-index` command scans markdown files (`.md`, `.markdown`) rather than every source file in the repository.
- For code-heavy projects, pair it with targeted memory writes or MCP source indexing for the files you want the agent to remember.

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
