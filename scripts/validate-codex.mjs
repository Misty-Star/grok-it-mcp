import { readFile, stat } from 'node:fs/promises';
import toml from 'toml';
import YAML from 'yaml';
const config = toml.parse(await readFile('codex/config.example.toml', 'utf8'));
if (!config.mcp_servers?.['grok-it']?.command) throw new Error('Codex config missing mcp_servers.grok-it.command');
const meta = YAML.parse(await readFile('codex/skills/grok-tools/agents/openai.yaml', 'utf8'));
if (!meta.display_name || !meta.short_description || !meta.default_prompt) throw new Error('Codex openai.yaml missing UI fields');
await stat('codex/skills/grok-tools/SKILL.md');
console.log('Codex static validation passed');
