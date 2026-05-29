# ⚡ flash-mem

[![npm version](https://img.shields.io/npm/v/flash-mem.svg)](https://www.npmjs.com/package/flash-mem)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![smithery badge](https://smithery.ai/badge/flash-mem)](https://smithery.ai/server/flash-mem)
[![Made with ❤️ in Indonesia](https://img.shields.io/badge/Made_with_%E2%9D%A4%EF%B8%8F_in-Indonesia-red.svg)](https://github.com/galih/flash-mem)

**Give your AI coding assistant a permanent memory.**

`flash-mem` is an MCP (Model Context Protocol) server and CLI tool designed to provide durable engineering memory for any MCP-compatible AI agent, such as Claude Code, Cursor, Windsurf, and Roo Code.

Constantly reminding your AI about the same architectural rules? Tired of watching it stumble over known edge cases? Traditional static prompts like `.cursorrules` or `CLAUDE.md` quickly become outdated and simply can't scale with a complex project's history. 

`flash-mem` solves this by acting as a living knowledge base. It persistently stores your project's high-level summaries, core architectural decisions, coding conventions, and historical bug fixes. When your agent begins a new task, it dynamically retrieves the specific context it needs through the Model Context Protocol, ensuring it understands your codebase's unwritten rules before writing any code.

**What changes?**
In Session 1, you make an architectural decision to use `better-sqlite3` instead of an async driver. In Session 2, you ask the agent to add a new database repository. The agent automatically queries `flash-mem` via MCP, sees the previous architectural decision, and writes the correct synchronous code on the first try. No re-explaining. No copy-pasting. The agent just *knows*.

## ✨ Why Use It?

`flash-mem` is a memory layer for engineering work, not a source-code mirror.

It is designed to help engineers and AI agents:
- remember durable project knowledge across sessions
- search architecture decisions and conventions quickly
- reduce repeated research and repeated mistakes
- keep retrieval-first workflows before code changes
- preserve context for agent-assisted development and SDD

If you are using AI for **vibe coding**, **spec-driven development** (like using **Spec-Kit**), or as a pair-programming partner, `flash-mem` helps keep the model grounded in your actual codebase instead of guessing from scratch every session.

For a deeper explanation of greenfield and brownfield workflows, see [Usage Guide](docs/usage.md).

For setup, workflow, and migration details, see the linked docs.

For a reusable review prompt to check whether flash-mem was used in a task, see [flash-mem Review Prompt](docs/flash-mem-review-prompt.md).

## 🚀 Quick Start

1. Initialize the workspace:
```bash
flash-mem init .
```
2. Connect your IDE or agent through MCP.
3. For brownfield work, refresh the markdown-backed project memory:
```bash
flash-mem rebuild-index . --yes
```

## 📦 Installation

### Global Installation
```bash
npm install -g flash-mem
```

### Development Setup (from source)
1. Clone the repository and install dependencies:
```bash
git clone https://github.com/dyangalih/flash-mem.git
cd flash-mem
npm install
```

2. Build the project:
```bash
npm run build
```

3. Link the package globally for development:
```bash
npm link
```

## 🔌 MCP Configuration

`flash-mem` is fully compatible with standard Model Context Protocol (MCP) clients. See [docs/mcp-setup.md](docs/mcp-setup.md) for grouped setup examples covering global installation, development checkouts, direct path execution, and IDE-specific configurations.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
