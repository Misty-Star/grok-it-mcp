import { readFile, stat } from 'node:fs/promises';
const manifest = JSON.parse(await readFile('claude-plugin/.claude-plugin/plugin.json', 'utf8'));
for (const key of ['name', 'version', 'description']) {
  if (!manifest[key]) throw new Error(`Claude plugin manifest missing ${key}`);
}
await stat('claude-plugin/.mcp.json');
await stat('claude-plugin/skills/grok-tools/SKILL.md');
const mcp = JSON.parse(await readFile('claude-plugin/.mcp.json', 'utf8'));
if (!mcp.mcpServers?.['grok-it']?.command) throw new Error('Claude .mcp.json missing grok-it stdio command');
const args = mcp.mcpServers['grok-it'].args || [];
if (!args.includes('${CLAUDE_PLUGIN_ROOT}/dist/index.js')) throw new Error('Claude .mcp.json must point to bundled plugin-root dist/index.js');
await stat('claude-plugin/dist/index.js');
console.log('Claude plugin static validation passed');
