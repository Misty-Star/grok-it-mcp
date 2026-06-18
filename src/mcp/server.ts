import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PACKAGE_NAME, PACKAGE_VERSION } from '../config/constants.js';
import { authStatus } from '../auth/credentials.js';
import { createLoginSession, discoverOAuth, exchangeCodeForTokens, parseCallback, persistTokenResponse, waitForLoopbackCode } from '../auth/oauth.js';
import { handleXSearch, xSearchSchema } from '../tools/x-search.js';
import { handleImageGenerate, imageGenerateSchema } from '../tools/image-generate.js';
import { handleVideoGenerate, videoGenerateSchema } from '../tools/video-generate.js';

function jsonContent(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

const loginSchema = {
  callback: z.string().optional().describe('Callback URL or bare authorization code from the xAI OAuth page.'),
  verifier: z.string().optional().describe('PKCE verifier returned by a previous grok_login call.'),
  redirect_uri: z.string().optional(),
  state: z.string().optional(),
  loopback: z.boolean().default(false).optional(),
  timeout_ms: z.number().int().min(1000).max(10 * 60_000).default(120_000).optional(),
};

export function createGrokMcpServer(): McpServer {
  const server = new McpServer({ name: PACKAGE_NAME, version: PACKAGE_VERSION });

  server.registerTool('grok_auth_status', {
    title: 'Grok auth status',
    description: 'Report Grok OAuth/API-key auth status without returning token material.',
    inputSchema: {},
  }, async () => jsonContent(await authStatus()));

  server.registerTool('grok_login', {
    title: 'Grok OAuth login',
    description: 'Start or complete xAI/Grok OAuth PKCE login. First call without callback to get authorize_url and verifier; second call with callback+verifier to persist tokens. loopback:true can wait locally.',
    inputSchema: loginSchema,
  }, async (args) => {
    if (args.callback && args.verifier && args.redirect_uri) {
      if (!args.state) throw new Error('grok_login completion requires the state returned by the initial login call');
      const discovery = await discoverOAuth();
      const { code } = parseCallback(args.callback, args.state);
      const tokens = await exchangeCodeForTokens({ code, verifier: args.verifier, challenge: undefined, redirectUri: args.redirect_uri, discovery });
      const persisted = await persistTokenResponse({ tokens, discovery, redirectUri: args.redirect_uri });
      return jsonContent({ logged_in: true, provider: 'xai-oauth', base_url: persisted.base_url, expires_at: tokens.expires_at ? new Date(tokens.expires_at).toISOString() : null });
    }
    const session = await createLoginSession({ redirectUri: args.redirect_uri });
    if (args.loopback) {
      const code = await waitForLoopbackCode(session, args.timeout_ms || 120_000);
      const tokens = await exchangeCodeForTokens({ code, verifier: session.verifier, challenge: session.challenge, redirectUri: session.redirectUri, discovery: session.discovery });
      const persisted = await persistTokenResponse({ tokens, discovery: session.discovery, redirectUri: session.redirectUri });
      return jsonContent({ logged_in: true, provider: 'xai-oauth', base_url: persisted.base_url, expires_at: tokens.expires_at ? new Date(tokens.expires_at).toISOString() : null });
    }
    return jsonContent({ logged_in: false, authorize_url: session.authorizeUrl, verifier: session.verifier, state: session.state, redirect_uri: session.redirectUri, instructions: 'Open authorize_url, then call grok_login again with callback, verifier, redirect_uri, and state. Do not paste tokens.' });
  });

  server.registerTool('grok_x_search', {
    title: 'Search X with Grok',
    description: 'Use xAI Responses API with the x_search built-in tool to search X/Twitter and summarize results.',
    inputSchema: xSearchSchema,
  }, async (args) => jsonContent(await handleXSearch(args)));

  server.registerTool('grok_image_generate', {
    title: 'Generate image with Grok',
    description: 'Generate images through xAI /images/generations and cache returned image artifacts by default.',
    inputSchema: imageGenerateSchema,
  }, async (args) => jsonContent(await handleImageGenerate(args)));

  server.registerTool('grok_video_generate', {
    title: 'Generate video with Grok',
    description: 'Generate videos through xAI /videos/generations, poll status, return remote URL by default, optionally cache with cache_video:true.',
    inputSchema: videoGenerateSchema,
  }, async (args) => jsonContent(await handleVideoGenerate(args)));

  return server;
}
