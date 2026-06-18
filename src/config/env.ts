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

export function getConfig(env: NodeJS.ProcessEnv = process.env): GrokItConfig {
  const home = os.homedir();
  return {
    baseUrl: env.XAI_BASE_URL || DEFAULT_XAI_BASE_URL,
    oauthBaseUrl: env.GROK_OAUTH_BASE_URL || DEFAULT_XAI_BASE_URL,
    apiKey: env.XAI_API_KEY,
    tokenStorePath: env.GROK_IT_TOKEN_STORE || path.join(home, '.grok-it', 'auth.json'),
    cacheDir: env.GROK_IT_CACHE_DIR || path.join(home, '.grok-it', 'artifacts'),
    cacheVideoByDefault: env.GROK_IT_CACHE_VIDEO === '1' || env.GROK_IT_CACHE_VIDEO === 'true',
    maxDownloadBytes: Number.parseInt(env.GROK_IT_MAX_DOWNLOAD_BYTES || '', 10) || DEFAULT_MAX_DOWNLOAD_BYTES,
    oauthClientId: env.GROK_IT_OAUTH_CLIENT_ID,
  };
}
