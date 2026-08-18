import { describe, expect, it, vi } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildXSearchPayload, handleXSearch } from '../src/tools/x-search.js';
import { buildImagePayload, handleImageGenerate } from '../src/tools/image-generate.js';
import { buildVideoPayload, handleVideoGenerate } from '../src/tools/video-generate.js';
import { XaiClient } from '../src/xai/client.js';

const credentials = { provider: 'xai' as const, credentialSource: 'xai' as const, authorization: 'Bearer test', baseUrl: 'https://api.x.ai/v1' };

describe('payload builders', () => {
  it('builds official Responses x_search payload', () => {
    const payload = buildXSearchPayload({ query: 'news', include_handles: ['@xai', 'elonmusk'], include_images: true, include_videos: true });
    expect(payload).toMatchObject({
      model: 'grok-4.5',
      input: [{ role: 'user', content: 'news' }],
      include: ['x_search_call'],
      tools: [{
        type: 'x_search',
        allowed_x_handles: ['xai', 'elonmusk'],
        enable_image_understanding: true,
        enable_video_understanding: true,
      }],
    });
    expect(payload.tools[0]).not.toHaveProperty('included_x_handles');
    expect(payload.tools[0]).not.toHaveProperty('search_parameters');
    expect(payload.tools[0]).not.toHaveProperty('max_search_results');
  });

  it('rejects mixing allowed and excluded handles', () => {
    expect(() => buildXSearchPayload({ query: 'q', include_handles: ['xai'], exclude_handles: ['spam'] })).toThrow(/cannot be used together/i);
  });

  it('rejects more than 20 handles', () => {
    const handles = Array.from({ length: 21 }, (_, index) => `user${index}`);
    expect(() => buildXSearchPayload({ query: 'q', include_handles: handles })).toThrow(/at most 20/);
  });

  it('builds image and video payloads', () => {
    expect(buildImagePayload({ prompt: 'cat' }).model).toBe('grok-imagine-image');
    expect(buildVideoPayload({ prompt: 'cat', image_url: 'https://example.com/cat.png' }).model).toContain('1.5');
  });
});

describe('tool handlers', () => {
  it('parses custom_tool_call invocations and annotation citations', async () => {
    const client = {
      json: vi.fn().mockResolvedValue({
        data: {
          id: 'resp-1',
          model: 'grok-4.20-reasoning',
          output: [
            {
              type: 'custom_tool_call',
              name: 'x_keyword_search',
              status: 'completed',
              call_id: 'xs_1',
              input: '{"query":"from:xai","limit":"5","mode":"Latest"}',
            },
            {
              type: 'message',
              content: [{
                type: 'output_text',
                text: 'answer',
                annotations: [{ type: 'url_citation', url: 'https://x.com/a/status/1', title: '1' }],
              }],
            },
          ],
        },
        credentials,
      }),
    } as unknown as XaiClient;
    await expect(handleXSearch({ query: 'q' }, client)).resolves.toMatchObject({
      answer: 'answer',
      citations: ['https://x.com/a/status/1'],
      credential_source: 'xai',
      include: ['x_search_call'],
      search_calls: [{
        type: 'custom_tool_call',
        name: 'x_keyword_search',
        input: { query: 'from:xai', limit: '5', mode: 'Latest' },
      }],
      sources: ['https://x.com/a/status/1'],
    });
  });

  it('retries without include when Responses rejects the include field', async () => {
    const { XaiError } = await import('../src/xai/client.js');
    const client = {
      json: vi.fn()
        .mockRejectedValueOnce(new XaiError('xai_http_error', 'Unknown include field', 400, { error: 'Unknown include field' }))
        .mockResolvedValueOnce({ data: { output_text: 'fallback', citations: [] }, credentials }),
    } as unknown as XaiClient;
    const result = await handleXSearch({ query: 'q' }, client);
    expect(result).toMatchObject({ answer: 'fallback', include_fallback: true, include: [] });
    expect(client.json).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(client.json.mock.calls[1][1].body)).not.toContain('"include"');
  });

  it('handles image b64 output without real network', async () => {
    const cacheDir = path.join(os.tmpdir(), `grok-it-tools-${process.pid}-image-cache`);
    await rm(cacheDir, { recursive: true, force: true });
    await mkdir(cacheDir, { recursive: true });
    vi.stubEnv('GROK_IT_CACHE_DIR', cacheDir);
    const client = { json: vi.fn().mockResolvedValue({ data: { data: [{ b64_json: Buffer.from('png').toString('base64'), mime_type: 'image/png' }] }, credentials }) } as unknown as XaiClient;
    const result = await handleImageGenerate({ prompt: 'q' }, client);
    expect(result.images[0].image).toContain(cacheDir);
    expect(result.images[0].image).toContain('image-');
    vi.unstubAllEnvs();
  });

  it('video returns remote URL by default without downloading', async () => {
    const client = { json: vi.fn().mockResolvedValue({ data: { request_id: 'req', status: 'completed', video_url: 'https://cdn.x.ai/video.mp4' }, credentials }) } as unknown as XaiClient;
    const result = await handleVideoGenerate({ prompt: 'q', timeout_ms: 1000 }, client);
    expect(result).toMatchObject({ video: 'https://cdn.x.ai/video.mp4', remote_url: 'https://cdn.x.ai/video.mp4', request_id: 'req' });
  });

  it('video reads nested URL from xAI deferred video result', async () => {
    const client = {
      json: vi.fn()
        .mockResolvedValueOnce({ data: { request_id: 'req', status: 'pending' }, credentials })
        .mockResolvedValueOnce({ data: { request_id: 'req', status: 'done', video: { url: 'https://vidgen.x.ai/video.mp4', duration: 6 } }, credentials }),
    } as unknown as XaiClient;
    const result = await handleVideoGenerate({ prompt: 'q', poll_interval_ms: 250, timeout_ms: 1000 }, client);
    expect(result).toMatchObject({ video: 'https://vidgen.x.ai/video.mp4', remote_url: 'https://vidgen.x.ai/video.mp4', request_id: 'req', status: 'done' });
  });
});
