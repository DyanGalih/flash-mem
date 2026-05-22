# Tasks: Add Memory

**Input**: Design documents from `specs/006-add-memory/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), security-constraints.md (required)

**Tests**: Tests are explicitly requested for validating the new CLI command, interactive prompting, path traversal validation, and secret redaction.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Category validation schema updates and indexing alignment

- [x] T001 Modify category validation in `src/domain/entities/MemoryEntry.ts` Zod schema to restrict category to the 12 specified values.
- [x] T002 Replace default fallback category `'note'` with `'project'` in `src/application/services/WorkspaceIndexingService.ts`.
- [x] T003 Replace default fallback category `'note'` with `'project'` in `src/infrastructure/markdown/MarkdownBackupParser.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core test suite category alignment

**⚠️ CRITICAL**: All existing tests must be aligned with the new category constraints before implement validation checks, otherwise Vitest runs will fail compilation/execution.

- [x] T004 Align category references (replacing `'note'` with valid categories) in existing tests: `tests/unit/MemoryEntryService.test.ts`, `tests/unit/MemorySearchService.test.ts`, `tests/unit/MarkdownExportService.test.ts`, `tests/unit/MarkdownExportFormatter.test.ts`, `tests/unit/IndexingService.test.ts`, `tests/integration/memory-store.test.ts`, `tests/integration/mcp-tools.test.ts`, `tests/integration/markdown-export.test.ts`, `tests/integration/markdown-restore.test.ts`, and `tests/integration/cli.test.ts`.

---

## Phase 3: User Story 1 - Add Valid Memory Entry (Priority: P1) 🎯 MVP

**Goal**: Expose memory addition capabilities via CLI (`flash-mem add`) and MCP (`add_memory` tool).

**Independent Test**:
- Execute Vitest integration tests for the CLI command execution.
- Manually run `flash-mem add` with invalid arguments and verify immediate rejection.
- Manually run `flash-mem add` with valid arguments and verify database persistence.

### Implementation for User Story 1

- [x] T005 [P] [US1] Add integration/unit tests for the new `flash-mem add` CLI command in `tests/integration/cli.test.ts` (validating success and missing-arg failure without `--interactive`).
- [x] T006 [US1] Implement `flash-mem add` CLI command configuration (options: `--title`, `--content`, `--category`, `--source`, `--tags`, `--confidence`, `--related-files`, `--project-path`, `-i/--interactive`, `-j/--json`) in `src/infrastructure/cli/index.ts`.
- [x] T007 [US1] Implement Dynamic Interactive Prompting using Node's native `readline` module in the CLI command handler in `src/infrastructure/cli/index.ts` when `-i` or `--interactive` flag is set.
- [x] T008 [US1] Implement CLI service instantiation, SQLite store initialization, calling `createMemoryEntry` and printing the output (text or JSON) in `src/infrastructure/cli/index.ts`.
- [x] T009 [US1] Verify that `add_memory` tool works correctly with the updated validation rules in `src/mcp/tools/add-memory.ts`.
- [x] T010 [US1] Ensure interactive CLI prompts and validation guidance are written to `process.stderr` and that the `readline` interface is closed in a `finally` block in `src/infrastructure/cli/index.ts` to avoid hanging CLI/test processes.

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently.

---

## Phase 4: User Story 2 - Redact Sensitive Content (Priority: P2)

**Goal**: Scan and redact high-entropy secrets in title and summary before database persistence.

**Independent Test**:
- Create a memory entry containing dummy AWS/Bearer keys and verify that they are replaced with `[REDACTED_SECRET]` or similar placeholders.

### Implementation for User Story 2

- [x] T011 [P] [US2] Add unit test cases in `tests/unit/MemoryEntryService.test.ts` verifying that creating a memory entry with secrets redacts them in `title` and `summary/content`.
- [x] T012 [US2] Verify and ensure that `MemoryEntryService.ts` calls `SecretScanner.redact` for both `title` and `summary/content` before writing to the repository.

**Checkpoint**: At this point, User Stories 1 and 2 should both work independently.

---

## Phase 5: User Story 3 - Add Memory with Rich Context (Priority: P3)

**Goal**: Support optional metadata fields (tags, confidence score, related files, project path) with directory traversal validation.

**Independent Test**:
- Pass relative paths escaping project root to `related_files` and verify rejection.
- Run `flash-mem add --project-path ../invalid` and verify rejection.

### Implementation for User Story 3

- [x] T013 [P] [US3] Add unit/integration tests in `tests/unit/MemoryEntryService.test.ts` for directory traversal attempts in `relatedFiles`.
- [x] T014 [P] [US3] Add integration tests in `tests/integration/cli.test.ts` for path traversal check on `--project-path` CLI option (SEC-001 remediation).
- [x] T015 [US3] Apply path sanitization/resolution on `--project-path` (maps to `rootPath`) in the CLI `add` command action in `src/infrastructure/cli/index.ts` using `PathSanitizer.resolveRoot` and check that the path exists and is a directory.

**Checkpoint**: All user stories should now be independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, validation, linting, and final checks.

- [x] T016 Run the full test suite (`npm test` or `npx vitest run`) to confirm all unit and integration tests pass perfectly. Note: blocked in this sandbox by `spawnSync node EPERM` from the CLI integration harness.
- [x] T017 Run linting and typecheck (`npm run build` or `npx tsc`) to ensure no compilation/type issues exist.
- [x] T018 [P] Document the new `flash-mem add` command usage in `README.md`.
- [x] T019 [P] Add a targeted performance smoke test or benchmark in `tests/integration/cli.test.ts` (or a dedicated benchmark test) that measures valid memory entry validation and persistence and guards the <50ms budget in typical local test conditions.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories.
- **User Stories (Phase 3+)**: All depend on Foundational phase completion.
  - User stories can then proceed in parallel or sequentially in priority order.
- **Polish (Final Phase)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories.
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1 but should be independently testable.
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - May integrate with US1/US2 but should be independently testable.

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation.
- Models before services.
- Services before endpoints/CLI command logic.
- Core implementation before integration.

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel.
- All Foundational tasks marked [P] can run in parallel (within Phase 2).
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows).
- All tests for a user story marked [P] can run in parallel.

---

## Phase 7: CLI Specification Alignment (Post-Architecture Review Remediation)

**Purpose**: Address CLI command contract misalignments identified in architecture review (6 specification compliance issues). **Status**: BLOCKING — these issues prevent merge approval.

**Architecture Review Findings**: Architecture is SOUND (FULL PASS on layer boundaries, DI, security). However, CLI contract has drifted from specification (FR-002, FR-005, FR-006). These tasks bring CLI contract back into spec compliance.

### CLI Contract Alignment Tasks

- [x] T020 [US1] **CRITICAL — V1**: Rename `--summary` option to `--content` in `src/infrastructure/cli/index.ts` line 430 to match FR-002 specification. Update description to "Content/body of the memory entry". Update prompt at line 502 from "Enter summary" to "Enter content".

- [x] T021 [US1] **CRITICAL — V2**: Replace comma-separated array options with repeated flags in `src/infrastructure/cli/index.ts`:
  - Line 430: Change `.option('--tags <items>', ...)` to repeated `.option('--tag <string>', ...)` that accumulates into array
  - Line 432: Change `.option('--related-files <items>', ...)` to repeated `.option('--related-file <string>', ...)` that accumulates into array
  - Update parsing logic (lines 550-555) from `.split(',')` to Commander's default repeated-flag accumulation

- [x] T022 [US1] **HIGH — V3**: Complete interactive prompts for all 8 required fields in `src/infrastructure/cli/index.ts` (lines 490-525):
  - Add Tags prompt after Source (collect via repeated input or comma-separated)
  - Add Confidence prompt with default 50 if user skips
  - Add Related Files prompt
  - Add Project Path prompt
  - Maintain exact order: Title → Content → Category → Source → Tags → Confidence → Related Files → Project Path

- [x] T023 [US1] **MEDIUM — V5**: Set default confidence value to 50 when not provided in `src/infrastructure/cli/index.ts` line 550:
  - Change `const confidence = options.confidence !== undefined ? options.confidence : undefined;`
  - To: `const confidence = options.confidence !== undefined ? options.confidence : 50;`

- [x] T024 [US1] **MEDIUM — V6**: Add TTY validation for interactive mode in `src/infrastructure/cli/index.ts` at line 439 (before interactive prompt setup):
  - Add check: `if (isInteractive && !process.stdin.isTTY) { throw new Error('Interactive mode requires a TTY terminal'); }`
  - Ensures non-TTY environments (pipes, cron, CI) fail fast with clear error instead of hanging

- [x] T025 [US1] **UPDATE TESTS**: Align all test cases in `tests/integration/cli.test.ts` to use new specification-compliant options:
  - Replace all `--summary` with `--content`
  - Replace all comma-separated `--tags` with repeated `--tag`
  - Replace all comma-separated `--related-files` with repeated `--related-file`
  - Add test for TTY validation failure (run with `stdin` redirected/piped)
  - Add test for confidence default (verify entry stored with confidence=50 when not provided)
  - Verify interactive mode prompts for all 8 fields in correct order

- [x] T026 [US1] **CLI BOUNDARY REFINEMENT**: Isolate nearest-Git-root / cwd fallback workspace resolution in `src/infrastructure/cli/workspace-root.ts` (or an equivalent tightly scoped helper) so `src/infrastructure/cli/index.ts` stays focused on command parsing and service orchestration. Keep the resolver filesystem-only, validate the resolved path with `PathSanitizer.resolveRoot()`, and verify it exists and is a directory before command execution.

- [x] T027 [US1] **JSON CONTRACT ALIGNMENT**: Update the `flash-mem add` JSON payloads and integration assertions so the transport contract matches `plan.md`: success responses include the approved success shape, failure responses include the approved error/details shape, and tests continue covering the project-root fallback path plus redaction behavior under `--json`.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: Test User Story 1 independently.
5. Deploy/demo if ready.

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready.
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!).
3. Add User Story 2 → Test independently → Deploy/Demo.
4. Add User Story 3 → Test independently → Deploy/Demo.
5. Each story adds value without breaking previous stories.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- Each user story should be independently completable and testable.
- Verify tests fail before implementing.
- Commit after each task or logical group.
- Stop at any checkpoint to validate story independently.
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence.

### Architecture Review Compliance

**Phase 7 Status**: Post-review remediation phase required. Architecture review (2026-05-22) identified 6 specification compliance issues (V1-V6) that must be resolved before merge approval. These are NOT architecture violations (arch is SOUND), but CLI contract drift from spec (FR-002, FR-005, FR-006). Tasks T020-T025 address each violation with specific file/line references from the review report.
