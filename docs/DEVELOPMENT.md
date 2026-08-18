# Development Guide

This repo is two things in one checkout:

- **`grok-it-mcp`**: the Node CLI / stdio MCP server at the repository root (`src/`, published to npm).
- **`grok-it` plugin**: the Claude Code / Codex plugin at `plugins/grok-it` (manifests, `.mcp.json`, skills).

Published installs use `npx grok-it-mcp@<version>` from `plugins/grok-it/.mcp.json`. Local plugin loading still starts that MCP command, so a local CLI build only reaches the Agent if that command points at your checkout.

## Prerequisites

- Node.js 20 or newer
- npm
- git
- For plugin testing: [Claude Code](https://code.claude.com/docs) and/or [Codex CLI](https://developers.openai.com/plugins/build/plugins)

## Clone and build

```bash
git clone https://github.com/Misty-Star/grok-it-mcp.git
cd grok-it-mcp
npm install
npm run build
```

`npm run build` compiles TypeScript to `dist/` and marks `dist/index.js` executable. That file is the `grok-it-mcp` binary.

## Run the CLI locally

From the repo root, after a build:

```bash
node dist/index.js --help
node dist/index.js status
node dist/index.js login --open
node dist/index.js search "xAI news" --json
```

No arguments starts the stdio MCP server (what Claude Code / Codex spawn):

```bash
node dist/index.js
```

To put `grok-it-mcp` on your `PATH` for this machine:

```bash
npm link
grok-it-mcp status
```

`npm link` installs the current working tree globally. Re-run `npm run build` after source changes; `npm link` does not need to be repeated unless you unlink.

Remote / headless login is the same as the published CLI. The OAuth loopback listens on `127.0.0.1:8153`:

```bash
ssh -N -L 8153:127.0.0.1:8153 user@remote-host
node dist/index.js login --loopback
```

Default local paths (unchanged from the published package):

- Tokens: `~/.grok-it/auth.json`
- Artifacts: `~/.grok-it/artifacts`

If this machine cannot reach `api.x.ai` / `auth.x.ai` on the default route, Node's `fetch` does not honor `HTTP_PROXY` unless env-proxy support is on:

```bash
export HTTPS_PROXY=http://127.0.0.1:7890
export HTTP_PROXY=http://127.0.0.1:7890
export NODE_USE_ENV_PROXY=1
node dist/index.js status
```

## Point the plugin MCP at this checkout

`plugins/grok-it/.mcp.json` is pinned to the npm release:

```json
{
  "mcpServers": {
    "grok-it": {
      "command": "npx",
      "args": ["-y", "grok-it-mcp@0.3.0"]
    }
  }
}
```

`npx -y grok-it-mcp@0.3.0` downloads the published tarball. It will **not** pick up `dist/` from this clone.

For local Agent testing, temporarily change that file (do not commit it) to the built binary:

```json
{
  "mcpServers": {
    "grok-it": {
      "command": "node",
      "args": ["/ABS/PATH/TO/grok-it-mcp/dist/index.js"]
    }
  }
}
```

Or, after `npm link`:

```json
{
  "mcpServers": {
    "grok-it": {
      "command": "grok-it-mcp",
      "args": []
    }
  }
}
```

Repo validation (`npm run validate:plugin`) requires the `npx` + version-pin shape, so restore `.mcp.json` before committing.

## Add the local plugin to Claude Code

The Claude marketplace catalog is `.claude-plugin/marketplace.json` at the **repository root**. The plugin root (the directory that contains `.claude-plugin/plugin.json`) is `plugins/grok-it`.

### Session-only (fastest)

```bash
claude --plugin-dir /ABS/PATH/TO/grok-it-mcp/plugins/grok-it
```

This loads the plugin for that process without installing it.

### Install from the local marketplace

In Claude Code, from any project:

```text
/plugin marketplace add /ABS/PATH/TO/grok-it-mcp
/plugin install grok-it@grok-it
```

`grok-it@grok-it` is `plugin-name@marketplace-name`. The marketplace name is `grok-it` (see `.claude-plugin/marketplace.json`).

You can also add the marketplace by pointing at the catalog file:

```text
/plugin marketplace add /ABS/PATH/TO/grok-it-mcp/.claude-plugin/marketplace.json
```

Then start a new session or reload plugins so MCP reconnects. Confirm `grok_auth_status` / `grok_x_search` appear as tools.

## Add the local plugin to Codex

This repo already has a Codex-style catalog at `.agents/plugins/marketplace.json` that points at `./plugins/grok-it`.

From the repo root:

```bash
codex plugin marketplace add .
codex plugin add grok-it@grok-it
```

Or with an absolute path:

```bash
codex plugin marketplace add /ABS/PATH/TO/grok-it-mcp
codex plugin add grok-it@grok-it
```

Useful checks:

```bash
codex plugin marketplace list
```

After changing plugin files or `.mcp.json`, upgrade / reinstall the local marketplace source and start a new Codex session. Codex caches local plugins; a restart is the reliable way to pick up MCP command changes.

## Tests and validation

```bash
npm test
npm run typecheck
npm run validate
```

`npm run validate` runs typecheck, unit tests, build, and the Claude / Codex plugin static checks.

Optional live probe of Responses `x_search` `include` values (needs working xAI credentials and network; uses the compiled `dist/` client):

```bash
npm run build
node --experimental-strip-types scripts/probe-x-search-include.ts
```

## Layout

```text
.
├── src/                         # CLI + MCP server
├── tests/
├── dist/                        # build output (gitignored after generate)
├── plugins/grok-it/             # plugin root
│   ├── .mcp.json                # how Agents launch the MCP server
│   ├── .claude-plugin/plugin.json
│   ├── .codex-plugin/plugin.json
│   └── skills/grok-tools/
├── .claude-plugin/marketplace.json   # Claude marketplace catalog
├── .agents/plugins/marketplace.json  # Codex / repo marketplace catalog
└── docs/DEVELOPMENT.md
```

## Related

- User install (marketplace + `npm install -g grok-it-mcp`): [README](../README.md)
- 简体中文开发指南：[DEVELOPMENT_CN.md](./DEVELOPMENT_CN.md)
