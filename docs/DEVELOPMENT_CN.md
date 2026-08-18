# 开发指南

本仓库一份检出里有两件事：

- **`grok-it-mcp`**：仓库根目录的 Node CLI / stdio MCP server（`src/`，发布到 npm）。
- **`grok-it` 插件**：`plugins/grok-it` 下的 Claude Code / Codex 插件（清单、`.mcp.json`、skills）。

线上安装走 `plugins/grok-it/.mcp.json` 里的 `npx grok-it-mcp@<version>`。本地加载插件时，Agent 仍然用这条命令拉起 MCP，所以只有把这条命令指到当前检出，本地构建才会进到 Agent。

## 环境

- Node.js 20 或更高
- npm
- git
- 测插件需要 [Claude Code](https://code.claude.com/docs) 和/或 [Codex CLI](https://developers.openai.com/plugins/build/plugins)

## 克隆与构建

```bash
git clone https://github.com/Misty-Star/grok-it-mcp.git
cd grok-it-mcp
npm install
npm run build
```

`npm run build` 会把 TypeScript 编到 `dist/`，并把 `dist/index.js` 标成可执行。这个文件就是 `grok-it-mcp` 入口。

## 本地运行 CLI

构建完成后在仓库根目录：

```bash
node dist/index.js --help
node dist/index.js status
node dist/index.js login --open
node dist/index.js search "xAI news" --json
```

不带参数时启动 stdio MCP server（Claude Code / Codex 也是这样拉起的）：

```bash
node dist/index.js
```

要把 `grok-it-mcp` 挂到本机 `PATH`：

```bash
npm link
grok-it-mcp status
```

`npm link` 把当前工作树装成全局命令。改源码后重新 `npm run build` 即可，一般不用再 link。

远程 / 无头登录和正式版一样。OAuth loopback 监听 `127.0.0.1:8153`：

```bash
ssh -N -L 8153:127.0.0.1:8153 user@remote-host
node dist/index.js login --loopback
```

默认本地路径（和正式包相同）：

- Token：`~/.grok-it/auth.json`
- 生成物：`~/.grok-it/artifacts`

如果本机默认路由到不了 `api.x.ai` / `auth.x.ai`，Node 的 `fetch` 默认不走 `HTTP_PROXY`，需要打开环境代理：

```bash
export HTTPS_PROXY=http://127.0.0.1:7890
export HTTP_PROXY=http://127.0.0.1:7890
export NODE_USE_ENV_PROXY=1
node dist/index.js status
```

## 让插件 MCP 用这份检出

`plugins/grok-it/.mcp.json` 钉的是 npm 正式包：

```json
{
  "mcpServers": {
    "grok-it": {
      "command": "npx",
      "args": ["-y", "grok-it-mcp@0.4.0"]
    }
  }
}
```

`npx -y grok-it-mcp@0.4.0` 会拉 registry 上的包，**不会**用当前仓库的 `dist/`。

本地给 Agent 试的时候，把该文件临时改成已构建的二进制（不要提交）：

```json
{
  "mcpServers": {
    "grok-it": {
      "command": "node",
      "args": ["/ABS/PATH/TO/grok-it-mcp/dist/index.js"]
    }
  }
}
```

或者在 `npm link` 之后：

```json
{
  "mcpServers": {
    "grok-it": {
      "command": "grok-it-mcp",
      "args": []
    }
  }
}
```

仓库校验（`npm run validate:plugin`）要求保持 `npx` + 版本钉死，提交前把 `.mcp.json` 改回去。

## 把本地插件加到 Claude Code

Claude 的市场目录是仓库**根目录**的 `.claude-plugin/marketplace.json`。插件根目录（含 `.claude-plugin/plugin.json` 的那一层）是 `plugins/grok-it`。

### 只对当前进程生效（最快）

```bash
claude --plugin-dir /ABS/PATH/TO/grok-it-mcp/plugins/grok-it
```

不会写入已安装插件列表。

### 从本地市场安装

在 Claude Code 里，任意项目都可以：

```text
/plugin marketplace add /ABS/PATH/TO/grok-it-mcp
/plugin install grok-it@grok-it
```

`grok-it@grok-it` 是 `插件名@市场名`。市场名是 `grok-it`（见 `.claude-plugin/marketplace.json`）。

也可以直接加目录文件：

```text
/plugin marketplace add /ABS/PATH/TO/grok-it-mcp/.claude-plugin/marketplace.json
```

然后开新会话或重载插件，让 MCP 重新连接。确认能看到 `grok_auth_status` / `grok_x_search`。

## 把本地插件加到 Codex

仓库里已有 `.agents/plugins/marketplace.json`，指向 `./plugins/grok-it`。

在仓库根目录：

```bash
codex plugin marketplace add .
codex plugin add grok-it@grok-it
```

或用绝对路径：

```bash
codex plugin marketplace add /ABS/PATH/TO/grok-it-mcp
codex plugin add grok-it@grok-it
```

查看已登记市场：

```bash
codex plugin marketplace list
```

改了插件文件或 `.mcp.json` 之后，升级/重装本地市场源，并开一个新的 Codex 会话。Codex 会缓存本地插件，重启是让 MCP 命令生效最稳的办法。

## 测试与校验

```bash
npm test
npm run typecheck
npm run validate
```

`npm run validate` 会跑 typecheck、单测、构建，以及 Claude / Codex 插件静态检查。

可选：探测 Responses `x_search` 的 `include`（需要可用的 xAI 凭据和网络；走编译后的 `dist/` 客户端）：

```bash
npm run build
node --experimental-strip-types scripts/probe-x-search-include.ts
```

## 目录结构

```text
.
├── src/                         # CLI + MCP server
├── tests/
├── dist/                        # 构建产物
├── plugins/grok-it/             # 插件根目录
│   ├── .mcp.json                # Agent 如何拉起 MCP
│   ├── .claude-plugin/plugin.json
│   ├── .codex-plugin/plugin.json
│   └── skills/grok-tools/
├── .claude-plugin/marketplace.json   # Claude 市场目录
├── .agents/plugins/marketplace.json  # Codex / 仓库市场目录
└── docs/DEVELOPMENT_CN.md
```

## 相关链接

- 用户安装（市场 + `npm install -g grok-it-mcp`）：[README_CN.md](../README_CN.md)
- English development guide: [DEVELOPMENT.md](./DEVELOPMENT.md)
