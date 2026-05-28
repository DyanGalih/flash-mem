# ⚡ flash-mem

[![npm version](https://img.shields.io/npm/v/flash-mem.svg)](https://www.npmjs.com/package/flash-mem)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![smithery badge](https://smithery.ai/badge/flash-mem)](https://smithery.ai/server/flash-mem)
[![Made with ❤️ in Indonesia](https://img.shields.io/badge/Made_with_%E2%9D%A4%EF%B8%8F_in-Indonesia-red.svg)](https://github.com/galih/flash-mem)

`flash-mem` is a local-first engineering memory server and CLI tool for software teams and AI coding agents.

It stores durable project knowledge so agents can retrieve the right context before writing code. That includes project summaries, architecture decisions, conventions, bug patterns, and other stable engineering knowledge.

If you are using AI for vibe coding, spec-driven development, or as a pair-programming partner, `flash-mem` helps keep the model grounded in your actual codebase instead of guessing from scratch every session.

The name reflects the goal of fast retrieval, fast context, and fast iteration for engineering work.

## ✨ What It Is

`flash-mem` is a memory layer for engineering work, not a source-code mirror.

It is designed to help engineers and AI agents:
- remember durable project knowledge across sessions
- search architecture decisions and conventions quickly
- reduce repeated research and repeated mistakes
- keep retrieval-first workflows before code changes
- preserve context for agent-assisted development and SDD

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
git clone https://github.com/galih/flash-mem.git
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

## 🚀 Publishing a New Release

To publish a new version of `flash-mem` to NPM, ensure you are logged in (`npm login`) and your working directory is clean. Then use one of the built-in release scripts:

- **Patch Release (Bug fixes)**: `npm run release:patch` (e.g., `0.1.2` -> `0.1.3`)
- **Minor Release (New features)**: `npm run release:minor` (e.g., `0.1.2` -> `0.2.0`)
- **Major Release (Breaking changes)**: `npm run release:major` (e.g., `0.1.2` -> `1.0.0`)

These scripts will automatically:
1. Build the project
2. Bump the version in `package.json`
3. Create a git commit and tag
4. Push the changes and tags to GitHub
5. Publish the package to NPM

## 🔌 MCP Configuration

`flash-mem` is fully compatible with standard Model Context Protocol (MCP) clients. See [docs/mcp-setup.md](docs/mcp-setup.md) for grouped setup examples covering global installation, development checkouts, direct path execution, and IDE-specific configurations.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
