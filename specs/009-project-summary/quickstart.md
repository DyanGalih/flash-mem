# Quickstart: Project Summary

## Prerequisites

- A local flash-mem workspace with a `.flash-mem/flashmem.sqlite` database.
- Node.js dependencies installed.

## Verify the Build

```bash
npm test
npm run build
```

## Start the MCP Server

```bash
FLASH_MEM_ENABLE_PROJECT_SUMMARY_WRITES=1 npm run mcp -- .
```

The MCP server resolves the summary from the workspace root passed on startup. If you are serving a different workspace, pass that path instead of `.`.
Project summary updates require the `FLASH_MEM_ENABLE_PROJECT_SUMMARY_WRITES=1` capability flag; retrieval remains available without it.

## Manual MCP Verification

1. Call `get_project_summary` with no arguments.
2. Confirm you receive either a `ready` payload with project metadata and summary or a structured `missing` empty state.
3. Start the server with `FLASH_MEM_ENABLE_PROJECT_SUMMARY_WRITES=1` and call `update_project_summary` with all seven required fields populated.
4. Call `get_project_summary` again and confirm the returned summary matches the latest update.

## Example JSON-RPC Calls

### Retrieve

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_project_summary","arguments":{}}}
```

### Update

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "update_project_summary",
    "arguments": {
      "projectName": "flash-mem",
      "purpose": "Local-first MCP memory server",
      "techStack": "Node.js, TypeScript, better-sqlite3, Zod",
      "architectureStyle": "Layered modular monolith",
      "importantConventions": "Keep transport thin and validate at boundaries",
      "knownConstraints": "No network egress; local SQLite only",
      "securitySensitiveAreas": "MCP handlers, repository boundary, path resolution"
    }
  }
}
```

## Success Criteria Check

- Retrieval remains compact and returns promptly.
- Missing summaries return the structured empty state.
- Updates replace the existing summary atomically.
- No summary update requires a project ID in the request payload.
