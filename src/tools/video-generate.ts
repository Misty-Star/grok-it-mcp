import { z } from 'zod';
import { DEFAULT_POLL_INTERVAL_MS, DEFAULT_VIDEO_IMAGE_MODEL, DEFAULT_VIDEO_MODEL, DEFAULT_VIDEO_TIMEOUT_MS } from '../config/constants.js';
import { getConfig } from '../config/env.js';
import { cacheUrlArtifact } from '../cache/artifacts.js';
import { XaiClient } from '../xai/client.js';

export const videoGenerateSchema = {
  prompt: z.string().min(1),
  model: z.string().optional(),
  image_url: z.string().url().optional(),
  reference_images: z.array(z.string().url()).optional(),
  duration: z.number().int().min(1).max(30).optional(),
  aspect_ratio: z.string().optional(),
  resolution: z.string().optional(),
  poll_interval_ms: z.number().int().min(250).max(30000).default(DEFAULT_POLL_INTERVAL_MS).optional(),
  timeout_ms: z.number().int().min(1000).max(30 * 60_000).default(DEFAULT_VIDEO_TIMEOUT_MS).optional(),
  cache_video: z.boolean().optional(),
};

export type VideoGenerateArgs = z.objectOutputType<typeof videoGenerateSchema, z.ZodTypeAny>;

export function defaultVideoModel(args: VideoGenerateArgs): string {
  return args.model || (args.image_url || args.reference_images?.length ? DEFAULT_VIDEO_IMAGE_MODEL : DEFAULT_VIDEO_MODEL);
}

export function buildVideoPayload(args: VideoGenerateArgs) {
  return {
    model: defaultVideoModel(args),
    prompt: args.prompt,
    ...(args.image_url ? { image_url: args.image_url } : {}),
    ...(args.reference_images?.length ? { reference_images: args.reference_images } : {}),
    ...(args.duration ? { duration: args.duration } : {}),
    ...(args.aspect_ratio ? { aspect_ratio: args.aspect_ratio } : {}),
    ...(args.resolution ? { resolution: args.resolution } : {}),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusOf(data: unknown): string {
  const obj = data as Record<string, unknown>;
  return String(obj.status || obj.state || obj.phase || '').toLowerCase();
}

function videoUrlOf(data: unknown): string | undefined {
  const obj = data as Record<string, unknown>;
  if (typeof obj.video_url === 'string') return obj.video_url;
  if (typeof obj.url === 'string') return obj.url;
  if (Array.isArray(obj.data)) {
    const first = obj.data[0] as Record<string, unknown> | undefined;
    if (typeof first?.url === 'string') return first.url;
    if (typeof first?.video_url === 'string') return first.video_url;
  }
  return undefined;
}

export async function handleVideoGenerate(args: VideoGenerateArgs, client = new XaiClient(), fetchImpl?: typeof fetch) {
  const { data: submitted, credentials } = await client.json('/videos/generations', { method: 'POST', body: buildVideoPayload(args) });
  const submitObj = submitted as Record<string, unknown>;
  const requestId = String(submitObj.request_id || submitObj.id || '');
  if (!requestId) throw new Error('xAI video response did not contain request_id');
  const deadline = Date.now() + (args.timeout_ms || DEFAULT_VIDEO_TIMEOUT_MS);
  let last = submitted;
  for (;;) {
    const status = statusOf(last);
    const directUrl = videoUrlOf(last);
    if (directUrl || ['done', 'completed', 'succeeded', 'success'].includes(status)) {
      const remoteUrl = directUrl || videoUrlOf(last);
      if (!remoteUrl) throw new Error('xAI video completed without a video URL');
      const shouldCache = args.cache_video ?? getConfig().cacheVideoByDefault;
      if (shouldCache) {
        try {
          const cached = await cacheUrlArtifact(remoteUrl, { mediaType: 'video', cacheDir: getConfig().cacheDir, fetchImpl });
          return { video: cached.path, remote_url: remoteUrl, request_id: requestId, status: status || 'completed', bytes: cached.bytes, content_type: cached.contentType, credential_source: credentials.credentialSource };
        } catch (error) {
          return { video: remoteUrl, remote_url: remoteUrl, request_id: requestId, status: status || 'completed', cache_warning: (error as Error).message, credential_source: credentials.credentialSource };
        }
      }
      return { video: remoteUrl, remote_url: remoteUrl, request_id: requestId, status: status || 'completed', credential_source: credentials.credentialSource };
    }
    if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) throw new Error(`xAI video generation failed: ${JSON.stringify(last)}`);
    if (Date.now() >= deadline) return { request_id: requestId, status: status || 'pending', timeout: true, remote_url: null, video: null, credential_source: credentials.credentialSource };
    await sleep(args.poll_interval_ms || DEFAULT_POLL_INTERVAL_MS);
    last = (await client.json(`/videos/${encodeURIComponent(requestId)}`, { method: 'GET' })).data;
  }
}
