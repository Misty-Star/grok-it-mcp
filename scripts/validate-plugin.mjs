import { readFile, stat } from 'node:fs/promises';

const pluginRoot = 'plugins/grok-it';
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const expectedPackage = `${packageJson.name}@${packageJson.version}`;
const manifest = JSON.parse(await readFile(`${pluginRoot}/.claude-plugin/plugin.json`, 'utf8'));
for (const key of ['name', 'version', 'description']) {
  if (!manifest[key]) throw new Error(`Claude plugin manifest missing ${key}`);
}
if (manifest.skills !== './skills/') throw new Error('Claude plugin manifest must reference shared ./skills/');
if (manifest.mcpServers !== './.mcp.json') throw new Error('Claude plugin manifest must reference shared ./.mcp.json');

await stat(`${pluginRoot}/.codex-plugin/plugin.json`);
await stat(`${pluginRoot}/.mcp.json`);
await stat(`${pluginRoot}/skills/grok-tools/SKILL.md`);

const mcp = JSON.parse(await readFile(`${pluginRoot}/.mcp.json`, 'utf8'));
const server = mcp.mcpServers?.['grok-it'];
if (!server?.command) throw new Error('Shared .mcp.json missing grok-it stdio command');
if (server.command !== 'npx') throw new Error('Shared .mcp.json must launch grok-it-mcp via npx for npm CLI distribution');
const args = server.args || [];
if (!args.includes(expectedPackage)) throw new Error(`Shared .mcp.json must pin ${expectedPackage}`);
if (server.env?.GROK_IT_TOKEN_STORE || server.env?.GROK_IT_CACHE_DIR) throw new Error('Shared .mcp.json must not override default paths with literal placeholders');
console.log('Cross-platform Claude plugin static validation passed');
