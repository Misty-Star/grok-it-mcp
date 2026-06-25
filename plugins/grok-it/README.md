# 🧠 Grok It

🌐 Languages: **English** | [简体中文](./README_CN.md)

---

## ✨ What is Grok It?

**Grok It** is a Codex / Claude Code plugin for Agents. It connects Grok / xAI capabilities to local Agent workflows through a local MCP server.

After installation, Agents can use this plugin to access:

- 🔎 **X Search / x_search**: use Grok subscription-backed X / Twitter search for recent or real-time social context.
- 🖼️ **Image generation**: let Agents call Grok / xAI image generation and cache generated files by default.
- 🎬 **Video generation**: let Agents generate short videos, returning remote URLs by default with optional local caching.
- 🔐 **Authentication support**: use Grok OAuth login, with `XAI_API_KEY` as a fallback option.

## 🧩 Use Cases

- 📰 Search recent X discussions, trends, sentiment, or account activity.
- 🎨 Generate images, illustrations, creative assets, or visual references from prompts.
- 📹 Generate short video assets from prompts or reference images.
- 🤖 Add Grok-powered tools to Codex / Claude Code Agents.

## 📦 What is included?

This plugin directory includes:

- 🛠️ `.mcp.json`: registers the local `grok-it` MCP server.
- 🧠 `skills/grok-tools/`: guidance that tells Agents when and how to use Grok tools.
- 🧾 `.codex-plugin/plugin.json`: Codex plugin manifest.
- 🧾 `.claude-plugin/plugin.json`: Claude Code plugin manifest.

## 🚀 How to Install This Plugin

> Official marketplace: `Misty-Star/grok-it-mcp`; plugin name: `grok-it`; marketplace name: `grok-it`.

### 📦 Install the npm CLI first

Install the local MCP server CLI globally:

```bash
npm install -g grok-it-mcp
```

### 🔐 Log in to Grok

Open the browser-based OAuth login flow:

```bash
grok-it-mcp login --open
```

You can also check local auth and run a quick X Search connectivity test from the terminal:

```bash
grok-it-mcp status
grok-it-mcp search "xAI news"
```

### 🛒 Add the marketplace once

```text
/plugin marketplace add Misty-Star/grok-it-mcp
```

### ⚡ Install the plugin

```text
/plugin install grok-it@grok-it
```

### 🔄 Update the marketplace

```text
/plugin marketplace update grok-it
```

## 🔑 Authentication

After installation, the Agent will usually check auth status first:

- ✅ Existing OAuth login: Grok tools can be used directly.
- 🔐 Not logged in: start Grok OAuth with `grok_login`.
- 🗝️ API key mode: provide an xAI API key through `XAI_API_KEY`.

Default local paths:

- 🧾 Token store: `${HOME}/.grok-it/auth.json`
- 📁 Artifact cache: `${HOME}/.grok-it/artifacts`

## 🧰 Agent Tools

- `grok_auth_status`: check OAuth / API-key availability without exposing secrets.
- `grok_login`: start or complete Grok OAuth login.
- `grok_x_search`: search X / Twitter with Grok.
- `grok_image_generate`: generate images and cache image files by default.
- `grok_video_generate`: generate videos, returning remote URLs by default with optional local caching.
