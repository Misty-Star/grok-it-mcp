import { readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';

const pluginRoot = 'plugins/grok-it';
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const expectedPackage = `${packageJson.name}@${packageJson.version}`;
const validator = '/home/misty/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py';

const result = spawnSync('python3', [validator, pluginRoot], { encoding: 'utf8' });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) {
  throw new Error(`Codex plugin official validation failed with status ${result.status}`);
}

const manifest = JSON.parse(await readFile(`${pluginRoot}/.codex-plugin/plugin.json`, 'utf8'));
if (manifest.name !== 'grok-it') throw new Error('Codex plugin manifest name must be grok-it');
if (manifest.skills !== './skills/') throw new Error('Codex plugin manifest must reference ./skills/');
if (manifest.mcpServers !== './.mcp.json') throw new Error('Codex plugin manifest must reference ./.mcp.json');

const mcp = JSON.parse(await readFile(`${pluginRoot}/.mcp.json`, 'utf8'));
const server = mcp.mcpServers?.['grok-it'];
if (!server?.command) throw new Error('Codex plugin .mcp.json missing grok-it command');
if (server.command !== 'npx') throw new Error('Codex plugin .mcp.json must launch grok-it-mcp via npx for npm CLI distribution');
const args = server.args || [];
if (!args.includes(expectedPackage)) {
  throw new Error(`Codex plugin .mcp.json must pin ${expectedPackage}`);
}
if (server.env?.GROK_IT_TOKEN_STORE || server.env?.GROK_IT_CACHE_DIR) {
  throw new Error('Codex plugin .mcp.json must not override default paths with literal placeholders');
}

const agent = YAML.parse(await readFile(`${pluginRoot}/skills/grok-tools/agents/openai.yaml`, 'utf8'));
if (!agent.interface?.display_name || !agent.interface?.short_description || !agent.interface?.default_prompt) {
  throw new Error('Codex plugin openai.yaml missing interface UI fields');
}
if (!Array.isArray(agent.dependencies?.tools) || !agent.dependencies.tools.includes('grok_video_generate')) {
  throw new Error('Codex plugin openai.yaml must declare Grok MCP tool dependencies');
}
await stat(`${pluginRoot}/skills/grok-tools/SKILL.md`);
console.log('Codex plugin static validation passed');
