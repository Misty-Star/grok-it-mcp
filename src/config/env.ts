import os from 'node:os';
import path from 'node:path';
import { DEFAULT_MAX_DOWNLOAD_BYTES, DEFAULT_XAI_BASE_URL } from './constants.js';

export type GrokItConfig = {
  baseUrl: string;
  oauthBaseUrl: string;
  apiKey?: string;
  tokenStorePath: string;
  cacheDir: string;
  cacheVideoByDefault: boolean;
  maxDownloadBytes: number;
  oauthClientId?: string;
};

function homeDir(env: NodeJS.ProcessEnv): string {
  return env.HOME || env.USERPROFILE || os.homedir();
}

export function expandConfigPath(value: string, env: NodeJS.ProcessEnv = process.env): string {
  const home = homeDir(env);
  let expanded = value;

  if (expanded === '~') {
    expanded = home;
  } else if (expanded.startsWith(`~${path.sep}`) || expanded.startsWith('~/')) {
    expanded = path.join(home, expanded.slice(2));
  }

  return expanded.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, braced: string | undefined, bare: string | undefined) => {
    const key = (braced ?? bare)!;
    if (key === 'HOME') return home;
    return env[key] ?? match;
  });
}

export function getConfig(env: NodeJS.ProcessEnv = process.env): GrokItConfig {
  const home = homeDir(env);
  return {
    baseUrl: env.XAI_BASE_URL || DEFAULT_XAI_BASE_URL,
    oauthBaseUrl: env.GROK_OAUTH_BASE_URL || DEFAULT_XAI_BASE_URL,
    apiKey: env.XAI_API_KEY,
    tokenStorePath: expandConfigPath(env.GROK_IT_TOKEN_STORE || path.join(home, '.grok-it', 'auth.json'), env),
    cacheDir: expandConfigPath(env.GROK_IT_CACHE_DIR || path.join(home, '.grok-it', 'artifacts'), env),
    cacheVideoByDefault: env.GROK_IT_CACHE_VIDEO === '1' || env.GROK_IT_CACHE_VIDEO === 'true',
    maxDownloadBytes: Number.parseInt(env.GROK_IT_MAX_DOWNLOAD_BYTES || '', 10) || DEFAULT_MAX_DOWNLOAD_BYTES,
    oauthClientId: env.GROK_IT_OAUTH_CLIENT_ID,
  };
}
