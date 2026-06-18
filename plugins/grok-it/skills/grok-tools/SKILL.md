---
name: grok-tools
description: "Use when Claude Code or Codex should call Grok/xAI MCP tools for X search, image generation, video generation, Grok OAuth login/status, or XAI_API_KEY fallback through the grok-it MCP server."
---

# Grok Tools

Prefer the local `grok-it` MCP server tools rather than reimplementing xAI HTTP calls:

1. Run `grok_auth_status` to check OAuth/API-key availability without exposing secrets.
2. Run `grok_login` when OAuth setup is needed. First call returns an authorize URL plus PKCE verifier/state; second call with the callback URL completes login. Never request raw access or refresh tokens.
3. Use `grok_x_search` for X/Twitter search with optional handle/date/media filters.
4. Use `grok_image_generate` for image generation. It returns local cached image paths by default.
5. Use `grok_video_generate` for video generation. It returns remote URLs by default; pass `cache_video:true` only when local video caching is desired.

OAuth bearer credentials are pinned to `https://*.x.ai`; API key mode may use `XAI_BASE_URL` for compatible endpoints.
