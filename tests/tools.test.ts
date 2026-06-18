import { describe, expect, it, vi } from 'vitest';
import { buildXSearchPayload, handleXSearch } from '../src/tools/x-search.js';
import { buildImagePayload, handleImageGenerate } from '../src/tools/image-generate.js';
import { buildVideoPayload, handleVideoGenerate } from '../src/tools/video-generate.js';
import { XaiClient } from '../src/xai/client.js';

const credentials = { provider: 'xai' as const, credentialSource: 'xai' as const, authorization: 'Bearer test', baseUrl: 'https://api.x.ai/v1' };

describe('payload builders', () => {
  it('builds x_search responses payload', () => {
    const payload = buildXSearchPayload({ query: 'news', include_handles: ['xai'], include_images: true, include_videos: false });
    expect(payload.tools[0]).toMatchObject({ type: 'x_search', included_x_handles: ['xai'] });
    expect(payload.input).toBe('news');
  });

  it('builds image and video payloads', () => {
    expect(buildImagePayload({ prompt: 'cat' }).model).toBe('grok-imagine-image');
    expect(buildVideoPayload({ prompt: 'cat', image_url: 'https://example.com/cat.png' }).model).toContain('1.5');
  });
});

describe('tool handlers', () => {
  it('parses x_search answer', async () => {
    const client = { json: vi.fn().mockResolvedValue({ data: { output_text: 'answer', citations: ['https://x.com/a'] }, credentials }) } as unknown as XaiClient;
    await expect(handleXSearch({ query: 'q' }, client)).resolves.toMatchObject({ answer: 'answer', credential_source: 'xai' });
  });

  it('handles image b64 output without real network', async () => {
    const client = { json: vi.fn().mockResolvedValue({ data: { data: [{ b64_json: Buffer.from('png').toString('base64'), mime_type: 'image/png' }] }, credentials }) } as unknown as XaiClient;
    const result = await handleImageGenerate({ prompt: 'q' }, client);
    expect(result.images[0].image).toContain('image-');
  });

  it('video returns remote URL by default without downloading', async () => {
    const client = { json: vi.fn().mockResolvedValue({ data: { request_id: 'req', status: 'completed', video_url: 'https://cdn.x.ai/video.mp4' }, credentials }) } as unknown as XaiClient;
    const result = await handleVideoGenerate({ prompt: 'q', timeout_ms: 1000 }, client);
    expect(result).toMatchObject({ video: 'https://cdn.x.ai/video.mp4', remote_url: 'https://cdn.x.ai/video.mp4', request_id: 'req' });
  });
});
