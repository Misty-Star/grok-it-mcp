import { authStatus } from './auth/credentials.js';
import { createLoginSession, discoverOAuth, exchangeCodeForTokens, parseCallback, persistTokenResponse, waitForLoopbackCode } from './auth/oauth.js';
import { PACKAGE_NAME, PACKAGE_VERSION } from './config/constants.js';
import { getConfig } from './config/env.js';
import { handleImageGenerate } from './tools/image-generate.js';
import { handleVideoGenerate } from './tools/video-generate.js';
import { handleXSearch } from './tools/x-search.js';
import { XaiClient } from './xai/client.js';

type CliStreams = {
  stdout?: Pick<NodeJS.WriteStream, 'write'>;
  stderr?: Pick<NodeJS.WriteStream, 'write'>;
};

export type CliOptions = CliStreams & {
  argv?: string[];
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  openUrl?: (url: string) => Promise<void> | void;
};

type ParsedArgs = {
  command?: string;
  flags: Map<string, string | boolean>;
  positionals: string[];
};

class CliError extends Error {
  constructor(message: string, public exitCode = 1) {
    super(message);
    this.name = 'CliError';
  }
}

function write(stream: Pick<NodeJS.WriteStream, 'write'> | undefined, text: string): void {
  stream?.write(text);
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const flags = new Map<string, string | boolean>();
  const positionals: string[] = [];

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--') {
      positionals.push(...rest.slice(i + 1));
      break;
    }
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      flags.set(arg.slice(2, eq), arg.slice(eq + 1));
      continue;
    }
    const key = arg.slice(2);
    const next = rest[i + 1];
    if (next && !next.startsWith('--')) {
      flags.set(key, next);
      i += 1;
    } else {
      flags.set(key, true);
    }
  }

  return { command, flags, positionals };
}

function stringFlag(flags: Map<string, string | boolean>, name: string): string | undefined {
  const value = flags.get(name);
  if (value === undefined || value === false) return undefined;
  if (value === true) throw new CliError(`--${name} requires a value`, 2);
  return value;
}

function numberFlag(flags: Map<string, string | boolean>, name: string): number | undefined {
  const value = stringFlag(flags, name);
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) throw new CliError(`--${name} must be a number`, 2);
  return parsed;
}

function rangedNumberFlag(flags: Map<string, string | boolean>, name: string, min: number, max: number): number | undefined {
  const value = numberFlag(flags, name);
  if (value === undefined) return undefined;
  if (value < min || value > max) throw new CliError(`--${name} must be between ${min} and ${max}`, 2);
  return value;
}

function booleanFlag(flags: Map<string, string | boolean>, name: string): boolean {
  return flags.get(name) === true;
}

function optionalBooleanFlag(flags: Map<string, string | boolean>, name: string): boolean | undefined {
  const value = flags.get(name);
  if (value === undefined) return undefined;
  if (value === true || value === false) return value;
  const normalized = value.toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new CliError(`--${name} must be true or false`, 2);
}

function listFlag(flags: Map<string, string | boolean>, name: string): string[] | undefined {
  const value = stringFlag(flags, name);
  if (!value) return undefined;
  const items = value.split(',').map((item) => item.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

function textFromArgs(flags: Map<string, string | boolean>, positionals: string[], flagName: string, label: string, example: string): string {
  const explicit = stringFlag(flags, flagName);
  const text = explicit || positionals.join(' ').trim();
  if (!text) throw new CliError(`${label} requires ${flagName === 'query' ? 'a query' : 'a prompt'}, e.g. ${example}`, 2);
  return text;
}

function queryFromArgs(flags: Map<string, string | boolean>, positionals: string[]): string {
  return textFromArgs(flags, positionals, 'query', 'search', 'grok-it-mcp search "xAI news"');
}

function promptFromArgs(flags: Map<string, string | boolean>, positionals: string[], command: string): string {
  return textFromArgs(flags, positionals, 'prompt', command, `grok-it-mcp ${command} "a cinematic cat"`);
}

function printHelp(stdout: Pick<NodeJS.WriteStream, 'write'> | undefined): void {
  write(stdout, `${PACKAGE_NAME} ${PACKAGE_VERSION}\n\n`);
  write(stdout, 'Usage:\n');
  write(stdout, '  grok-it-mcp                         Start the stdio MCP server\n');
  write(stdout, '  grok-it-mcp status|auth-status      Show Grok auth status\n');
  write(stdout, '  grok-it-mcp login [options]         Run Grok OAuth login\n');
  write(stdout, '  grok-it-mcp search <query>          Run X search through Grok/xAI\n');
  write(stdout, '  grok-it-mcp x-search <query>        Alias for search\n');
  write(stdout, '  grok-it-mcp image-gen <prompt>      Generate image(s) through Grok/xAI\n');
  write(stdout, '  grok-it-mcp image_gen <prompt>      Alias for image-gen\n');
  write(stdout, '  grok-it-mcp video-gen <prompt>      Generate a video through Grok/xAI\n');
  write(stdout, '  grok-it-mcp video_gen <prompt>      Alias for video-gen\n\n');
  write(stdout, 'Login options:\n');
  write(stdout, '  --loopback                          Wait for the local OAuth callback and save tokens\n');
  write(stdout, '  --open                              Open the authorize URL in your browser; implies --loopback\n');
  write(stdout, '  --callback <url-or-code>            Complete login from callback URL or authorization code\n');
  write(stdout, '  --verifier <pkce-verifier>          PKCE verifier from the first login call\n');
  write(stdout, '  --state <state>                     OAuth state from the first login call\n');
  write(stdout, '  --redirect-uri <uri>                OAuth redirect URI\n');
  write(stdout, '  --timeout-ms <ms>                   Loopback timeout, default 120000\n');
  write(stdout, '  --json                              Print machine-readable JSON\n\n');
  write(stdout, 'Search options:\n');
  write(stdout, '  --query <text>                      Search query alternative to positional args\n');
  write(stdout, '  --model <model>                     Override xAI Responses model\n');
  write(stdout, '  --from-date <YYYY-MM-DD>            Inclusive lower date bound\n');
  write(stdout, '  --to-date <YYYY-MM-DD>              Inclusive upper date bound\n');
  write(stdout, '  --include-handles <a,b>             Comma-separated X handles to include\n');
  write(stdout, '  --exclude-handles <a,b>             Comma-separated X handles to exclude\n');
  write(stdout, '  --include-images                    Include image results in X search parameters\n');
  write(stdout, '  --include-videos                    Include video results in X search parameters\n');
  write(stdout, '  --max-results <n>                   Maximum X search results, 1-50\n');
  write(stdout, '  --json                              Print machine-readable JSON\n\n');
  write(stdout, 'Image options:\n');
  write(stdout, '  --prompt <text>                     Prompt alternative to positional args\n');
  write(stdout, '  --model <model>                     Override image generation model\n');
  write(stdout, '  --aspect-ratio <ratio>              Aspect ratio, e.g. 16:9\n');
  write(stdout, '  --resolution <size>                 Resolution override\n');
  write(stdout, '  --n <1-4>                           Number of images, default 1\n');
  write(stdout, '  --cache <true|false>, --no-cache    Cache returned image artifacts, default true\n');
  write(stdout, '  --json                              Print machine-readable JSON\n\n');
  write(stdout, 'Video options:\n');
  write(stdout, '  --prompt <text>                     Prompt alternative to positional args\n');
  write(stdout, '  --model <model>                     Override video generation model\n');
  write(stdout, '  --image-url <url>                   Source image URL for image-to-video\n');
  write(stdout, '  --reference-images <url1,url2>      Comma-separated reference image URLs\n');
  write(stdout, '  --duration <1-30>                   Video duration\n');
  write(stdout, '  --aspect-ratio <ratio>              Aspect ratio, e.g. 16:9\n');
  write(stdout, '  --resolution <size>                 Resolution override\n');
  write(stdout, '  --poll-interval-ms <250-30000>      Poll interval, default 2000\n');
  write(stdout, '  --timeout-ms <1000-1800000>         Overall timeout, default 600000\n');
  write(stdout, '  --cache-video <true|false>          Download/cache the generated video\n');
  write(stdout, '  --no-cache-video                    Return remote video URL without caching\n');
  write(stdout, '  --json                              Print machine-readable JSON\n\n');
  write(stdout, 'Examples:\n');
  write(stdout, '  grok-it-mcp status\n');
  write(stdout, '  grok-it-mcp login --open\n');
  write(stdout, '  grok-it-mcp search "xAI news"\n');
  write(stdout, '  grok-it-mcp x-search "grok updates" --include-handles xai --max-results 5 --json\n');
  write(stdout, '  grok-it-mcp image-gen "a neon robot in Shanghai" --aspect-ratio 16:9\n');
  write(stdout, '  grok-it-mcp video-gen "waves crashing at sunset" --duration 6 --json\n');
  write(stdout, '  grok-it-mcp login --callback "$CALLBACK" --verifier "$VERIFIER" --state "$STATE" --redirect-uri http://127.0.0.1:8153/callback\n');
}

export type OpenUrlCommand = {
  command: string;
  args: string[];
};

export function getOpenUrlCommand(url: string, platform: NodeJS.Platform = process.platform): OpenUrlCommand {
  if (platform === 'darwin') return { command: 'open', args: [url] };
  if (platform === 'win32') {
    // Avoid `cmd /c start <url>`: cmd.exe treats `&` in OAuth query strings as
    // command separators unless the URL is quoted exactly right, so Windows would
    // open only `...?response_type=code` and drop `client_id` plus later params.
    return { command: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', url] };
  }
  return { command: 'xdg-open', args: [url] };
}

async function defaultOpenUrl(url: string): Promise<void> {
  const { spawn } = await import('node:child_process');
  const { command, args } = getOpenUrlCommand(url);
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.unref();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 50);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function runStatus(flags: Map<string, string | boolean>, options: CliOptions): Promise<number> {
  const status = await authStatus(options.env || process.env);
  if (booleanFlag(flags, 'json')) {
    write(options.stdout || process.stdout, `${JSON.stringify(status, null, 2)}\n`);
    return 0;
  }
  write(options.stdout || process.stdout, `Logged in: ${status.logged_in ? 'yes' : 'no'}\n`);
  write(options.stdout || process.stdout, `Provider: ${status.provider || 'none'}\n`);
  write(options.stdout || process.stdout, `Base URL: ${status.base_url || 'none'}\n`);
  write(options.stdout || process.stdout, `OAuth expires at: ${status.oauth_expires_at || 'none'}\n`);
  write(options.stdout || process.stdout, `API key present: ${status.api_key_present ? 'yes' : 'no'}\n`);
  write(options.stdout || process.stdout, `Token store: ${status.token_store}\n`);
  write(options.stdout || process.stdout, `Cache dir: ${status.cache_dir}\n`);
  return 0;
}

async function runLogin(flags: Map<string, string | boolean>, options: CliOptions): Promise<number> {
  const stdout = options.stdout || process.stdout;
  const config = getConfig(options.env || process.env);
  const json = booleanFlag(flags, 'json');
  const callback = stringFlag(flags, 'callback');
  const verifier = stringFlag(flags, 'verifier');
  const state = stringFlag(flags, 'state');
  const redirectUri = stringFlag(flags, 'redirect-uri');
  const timeoutMs = numberFlag(flags, 'timeout-ms') || 120_000;
  const loopback = booleanFlag(flags, 'loopback') || booleanFlag(flags, 'open');

  if (callback) {
    if (!verifier) throw new CliError('login completion requires --verifier', 2);
    if (!redirectUri) throw new CliError('login completion requires --redirect-uri', 2);
    if (!state) throw new CliError('login completion requires --state', 2);
    const discovery = await discoverOAuth(options.fetchImpl || fetch);
    const { code } = parseCallback(callback, state);
    const tokens = await exchangeCodeForTokens({ code, verifier, redirectUri, discovery, fetchImpl: options.fetchImpl });
    const persisted = await persistTokenResponse({ tokens, discovery, redirectUri, baseUrl: config.oauthBaseUrl, tokenStorePath: config.tokenStorePath });
    const result = { logged_in: true, provider: 'xai-oauth', base_url: persisted.base_url, expires_at: tokens.expires_at ? new Date(tokens.expires_at).toISOString() : null };
    write(stdout, json ? `${JSON.stringify(result, null, 2)}\n` : `Grok login complete. Provider: xai-oauth\nBase URL: ${result.base_url}\nOAuth expires at: ${result.expires_at || 'unknown'}\n`);
    return 0;
  }

  const session = await createLoginSession({ redirectUri, fetchImpl: options.fetchImpl || fetch });
  if (booleanFlag(flags, 'open')) {
    try {
      await (options.openUrl || defaultOpenUrl)(session.authorizeUrl);
    } catch (error) {
      write(options.stderr || process.stderr, `Could not open browser automatically: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  if (loopback) {
    if (!json) {
      write(stdout, `Open this URL to authorize Grok:\n${session.authorizeUrl}\n\nWaiting for OAuth callback on ${session.redirectUri} ...\n`);
    }
    const code = await waitForLoopbackCode(session, timeoutMs);
    const tokens = await exchangeCodeForTokens({ code, verifier: session.verifier, challenge: session.challenge, redirectUri: session.redirectUri, discovery: session.discovery, fetchImpl: options.fetchImpl });
    const persisted = await persistTokenResponse({ tokens, discovery: session.discovery, redirectUri: session.redirectUri, baseUrl: config.oauthBaseUrl, tokenStorePath: config.tokenStorePath });
    const result = { logged_in: true, provider: 'xai-oauth', base_url: persisted.base_url, expires_at: tokens.expires_at ? new Date(tokens.expires_at).toISOString() : null };
    write(stdout, json ? `${JSON.stringify(result, null, 2)}\n` : `Grok login complete. Provider: xai-oauth\nBase URL: ${result.base_url}\nOAuth expires at: ${result.expires_at || 'unknown'}\n`);
    return 0;
  }

  const result = {
    logged_in: false,
    authorize_url: session.authorizeUrl,
    verifier: session.verifier,
    state: session.state,
    redirect_uri: session.redirectUri,
    instructions: 'Open authorize_url, then run grok-it-mcp login --callback <callback-url-or-code> --verifier <verifier> --state <state> --redirect-uri <redirect_uri>. Do not paste tokens.',
  };
  if (json) {
    write(stdout, `${JSON.stringify(result, null, 2)}\n`);
  } else {
    write(stdout, `Open this URL to authorize Grok:\n${result.authorize_url}\n\n`);
    write(stdout, `Then complete login with:\n`);
    write(stdout, `grok-it-mcp login --callback '<callback-url-or-code>' --verifier '${result.verifier}' --state '${result.state}' --redirect-uri '${result.redirect_uri}'\n`);
  }
  return 0;
}

async function runSearch(flags: Map<string, string | boolean>, positionals: string[], options: CliOptions): Promise<number> {
  const stdout = options.stdout || process.stdout;
  const maxResults = numberFlag(flags, 'max-results');
  if (maxResults !== undefined && (maxResults < 1 || maxResults > 50)) throw new CliError('--max-results must be between 1 and 50', 2);

  const args = {
    query: queryFromArgs(flags, positionals),
    model: stringFlag(flags, 'model'),
    from_date: stringFlag(flags, 'from-date'),
    to_date: stringFlag(flags, 'to-date'),
    include_handles: listFlag(flags, 'include-handles'),
    exclude_handles: listFlag(flags, 'exclude-handles'),
    include_images: booleanFlag(flags, 'include-images') ? true : undefined,
    include_videos: booleanFlag(flags, 'include-videos') ? true : undefined,
    max_results: maxResults,
  };

  const result = await handleXSearch(args, new XaiClient({ env: options.env || process.env, fetchImpl: options.fetchImpl }));
  if (booleanFlag(flags, 'json')) {
    write(stdout, `${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  write(stdout, `${result.answer || '(no answer returned)'}\n`);
  if (result.citations.length) write(stdout, `\nCitations:\n${result.citations.map((citation) => `- ${citation}`).join('\n')}\n`);
  write(stdout, `\nModel: ${String(result.model)}\n`);
  write(stdout, `Credential source: ${result.credential_source}\n`);
  if (result.degraded) write(stdout, 'Warning: response did not include output text. Use --json to inspect metadata.\n');
  return 0;
}


type ImageOutput = {
  image?: unknown;
  remote_url?: unknown;
  bytes?: unknown;
  content_type?: unknown;
  revised_prompt?: unknown;
};

async function runImageGenerate(flags: Map<string, string | boolean>, positionals: string[], options: CliOptions): Promise<number> {
  const stdout = options.stdout || process.stdout;
  const n = rangedNumberFlag(flags, 'n', 1, 4);
  const cache = booleanFlag(flags, 'no-cache') ? false : optionalBooleanFlag(flags, 'cache');
  const args = {
    prompt: promptFromArgs(flags, positionals, 'image-gen'),
    model: stringFlag(flags, 'model'),
    aspect_ratio: stringFlag(flags, 'aspect-ratio'),
    resolution: stringFlag(flags, 'resolution'),
    n,
    cache,
  };

  const result = await handleImageGenerate(args, new XaiClient({ env: options.env || process.env, fetchImpl: options.fetchImpl }), options.fetchImpl, options.env || process.env);
  if (booleanFlag(flags, 'json')) {
    write(stdout, `${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  write(stdout, 'Images:\n');
  result.images.forEach((image: ImageOutput, index: number) => {
    write(stdout, `- [${index + 1}] ${String(image.image || image.remote_url || '(no image URL/path returned)')}\n`);
    if (image.bytes) write(stdout, `  Bytes: ${String(image.bytes)}\n`);
    if (image.content_type) write(stdout, `  Content type: ${String(image.content_type)}\n`);
    if (image.remote_url && image.remote_url !== image.image) write(stdout, `  Remote URL: ${String(image.remote_url)}\n`);
    if (image.revised_prompt) write(stdout, `  Revised prompt: ${String(image.revised_prompt)}\n`);
  });
  write(stdout, `Model: ${String(result.model)}\n`);
  write(stdout, `Credential source: ${result.credential_source}\n`);
  return 0;
}

async function runVideoGenerate(flags: Map<string, string | boolean>, positionals: string[], options: CliOptions): Promise<number> {
  const stdout = options.stdout || process.stdout;
  const cacheVideo = booleanFlag(flags, 'no-cache-video') ? false : optionalBooleanFlag(flags, 'cache-video');
  const args = {
    prompt: promptFromArgs(flags, positionals, 'video-gen'),
    model: stringFlag(flags, 'model'),
    image_url: stringFlag(flags, 'image-url'),
    reference_images: listFlag(flags, 'reference-images'),
    duration: rangedNumberFlag(flags, 'duration', 1, 30),
    aspect_ratio: stringFlag(flags, 'aspect-ratio'),
    resolution: stringFlag(flags, 'resolution'),
    poll_interval_ms: rangedNumberFlag(flags, 'poll-interval-ms', 250, 30000),
    timeout_ms: rangedNumberFlag(flags, 'timeout-ms', 1000, 30 * 60_000),
    cache_video: cacheVideo,
  };

  const result = await handleVideoGenerate(args, new XaiClient({ env: options.env || process.env, fetchImpl: options.fetchImpl }), options.fetchImpl, options.env || process.env);
  if (booleanFlag(flags, 'json')) {
    write(stdout, `${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  write(stdout, `Video: ${String(result.video || '(not ready)')}\n`);
  if (result.remote_url) write(stdout, `Remote URL: ${String(result.remote_url)}\n`);
  write(stdout, `Request ID: ${String(result.request_id)}\n`);
  write(stdout, `Status: ${String(result.status)}\n`);
  if (result.bytes) write(stdout, `Bytes: ${String(result.bytes)}\n`);
  if (result.content_type) write(stdout, `Content type: ${String(result.content_type)}\n`);
  if (result.timeout) write(stdout, 'Timed out before completion. Re-run with a larger --timeout-ms to wait longer.\n');
  if (result.cache_warning) write(stdout, `Cache warning: ${String(result.cache_warning)}\n`);
  write(stdout, `Credential source: ${result.credential_source}\n`);
  return 0;
}

export async function runCli(options: CliOptions = {}): Promise<number> {
  const argv = options.argv || process.argv.slice(2);
  const parsed = parseArgs(argv);
  const command = parsed.command;

  if (!command) return -1;
  if (command === '--help' || command === '-h' || command === 'help') {
    printHelp(options.stdout || process.stdout);
    return 0;
  }
  if (command === '--version' || command === '-v' || command === 'version') {
    write(options.stdout || process.stdout, `${PACKAGE_VERSION}\n`);
    return 0;
  }
  if (command === 'status' || command === 'auth-status' || command === 'auth_status') return runStatus(parsed.flags, options);
  if (command === 'login') return runLogin(parsed.flags, options);
  if (command === 'search' || command === 'x-search' || command === 'x_search') return runSearch(parsed.flags, parsed.positionals, options);
  if (command === 'image-gen' || command === 'image_gen' || command === 'image-generate' || command === 'image_generate') return runImageGenerate(parsed.flags, parsed.positionals, options);
  if (command === 'video-gen' || command === 'video_gen' || command === 'video-generate' || command === 'video_generate') return runVideoGenerate(parsed.flags, parsed.positionals, options);

  throw new CliError(`Unknown command: ${command}`, 2);
}

export async function runCliAndExit(options: CliOptions = {}): Promise<boolean> {
  try {
    const code = await runCli(options);
    if (code === -1) return false;
    process.exitCode = code;
    return true;
  } catch (error) {
    const exitCode = error instanceof CliError ? error.exitCode : 1;
    write(options.stderr || process.stderr, `${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = exitCode;
    return true;
  }
}
