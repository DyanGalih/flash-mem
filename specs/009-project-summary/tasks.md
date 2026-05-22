# Tasks: Project Summary

## Phase 0: Core Data Model and Storage
- [x] **TASK-001**: Add a dedicated `ProjectSummary` domain entity and Zod schema in `src/domain/entities/ProjectSummary.ts` with the required fields, compactness constraints, and a canonical missing/present state model.
- [x] **TASK-002**: Extend `src/domain/repositories/interfaces.ts` with a `IProjectSummaryRepository` boundary for lookup, upsert, and atomic replacement by `projectId`.
- [x] **TASK-003**: Add a `project_summaries` table to `src/infrastructure/database/migrations/0001_memory_store.ts` with a unique `project_id` foreign key, required text columns, and `last_updated_at`.
- [x] **TASK-004**: Add a repository implementation at `src/infrastructure/database/repositories/ProjectSummaryRepository.ts` that uses parameterized SQL only and performs atomic upsert/replacement semantics.

## Phase 1: Application Services
- [x] **TASK-005**: Refactor `src/application/services/ProjectSummaryService.ts` to use the new repository boundary, resolve the active project from workspace context, and return either a structured summary payload or a structured empty state.
- [x] **TASK-006**: Update `src/application/services/RelevantContextService.ts` to keep consuming project metadata correctly after the summary service refactor and preserve relative-path rendering behavior.
- [x] **TASK-007**: Add validation helpers in the service layer to enforce per-field trimming, required-field checks, and the 4,000-character aggregate cap before persistence.
- [x] **TASK-008**: Add/update unit tests for summary retrieval, empty-state behavior, update validation, and atomic overwrite semantics in `tests/unit/ProjectSummaryService.test.ts`.

## Phase 2: MCP Transport
- [x] **TASK-009**: Update `src/mcp/tools/get-project-summary.ts` so the tool uses the active workspace context and does not require `projectId` in the request payload.
- [x] **TASK-010**: Add a new MCP tool at `src/mcp/tools/update-project-summary.ts` with a Zod schema for the seven required fields and a corresponding executor.
- [x] **TASK-011**: Register the summary tools in `src/mcp/server.ts` and ensure they are wired through the existing application service graph without violating layer boundaries.
- [x] **TASK-012**: Add integration coverage in `tests/integration/mcp-tools.test.ts` for summary retrieval, structured missing-state responses, and update round-trips over JSON-RPC.

## Phase 3: CLI and Workspace Wiring
- [x] **TASK-013**: Update `src/infrastructure/cli/index.ts` so the MCP bootstrap path passes the active workspace root into the server context used by project summary resolution.
- [x] **TASK-014**: Ensure the CLI/MCP startup path validates the workspace root before connecting to the SQLite store and continues to resolve it through `PathSanitizer`.

## Phase 4: Security and Architecture Checks
- [x] **TASK-015**: Add or update tests to confirm summary inputs are rejected when fields are missing, whitespace-only, or too long, and that no project identifier leaks into the update contract.
- [x] **TASK-016**: Verify the implementation does not introduce direct SQL access in MCP handlers, cross-layer imports, or stdout logging of sensitive summary data.
- [x] **TASK-017**: Confirm the new repository and service additions follow the existing dependency direction and do not require any architecture-guard refactor tasks.

## Phase 5: Documentation and Verification
- [x] **TASK-018**: Refresh `specs/009-project-summary/quickstart.md` if any command names or bootstrap assumptions change during implementation.
- [x] **TASK-019**: Run the full test suite and confirm the new summary feature passes unit and integration coverage before handoff.

## Phase 6: Approved Architecture Follow-up Remediations
- [x] **TASK-020**: Move workspace path resolution out of `src/application/services/ProjectSummaryService.ts` and `src/application/services/RelevantContextService.ts` into the CLI/MCP bootstrap layer, then pass resolved workspace context into services without importing `PathSanitizer` from application code.
- [x] **TASK-021**: Add an explicit authorization boundary for `update_project_summary` so write access is limited by an enforceable local capability or equivalent guard instead of being open to every MCP caller.
- [x] **TASK-022**: Split project lookup from project bootstrap in the summary read path so `get_project_summary` stays side-effect free and any missing project row is created before retrieval, not during it.
