import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createGrokMcpServer } from '../src/mcp/server.js';

describe('MCP server', () => {
  it('lists all Grok tools', async () => {
    const server = createGrokMcpServer();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    expect(names).toEqual(['grok_auth_status', 'grok_image_generate', 'grok_login', 'grok_video_generate', 'grok_x_search']);
    await client.close();
    await server.close();
  });
});
