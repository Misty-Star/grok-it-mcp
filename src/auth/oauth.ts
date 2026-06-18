import crypto from 'node:crypto';
import http from 'node:http';
import { URL, URLSearchParams } from 'node:url';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_REDIRECT_HOST,
  DEFAULT_REDIRECT_PATH,
  DEFAULT_REDIRECT_PORT,
  DEFAULT_XAI_DISCOVERY_URL,
  DEFAULT_XAI_OAUTH_CLIENT_ID,
  DEFAULT_XAI_OAUTH_SCOPE,
  OAUTH_REFRESH_SKEW_MS,
  PACKAGE_NAME,
  PACKAGE_VERSION,
} from '../config/constants.js';
import { getConfig } from '../config/env.js';

export type OAuthDiscovery = {
  issuer?: string;
  authorization_endpoint: string;
  token_endpoint: string;
};

export type StoredOAuthTokens = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_at?: number;
  token_type?: string;
  scope?: string;
};

export type StoredOAuthState = {
  provider: 'xai-oauth';
  auth_mode: 'oauth_pkce';
  tokens: StoredOAuthTokens;
  discovery: OAuthDiscovery;
  redirect_uri: string;
  base_url: string;
  last_refresh: string;
  invalid?: boolean;
  last_auth_error?: string;
};

export type AuthStore = {
  providers?: {
    'xai-oauth'?: StoredOAuthState;
  };
};

export type LoginSession = {
  verifier: string;
  challenge: string;
  state: string;
  nonce: string;
  redirectUri: string;
  authorizeUrl: string;
  discovery: OAuthDiscovery;
};

export class OAuthError extends Error {
  constructor(public code: string, message: string, public status?: number) {
    super(message);
    this.name = 'OAuthError';
  }
}

export function base64Url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function generatePkce() {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function randomState(): string {
  return base64Url(crypto.randomBytes(24));
}

export function isXaiOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'x.ai' || url.hostname.endsWith('.x.ai'));
  } catch {
    return false;
  }
}

export function validateXaiHttpsUrl(value: string, label = 'xAI URL'): string {
  if (!isXaiOrigin(value)) {
    throw new OAuthError('xai_origin_required', `${label} must be an https://*.x.ai URL`);
  }
  return value;
}

export function validateInferenceBaseUrl(value: string): string {
  const url = new URL(validateXaiHttpsUrl(value, 'OAuth inference base URL'));
  url.pathname = url.pathname.replace(/\/$/, '');
  return url.toString().replace(/\/$/, '');
}

export async function readAuthStore(tokenStorePath = getConfig().tokenStorePath): Promise<AuthStore> {
  try {
    return JSON.parse(await readFile(tokenStorePath, 'utf8')) as AuthStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

export async function writeAuthStore(store: AuthStore, tokenStorePath = getConfig().tokenStorePath): Promise<void> {
  await mkdir(path.dirname(tokenStorePath), { recursive: true, mode: 0o700 });
  const tmp = `${tokenStorePath}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, tokenStorePath);
}

export async function readOAuthState(tokenStorePath = getConfig().tokenStorePath): Promise<StoredOAuthState | undefined> {
  const state = (await readAuthStore(tokenStorePath)).providers?.['xai-oauth'];
  if (!state || state.invalid || !state.tokens?.access_token) return undefined;
  return state;
}

export async function saveOAuthState(state: StoredOAuthState, tokenStorePath = getConfig().tokenStorePath): Promise<void> {
  const store = await readAuthStore(tokenStorePath);
  store.providers ||= {};
  store.providers['xai-oauth'] = state;
  await writeAuthStore(store, tokenStorePath);
}

export async function markOAuthInvalid(reason: string, tokenStorePath = getConfig().tokenStorePath): Promise<void> {
  const store = await readAuthStore(tokenStorePath);
  if (store.providers?.['xai-oauth']) {
    store.providers['xai-oauth'].invalid = true;
    store.providers['xai-oauth'].last_auth_error = reason;
    await writeAuthStore(store, tokenStorePath);
  }
}

export async function clearOAuthState(tokenStorePath = getConfig().tokenStorePath): Promise<void> {
  const store = await readAuthStore(tokenStorePath);
  if (store.providers?.['xai-oauth']) {
    delete store.providers['xai-oauth'];
    await writeAuthStore(store, tokenStorePath);
  } else {
    await rm(tokenStorePath, { force: true });
  }
}

export function tokenExpiresAt(tokenResponse: Record<string, unknown>, now = Date.now()): number | undefined {
  if (typeof tokenResponse.expires_at === 'number') return tokenResponse.expires_at;
  if (typeof tokenResponse.expires_in === 'number') return now + tokenResponse.expires_in * 1000;
  return undefined;
}

export function isTokenExpiring(tokens: StoredOAuthTokens, now = Date.now()): boolean {
  return typeof tokens.expires_at === 'number' && tokens.expires_at - now <= OAUTH_REFRESH_SKEW_MS;
}

export async function discoverOAuth(fetchImpl: typeof fetch = fetch): Promise<OAuthDiscovery> {
  const response = await fetchImpl(DEFAULT_XAI_DISCOVERY_URL, { headers: { accept: 'application/json', 'user-agent': `${PACKAGE_NAME}/${PACKAGE_VERSION}` } });
  if (!response.ok) throw new OAuthError('discovery_failed', `OIDC discovery failed with HTTP ${response.status}`, response.status);
  const discovery = (await response.json()) as OAuthDiscovery;
  validateXaiHttpsUrl(discovery.authorization_endpoint, 'authorization_endpoint');
  validateXaiHttpsUrl(discovery.token_endpoint, 'token_endpoint');
  return discovery;
}

export function buildAuthorizeUrl(params: {
  discovery: OAuthDiscovery;
  clientId?: string;
  redirectUri: string;
  scope?: string;
  challenge: string;
  state: string;
  nonce: string;
}): string {
  const url = new URL(params.discovery.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: params.clientId || DEFAULT_XAI_OAUTH_CLIENT_ID,
    redirect_uri: params.redirectUri,
    scope: params.scope || DEFAULT_XAI_OAUTH_SCOPE,
    code_challenge: params.challenge,
    code_challenge_method: 'S256',
    state: params.state,
    nonce: params.nonce,
    plan: 'generic',
    referrer: PACKAGE_NAME,
  }).toString();
  return url.toString();
}

export async function createLoginSession(options: { redirectUri?: string; port?: number; fetchImpl?: typeof fetch } = {}): Promise<LoginSession> {
  const config = getConfig();
  const discovery = await discoverOAuth(options.fetchImpl || fetch);
  const { verifier, challenge } = generatePkce();
  const state = randomState();
  const nonce = randomState();
  const redirectUri = options.redirectUri || `http://${DEFAULT_REDIRECT_HOST}:${options.port || DEFAULT_REDIRECT_PORT}${DEFAULT_REDIRECT_PATH}`;
  return {
    verifier,
    challenge,
    state,
    nonce,
    redirectUri,
    discovery,
    authorizeUrl: buildAuthorizeUrl({ discovery, clientId: config.oauthClientId, redirectUri, challenge, state, nonce }),
  };
}

export function parseCallback(input: string, expectedState?: string): { code: string; state?: string } {
  let code: string | null = null;
  let state: string | null = null;
  let callbackUrl = false;
  if (/^https?:\/\//.test(input)) {
    callbackUrl = true;
    const url = new URL(input);
    const error = url.searchParams.get('error');
    if (error) throw new OAuthError(error, url.searchParams.get('error_description') || error);
    code = url.searchParams.get('code');
    state = url.searchParams.get('state');
  } else {
    code = input.trim();
  }
  if (!code) throw new OAuthError('missing_code', 'OAuth callback did not contain an authorization code');
  if (expectedState && callbackUrl && !state) throw new OAuthError('missing_state', 'OAuth callback URL did not contain state');
  if (expectedState && state !== null && state !== expectedState) throw new OAuthError('state_mismatch', 'OAuth callback state did not match login session');
  return { code, state: state || undefined };
}

export async function exchangeCodeForTokens(params: {
  code: string;
  verifier: string;
  challenge?: string;
  redirectUri: string;
  discovery: OAuthDiscovery;
  clientId?: string;
  fetchImpl?: typeof fetch;
}): Promise<StoredOAuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId || DEFAULT_XAI_OAUTH_CLIENT_ID,
    code_verifier: params.verifier,
  });
  if (params.challenge) {
    body.set('code_challenge', params.challenge);
    body.set('code_challenge_method', 'S256');
  }
  const response = await (params.fetchImpl || fetch)(validateXaiHttpsUrl(params.discovery.token_endpoint, 'token_endpoint'), {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'user-agent': `${PACKAGE_NAME}/${PACKAGE_VERSION}` },
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload.error_description === 'string' ? payload.error_description : `Token exchange failed with HTTP ${response.status}`;
    throw new OAuthError(response.status === 403 ? 'oauth_entitlement_required' : 'token_exchange_failed', message, response.status);
  }
  if (typeof payload.access_token !== 'string') throw new OAuthError('missing_access_token', 'Token exchange response did not contain access_token');
  return {
    access_token: payload.access_token,
    refresh_token: typeof payload.refresh_token === 'string' ? payload.refresh_token : undefined,
    id_token: typeof payload.id_token === 'string' ? payload.id_token : undefined,
    expires_at: tokenExpiresAt(payload),
    token_type: typeof payload.token_type === 'string' ? payload.token_type : 'Bearer',
    scope: typeof payload.scope === 'string' ? payload.scope : undefined,
  };
}

export async function persistTokenResponse(params: {
  tokens: StoredOAuthTokens;
  discovery: OAuthDiscovery;
  redirectUri: string;
  baseUrl?: string;
  tokenStorePath?: string;
}): Promise<StoredOAuthState> {
  const state: StoredOAuthState = {
    provider: 'xai-oauth',
    auth_mode: 'oauth_pkce',
    tokens: params.tokens,
    discovery: params.discovery,
    redirect_uri: params.redirectUri,
    base_url: validateInferenceBaseUrl(params.baseUrl || getConfig().oauthBaseUrl),
    last_refresh: new Date().toISOString(),
  };
  await saveOAuthState(state, params.tokenStorePath);
  return state;
}

export async function refreshOAuthState(state: StoredOAuthState, options: { force?: boolean; fetchImpl?: typeof fetch; tokenStorePath?: string } = {}): Promise<StoredOAuthState> {
  if (!options.force && !isTokenExpiring(state.tokens)) return state;
  if (!state.tokens.refresh_token) throw new OAuthError('missing_refresh_token', 'OAuth token has no refresh_token; run grok_login again');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: getConfig().oauthClientId || DEFAULT_XAI_OAUTH_CLIENT_ID,
    refresh_token: state.tokens.refresh_token,
  });
  const response = await (options.fetchImpl || fetch)(validateXaiHttpsUrl(state.discovery.token_endpoint, 'token_endpoint'), {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'user-agent': `${PACKAGE_NAME}/${PACKAGE_VERSION}` },
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const code = response.status === 403 ? 'oauth_entitlement_required' : response.status === 400 || response.status === 401 ? 'invalid_grant' : 'refresh_failed';
    if (code === 'invalid_grant' || code === 'oauth_entitlement_required') await markOAuthInvalid(code, options.tokenStorePath);
    throw new OAuthError(code, typeof payload.error_description === 'string' ? payload.error_description : `OAuth refresh failed with HTTP ${response.status}`, response.status);
  }
  if (typeof payload.access_token !== 'string') throw new OAuthError('missing_access_token', 'OAuth refresh response did not contain access_token');
  const next: StoredOAuthState = {
    ...state,
    invalid: false,
    last_auth_error: undefined,
    last_refresh: new Date().toISOString(),
    tokens: {
      access_token: payload.access_token,
      refresh_token: typeof payload.refresh_token === 'string' ? payload.refresh_token : state.tokens.refresh_token,
      id_token: typeof payload.id_token === 'string' ? payload.id_token : state.tokens.id_token,
      expires_at: tokenExpiresAt(payload),
      token_type: typeof payload.token_type === 'string' ? payload.token_type : 'Bearer',
      scope: typeof payload.scope === 'string' ? payload.scope : state.tokens.scope,
    },
  };
  await saveOAuthState(next, options.tokenStorePath);
  return next;
}

export async function waitForLoopbackCode(session: LoginSession, timeoutMs: number): Promise<string> {
  const redirect = new URL(session.redirectUri);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new OAuthError('callback_timeout', 'Timed out waiting for OAuth loopback callback'));
    }, timeoutMs);
    const server = http.createServer((req, res) => {
      try {
        const parsed = new URL(req.url || '/', session.redirectUri);
        const { code } = parseCallback(parsed.toString(), session.state);
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('Grok login complete. You can close this tab.');
        clearTimeout(timer);
        server.close();
        resolve(code);
      } catch (error) {
        res.writeHead(400, { 'content-type': 'text/plain' });
        res.end((error as Error).message);
      }
    });
    server.listen(Number(redirect.port), redirect.hostname, () => undefined);
    server.on('error', reject);
  });
}
