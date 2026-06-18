import { cp, mkdir, rm } from 'node:fs/promises';

await rm('claude-plugin/dist', { recursive: true, force: true });
await mkdir('claude-plugin/dist', { recursive: true });
await cp('dist', 'claude-plugin/dist', { recursive: true });
