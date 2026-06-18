import { DEFAULT_XAI_BASE_URL, PACKAGE_NAME, PACKAGE_VERSION } from '../config/constants.js';
import { resolveCredentials, ResolvedCredentials, redactSecret } from '../auth/credentials.js';
import { validateInferenceBaseUrl } from '../auth/oauth.js';

export type XaiClientOptions = {
  fetchImpl?: typeof fetch;
  credentials?: ResolvedCredentials;
  env?: NodeJS.ProcessEnv;
};

export class XaiError extends Error {
  constructor(public code: string, message: string, public status?: number, public details?: unknown) {
    super(redactSecret(message));
    this.name = 'XaiError';
  }
}

export class XaiClient {
  constructor(private options: XaiClientOptions = {}) {}

  async json(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}, retrying = false): Promise<{ data: unknown; credentials: ResolvedCredentials }> {
    const credentials = this.options.credentials || (await resolveCredentials({ fetchImpl: this.options.fetchImpl, env: this.options.env }));
    const baseUrl = credentials.provider === 'xai-oauth' ? validateInferenceBaseUrl(credentials.baseUrl) : (credentials.baseUrl || DEFAULT_XAI_BASE_URL).replace(/\/$/, '');
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const controller = new AbortController();
    const timer = init.timeoutMs ? setTimeout(() => controller.abort(), init.timeoutMs) : undefined;
    const response = await (this.options.fetchImpl || fetch)(url, {
      method: init.method || 'GET',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: credentials.authorization,
        'user-agent': `${PACKAGE_NAME}/${PACKAGE_VERSION}`,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    }).finally(() => timer && clearTimeout(timer));
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && credentials.provider === 'xai-oauth' && !retrying && !this.options.credentials) {
      await resolveCredentials({ forceRefresh: true, fetchImpl: this.options.fetchImpl, env: this.options.env });
      return this.json(path, init, true);
    }
    if (!response.ok) {
      const msg = typeof (data as Record<string, unknown>).error === 'string' ? (data as Record<string, string>).error : `xAI request failed with HTTP ${response.status}`;
      throw new XaiError('xai_http_error', msg, response.status, data);
    }
    return { data, credentials };
  }
}

export function extractOutputText(response: unknown): string {
  const obj = response as Record<string, unknown>;
  if (typeof obj.output_text === 'string') return obj.output_text;
  if (Array.isArray(obj.output)) {
    const parts: string[] = [];
    for (const item of obj.output as Array<Record<string, unknown>>) {
      if (typeof item.content === 'string') parts.push(item.content);
      if (Array.isArray(item.content)) {
        for (const content of item.content as Array<Record<string, unknown>>) {
          if (typeof content.text === 'string') parts.push(content.text);
        }
      }
    }
    if (parts.length) return parts.join('\n');
  }
  if (Array.isArray(obj.choices)) {
    const choice = obj.choices[0] as Record<string, unknown> | undefined;
    const message = choice?.message as Record<string, unknown> | undefined;
    if (typeof message?.content === 'string') return message.content;
  }
  return '';
}
