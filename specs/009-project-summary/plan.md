# Implementation Plan: Project Summary

**Branch**: `009-project-summary` | **Date**: 2026-05-22 | **Spec**: [spec.md](file:///home/galih/IdeaProjects/flash-mem/specs/009-project-summary/spec.md)

**Input**: Feature specification from `/specs/009-project-summary/spec.md`

## Summary

Implement a workspace-bound project summary feature that stores one canonical summary per project, retrieves it through MCP, and allows atomic updates from the trusted local client. The plan introduces a dedicated `project_summaries` table, workspace-aware MCP context, and compact validation so the response remains suitable for fast AI-agent context retrieval.

## Technical Context

**Language/Version**: Node.js/TypeScript (CommonJS build targeting the current repo toolchain)

**Primary Dependencies**: `@modelcontextprotocol/sdk`, `better-sqlite3`, `zod`, `commander`, `fs-extra`, `vitest`

**Storage**: Local SQLite database managed through `better-sqlite3`

**Testing**: Vitest unit and integration tests

**Target Platform**: Local developer workstation, stdio-based MCP server, and CLI entrypoints

**Project Type**: CLI tool plus local MCP server

**Performance Goals**: Summary retrieval should stay fast enough for interactive agent use and remain below the existing 500ms acceptance target

**Constraints**: Local-first execution only, no remote services, parameterized SQL only, strict layer boundaries, structured empty-state response for missing summaries, and atomic overwrite semantics for updates

**Scale/Scope**: One canonical summary per workspace/project, with compact text fields capped both per field and in total

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Local-First / Zero Egress**: Passed. The feature remains entirely on the user’s workstation and uses the existing SQLite store.
- **Layer Boundaries**: Passed. Transport handlers will stay thin and delegate to application services and repositories.
- **Validation at the Boundary**: Passed. MCP tool inputs will be validated with Zod before entering application logic.
- **Parameterized SQL**: Passed. Summary persistence will use repository methods only, with prepared statements for all writes and reads.
- **Workspace Isolation**: Passed. The CLI and MCP bootstrap already resolve workspace roots locally; summary lookup will continue to operate within that boundary.
- **Logging / StdIO Safety**: Passed. No design step requires writing diagnostics to stdout; JSON-RPC output remains separate from error logging.

## Project Structure

### Documentation (this feature)

```text
specs/009-project-summary/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── project-summary-tools.md
└── security-constraints.md
```

### Source Code (repository root)

```text
src/
├── application/services/
│   ├── ProjectSummaryService.ts
│   └── RelevantContextService.ts
├── domain/entities/
│   └── ProjectSummary.ts
├── domain/repositories/
│   └── interfaces.ts
├── infrastructure/database/
│   ├── migrations/0001_memory_store.ts
│   └── repositories/
│       ├── ProjectRepository.ts
│       └── ProjectSummaryRepository.ts
├── infrastructure/cli/index.ts
├── mcp/
│   ├── server.ts
│   └── tools/
│       ├── get-project-summary.ts
│       └── update-project-summary.ts
└── infrastructure/safety/
    └── PathSanitizer.ts

tests/
├── integration/
│   ├── mcp-tools.test.ts
│   └── project-summary.test.ts
└── unit/
    ├── ProjectSummaryService.test.ts
    └── RelevantContextService.test.ts
```

**Structure Decision**: Keep the feature inside the existing single-package CLI/MCP codebase. Add a dedicated summary entity and repository rather than extending the `projects` table with long-form text columns, because the summary is a distinct 1:1 artifact with its own validation and lifecycle.

## Phase 0 Research Outputs

- `research.md` resolves the storage model, workspace binding, validation strategy, and atomic overwrite behavior.
- The selected approach is a dedicated `project_summaries` table with a unique `project_id` foreign key to `projects(id)`.
- The MCP transport will pass the active workspace root through server context so summary retrieval does not require a user-supplied project identifier.

## Phase 1 Design Notes

- `data-model.md` captures the summary entity, field-level validation, and the missing/present state transition.
- `contracts/project-summary-tools.md` defines the MCP input/output payloads for `get_project_summary` and `update_project_summary`.
- `quickstart.md` documents build, test, and manual MCP verification commands.
- `RelevantContextService` remains a downstream consumer of project metadata, so its dependency on project root path must remain intact after the summary service refactor.

## Architecture Follow-up Notes

Approved non-blocking remediation items from the architecture review:

- Workspace path resolution should be pushed to CLI/MCP bootstrap code so application services depend only on resolved context, not infrastructure path helpers.
- Summary updates need an explicit authorization boundary before they are considered production-safe, even if the current feature contract is local-only.
- Project lookup for summary retrieval should remain side-effect free; bootstrap code should create any missing project row before the retrieval path runs.

## Complexity Tracking

No constitution violations or intentional deviations are planned at this stage, so no complexity waiver is required.
