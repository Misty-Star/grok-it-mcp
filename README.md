# Grok It

Languages: **English** | [简体中文](./README_CN.md)

---

## What is Grok It?

Grok It is a Codex / Claude Code plugin that connects xAI capabilities to local AI agent workflows through an MCP server. It enables agents to search X/Twitter, generate images and videos, and access Grok models directly from your development environment.

**Core capabilities:**

- **X Search**: Use Grok subscription-backed X/Twitter search for recent social context, trends, and account activity
- **Image generation**: Generate images through xAI with automatic local caching
- **Video generation**: Create short videos from prompts or reference images
- **OAuth authentication**: Secure login flow with API key fallback

## Use Cases

- Search recent X discussions, trends, sentiment, or account activity
- Generate images, illustrations, creative assets, or visual references from prompts
- Create short video assets from prompts or reference images
- Add Grok-powered tools to Codex / Claude Code agents

## What's Included

This plugin directory contains:

- `.mcp.json`: MCP server registration
- `skills/grok-tools/`: Agent guidance for when and how to use Grok tools
- `.codex-plugin/plugin.json`: Codex plugin manifest
- `.claude-plugin/plugin.json`: Claude Code plugin manifest

## Installation

Official marketplace: `Misty-Star/grok-it-mcp`; plugin name: `grok-it`

### Install the npm CLI

```bash
npm install -g grok-it-mcp
```

### Log in to Grok

```bash
grok-it-mcp login --open
```

### Remote / headless sessions

On servers, containers, or SSH sessions where no browser is available, the login flow prints the authorization URL instead of opening a browser.

The loopback listener runs on the remote machine at `127.0.0.1:8153`. The xAI redirect needs to reach that listener, so opening the URL on your laptop will fail unless you forward the port:

```bash
ssh -N -L 8153:127.0.0.1:8153 user@remote-host
grok-it-mcp login --loopback
```

You can check local auth and run quick generation/search commands from the terminal:

```bash
grok-it-mcp status
grok-it-mcp search "xAI news"
grok-it-mcp image-gen "a neon robot in Shanghai" --aspect-ratio 16:9
grok-it-mcp video-gen "waves crashing at sunset" --duration 6 --json
```

CLI aliases with underscores are also supported: `image_gen` and `video_gen`.

### Codex CLI

Add the marketplace once:

```bash
codex plugin marketplace add Misty-Star/grok-it-mcp
```

Install the plugin:

```bash
codex plugin add grok-it@grok-it
```

Update the marketplace:

```bash
codex plugin marketplace upgrade grok-it
```

### Claude Code

Add the marketplace once:

```text
/plugin marketplace add Misty-Star/grok-it-mcp
```

Install the plugin:

```text
/plugin install grok-it@grok-it
```

Update the marketplace:

```text
/plugin marketplace update grok-it
```

To clone this repo, run the CLI from `dist/`, or attach the checkout as a local plugin, see the [Development Guide](./docs/DEVELOPMENT.md).

## Authentication

After installation, agents check auth status automatically:

- Existing OAuth login: Grok tools work directly
- Not logged in: agents start OAuth with `grok_login`
- API key mode: provide an xAI API key through `XAI_API_KEY`

Default local paths (resolved inside the MCP server/CLI):

- Token store: `~/.grok-it/auth.json`
- Artifact cache: `~/.grok-it/artifacts`

## Agent Tools

- `grok_auth_status`: Check OAuth / API-key availability without exposing secrets
- `grok_login`: Start or complete Grok OAuth login
- `grok_x_search`: Search X/Twitter with Grok
- `grok_image_generate`: Generate images and cache files by default
- `grok_video_generate`: Generate videos, returning remote URLs by default with optional local caching

## CLI Commands

Besides starting the MCP server with no arguments, the npm binary exposes:

- `grok-it-mcp image-gen <prompt>` / `image_gen`: Generate image(s). Flags: `--prompt`, `--model`, `--aspect-ratio`, `--resolution`, `--n <1-4>`, `--no-cache`, `--json`
- `grok-it-mcp video-gen <prompt>` / `video_gen`: Generate video. Flags: `--prompt`, `--model`, `--image-url`, `--reference-images <url1,url2>`, `--duration <1-30>`, `--aspect-ratio`, `--resolution`, `--cache-video <true|false>`, `--json`

## Development

To clone this repo, build the CLI locally, or attach the checkout as a local plugin, see the [Development Guide](./docs/DEVELOPMENT.md).
