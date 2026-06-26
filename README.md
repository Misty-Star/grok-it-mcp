# grok-it MCP Plugin

Local TypeScript stdio MCP server published as an npm CLI package, plus shared Claude Code + Codex plugin wrappers for Grok/xAI.

- `grok_x_search` — xAI Responses API with built-in `x_search`.
- `grok_image_generate` — `/images/generations`, cached locally by default.
- `grok_video_generate` — `/videos/generations`, polling; returns remote URL by default, optional local cache.
- `grok_auth_status` / `grok_login` — Grok OAuth PKCE status/login with `XAI_API_KEY` fallback.

## npm CLI

Install the server directly:

```bash
npm install -g grok-it-mcp
```

Or run it ad hoc:

```bash
npx -y grok-it-mcp@0.1.0
```

The default CLI starts the stdio MCP server defined in `src/index.ts`. It also exposes auth helpers for terminal use:

```bash
grok-it-mcp status
grok-it-mcp login --open
grok-it-mcp search "xAI news"
grok-it-mcp x-search "grok updates" --include-handles xai --max-results 5 --json
```

For manual OAuth completion without a loopback browser flow:

```bash
grok-it-mcp login
grok-it-mcp login --callback '<callback-url-or-code>' --verifier '<verifier>' --state '<state>' --redirect-uri 'http://127.0.0.1:8765/callback'
```


### OAuth note

The current default browser-login flow uses xAI's public Grok OAuth client id and the `grok-cli:access api:access` scopes. If xAI changes those values again, override them with `GROK_IT_OAUTH_CLIENT_ID` or fall back to `XAI_API_KEY`.

### Search connectivity test

Use `search` or its alias `x-search` to run the existing `grok_x_search` flow from a terminal. This is useful for end-to-end connectivity checks because it exercises credential resolution, xAI `/responses`, and the built-in `x_search` tool:

```bash
grok-it-mcp search "xAI news"
grok-it-mcp x-search --query "grok updates" --include-handles xai,elonmusk --max-results 10 --json
```

Supported search flags: `--model`, `--from-date`, `--to-date`, `--include-handles`, `--exclude-handles`, `--include-images`, `--include-videos`, `--max-results`, and `--json`.
## Cross-platform plugin root

`plugins/grok-it/` is the canonical plugin root for both Claude Code and Codex:

```text
plugins/grok-it/
  .claude-plugin/plugin.json   # Claude Code manifest
  .codex-plugin/plugin.json    # Codex manifest
  .mcp.json                    # shared MCP server config
  skills/grok-tools/SKILL.md   # shared skill instructions
  skills/grok-tools/agents/openai.yaml
```

Both manifests reference the same `./skills/` and `./.mcp.json`. The shared MCP config launches `npx -y grok-it-mcp@0.1.0`, so the plugin no longer bundles `dist/index.js`.

## Install/build

```bash
npm install
npm run build
```

`npm run build` typechecks and emits the CLI entrypoint.

## Authentication

Preferred: call MCP tool `grok_login`. It performs OAuth PKCE and stores tokens at `~/.grok-it/auth.json` (override with `GROK_IT_TOKEN_STORE`). The tool never returns token material.

Fallback: set `XAI_API_KEY`. OAuth credentials take precedence over API keys. OAuth bearer requests are pinned to `https://*.x.ai` so `XAI_BASE_URL` cannot leak OAuth tokens to another origin.

## Codex

Install/use `plugins/grok-it/` as the Codex plugin root. The Codex manifest is at `plugins/grok-it/.codex-plugin/plugin.json`.

## Claude Code

Install/use the same `plugins/grok-it/` folder as the Claude Code plugin root. The Claude manifest is at `plugins/grok-it/.claude-plugin/plugin.json`.

## Validation

```bash
npm run typecheck
npm test
npm run build
npm run validate:plugin
npm run validate:codex-plugin
```

- `validate:plugin` checks the shared Claude/Codex plugin root and shared MCP config.
- `validate:codex-plugin` runs the official plugin-creator validator against `plugins/grok-it/` and checks shared skill metadata.

Tests mock network behavior; they must not call real xAI APIs or open browsers.
