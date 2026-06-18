import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getConfig } from '../config/env.js';

export type CacheResult = { path: string; bytes: number; contentType?: string };

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

function safeName(prefix: string, content: string, ext: string): string {
  const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 24);
  return `${prefix}-${hash}${ext}`;
}

async function ensureCacheDir(cacheDir = getConfig().cacheDir): Promise<string> {
  await mkdir(cacheDir, { recursive: true });
  return cacheDir;
}

export async function cacheBase64Artifact(data: string, options: { mediaType: 'image' | 'video'; contentType?: string; cacheDir?: string } = { mediaType: 'image' }): Promise<CacheResult> {
  const contentType = options.contentType || (options.mediaType === 'image' ? 'image/png' : 'video/mp4');
  const ext = EXT_BY_TYPE[contentType] || (options.mediaType === 'image' ? '.png' : '.bin');
  const bytes = Buffer.from(data, 'base64');
  const dir = await ensureCacheDir(options.cacheDir);
  const filePath = path.join(dir, safeName(options.mediaType, data, ext));
  await writeFile(filePath, bytes, { mode: 0o600 });
  return { path: filePath, bytes: bytes.length, contentType };
}

export async function cacheUrlArtifact(url: string, options: { mediaType: 'image' | 'video'; cacheDir?: string; maxBytes?: number; fetchImpl?: typeof fetch } = { mediaType: 'image' }): Promise<CacheResult> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Only https artifact URLs can be cached');
  const response = await (options.fetchImpl || fetch)(url);
  if (!response.ok) throw new Error(`Artifact download failed with HTTP ${response.status}`);
  const contentType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!contentType.startsWith(`${options.mediaType}/`)) throw new Error(`Unexpected artifact content type: ${contentType || 'unknown'}`);
  const limit = options.maxBytes || getConfig().maxDownloadBytes;
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Artifact response has no body');
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) throw new Error(`Artifact exceeds max download size (${limit} bytes)`);
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  const ext = EXT_BY_TYPE[contentType] || (options.mediaType === 'image' ? '.img' : '.video');
  const dir = await ensureCacheDir(options.cacheDir);
  const filePath = path.join(dir, safeName(options.mediaType, url, ext));
  await writeFile(filePath, bytes, { mode: 0o600 });
  return { path: filePath, bytes: total, contentType };
}
