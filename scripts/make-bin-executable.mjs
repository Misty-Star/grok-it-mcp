import { chmod } from 'node:fs/promises';
await chmod('dist/index.js', 0o755).catch(() => {});
