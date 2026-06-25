# 🧠 Grok It 插件

🌐 语言： [English](./README.md) | **简体中文**

---

## ✨ 项目作用

**Grok It** 是一个面向 Agent 的 Codex / Claude Code 插件，用来把 Grok / xAI 能力接入到本地 Agent 工作流中。

安装后，Agent 可以通过本插件提供的本地 MCP 工具使用：

- 🔎 **X Search / x_search**：调用 Grok 订阅相关的 X / Twitter 搜索能力，获取实时或近期社交信息。
- 🖼️ **图片生成**：让 Agent 直接调用 Grok / xAI 图片生成接口，并默认缓存生成结果。
- 🎬 **视频生成**：让 Agent 生成短视频，支持返回远程 URL，也可按需缓存到本地。
- 🔐 **认证支持**：支持 Grok OAuth 登录，也支持 `XAI_API_KEY` 作为备用认证方式。

## 🧩 适用场景

- 📰 让 Agent 搜索 X 上的最新讨论、舆情、趋势或账号动态。
- 🎨 让 Agent 根据提示词生成图片素材、插图、视觉参考图。
- 📹 让 Agent 根据提示词或参考图生成短视频素材。
- 🤖 给 Codex / Claude Code 等 Agent 增加 Grok 工具调用能力。

## 📦 插件包含什么

本插件目录包含：

- 🛠️ `.mcp.json`：注册 `grok-it` 本地 MCP server。
- 🧠 `skills/grok-tools/`：告诉 Agent 何时以及如何使用 Grok 工具。
- 🧾 `.codex-plugin/plugin.json`：Codex 插件清单。
- 🧾 `.claude-plugin/plugin.json`：Claude Code 插件清单。

## 🚀 如何安装该 Plugin

> 官方市场：`Misty-Star/grok-it-mcp`；插件名：`grok-it`；市场名：`grok-it`。

### 📦 首先安装 npm CLI

先全局安装本地 MCP server CLI：

```bash
npm install -g grok-it-mcp
```

### 🔐 登录 Grok

打开浏览器 OAuth 登录流程：

```bash
grok-it-mcp login --open
```

也可以在终端检查本地认证状态，并快速测试 X Search 连通性：

```bash
grok-it-mcp status
grok-it-mcp search "xAI news"
```

### 🛒 添加市场（只需一次）

```text
/plugin marketplace add Misty-Star/grok-it-mcp
```

### ⚡ 安装插件

```text
/plugin install grok-it@grok-it
```

### 🔄 更新市场

```text
/plugin marketplace update grok-it
```

## 🔑 认证方式

安装后，Agent 通常会先检查认证状态：

- ✅ 已有 OAuth 登录：直接使用 Grok 工具。
- 🔐 未登录：通过 `grok_login` 发起 Grok OAuth 登录。
- 🗝️ 使用 API Key：可通过环境变量 `XAI_API_KEY` 提供 xAI API key。

默认本地路径：

- 🧾 Token：`${HOME}/.grok-it/auth.json`
- 📁 生成物缓存：`${HOME}/.grok-it/artifacts`

## 🧰 Agent 可用工具

- `grok_auth_status`：检查 OAuth / API key 是否可用，不返回密钥内容。
- `grok_login`：启动或完成 Grok OAuth 登录流程。
- `grok_x_search`：使用 Grok 搜索 X / Twitter。
- `grok_image_generate`：生成图片并默认缓存图片文件。
- `grok_video_generate`：生成视频，默认返回远程 URL，可选本地缓存。
