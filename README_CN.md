# Grok It 插件

语言： [English](./README.md) | **简体中文**

---

## 项目作用

Grok It 是一个 Codex / Claude Code 插件，通过 MCP 服务器将 xAI 能力接入到本地 AI Agent 工作流中。它让 Agent 可以搜索 X/Twitter、生成图片和视频，并直接从开发环境访问 Grok 模型。

**核心功能：**

- **X Search**：使用 Grok 订阅支持的 X/Twitter 搜索获取实时社交信息、趋势和账号动态
- **图片生成**：通过 xAI 生成图片并自动本地缓存
- **视频生成**：根据提示词或参考图生成短视频
- **OAuth 认证**：安全的登录流程，支持 API key 备用方案

## 适用场景

- 搜索 X 上的最新讨论、趋势、舆情或账号动态
- 根据提示词生成图片、插图、创意素材或视觉参考
- 根据提示词或参考图生成短视频素材
- 为 Codex / Claude Code Agent 添加 Grok 工具能力

## 插件包含内容

本插件目录包含：

- `.mcp.json`：MCP 服务器注册配置
- `skills/grok-tools/`：Agent 使用 Grok 工具的指导说明
- `.codex-plugin/plugin.json`：Codex 插件清单
- `.claude-plugin/plugin.json`：Claude Code 插件清单

## 安装

官方市场：`Misty-Star/grok-it-mcp`；插件名：`grok-it`

### 安装 npm CLI

```bash
npm install -g grok-it-mcp
```

### 登录 Grok

```bash
grok-it-mcp login --open
```

### 远程 / 无头环境

在服务器、容器或 SSH 会话等没有可用浏览器的环境中，登录流程会打印授权 URL 而不是打开浏览器。

loopback 监听运行在远程机器的 `127.0.0.1:8153`。xAI redirect 需要访问这个监听地址，所以在本地电脑浏览器打开授权 URL 会失败，除非先转发端口：

```bash
ssh -N -L 8153:127.0.0.1:8153 user@remote-host
grok-it-mcp login --loopback
```

可以在终端检查本地认证状态并快速运行搜索/生成命令：

```bash
grok-it-mcp status
grok-it-mcp search "xAI news"
grok-it-mcp image-gen "a neon robot in Shanghai" --aspect-ratio 16:9
grok-it-mcp video-gen "waves crashing at sunset" --duration 6 --json
```

CLI 也支持下划线别名：`image_gen` 和 `video_gen`。

### Codex CLI

添加市场（只需一次）：

```bash
codex plugin marketplace add Misty-Star/grok-it-mcp
```

安装插件：

```bash
codex plugin add grok-it@grok-it
```

更新市场：

```bash
codex plugin marketplace upgrade grok-it
```

### Claude Code

添加市场（只需一次）：

```text
/plugin marketplace add Misty-Star/grok-it-mcp
```

安装插件：

```text
/plugin install grok-it@grok-it
```

更新市场：

```text
/plugin marketplace update grok-it
```

## 认证方式

安装后，Agent 会自动检查认证状态：

- 已有 OAuth 登录：Grok 工具直接可用
- 未登录：Agent 通过 `grok_login` 启动 OAuth
- API key 模式：通过 `XAI_API_KEY` 环境变量提供 xAI API key

默认本地路径（由 MCP server/CLI 内部解析）：

- Token 存储：`~/.grok-it/auth.json`
- 生成物缓存：`~/.grok-it/artifacts`

## Agent 可用工具

- `grok_auth_status`：检查 OAuth / API key 可用性，不暴露密钥内容
- `grok_login`：启动或完成 Grok OAuth 登录
- `grok_x_search`：使用 Grok 搜索 X/Twitter
- `grok_image_generate`：生成图片并默认缓存文件
- `grok_video_generate`：生成视频，默认返回远程 URL，可选本地缓存

## CLI 命令

除了无参数启动 MCP 服务器外，npm binary 还提供：

- `grok-it-mcp image-gen <prompt>` / `image_gen`：生成图片。参数：`--prompt`、`--model`、`--aspect-ratio`、`--resolution`、`--n <1-4>`、`--no-cache`、`--json`
- `grok-it-mcp video-gen <prompt>` / `video_gen`：生成视频。参数：`--prompt`、`--model`、`--image-url`、`--reference-images <url1,url2>`、`--duration <1-30>`、`--aspect-ratio`、`--resolution`、`--cache-video <true|false>`、`--json`

## 开发

要克隆本仓库、本地构建 CLI 或将检出附加为本地插件，请参阅[开发指南](./docs/DEVELOPMENT_CN.md)。
