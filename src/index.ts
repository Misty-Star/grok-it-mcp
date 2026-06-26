#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { runCliAndExit } from './cli.js';
import { createGrokMcpServer } from './mcp/server.js';

async function main() {
  if (await runCliAndExit()) return;
  const server = createGrokMcpServer();
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
