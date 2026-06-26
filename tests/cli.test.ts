import { describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runCli } from '../src/cli.js';

type MockResponseInit = {
  ok?: boolean;
  status?: number;
  body: Record<string, unknown>;
};

function mockResponse(init: MockResponseInit): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: vi.fn().mockResolvedValue(init.body),
  } as unknown as Response;
}

async function tmpEnv(name: string): Promise<NodeJS.ProcessEnv> {
  const dir = path.join(os.tmpdir(), `grok-it-cli-${process.pid}-${name}`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  return {
    GROK_IT_TOKEN_STORE: path.join(dir, 'auth.json'),
    GROK_IT_CACHE_DIR: path.join(dir, 'artifacts'),
  } as NodeJS.ProcessEnv;
}

function capture() {
  let output = '';
  return {
    stream: { write: (chunk: string | Uint8Array) => { output += String(chunk); return true; } } as NodeJS.WriteStream,
    output: () => output,
  };
}

const discovery = {
  authorization_endpoint: 'https://auth.x.ai/oauth2/authorize',
  token_endpoint: 'https://auth.x.ai/oauth2/token',
};

describe('CLI', () => {
  it('returns -1 with no command so index can start the stdio MCP server', async () => {
    await expect(runCli({ argv: [] })).resolves.toBe(-1);
  });

  it('prints auth status as JSON', async () => {
    const env = await tmpEnv('status');
    const stdout = capture();
    await expect(runCli({ argv: ['status', '--json'], env, stdout: stdout.stream })).resolves.toBe(0);
    const status = JSON.parse(stdout.output());
    expect(status).toMatchObject({ logged_in: false, provider: null, api_key_present: false, token_store: env.GROK_IT_TOKEN_STORE });
  });

  it('starts login and prints authorize material without token secrets', async () => {
    const env = await tmpEnv('login-start');
    const stdout = capture();
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ body: discovery }));
    await expect(runCli({ argv: ['login', '--json'], env, stdout: stdout.stream, fetchImpl })).resolves.toBe(0);
    const result = JSON.parse(stdout.output());
    expect(result.logged_in).toBe(false);
    expect(result.authorize_url).toContain('https://auth.x.ai/oauth2/authorize');
    expect(result.verifier).toEqual(expect.any(String));
    expect(result.state).toEqual(expect.any(String));
    expect(result.redirect_uri).toBe('http://127.0.0.1:8765/callback');
    expect(stdout.output()).not.toContain('access_token');
  });

  it('completes login from callback, verifier, state, and redirect URI', async () => {
    const env = await tmpEnv('login-complete');
    const stdout = capture();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ body: discovery }))
      .mockResolvedValueOnce(mockResponse({ body: { access_token: 'access', refresh_token: 'refresh', expires_in: 3600, token_type: 'Bearer' } }));
    const callback = 'http://127.0.0.1:8765/callback?code=abc&state=state-1';
    await expect(runCli({
      argv: ['login', '--json', '--callback', callback, '--verifier', 'verifier-1', '--state', 'state-1', '--redirect-uri', 'http://127.0.0.1:8765/callback'],
      env,
      stdout: stdout.stream,
      fetchImpl,
    })).resolves.toBe(0);
    const result = JSON.parse(stdout.output());
    expect(result).toMatchObject({ logged_in: true, provider: 'xai-oauth', base_url: 'https://api.x.ai/v1' });
    const stored = JSON.parse(await readFile(env.GROK_IT_TOKEN_STORE!, 'utf8'));
    expect(stored.providers['xai-oauth'].tokens.access_token).toBe('access');
    expect(stored.providers['xai-oauth'].tokens.refresh_token).toBe('refresh');
  });

  it('requires login completion safety parameters', async () => {
    const stdout = capture();
    await expect(runCli({ argv: ['login', '--callback', 'code'], stdout: stdout.stream })).rejects.toThrow(/--verifier/);
  });

  it('runs search alias with positional query and prints a human-readable answer', async () => {
    const env = { ...(await tmpEnv('search')), XAI_API_KEY: 'key' } as NodeJS.ProcessEnv;
    const stdout = capture();
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ body: { output_text: 'answer', citations: ['https://x.com/xai/status/1'], id: 'resp-1', model: 'model-1' } }));
    await expect(runCli({ argv: ['search', 'xAI', 'news'], env, stdout: stdout.stream, fetchImpl })).resolves.toBe(0);
    expect(stdout.output()).toContain('answer');
    expect(stdout.output()).toContain('https://x.com/xai/status/1');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = fetchImpl.mock.calls[0];
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://api.x.ai/v1/responses');
    expect(JSON.parse(String(init.body))).toMatchObject({ input: 'xAI news', tools: [{ type: 'x_search' }] });
  });

  it('runs x-search alias with flags and JSON output', async () => {
    const env = { ...(await tmpEnv('x-search')), XAI_API_KEY: 'key' } as NodeJS.ProcessEnv;
    const stdout = capture();
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ body: { output_text: 'json answer', citations: [], id: 'resp-2', model: 'model-2' } }));
    await expect(runCli({
      argv: ['x-search', '--query', 'grok updates', '--include-handles', 'xai,elonmusk', '--exclude-handles', 'spam', '--include-images', '--include-videos', '--from-date', '2026-06-01', '--to-date', '2026-06-22', '--max-results', '5', '--json'],
      env,
      stdout: stdout.stream,
      fetchImpl,
    })).resolves.toBe(0);
    const result = JSON.parse(stdout.output());
    expect(result).toMatchObject({ answer: 'json answer', raw_id: 'resp-2', credential_source: 'xai' });
    const [, init] = fetchImpl.mock.calls[0];
    expect(JSON.parse(String(init.body))).toMatchObject({
      input: 'grok updates',
      tools: [{
        type: 'x_search',
        from_date: '2026-06-01',
        to_date: '2026-06-22',
        included_x_handles: ['xai', 'elonmusk'],
        excluded_x_handles: ['spam'],
        search_parameters: { include_images: true, include_videos: true },
        max_search_results: 5,
      }],
    });
  });

  it('requires search query and validates max results', async () => {
    await expect(runCli({ argv: ['search'] })).rejects.toThrow(/requires a query/);
    await expect(runCli({ argv: ['x-search', 'q', '--max-results', '99'] })).rejects.toThrow(/between 1 and 50/);
  });

});
