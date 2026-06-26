import { describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildAuthorizeUrl, generatePkce, isXaiOrigin, parseCallback, validateInferenceBaseUrl } from '../src/auth/oauth.js';
import { resolveCredentials } from '../src/auth/credentials.js';

async function tmpStore(name: string) {
  const dir = path.join(os.tmpdir(), `grok-it-${process.pid}-${name}`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  return path.join(dir, 'auth.json');
}

describe('oauth helpers', () => {
  it('generates PKCE and authorize URL with required parameters', () => {
    const pkce = generatePkce();
    const url = buildAuthorizeUrl({
      discovery: { authorization_endpoint: 'https://auth.x.ai/oauth2/authorize', token_endpoint: 'https://auth.x.ai/oauth2/token' },
      redirectUri: 'http://127.0.0.1:8765/callback',
      challenge: pkce.challenge,
      state: 'state',
      nonce: 'nonce',
    });
    expect(pkce.verifier).not.toEqual(pkce.challenge);
    expect(url).toContain('client_id=b1a00492-073a-47ea-816f-4c329264a828');
    expect(url).toContain('scope=openid+profile+email+offline_access+grok-cli%3Aaccess+api%3Aaccess');
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain('state=state');
  });

  it('parses callbacks and rejects mismatched state', () => {
    expect(parseCallback('http://127.0.0.1/callback?code=abc&state=s', 's').code).toBe('abc');
    expect(parseCallback('bare-code').code).toBe('bare-code');
    expect(() => parseCallback('http://127.0.0.1/callback?code=abc', 's')).toThrow(/state/);
    expect(() => parseCallback('http://127.0.0.1/callback?code=abc&state=bad', 'good')).toThrow(/state/);
  });

  it('pins OAuth origins to x.ai HTTPS', () => {
    expect(isXaiOrigin('https://api.x.ai/v1')).toBe(true);
    expect(isXaiOrigin('https://auth.x.ai/token')).toBe(true);
    expect(isXaiOrigin('http://api.x.ai/v1')).toBe(false);
    expect(isXaiOrigin('https://evil.example/v1')).toBe(false);
    expect(() => validateInferenceBaseUrl('https://evil.example/v1')).toThrow(/x\.ai/i);
  });
});

describe('credential resolution', () => {
  it('uses API key fallback when OAuth is missing', async () => {
    const store = await tmpStore('api-key');
    const creds = await resolveCredentials({ env: { XAI_API_KEY: 'key', GROK_IT_TOKEN_STORE: store } as NodeJS.ProcessEnv });
    expect(creds.provider).toBe('xai');
    expect(creds.authorization).toBe('Bearer key');
  });

  it('OAuth wins over API key and refuses non-xAI OAuth base URL before request', async () => {
    const store = await tmpStore('oauth');
    await writeFile(store, JSON.stringify({ providers: { 'xai-oauth': { provider: 'xai-oauth', auth_mode: 'oauth_pkce', tokens: { access_token: 'oauth-token', refresh_token: 'refresh' }, discovery: { authorization_endpoint: 'https://auth.x.ai/a', token_endpoint: 'https://auth.x.ai/t' }, redirect_uri: 'http://127.0.0.1/callback', base_url: 'https://api.x.ai/v1', last_refresh: new Date().toISOString() } } }));
    const creds = await resolveCredentials({ env: { XAI_API_KEY: 'key', GROK_IT_TOKEN_STORE: store } as NodeJS.ProcessEnv });
    expect(creds.provider).toBe('xai-oauth');
    expect(creds.authorization).toBe('Bearer oauth-token');
  });
});
