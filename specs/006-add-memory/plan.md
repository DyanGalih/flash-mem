# Implementation Plan: Add Memory CLI Command

**Branch**: `006-add-memory` | **Date**: 2026-05-22 | **Spec**: [spec.md](file:///home/galih/IdeaProjects/flash-mem/specs/006-add-memory/spec.md)

## Summary

Align the existing `flash-mem add` CLI command with the clarified feature spec. The current CLI already creates memory entries, but it still uses legacy `summary`/comma-separated input conventions and does not fully match the required interactive and JSON behavior. This plan updates the command surface, path resolution, prompt handling, and test coverage without changing the core domain schema, which already supports the required `content`, `tag`, `relatedFiles`, `confidence`, and category validation rules. The transport-layer refactor should keep project-root resolution isolated from command parsing, with nearest-Git-root fallback behavior expressed explicitly at the CLI boundary.

## Governance Summary

### Memory Context
- **Status**: Synthesized
- **Key Constraints**:
  - Keep stdout clean for JSON output and piping; prompts and validation guidance belong on stderr.
  - Use the shared closed category vocabulary from the domain layer.
  - Preserve path traversal protections via `PathSanitizer`.
  - Avoid readline hangs by closing interactive interfaces on completion and cancellation.
  - Delegate persistence and secret redaction to `MemoryEntryService`, not the CLI handler.

### Security Review
- **Status**: Executed and PASSED
- **Result**: Overall risk **LOW**; SEC-001 (path traversal) remediated via `PathSanitizer.resolveRoot()` and directory validation.
- **Key Controls Verified**:
  - Secret redaction via `SecretScanner.redact()` before persistence ✅
  - Parameterized SQL queries via repository pattern ✅
  - Workspace path isolation via PathSanitizer ✅
- **Warnings**:
  - Interactive prompt handling must fail fast in non-TTY environments to avoid brittle subprocess behavior.

### Architecture Review
- **Status**: Executed and PASSED (Architecture Compliance: FULL)
- **Architecture Findings**: ✅ ZERO P0 violations. Layer boundaries, DI pattern, delegation to services all correct.
- **Specification Compliance Findings**: ⚠️ **6 ISSUES DETECTED** (not architecture violations, but CLI contract misalignments):
  - **V1 (CRITICAL)**: CLI uses `--summary` instead of spec-required `--content`
  - **V2 (CRITICAL)**: Array options use comma-separated format instead of repeated flags (`--tag tag1 --tag tag2`)
  - **V3 (HIGH)**: Interactive prompts incomplete (4 of 8 required fields; missing Tags, Confidence, Related Files, Project Path)
  - **V4 (MEDIUM)**: Prompt labels use "summary" instead of "content"
  - **V5 (MEDIUM)**: No default confidence value (spec requires default = 50)
  - **V6 (MEDIUM)**: Missing TTY check for interactive mode
- **Action**: See Phase 7 in tasks.md for CLI specification alignment remediation.
- **Risk Assessment**: Architecture is sound; CLI contract drift from spec must be corrected before merge.

## Proposed Changes

### 1. CLI Command Contract

#### [MODIFY] `src/infrastructure/cli/index.ts`
- Replace the add-command legacy `--summary` option with `--content`.
- Parse repeated `--tag` and `--related-file` flags as arrays.
- Keep `--confidence` as an integer constrained to `0-100`.
- Resolve `--project-path` from the nearest Git repository root when omitted or relative, falling back to the current working directory if no Git root exists.
- Reject `-i/--interactive` immediately when `stdin` is not a TTY.
- Keep prompts, validation errors, and guidance on `stderr`.
- Emit the success JSON payload as `{"success": true, "id": "<entry-id>"}`.
- Emit the failure JSON payload as `{"success": false, "error": "<error message>", "details": [...]}`.
- Continue delegating creation to `MemoryEntryService` so secret redaction and traversal checks stay centralized.

#### [ADD] `src/infrastructure/cli/workspace-root.ts` or equivalent helper (if separate module)
- Introduce a small resolver for nearest-Git-root lookup and cwd fallback.
- Keep this helper filesystem-only and free of persistence concerns.
- If combined directly into the CLI command handler, ensure project-root resolution logic is isolated from CLI parsing and service instantiation concerns.
- The resolver MUST use `PathSanitizer.resolveRoot()` for path validation and must verify that the resolved path exists and is a directory.

### 2. Test Alignment

#### [MODIFY] `tests/integration/cli.test.ts`
- Update add-command coverage to use `--content`, repeated `--tag`, repeated `--related-file`, and numeric `--confidence`.
- Add JSON assertions for the exact success and failure payload shape.
- Add a non-TTY `-i` failure case.
- Add coverage for the project-root fallback path and nearest-Git-root resolution.
- Keep redaction assertions on stdout JSON payloads.

#### [MODIFY] Targeted unit/integration tests as needed
- Update any CLI or documentation-facing tests that still assert the legacy `summary` contract.
- Add focused coverage for the workspace-root helper if it is introduced as a separate module.

### 3. Documentation Sync

#### [MODIFY] `README.md`
- Update the CLI usage examples to reflect `--content`, repeated `--tag` / `--related-file`, and `--confidence` as `0-100`.
- Document the `--project-path` resolution rules and the non-TTY interactive failure.

## Dependencies & Execution Order

1. Update the CLI parser and helper first so the command surface matches the spec.
2. Update integration tests to lock the new contract before broadening coverage.
3. Refresh documentation after the implementation behavior is stable.

## Verification Plan

- Run the CLI integration suite focused on `flash-mem add`.
- Run the full test suite after the CLI changes land.
- Verify manually:
  - `flash-mem add` with all required flags succeeds.
  - `flash-mem add` without required flags fails unless `-i` is supplied.
  - `flash-mem add -i` fails immediately in non-TTY mode.
  - `flash-mem add --json` emits only structured JSON on stdout.

## Notes

- No domain schema change is expected for this feature; the existing `MemoryEntry` input model already supports the required fields.
- The main implementation risk is transport-layer drift, not storage or domain validation.
