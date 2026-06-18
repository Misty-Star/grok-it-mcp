import { z } from 'zod';
import { DEFAULT_IMAGE_MODEL } from '../config/constants.js';
import { getConfig } from '../config/env.js';
import { cacheBase64Artifact, cacheUrlArtifact } from '../cache/artifacts.js';
import { XaiClient } from '../xai/client.js';

export const imageGenerateSchema = {
  prompt: z.string().min(1),
  model: z.string().default(DEFAULT_IMAGE_MODEL).optional(),
  aspect_ratio: z.string().optional(),
  resolution: z.string().optional(),
  n: z.number().int().min(1).max(4).default(1).optional(),
  cache: z.boolean().default(true).optional(),
};

export type ImageGenerateArgs = z.objectOutputType<typeof imageGenerateSchema, z.ZodTypeAny>;

export function buildImagePayload(args: ImageGenerateArgs) {
  return {
    model: args.model || DEFAULT_IMAGE_MODEL,
    prompt: args.prompt,
    n: args.n || 1,
    ...(args.aspect_ratio ? { aspect_ratio: args.aspect_ratio } : {}),
    ...(args.resolution ? { resolution: args.resolution } : {}),
  };
}

export async function handleImageGenerate(args: ImageGenerateArgs, client = new XaiClient(), fetchImpl?: typeof fetch) {
  const { data, credentials } = await client.json('/images/generations', { method: 'POST', body: buildImagePayload(args) });
  const images = ((data as Record<string, unknown>).data || []) as Array<Record<string, unknown>>;
  if (!Array.isArray(images) || images.length === 0) throw new Error('xAI image response did not contain data[]');
  const outputs = [];
  for (const image of images) {
    const contentType = typeof image.mime_type === 'string' ? image.mime_type : 'image/png';
    if (args.cache !== false && typeof image.b64_json === 'string') {
      const cached = await cacheBase64Artifact(image.b64_json, { mediaType: 'image', contentType, cacheDir: getConfig().cacheDir });
      outputs.push({ image: cached.path, bytes: cached.bytes, content_type: cached.contentType, revised_prompt: image.revised_prompt ?? null });
    } else if (args.cache !== false && typeof image.url === 'string') {
      const cached = await cacheUrlArtifact(image.url, { mediaType: 'image', cacheDir: getConfig().cacheDir, fetchImpl });
      outputs.push({ image: cached.path, remote_url: image.url, bytes: cached.bytes, content_type: cached.contentType, revised_prompt: image.revised_prompt ?? null });
    } else {
      outputs.push({ image: typeof image.url === 'string' ? image.url : null, remote_url: image.url ?? null, revised_prompt: image.revised_prompt ?? null });
    }
  }
  return { images: outputs, model: (data as Record<string, unknown>).model ?? args.model ?? DEFAULT_IMAGE_MODEL, credential_source: credentials.credentialSource };
}
