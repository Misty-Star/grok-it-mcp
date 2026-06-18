import { z } from 'zod';
import { DEFAULT_X_SEARCH_MODEL } from '../config/constants.js';
import { XaiClient, extractOutputText } from '../xai/client.js';

export const xSearchSchema = {
  query: z.string().min(1).describe('Search question or query for X.'),
  model: z.string().default(DEFAULT_X_SEARCH_MODEL).optional(),
  from_date: z.string().optional().describe('Optional inclusive YYYY-MM-DD lower date bound.'),
  to_date: z.string().optional().describe('Optional inclusive YYYY-MM-DD upper date bound.'),
  include_handles: z.array(z.string()).optional(),
  exclude_handles: z.array(z.string()).optional(),
  include_images: z.boolean().optional(),
  include_videos: z.boolean().optional(),
  max_results: z.number().int().min(1).max(50).optional(),
};

export type XSearchArgs = z.objectOutputType<typeof xSearchSchema, z.ZodTypeAny>;

export function buildXSearchPayload(args: XSearchArgs) {
  const tool: Record<string, unknown> = { type: 'x_search' };
  if (args.from_date) tool.from_date = args.from_date;
  if (args.to_date) tool.to_date = args.to_date;
  if (args.include_handles?.length) tool.included_x_handles = args.include_handles;
  if (args.exclude_handles?.length) tool.excluded_x_handles = args.exclude_handles;
  if (args.include_images !== undefined || args.include_videos !== undefined) {
    tool.search_parameters = { include_images: Boolean(args.include_images), include_videos: Boolean(args.include_videos) };
  }
  if (args.max_results) tool.max_search_results = args.max_results;
  return {
    model: args.model || DEFAULT_X_SEARCH_MODEL,
    input: args.query,
    tools: [tool],
  };
}

export async function handleXSearch(args: XSearchArgs, client = new XaiClient()) {
  const { data, credentials } = await client.json('/responses', { method: 'POST', body: buildXSearchPayload(args) });
  const obj = data as Record<string, unknown>;
  return {
    answer: extractOutputText(data),
    citations: Array.isArray(obj.citations) ? obj.citations : [],
    raw_id: obj.id ?? null,
    model: obj.model ?? args.model ?? DEFAULT_X_SEARCH_MODEL,
    credential_source: credentials.credentialSource,
    degraded: !extractOutputText(data),
  };
}
