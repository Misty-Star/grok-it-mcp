import { DEFAULT_XAI_BASE_URL } from '../config/constants.js';
import { getConfig } from '../config/env.js';
import { OAuthError, readOAuthState, refreshOAuthState, validateInferenceBaseUrl } from './oauth.js';

export type CredentialSource = 'xai-oauth' | 'xai';

export type ResolvedCredentials = {
  provider: CredentialSource;
  credentialSource: CredentialSource;
  authorization: string;
  baseUrl: string;
  expiresAt?: number;
  tokenStorePath?: string;
};

export class AuthRequiredError extends Error {
  constructor(message = 'No Grok OAuth token or XAI_API_KEY is configured') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

export async function resolveCredentials(options: { forceRefresh?: boolean; fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv } = {}): Promise<ResolvedCredentials> {
  const config = getConfig(options.env);
  const oauth = await readOAuthState(config.tokenStorePath);
  if (oauth) {
    try {
      const fresh = await refreshOAuthState(oauth, { force: options.forceRefresh, fetchImpl: options.fetchImpl, tokenStorePath: config.tokenStorePath });
      return {
        provider: 'xai-oauth',
        credentialSource: 'xai-oauth',
        authorization: `Bearer ${fresh.tokens.access_token}`,
        baseUrl: validateInferenceBaseUrl(fresh.base_url || DEFAULT_XAI_BASE_URL),
        expiresAt: fresh.tokens.expires_at,
        tokenStorePath: config.tokenStorePath,
      };
    } catch (error) {
      if (error instanceof OAuthError && (error.code === 'invalid_grant' || error.code === 'oauth_entitlement_required')) {
        if (config.apiKey) return apiKeyCredentials(config);
      }
      throw error;
    }
  }
  if (config.apiKey) return apiKeyCredentials(config);
  throw new AuthRequiredError();
}

function apiKeyCredentials(config: ReturnType<typeof getConfig>): ResolvedCredentials {
  return {
    provider: 'xai',
    credentialSource: 'xai',
    authorization: `Bearer ${config.apiKey}`,
    baseUrl: config.baseUrl.replace(/\/$/, ''),
    tokenStorePath: config.tokenStorePath,
  };
}

export function isOAuthCredential(creds: ResolvedCredentials): boolean {
  return creds.provider === 'xai-oauth';
}

export function redactSecret(input: string): string {
  return input
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/g, 'Bearer [REDACTED]')
    .replace(/(access_token|refresh_token|id_token|code|code_verifier)=([^&\s]+)/gi, '$1=[REDACTED]');
}

export async function authStatus(env: NodeJS.ProcessEnv = process.env) {
  const config = getConfig(env);
  const oauth = await readOAuthState(config.tokenStorePath);
  return {
    logged_in: Boolean(oauth?.tokens?.access_token || config.apiKey),
    provider: oauth?.tokens?.access_token ? 'xai-oauth' : config.apiKey ? 'xai' : null,
    base_url: oauth?.tokens?.access_token ? oauth.base_url : config.apiKey ? config.baseUrl : null,
    oauth_expires_at: oauth?.tokens?.expires_at ? new Date(oauth.tokens.expires_at).toISOString() : null,
    token_store: config.tokenStorePath,
    cache_dir: config.cacheDir,
    api_key_present: Boolean(config.apiKey),
  };
}
