# Feature Specification: Add Memory CLI Command

**Feature Branch**: `006-add-memory`

**Created**: 2026-05-21

**Status**: Approved

**Input**: User description: "Add Memory CLI UX"

## Clarifications

### Session 2026-05-21

- Q: Should the ability to manually add a memory entry be exposed via a new CLI command or solely through the MCP Server tool and internal service API? → A: Both MCP Server and CLI. (Note: Feature 005 defines the MCP tool contract; Feature 006 defines the CLI command UX).
- Q: If a user runs the `flash-mem add` CLI command but omits one or more required fields, how should the CLI behave? → A: Hybrid (Interactive via flag) — fails immediately by default, but prompts interactively if a specific `-i` or `--interactive` flag is supplied.

### Session 2026-05-22

- Q: Is direct database modification or SQL logic strictly out-of-scope for the CLI command? → A: Yes, DB/SQL is strictly out-of-scope; the CLI must only interact with services/repositories via Dependency Injection.
- Q: For `flash-mem add -j`, what should the JSON structure on stdout look like when validation fails? → A: `{"success": false, "error": "<error message>", "details": [...]}` on stdout, exit code 1.
- Q: When a user enters an invalid value in interactive mode, does the CLI retry at the prompt level or form level? → A: Prompt-level retry: show the validation error for that field immediately, and re-prompt for that specific field until valid or cancelled.
- Q: If a user runs `flash-mem add -i` in a non-interactive shell (stdin is not a TTY), how should the CLI behave? → A: Fail immediately with an error (e.g., "Interactive mode requires a TTY terminal") and exit code 1.
- Q: What is the exact order of interactive prompts when prompting for fields? → A: Title -> Content -> Category -> Source -> Tags -> Confidence -> Related Files -> Project Path.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add Valid Memory Entry via CLI (Priority: P1)

As a developer using the terminal, I want to execute a CLI command to add a memory entry directly so that I can capture quick developer lessons without needing an MCP client connection.

**Why this priority**: It is the core functional path for CLI users. Without a command-line interface to add memories, offline terminal usage is not supported.

**Independent Test**:
- Run `flash-mem add` with all required parameters and options, and verify that the entry is successfully persisted and the output prints the generated entry ID.
- Run `flash-mem add` omitting required options without `--interactive`, and verify it exits with code 1.

**Acceptance Scenarios**:

1. **Given** the CLI is installed, **When** a developer executes `flash-mem add` with all required parameters (e.g., `--title "Durable decisions"`, `--content "We use PathSanitizer"`, `--category "decision"`, `--source "cli"`), **Then** the entry is successfully persisted and the stdout prints the generated entry ID.
2. **Given** the CLI is installed, **When** a developer executes `flash-mem add` and omits a required option without the `--interactive` flag, **Then** the CLI fails immediately, prints a validation error to `stderr`, and exits with a non-zero status code (exit code 1).
3. **Given** the CLI is installed, **When** a developer executes `flash-mem add -i` (or `--interactive`), **Then** the CLI prompts the user in the terminal to input any missing required fields, validates the inputs, and persists the entry upon completion.
4. **Given** the CLI is installed, **When** a developer executes `flash-mem add -j` (or `--json`), **Then** the CLI returns a structured JSON payload for success or failure on `stdout`, keeping interactive prompts and validation logs on `stderr`.

---

### User Story 2 - Interactive Input Prompts on Stderr (Priority: P2)

As a developer who redirects CLI stdout to a file or a script pipe, I want all interactive prompts and validation error listings to be written to `stderr` so that `stdout` is not polluted with non-data messages.

**Why this priority**: Supports piping CLI commands to other tools (e.g. jq) and prevents interactive prompts from breaking automated scripting.

**Independent Test**:
- Run `flash-mem add -i` and redirect `stdout` to a file. Complete the prompts and verify that the file contains only the final output (or JSON output), and all question prompts appeared in the terminal (via `stderr`).

**Acceptance Scenarios**:

1. **Given** the CLI is run in interactive mode, **When** the terminal prompts for title, content, category, or source, **Then** these prompts are output to `stderr`.
2. **Given** the CLI is run with the `-j` (or `--json`) flag, **When** interactive questions are prompted and completed, **Then** only the final JSON payload containing the success state and entry ID is written to `stdout`.

---

### Edge Cases

- **Missing Options in Non-Interactive Mode**: Executing the command without options must result in usage text to `stderr` and non-zero exit.
- **Interactive Session Interruption**: If the user presses Ctrl+C or exits the prompt session mid-way, the CLI must exit cleanly, close the readline interface stream to prevent hanging processes, and not write any partial or invalid data to the database.
- **Invalid Values Entered via Prompts**: If the user inputs an invalid field (e.g., a category not in the canonical list or a confidence level out of bounds), the CLI must show the validation error on `stderr` immediately and re-prompt specifically for that field (prompt-level retry) until a valid input is given or the session is cancelled.
- **Interactive Mode in Non-TTY Environments**: If the CLI is run in interactive mode (`-i` or `--interactive`) but the standard input is not a terminal TTY, the CLI must fail immediately, print an error message (e.g., "Interactive mode requires a TTY terminal") to `stderr`, and exit with code 1.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose the add-memory capability via a CLI command `flash-mem add`.
- **FR-002**: The CLI command MUST accept core options: `--title`, `--content`, `--category`, `--source`, `--tags`, `--confidence`, `--related-files`, `--project-path`.
- **FR-003**: The CLI command MUST support an `--interactive` (or `-i`) flag.
- **FR-004**: If required options are missing and the `--interactive` flag is NOT set, the CLI MUST print a validation error to `stderr` and exit with a non-zero status code (exit code 1).
- **FR-005**: If the `--interactive` flag is set, the CLI MUST prompt the user for any missing required options via an interactive readline interface. The exact order of interactive prompts is: Title -> Content -> Category -> Source -> Tags -> Confidence -> Related Files -> Project Path.
- **FR-006**: The CLI command MUST write all interactive prompts, validation errors, and user-facing guidelines strictly to `process.stderr`.
- **FR-007**: The CLI command MUST support a `--json` (or `-j`) flag. When provided, the CLI MUST output a single structured JSON object on `process.stdout` representing either the successful creation payload (containing the new entry `id`) or the validation failure payload (formatted as `{"success": false, "error": "<error message>", "details": [...]}`), and MUST NOT output any plain text to `stdout`.
- **FR-008**: The CLI command MUST delegate memory validation, secret redaction, path traversal checks, and persistence to the core application service, ensuring it inherits all canonical validation rules specified in Feature 005. Direct database access or SQL execution by the CLI command handler is strictly out of scope.

### Key Entities

- **CLI Action Handler**: The controller block parsing parameters and coordinating CLI prompts.
- **Interactive Prompt Session**: Readline interface used to prompt for missing inputs.
- **JSON Payload Format**: The structured JSON payload emitted on `stdout` when `--json` is selected.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of interactive prompts and helper guidelines are written to `stderr`, keeping `stdout` clean for piping.
- **SC-002**: When `--json` is specified, the stdout is 100% valid JSON payload on success or failure.
- **SC-003**: User cancellation (Ctrl+C) during prompt sessions exits immediately, closes the readline interface resource, and performs 0 database writes.

## Assumptions

- The CLI uses standard readline utilities provided by Node.js.
- Validation logic is shared with the domain model schemas defined in Feature 005.
