# openClaw 插件安装体系

> 基于 openFinclaw (openclaw@2026.2.25) 源码分析，2026-03-01

## 1. Extension vs Plugin — 同一机制的两个层次

openClaw 中 Extension 和 Plugin **不是两个独立概念**，而是同一加载机制的不同完整度：

|          | Extension（轻量）                      | Plugin（完整）                           |
| -------- | -------------------------------------- | ---------------------------------------- |
| 入口     | `package.json` → `openclaw.extensions` | 同左                                     |
| 加载方式 | `jiti` 动态 import (.ts/.js)           | 同左                                     |
| 元数据   | 可选                                   | **必须** 有 `openclaw.plugin.json`       |
| 配置校验 | 无                                     | JSON Schema (`configSchema`)             |
| UI 提示  | 无                                     | `uiHints` (标签、占位符、sensitive 标记) |
| 生命周期 | `register(api)`                        | `register(api)` + `activate(api)`        |

**结论**: 任何有 `openclaw.plugin.json` 的 extension 就是一个 plugin。两者共用同一套发现和加载流程。

## 2. 插件发现与加载流程

```
扫描 extensions/ 目录
       │
       ▼
读取 package.json → 检查 openclaw.extensions 字段
       │
       ▼
是否存在 openclaw.plugin.json ?
  ├── YES → 读取 manifest → 校验 configSchema (不执行代码)
  └── NO  → 跳过校验
       │
       ▼
jiti 动态 import 入口文件 (.ts/.js)
       │
       ▼
调用 register(api) → 注册 tools/hooks/services/channels
       │
       ▼
调用 activate(api) (如果定义了)
```

**加载优先级**:

1. `plugins.load.paths` (用户自定义路径)
2. `<workspace>/.openclaw/extensions/*.ts` (工作区扩展)
3. `~/.openclaw/extensions/*.ts` (全局扩展)
4. 内置 extensions (随主包发布，默认禁用)

## 3. 三种 Extension 类型

### 类型 A: Channel 插件 (消息渠道)

连接聊天平台 (Discord / Telegram / WeChat / Slack 等)。

**特征**:

- 有 `openclaw.channel` 字段 (渠道 ID、标签、文档路径)
- 部分有 `openclaw.install` (npm 安装引导)
- 需要平台的 Bot Token / API Key
- 注册 channel handler

**代表**: `@openclaw/discord`, `@openclaw/nextcloud-talk`, `@icesword760/openclaw-wechat`

```json
// package.json
{
  "name": "@openclaw/nextcloud-talk",
  "openclaw": {
    "extensions": ["./index.ts"],
    "channel": {
      "id": "nextcloud-talk",
      "label": "Nextcloud Talk",
      "docsPath": "/channels/nextcloud-talk"
    },
    "install": {
      "npmSpec": "@openclaw/nextcloud-talk",
      "localPath": "extensions/nextcloud-talk",
      "defaultChoice": "npm"
    }
  }
}
```

### 类型 B: 功能插件 (能力扩展)

提供独立功能，需要外部服务的 API Key。

**特征**:

- 无 `channel`，有完整 `configSchema` + `uiHints`
- `private` 未设置或 `false` → 可发布到 npm
- 用户安装后通过 UI 配置密钥
- 注册 tools / services / hooks

**代表**: `@openclaw/voice-call`, `@openclaw/memory-lancedb`

```json
// package.json
{
  "name": "@openclaw/voice-call",
  "version": "2026.2.25",
  "openclaw": {
    "extensions": ["./index.ts"]
  }
}

// openclaw.plugin.json
{
  "id": "voice-call",
  "configSchema": {
    "type": "object",
    "properties": {
      "provider": { "type": "string", "enum": ["telnyx", "twilio", "mock"] },
      "telnyx": {
        "type": "object",
        "properties": {
          "apiKey": { "type": "string" }
        }
      }
    }
  },
  "uiHints": {
    "telnyx.apiKey": { "label": "Telnyx API Key", "sensitive": true }
  }
}
```

### 类型 C: 内部模块

Monorepo 内部组件，不对外发布。

**特征**:

- `private: true`
- `workspace:*` 依赖
- 无 `openclaw.install`
- 无法单独安装

**代表**: `@openfinclaw/fin-core`, `@openfinclaw/fin-trading`, `@openclaw/copilot-proxy`

## 4. 用户安装方式

### 4.1 CLI 命令

```bash
# 从 npm 安装
openfinclaw plugins install @scope/package-name

# 从本地目录安装
openfinclaw plugins install ./my-plugin

# 从本地压缩包安装
openfinclaw plugins install ./plugin.tgz

# 开发模式 (符号链接)
openfinclaw plugins install -l ./plugin --link

# 固定版本
openfinclaw plugins install @scope/pkg --pin
```

### 4.2 管理命令

```bash
openfinclaw plugins list           # 列出已安装插件
openfinclaw plugins info <id>      # 查看插件详情
openfinclaw plugins enable <id>    # 启用插件
openfinclaw plugins disable <id>   # 禁用插件
openfinclaw plugins uninstall <id> # 卸载插件
openfinclaw plugins update <id>    # 更新插件
openfinclaw plugins doctor         # 诊断加载问题
```

### 4.3 安装记录

安装信息持久化在 `~/.openclaw/config.json`:

```json
{
  "plugins": {
    "installs": {
      "voice-call": {
        "source": "npm",
        "spec": "@openclaw/voice-call",
        "version": "2026.2.25",
        "resolvedSpec": "@openclaw/voice-call@2026.2.25",
        "integrity": "sha512-...",
        "installedAt": "2026-03-01T..."
      }
    },
    "entries": {
      "voice-call": { "enabled": true, "config": { ... } }
    }
  }
}
```

## 5. 插件 SDK — OpenClawPluginApi

插件加载时接收的 API 对象:

```typescript
type OpenClawPluginApi = {
  id: string;
  name: string;
  source: string;
  config: OpenClawConfig;
  pluginConfig?: Record<string, unknown>;
  runtime: PluginRuntime;
  logger: PluginLogger;

  // 注册方法
  registerTool(tool, opts?): void; // 注册 LLM 工具
  registerHook(events, handler, opts?): void; // 注册生命周期钩子
  registerHttpHandler(handler): void; // 注册 HTTP 处理器
  registerHttpRoute(params): void; // 注册 HTTP 路由
  registerChannel(registration): void; // 注册消息渠道
  registerGatewayMethod(method, handler): void;
  registerCli(registrar, opts?): void; // 注册 CLI 命令
  registerService(service): void; // 注册后台服务
  registerProvider(provider): void; // 注册 LLM provider
  registerCommand(command): void; // 注册用户命令
  resolvePath(input): string;
  on(hookName, handler, opts?): void;
};
```

## 6. 社区插件发布要求

提交 PR 到 `docs/plugins/community.md`，需满足:

1. 发布到 **npmjs.com** (`openfinclaw plugins install <npm-spec>`)
2. 源码在 **GitHub** (公开仓库)
3. 有 setup/使用文档 + issue tracker
4. 有活跃维护信号

**提交格式**:

```markdown
- **Plugin Name** — short description
  npm: `@scope/package`
  repo: `https://github.com/org/repo`
  install: `openfinclaw plugins install @scope/package`
```

## 7. 安全机制

- 源文件路径校验 (必须在 plugin root 内)
- Unix 文件权限检查 (不允许 world-writable)
- npm 安装使用 `--ignore-scripts`
- Config 在代码执行前通过 JSON Schema 校验
- 未知 plugin ID 引用会触发错误

## 8. 完整 Extension 清单 (openFinclaw 2026.2.25)

### Channel 插件 (有 `openclaw.channel`)

bluebubbles, feishu, googlechat, line, matrix, mattermost, msteams,
nextcloud-talk, nostr, synology-chat, tlon, zalo, zalouser

### 功能插件 (有 `configSchema`，无 channel)

copilot-proxy, diagnostics-otel, discord, google-gemini-cli-auth,
llm-task, lobster, memory-core, memory-lancedb, minimax-portal-auth,
open-prose, voice-call

### 金融扩展 (当前全部 private:true)

fin-core, fin-data-bus, fin-data-hub, fin-evolution-engine,
fin-expert-sdk, fin-fund-manager, fin-info-feed, fin-market-data,
fin-monitoring, fin-paper-trading, fin-portfolio, fin-shared-types,
fin-strategy-engine, fin-strategy-memory, fin-trading

### 内部工具

device-pair, phone-control, qwen-portal-auth, shared, talk-voice,
test-utils, thread-ownership, imessage, irc, signal, slack, telegram,
twitch, whatsapp
