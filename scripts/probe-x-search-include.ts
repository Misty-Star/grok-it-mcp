/**
 * Live-probe Responses `include` values for x_search.
 *
 * Node fetch ignores HTTP(S)_PROXY unless env proxy support is on:
 *   HTTPS_PROXY=http://127.0.0.1:7890 NODE_USE_ENV_PROXY=1 npm run build
 *   HTTPS_PROXY=http://127.0.0.1:7890 NODE_USE_ENV_PROXY=1 node --experimental-strip-types scripts/probe-x-search-include.ts
 */
import { writeFile } from 'node:fs/promises';
import { XaiClient, XaiError } from '../dist/xai/client.js';

const INCLUDE_VARIANTS: Array<string[] | undefined> = [
  undefined,
  ['x_search_call'],
  ['x_search_call_output'],
  ['x_search_call.action.sources'],
];

function summarize(data: unknown) {
  const obj = (data && typeof data === 'object') ? data as Record<string, unknown> : {};
  const output = Array.isArray(obj.output) ? obj.output as Array<Record<string, unknown>> : [];
  const xSearchItems = output.filter((item) => typeof item?.type === 'string' && String(item.type).includes('x_search'));
  return {
    top_level_keys: Object.keys(obj).sort(),
    output_types: output.map((item) => item?.type ?? null),
    x_search_item_count: xSearchItems.length,
    x_search_item_keys: xSearchItems.map((item) => Object.keys(item).sort()),
    x_search_items: xSearchItems,
    citations: obj.citations ?? null,
    has_output_text: typeof obj.output_text === 'string' && obj.output_text.length > 0,
    output_text_preview: typeof obj.output_text === 'string' ? obj.output_text.slice(0, 240) : null,
  };
}

async function main() {
  const client = new XaiClient();
  const results: unknown[] = [];
  for (const include of INCLUDE_VARIANTS) {
    const label = include ? include.join(',') : '(none)';
    const body: Record<string, unknown> = {
      model: process.env.GROK_IT_PROBE_MODEL || 'grok-4.6',
      input: [{ role: 'user', content: 'What did @xai post most recently?' }],
      tools: [{ type: 'x_search', allowed_x_handles: ['xai'] }],
    };
    if (include) body.include = include;
    try {
      const { data, credentials } = await client.json('/responses', { method: 'POST', body, timeoutMs: 180_000 });
      results.push({ label, ok: true, credential_source: credentials.credentialSource, summary: summarize(data) });
      console.log(JSON.stringify({ label, ok: true, summary: summarize(data) }, null, 2));
    } catch (error) {
      const err = error instanceof XaiError
        ? { name: error.name, code: error.code, status: error.status, message: error.message, details: error.details }
        : { message: error instanceof Error ? error.message : String(error) };
      results.push({ label, ok: false, error: err });
      console.log(JSON.stringify({ label, ok: false, error: err }, null, 2));
    }
  }
  const out = process.env.GROK_IT_PROBE_OUT || '/tmp/grok-it-x-search-include-probe.json';
  await writeFile(out, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`wrote ${out}`);
}

await main();
