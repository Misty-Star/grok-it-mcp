import { z } from 'zod';
import { DEFAULT_X_SEARCH_MODEL } from '../config/constants.js';
import { XaiClient, XaiError, extractOutputText } from '../xai/client.js';

export const MAX_X_HANDLES = 20;
export const X_SEARCH_INCLUDE = ['x_search_call'] as const;
const X_SEARCH_TOOL_NAMES = new Set(['x_keyword_search', 'x_semantic_search', 'x_thread_fetch', 'x_user_search']);

export const xSearchSchema = {
  query: z.string().min(1).describe('Search question or query for X.'),
  model: z.string().default(DEFAULT_X_SEARCH_MODEL).optional(),
  from_date: z.string().optional().describe('Optional inclusive YYYY-MM-DD lower date bound.'),
  to_date: z.string().optional().describe('Optional inclusive YYYY-MM-DD upper date bound.'),
  include_handles: z.array(z.string()).optional().describe('Only consider posts from these X handles (max 20). Cannot be combined with exclude_handles.'),
  exclude_handles: z.array(z.string()).optional().describe('Exclude posts from these X handles (max 20). Cannot be combined with include_handles.'),
  include_images: z.boolean().optional().describe('Enable analysis of images in X posts (enable_image_understanding).'),
  include_videos: z.boolean().optional().describe('Enable analysis of videos in X posts (enable_video_understanding).'),
};

export type XSearchArgs = z.objectOutputType<typeof xSearchSchema, z.ZodTypeAny>;

function normalizeHandles(handles: string[] | undefined, fieldName: string): string[] {
  const cleaned = (handles || []).map((handle) => handle.trim().replace(/^@/, '')).filter(Boolean);
  if (cleaned.length > MAX_X_HANDLES) throw new Error(`${fieldName} supports at most ${MAX_X_HANDLES} handles`);
  return cleaned;
}

export function buildXSearchPayload(args: XSearchArgs) {
  const allowed = normalizeHandles(args.include_handles, 'include_handles');
  const excluded = normalizeHandles(args.exclude_handles, 'exclude_handles');
  if (allowed.length && excluded.length) throw new Error('include_handles and exclude_handles cannot be used together');

  const tool: Record<string, unknown> = { type: 'x_search' };
  if (args.from_date) tool.from_date = args.from_date;
  if (args.to_date) tool.to_date = args.to_date;
  if (allowed.length) tool.allowed_x_handles = allowed;
  if (excluded.length) tool.excluded_x_handles = excluded;
  if (args.include_images) tool.enable_image_understanding = true;
  if (args.include_videos) tool.enable_video_understanding = true;
  return {
    model: args.model || DEFAULT_X_SEARCH_MODEL,
    input: [{ role: 'user', content: args.query }],
    include: [...X_SEARCH_INCLUDE],
    tools: [tool],
  };
}

function parseToolInput(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

function isXSearchCall(item: Record<string, unknown>): boolean {
  const type = typeof item.type === 'string' ? item.type : '';
  const name = typeof item.name === 'string' ? item.name : '';
  return type.includes('x_search') || (type === 'custom_tool_call' && X_SEARCH_TOOL_NAMES.has(name));
}

export function extractXSearchCalls(response: unknown): Record<string, unknown>[] {
  const obj = response as Record<string, unknown>;
  if (!Array.isArray(obj.output)) return [];
  return (obj.output as Array<Record<string, unknown>>).filter(isXSearchCall).map((item) => ({
    type: item.type,
    name: item.name,
    status: item.status,
    call_id: item.call_id ?? item.id ?? null,
    input: parseToolInput(item.input ?? (item.action as Record<string, unknown> | undefined)?.query ?? item.action),
  }));
}

export function extractXSearchCitations(response: unknown): string[] {
  const obj = response as Record<string, unknown>;
  const urls: string[] = [];
  if (Array.isArray(obj.citations)) {
    for (const citation of obj.citations) {
      if (typeof citation === 'string') urls.push(citation);
    }
  }
  if (Array.isArray(obj.output)) {
    for (const item of obj.output as Array<Record<string, unknown>>) {
      const contents = Array.isArray(item.content) ? item.content as Array<Record<string, unknown>> : [];
      for (const content of contents) {
        const annotations = Array.isArray(content.annotations) ? content.annotations as Array<Record<string, unknown>> : [];
        for (const annotation of annotations) {
          if (annotation.type === 'url_citation' && typeof annotation.url === 'string') urls.push(annotation.url);
        }
      }
    }
  }
  return [...new Set(urls)];
}

export function extractXSearchSources(response: unknown): unknown[] {
  const sources: unknown[] = [];
  const obj = response as Record<string, unknown>;
  if (Array.isArray(obj.output)) {
    for (const item of obj.output as Array<Record<string, unknown>>) {
      if (!isXSearchCall(item)) continue;
      const action = item.action as Record<string, unknown> | undefined;
      const candidates = [action?.sources, action?.results, action?.posts, item.sources, item.results, item.output];
      for (const candidate of candidates) {
        if (Array.isArray(candidate) && candidate.length) {
          sources.push(...candidate);
          break;
        }
      }
    }
  }
  if (sources.length) return sources;
  return extractXSearchCitations(response);
}

function isIncludeRejected(error: unknown): boolean {
  if (!(error instanceof XaiError) || error.status !== 400) return false;
  const haystack = `${error.message} ${JSON.stringify(error.details ?? '')}`.toLowerCase();
  return haystack.includes('include');
}

function formatXSearchResult(data: unknown, args: XSearchArgs, credentialSource: string, include: string[], includeFallback = false) {
  const obj = data as Record<string, unknown>;
  const answer = extractOutputText(data);
  return {
    answer,
    citations: extractXSearchCitations(data),
    raw_id: obj.id ?? null,
    model: obj.model ?? args.model ?? DEFAULT_X_SEARCH_MODEL,
    credential_source: credentialSource,
    degraded: !answer,
    include,
    include_fallback: includeFallback,
    search_calls: extractXSearchCalls(data),
    sources: extractXSearchSources(data),
  };
}

export async function handleXSearch(args: XSearchArgs, client = new XaiClient()) {
  const payload = buildXSearchPayload(args);
  try {
    const { data, credentials } = await client.json('/responses', { method: 'POST', body: payload });
    return formatXSearchResult(data, args, credentials.credentialSource, payload.include);
  } catch (error) {
    if (!isIncludeRejected(error)) throw error;
    const { include: _include, ...withoutInclude } = payload;
    const { data, credentials } = await client.json('/responses', { method: 'POST', body: withoutInclude });
    return formatXSearchResult(data, args, credentials.credentialSource, [], true);
  }
}
