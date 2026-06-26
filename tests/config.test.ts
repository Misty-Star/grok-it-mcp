import { describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { authStatus } from '../src/auth/credentials.js';
import { expandConfigPath, getConfig } from '../src/config/env.js';

describe('config path expansion', () => {
  it('expands MCP JSON ${HOME} placeholders to the same default paths used by the CLI', () => {
    const env = {
      HOME: '/tmp/grok-home',
      GROK_IT_TOKEN_STORE: '${HOME}/.grok-it/auth.json',
      GROK_IT_CACHE_DIR: '${HOME}/.grok-it/artifacts',
    } as NodeJS.ProcessEnv;

    const config = getConfig(env);

    expect(config.tokenStorePath).toBe(path.join('/tmp/grok-home', '.grok-it', 'auth.json'));
    expect(config.cacheDir).toBe(path.join('/tmp/grok-home', '.grok-it', 'artifacts'));
  });

  it('expands shell-style home and environment variables in configured paths', () => {
    const env = { HOME: '/tmp/grok-home', XDG_STATE_HOME: '/tmp/state' } as NodeJS.ProcessEnv;

    expect(expandConfigPath('~/.grok-it/auth.json', env)).toBe(path.join('/tmp/grok-home', '.grok-it', 'auth.json'));
    expect(expandConfigPath('$XDG_STATE_HOME/grok-it/auth.json', env)).toBe(path.join('/tmp/state', 'grok-it', 'auth.json'));
  });

  it('keeps MCP auth status synchronized with the npm CLI default token store', async () => {
    const home = path.join(os.tmpdir(), `grok-it-home-${process.pid}-sync`);
    await rm(home, { recursive: true, force: true });
    const tokenDir = path.join(home, '.grok-it');
    await mkdir(tokenDir, { recursive: true });
    await writeFile(path.join(tokenDir, 'auth.json'), JSON.stringify({
      providers: {
        'xai-oauth': {
          provider: 'xai-oauth',
          auth_mode: 'oauth_pkce',
          tokens: { access_token: 'oauth-token' },
          discovery: { authorization_endpoint: 'https://auth.x.ai/a', token_endpoint: 'https://auth.x.ai/t' },
          redirect_uri: 'http://127.0.0.1/callback',
          base_url: 'https://api.x.ai/v1',
          last_refresh: new Date().toISOString(),
        },
      },
    }));

    const status = await authStatus({ HOME: home, GROK_IT_TOKEN_STORE: '${HOME}/.grok-it/auth.json' } as NodeJS.ProcessEnv);

    expect(status).toMatchObject({ logged_in: true, provider: 'xai-oauth', token_store: path.join(home, '.grok-it', 'auth.json') });
  });
});
