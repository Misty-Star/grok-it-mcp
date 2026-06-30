---
name: grok-tools
description: "Use when Agent should call Grok/xAI MCP tools for X search, image generation, video generation, Grok OAuth login/status, or XAI_API_KEY fallback. Also use whenever the user mentions Twitter, tweets, X posts, searching social media, generating AI images with Grok, or creating AI videos."
---

# Grok Tools

Prefer the local `grok-it` MCP server tools rather than reimplementing xAI HTTP calls:

1. Run `grok_auth_status` to check OAuth/API-key availability without exposing secrets.
2. Run `grok_login` when OAuth setup is needed. First call returns an authorize URL plus PKCE verifier/state; second call with the callback URL completes login. Never request raw access or refresh tokens.
3. Use `grok_x_search` for X/Twitter search with optional handle/date/media filters.
4. Use `grok_image_generate` for image generation. It returns local cached image paths by default.
5. Use `grok_video_generate` for video generation. It returns remote URLs by default; pass `cache_video:true` only when local video caching is desired.

## Error Handling

Auth resolution follows a fallback chain: OAuth token → refresh token → XAI_API_KEY. When a tool call fails:

- **401 with OAuth**: the client auto-refreshes once. If refresh fails with `invalid_grant` or `oauth_entitlement_required`, it falls back to XAI_API_KEY silently. No action needed from Agent unless both paths are exhausted.
- **AuthRequiredError** ("No Grok OAuth token or XAI_API_KEY is configured"): prompt the user to either run `grok_login` for OAuth or set `XAI_API_KEY` in their environment. Check with `grok_auth_status` first to confirm the current state.
- **XaiError (HTTP 4xx/5xx)**: surface the error message to the user as-is — it's already redacted of secrets. For 429 (rate limit), suggest waiting before retrying. Do not retry 4xx errors automatically.
- **Video generation timeout**: the default timeout is 10 minutes with 2s polling. If the job times out, inform the user rather than retrying — the job may still be processing server-side.

## Model Selection

- **X search**: uses `grok-4.20-reasoning` by default. Override via `model` param only if the user requests a specific model.
- **Image generation**: uses `grok-imagine-image` by default.
- **Video generation**: model is chosen automatically based on input:
  - Text-to-video (prompt only) → `grok-imagine-video`
  - Image-to-video (`image_url` or `reference_images` provided) → `grok-imagine-video-1.5-preview`
  
  The Agent does not need to set `model` explicitly — the server picks the right one based on whether image inputs are present.

## Credentials

OAuth bearer credentials are pinned to `https://*.x.ai`; API key mode may use `XAI_BASE_URL` for compatible endpoints.
