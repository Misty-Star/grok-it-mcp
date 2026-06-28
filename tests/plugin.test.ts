import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import packageJson from '../package.json' with { type: 'json' };

describe('plugin MCP configuration', () => {
  it('launches the current MCP package without literal HOME path overrides', async () => {
    const mcp = JSON.parse(await readFile('plugins/grok-it/.mcp.json', 'utf8'));
    const server = mcp.mcpServers?.['grok-it'];

    expect(server).toMatchObject({
      command: 'npx',
      args: ['-y', `grok-it-mcp@${packageJson.version}`],
    });
    expect(server.env?.GROK_IT_TOKEN_STORE).toBeUndefined();
    expect(server.env?.GROK_IT_CACHE_DIR).toBeUndefined();
  });
});
