# OpenClaw 源码架构深度研究报告

> 本报告基于 OpenClaw 仓库源码（截至 2026 年 3 月）、DeepWiki 自动化代码索引、官方文档站点的系统性分析
> 目标读者：需要在 Claude Code 中基于 OpenClaw 进行二次开发的工程师

---

## 一、全局架构：Hub-and-Spoke 模型

### 1.1 三层架构

OpenClaw 采用经典的 **Hub-and-Spoke（中心-辐射）** 架构。整个系统分为三个清晰的层次：

**传输层 (Transport Layer)**
- Gateway WebSocket RPC 服务器（默认端口 18789）
- HTTP 端点（健康检查、Control UI、Webhook、Canvas/A2UI 服务）
- 所有控制平面通信使用带有必需 `type` 字段的 JSON 帧

**编排层 (Orchestration Layer)**
- Agent 运行时（Pi Agent Core 嵌入）
- 会话管理（Session routing + 持久化）
- 消息路由（Channel → Agent → Channel）
- 配置热重载

**执行层 (Execution Layer)**
- 工具执行（宿主机或 Docker 沙箱）
- 记忆搜索（混合向量 + BM25）
- 模型 API 调用（流式传输）

### 1.2 单进程设计

**关键设计决策**：OpenClaw 是一个**单 Node.js 进程**。Gateway 就是整个应用。这意味着：

- 所有 Channel 适配器、Agent 运行时、WebSocket 服务器、HTTP 服务器、定时任务 (Cron) 全部运行在同一个进程中
- 简化部署（一个 `openclaw gateway` 命令启动一切）
- 状态共享简单（进程内内存 + 磁盘文件）
- 可以作为 `launchd`（macOS）或 `systemd`（Linux）守护进程安装

**源码入口**：
```
openclaw.mjs                      ← CLI 入口点
  → dist/index.js (src/index.ts)  ← 设置环境、错误处理
    → src/cli/program.ts           ← Commander.js CLI 程序
      → src/commands/gateway.ts    ← gateway 子命令
        → src/gateway/server.ts    ← Gateway 服务器导出
          → src/gateway/server.impl.ts ← 实际实现：startGatewayServer()
```

### 1.3 核心目录结构与模块职责

```
src/
├── gateway/                    # Gateway 核心
│   ├── server.ts               # 导出入口
│   ├── server.impl.ts          # startGatewayServer() 实现
│   ├── server-methods.ts       # RPC 方法注册与分发
│   ├── server-methods-list.ts  # 所有 RPC 方法列表
│   ├── server-methods/         # 按领域组织的 RPC handler
│   │   ├── agents.ts
│   │   ├── sessions.ts
│   │   ├── channels.ts
│   │   └── ...
│   ├── protocol/               # WS 协议定义
│   │   ├── index.ts            # 协议处理主逻辑
│   │   ├── schema.ts           # TypeBox Schema 入口
│   │   └── schema/
│   │       ├── frames.ts       # 帧结构定义
│   │       ├── snapshot.ts     # 状态快照
│   │       ├── sessions.ts     # 会话协议
│   │       ├── channels.ts     # 通道协议
│   │       ├── nodes.ts        # 设备节点协议
│   │       └── error-codes.ts  # 错误码
│   ├── channel-lifecycle.ts    # Channel 健康监控与自动重启
│   ├── daemon-install.ts       # 守护进程安装
│   └── router.ts               # 消息路由
│
├── agents/                     # Agent 运行时
│   ├── piembeddedrunner.ts     # 主 Agent Runner（嵌入 Pi Agent Core）
│   ├── pi-embedded.ts          # Pi 嵌入式 Agent 实现
│   ├── prompt-builder.ts       # 系统提示词构建
│   ├── model-selection.ts      # 模型选择 + 降级
│   ├── model-auth.ts           # 模型认证 (OAuth/API Key)
│   ├── workspace.ts            # 工作区管理
│   ├── tool-policy.ts          # 工具策略（旧）
│   ├── pi-tools.ts             # 工具注册（核心工具列表）
│   ├── pi-tools.policy.ts      # 工具策略管道
│   ├── bash-tools.ts           # Shell/Bash 工具
│   ├── openclaw-tools.ts       # OpenClaw 专有工具
│   ├── memory-search.ts        # 记忆搜索集成
│   ├── sandbox.ts              # Docker 沙箱主模块
│   ├── sandbox/
│   │   ├── types.ts            # 沙箱类型定义
│   │   ├── config.ts           # 沙箱配置解析
│   │   ├── context.ts          # 沙箱上下文
│   │   ├── docker.ts           # Docker 容器管理
│   │   └── manage.ts           # 容器生命周期
│   └── auth-profiles/          # OAuth 令牌存储
│
├── config/                     # 配置系统
│   ├── config.ts               # 配置加载主入口
│   ├── io.ts                   # 文件 I/O + JSON5 解析
│   ├── zod-schema.ts           # 主 Zod Schema（OpenClawSchema）
│   ├── zod-schema.agents.ts    # Agent 配置 Schema
│   ├── zod-schema.agent-runtime.ts  # Agent 运行时 Schema
│   ├── zod-schema.session.ts   # 会话 Schema
│   ├── zod-schema.providers.ts # Channel Provider Schema
│   ├── zod-schema.providers-core.ts # 核心 Provider Schema
│   ├── zod-schema.core.ts      # 核心通用 Schema
│   ├── zod-schema.sensitive.ts # 敏感字段标记
│   ├── schema.ts               # Schema 合成（核心 + 插件 + 通道）
│   ├── schema.labels.ts        # UI 字段标签
│   ├── schema.help.ts          # UI 帮助文本
│   ├── validation.ts           # 运行时验证
│   ├── sessions.ts             # 会话存储
│   ├── paths.ts                # 路径常量
│   ├── types.ts                # 主类型定义
│   ├── types.base.ts           # 基础类型
│   ├── types.tools.ts          # 工具类型
│   ├── types.whatsapp.ts       # WhatsApp 类型
│   ├── types.telegram.ts       # Telegram 类型
│   ├── types.discord.ts        # Discord 类型
│   ├── types.slack.ts          # Slack 类型
│   ├── migrations.ts           # 配置迁移
│   └── runtime-group-policy.ts # 运行时群组策略
│
├── routing/                    # 消息路由
│   ├── bindings.ts             # 路由绑定规则匹配
│   ├── session-key.ts          # 会话键构建
│   └── access-control.ts       # 访问控制
│
├── channels/                   # 通道通用层
│   ├── envelope.ts             # 消息信封标准化
│   ├── formatting.ts           # 输出格式化
│   ├── typing.ts               # 打字指示器
│   ├── ack-reactions.ts        # ACK 反应
│   ├── mention-gating.ts       # @提及门控
│   ├── thread-bindings-policy.ts
│   └── logging.ts
│
├── telegram/                   # Telegram 适配器（grammY）
│   ├── bot.ts                  # 主入口（monitorTelegramProvider）
│   ├── accounts.ts             # 多账号支持
│   ├── group-access.ts         # 群组访问控制
│   ├── thread-bindings.ts      # 线程绑定
│   └── exec-approvals.ts       # 执行审批
│
├── discord/                    # Discord 适配器（@buape/carbon）
│   ├── monitor/
│   │   ├── provider.ts         # monitorDiscordProvider
│   │   ├── message-handler.process.ts
│   │   ├── allow-list.ts
│   │   ├── thread-bindings.ts
│   │   ├── exec-approvals.ts
│   │   ├── native-command.ts
│   │   └── presence-cache.ts
│   └── accounts.ts
│
├── slack/                      # Slack 适配器（Bolt）
│   └── monitor/
│       ├── provider.ts
│       └── policy.ts
│
├── signal/                     # Signal 适配器（signal-cli）
│   └── monitor.ts
│
├── imessage/                   # iMessage（legacy）
│   └── monitor.ts
│
├── web/                        # WebChat + Control UI 后端
│   ├── autoreply.ts            # Web 聊天自动回复
│   └── inbound.ts              # Web 入站消息处理
│
├── memory/                     # 记忆系统
│   ├── manager.ts              # MemoryIndexManager（核心类）
│   ├── manager-search.ts       # 搜索实现
│   ├── hybrid.ts               # 混合搜索（向量 70% + BM25 30%）
│   ├── embeddings.ts           # 嵌入向量生成
│   ├── sqlite-vec.ts           # sqlite-vec 扩展
│   └── internal.ts             # 分块逻辑
│
├── tools/                      # 工具系统
│   ├── registry.ts             # 工具注册表
│   ├── policy.ts               # 级联策略解析
│   ├── runtime/                # 工具运行时实现
│   └── ...
│
├── cron/                       # 定时任务
│   ├── store.ts                # Cron 存储
│   ├── isolated-agent.ts       # 隔离 Agent 执行
│   └── run-log.ts              # 运行日志
│
├── plugins/                    # 插件系统
│   └── loader.ts               # 插件发现 + 加载
│
├── security/                   # 安全模块
│   └── dm-policy-shared.ts     # DM 策略
│
├── pairing/                    # 配对系统
│   └── pairing.ts
│
├── logging/                    # 日志
│   └── redact.ts               # 敏感信息脱敏
│
├── cli/                        # CLI 工具
│   ├── program.ts              # Commander.js 主程序
│   ├── memory-cli.ts           # 记忆 CLI
│   └── models-cli.ts           # 模型 CLI
│
├── commands/                   # 命令实现
│   ├── gateway.ts              # openclaw gateway
│   ├── agent.ts                # openclaw agent
│   ├── channels.ts             # openclaw channels
│   ├── doctor.ts               # openclaw doctor
│   ├── doctor-config-flow.ts   # 配置迁移流程
│   ├── doctor-state-migrations.ts
│   ├── doctor-auth.ts
│   ├── onboard.ts              # openclaw onboard
│   ├── onboard-non-interactive.ts
│   └── onboard-helpers.ts
│
├── auto-reply/                 # 统一自动回复系统
│   └── reply.ts                # 处理访问控制、会话解析、Agent 分发
│
├── infra/                      # 基础设施
│   └── git-commit.ts           # 版本信息
│
├── plugin-sdk/                 # 插件 SDK
│   └── index.ts
│
└── provider-web.ts             # Web Provider

extensions/                     # 扩展插件（npm workspace 包）
├── msteams/                    # Microsoft Teams
├── matrix/                     # Matrix
├── memory-core/                # 核心记忆插件
├── memory-lancedb/             # LanceDB 记忆后端
├── nostr/                      # Nostr
├── diagnostics-otel/           # OpenTelemetry 诊断
└── ...

ui/                             # Control UI 前端
├── package.json
└── src/
    ├── ui/
    │   ├── gateway.ts          # Gateway WS 连接客户端
    │   ├── app-view-state.ts   # 应用状态管理
    │   ├── views/
    │   │   ├── login-gate.ts   # 登录认证门
    │   │   ├── chat.ts         # 聊天视图
    │   │   └── agents-utils.ts # Agent 工具函数
    │   └── controllers/
    │       ├── agents.ts       # Agent 控制器
    │       ├── chat.ts         # 聊天控制器
    │       ├── skills.ts       # 技能控制器
    │       └── nodes.ts        # 节点控制器
    └── styles/

apps/                           # 原生应用
├── macos/                      # macOS 菜单栏应用（Swift）
├── ios/                        # iOS 节点（Swift）
├── android/                    # Android 节点（Kotlin）
└── shared/
    └── OpenClawKit/            # 共享协议库
        └── Sources/
            └── OpenClawProtocol/
                └── GatewayModels.swift  # 自动生成的协议模型
```

---

## 二、Gateway 深度剖析

### 2.1 Gateway 启动流程

`startGatewayServer()` (in `src/gateway/server.impl.ts`) 是整个系统的启动函数：

```
startGatewayServer()
│
├── 1. 加载并验证配置
│   └── readConfigFileSnapshot() → Zod 验证 → OpenClawSchema
│
├── 2. 初始化 WebSocket 服务器
│   └── new WebSocketServer({ port: config.gateway.port })
│       默认：ws://127.0.0.1:18789
│
├── 3. 初始化 HTTP 服务器（复用同一端口）
│   ├── /health          → 健康检查
│   ├── /                → Control UI 静态文件
│   ├── /webchat         → WebChat 页面
│   ├── /api/...         → REST API
│   └── /hooks/...       → Webhook 端点
│
├── 4. 注册 RPC 方法
│   └── src/gateway/server-methods.ts
│       按领域注册 handler：
│       ├── sessions.*    (sessions.list, sessions.patch, sessions.delete)
│       ├── channels.*    (message.send, channels.list, pairing.approve)
│       ├── config.*      (config.get, config.apply, config.patch)
│       ├── agents.*      (agent.run, agent.status)
│       ├── nodes.*       (node.list, node.describe, node.invoke)
│       ├── doctor.*      (doctor.run, doctor.memory.status)
│       └── update.*      (update.run, update.status)
│
├── 5. 启动 Channel Monitor
│   └── src/gateway/channel-lifecycle.ts
│       遍历 config.channels，为每个启用的通道启动 monitor：
│       ├── Telegram: monitorTelegramProvider()
│       ├── Discord: monitorDiscordProvider()
│       ├── WhatsApp: monitorWhatsAppProvider()
│       ├── Slack: monitorSlackProvider()
│       └── ...（包括插件通道）
│       每个 monitor 启动后进入长连接事件循环
│
├── 6. 初始化 Cron 调度器
│   └── src/cron/store.ts
│
├── 7. 初始化记忆系统
│   └── MemoryIndexManager 实例化
│
├── 8. 启动配置文件监听
│   └── chokidar.watch('~/.openclaw/openclaw.json')
│       根据 gateway.reload.mode 决定热重载行为
│
└── 9. 广播 Gateway Ready 状态
```

### 2.2 WebSocket 协议详解

**协议版本**：v3（当前）

**帧结构**（定义在 `src/gateway/protocol/schema/frames.ts`）：

```typescript
// 请求帧
{
  id: string,           // 请求 ID（用于匹配响应）
  type: "request",
  method: string,       // e.g. "sessions.list", "config.patch"
  params: object        // 方法参数
}

// 响应帧
{
  id: string,           // 匹配请求 ID
  type: "response",
  result?: object,      // 成功结果
  error?: {             // 错误信息
    code: string,       // 错误码 (UNAVAILABLE, NOT_FOUND, etc.)
    message: string
  }
}

// 事件帧（服务端推送）
// ⚠️ 注意：payload 字段名是 "payload"，不是 "data"（已从 OpenClaw control-ui 编译产物验证）
{
  type: "event",
  event: string,        // e.g. "tick", "chat", "agent", "presence", "cron"
  payload: object       // 事件数据，字段名是 payload 而非 data
}
```

**连接握手流程**：

```
Client                                    Gateway
  │                                          │
  ├─── WebSocket 连接 ───────────────────→  │
  │                                          │
  │  ←── connect.challenge (nonce) ─────────┤  (协议 v3)
  │                                          │
  ├─── ConnectParams ────────────────────→  │
  │    {                                     │
  │      protocolVersion: { min: 3, max: 3 },│
  │      auth: { mode, token/password },     │
  │      device?: { id, nonce, signature },  │
  │      client: { name, version }           │
  │    }                                     │
  │                                          │
  │  ←── HelloOk ───────────────────────────┤
  │    {                                     │
  │      protocolVersion: 3,                 │
  │      snapshot: { ... },     // 全量状态快照
  │      role: "operator.admin" // 授权角色
  │    }                                     │
  │                                          │
  │  ←── 事件流 (tick, chat, agent, etc.) ──┤
```

**RPC 方法命名约定**：`{domain}.{action}`

| 域名 | 方法示例 | 授权级别 |
|------|---------|---------|
| sessions | sessions.list, sessions.patch, sessions.delete | operator.read / operator.write |
| config | config.get, config.apply, config.patch | operator.admin |
| channels | message.send, channels.list | operator.write |
| agents | agent.run, agent.status | operator.write |
| nodes | node.list, node.describe, node.invoke | operator.write |
| doctor | doctor.run, doctor.memory.status | operator.admin |
| update | update.run, update.status | operator.admin |

**速率限制**：写操作（config.apply、config.patch、update.run）限制为每 60 秒每客户端 3 次请求。超限返回 `UNAVAILABLE` + `retryAfterMs`。

### 2.3 Gateway HTTP 端点

Gateway 在同一端口同时服务 WebSocket 和 HTTP：

| 路径 | 功能 | 来源 |
|------|------|------|
| `/` | Control UI (SPA 静态文件) | `ui/` 构建产物 |
| `/webchat` | WebChat 页面 | Gateway 内建 |
| `/health` | 健康检查 | `src/gateway/server.impl.ts` |
| `/api/v1/...` | REST API | 部分端点 |
| `/hooks/...` | Webhook 端点 | Gmail Pub/Sub 等 |
| `/canvas/...` | Canvas/A2UI | 可视化工作区 |

---

## 三、配置系统深度剖析

### 3.1 配置文件格式与位置

| 设置 | 默认路径 | 环境变量覆盖 |
|------|---------|-------------|
| 配置文件 | `~/.openclaw/openclaw.json` | `OPENCLAW_CONFIG_PATH` |
| 状态目录 | `~/.openclaw/` | `OPENCLAW_STATE_DIR` |
| 工作区 | `~/.openclaw/workspace/` | `agents.defaults.workspace` |

**格式**：JSON5（支持注释、尾逗号、无引号键名）

**对于 U 盘项目的关键发现**：
- `OPENCLAW_CONFIG_PATH` 环境变量可以重定向配置文件位置
- `OPENCLAW_STATE_DIR` 环境变量可以重定向状态目录
- 这两个变量是实现 U 盘便携化的关键——启动脚本中设置这两个环境变量即可将所有数据指向 U 盘

### 3.2 Zod Schema 验证管道

配置验证是 OpenClaw 最复杂的子系统之一：

```
openclaw.json (JSON5 文本)
    │
    ▼
src/config/io.ts
    │  JSON5.parse()
    ▼
原始 JavaScript 对象
    │
    ▼
src/config/config.ts :: readConfigFileSnapshot()
    │
    ├── 1. 处理 $include 指令（嵌套最深 10 层）
    │      递归加载子文件 → 深度合并
    │
    ├── 2. 展开 ${VAR_NAME} 环境变量
    │      依次检查：进程环境 → .env → ~/.openclaw/.env
    │
    ├── 3. 解析 SecretRef 对象
    │      { $secret: { source: "env"|"file"|"exec", key: "..." } }
    │
    ├── 4. Zod 验证
    │      OpenClawSchema (src/config/zod-schema.ts:95-632)
    │      ├── .strict() 模式：拒绝未知键
    │      ├── 组合子 Schema：
    │      │   ├── zod-schema.agents.ts
    │      │   ├── zod-schema.agent-runtime.ts
    │      │   ├── zod-schema.session.ts
    │      │   ├── zod-schema.providers.ts（通道）
    │      │   └── zod-schema.core.ts
    │      └── 自定义 refinement：
    │          ├── requireOpenAllowFrom：dmPolicy="open" 必须有 allowFrom=["*"]
    │          └── requireAllowlistAllowFrom：dmPolicy="allowlist" 必须有 ≥1 个 allowFrom
    │
    └── 5. 返回 ConfigSnapshot
           { valid: boolean, config: OpenClawConfig, issues: Issue[] }
```

**Schema 合成**（`src/config/schema.ts:313-335` 的 `buildConfigSchema()`）：

核心 Schema + 插件 Schema + 通道 Schema 在运行时合并。这意味着当安装了新插件时，配置 Schema 会动态扩展。

### 3.3 配置热重载

Gateway 通过 `chokidar` 监听配置文件变更：

| 模式 (`gateway.reload.mode`) | 行为 |
|-----|------|
| `hybrid`（默认） | 安全变更热应用，基础设施变更（port/bind）自动重启 |
| `hot` | 仅热应用，不安全变更只警告不重启 |
| `restart` | 任何变更都重启 |
| `off` | 不监听文件 |

**热应用的变更**：模型、通道配置、Agent 设置、工具策略、技能列表
**需要重启的变更**：`gateway.port`、`gateway.bind`

### 3.4 配置优先级

从高到低：
1. 命令行标志（`--port`, `--bind`）
2. 环境变量（`OPENCLAW_GATEWAY_PORT`）
3. 配置文件值（`openclaw.json`）
4. 系统默认值

### 3.5 常见配置问题与 Doctor 迁移

`openclaw doctor` 是配置自愈工具，处理以下常见问题：

```
src/commands/doctor.ts            ← 主入口
src/commands/doctor-config-flow.ts ← 配置迁移
src/commands/doctor-state-migrations.ts ← 状态迁移
src/commands/doctor-auth.ts       ← 认证修复
```

典型迁移示例：
- `routing.allowFrom` → `channels.whatsapp.allowFrom`（旧路径重命名）
- `routing.groupChat.*` → `messages.groupChat.*` + 通道特定覆盖
- 遗留目录结构迁移到新格式

---

## 四、Agent 执行管道

### 4.1 完整执行流程

当一条消息从任何通道到达时：

```
用户消息（来自 WhatsApp/Telegram/Discord/WebChat/...）
    │
    ▼
Channel Monitor（通道适配器）
    │  解析平台特定消息格式
    ▼
src/channels/envelope.ts
    │  标准化为 InboundEnvelope
    ▼
src/auto-reply/reply.ts
    │  统一自动回复入口
    │  ├── 访问控制检查（allowFrom、DM Policy、Pairing）
    │  ├── 命令检测（/status、/new、/compact 等）
    │  └── 消息入队
    ▼
src/routing/bindings.ts
    │  1. 匹配绑定规则（channel、accountId、chatType、sender）
    │  2. 解析目标 Agent
    │  3. 构建 Session Key
    ▼
src/routing/session-key.ts
    │  构建键：agent:{agentId}:{channel}:{scope}:{peer}
    │  作用域模式：
    │    main       → agent:main:*:main（共享单会话）
    │    per-peer   → agent:main:*:dm:<peer>（每用户独立）
    │    per-channel-peer → agent:main:<channel>:dm:<peer>
    ▼
src/agents/piembeddedrunner.ts（PiEmbeddedRunner）
    │
    ├── 1. 加载会话历史
    │      src/config/sessions.ts → ~/.openclaw/agents/{agentId}/sessions/{key}.jsonl
    │
    ├── 2. 模型选择
    │      src/agents/model-selection.ts
    │      主模型 → fallback 链 → 按 allowlist 过滤
    │
    ├── 3. 构建系统提示词
    │      src/agents/prompt-builder.ts
    │      ├── IDENTITY.md（身份）
    │      ├── SOUL.md（人设）
    │      ├── TOOLS.md（工具声明）
    │      ├── 已安装 Skills 的 SKILL.md
    │      ├── 记忆搜索结果
    │      └── 会话上下文
    │
    ├── 4. 工具策略解析
    │      src/agents/pi-tools.policy.ts → tool-policy-pipeline.ts
    │      级联：全局 → 模型提供商 → Agent → 群组 → 沙箱
    │      deny 列表优先于 allow 列表
    │
    ├── 5. 调用 LLM API（流式）
    │      @mariozechner/pi-agent-core
    │      @mariozechner/pi-ai（提供商适配器）
    │      支持：Anthropic、OpenAI、Google、DeepSeek 等
    │
    ├── 6. 工具调用循环
    │      模型返回 tool_use → 执行工具 → 返回结果 → 继续推理
    │      工具执行可在宿主机或 Docker 沙箱中进行
    │
    ├── 7. 流式输出
    │      agent.text.delta 事件 → 通道适配器 → 用户
    │      支持打字指示器（typing indicators）
    │
    └── 8. 会话持久化
           追加到 JSONL 文件，更新 Token 用量
```

### 4.2 Pi Agent Core 依赖

OpenClaw 不自己实现 Agent 循环，而是嵌入了 `@mariozechner/pi-agent-core` 系列包：

| 包名 | 职责 |
|------|------|
| `@mariozechner/pi-agent-core` | 核心 Agent 循环、工具调用 |
| `@mariozechner/pi-ai` | LLM 提供商集成（API 调用） |
| `@mariozechner/pi-coding-agent` | 编码特定工具 |

这些是外部依赖（非 OpenClaw 仓库内代码），意味着 Agent 的核心推理循环是一个黑盒。OpenClaw 负责的是：会话管理、提示词构建、工具注册、策略过滤、通道对接。

### 4.3 会话存储

```
~/.openclaw/agents/{agentId}/sessions/
├── main-default.jsonl              # 主 DM 会话
├── group-telegram-123456789.jsonl  # 群组会话
├── cron-daily-summary.jsonl        # Cron 任务会话
└── subagent-abc123.jsonl           # 子 Agent 会话
```

每个 `.jsonl` 文件是追加式日志，每行一个 JSON 对象（用户消息或 Assistant 回复）。

---

## 五、Control UI（前端）深度剖析

### 5.1 技术栈

| 组件 | 技术 |
|------|------|
| 框架 | **Lit**（Web Components，非 React/Vue） |
| 模板 | `html` 模板字面量 |
| 状态 | 响应式属性（Lit reactive properties） |
| 样式 | CSS（非 Tailwind） |
| 构建 | 由 Gateway 直接提供静态文件 |

**关键发现**：UI 使用的是 **Lit**，不是 React。这对我们的简约 UI 项目意味着：
- 我们的简约 UI 使用 React 是完全独立的技术选型，不会与原生 UI 冲突
- 两个 UI 可以完全共存

### 5.2 UI 与 Gateway 通信

```typescript
// ui/src/ui/gateway.ts — Gateway WS 客户端
class GatewayClient {
  // 连接到 Gateway
  connect(url: string, auth: AuthConfig): Promise<void>;

  // RPC 调用
  request<T>(method: string, params: object): Promise<T>;

  // 事件订阅
  on(event: string, handler: (data: any) => void): void;
}

// 使用示例（from controllers/agents.ts）
const agents = await gateway.request('agents.list', {});
const skills = await gateway.request('skills.list', { agentId: 'main' });
```

### 5.3 认证流程

`ui/src/ui/views/login-gate.ts` 实现登录门：
- 支持 Token 认证和密码认证
- 凭证存储在 `localStorage`
- 连接成功后收到 `HelloOk` + 状态快照

---

## 六、Channel 适配器架构

### 6.1 通用适配器模式

每个 Channel 遵循统一的多层架构：

```
Provider Monitor 函数（生命周期管理）
    │
    ├── 平台 SDK 连接
    │   （Baileys / grammY / discord.js / Bolt / signal-cli）
    │
    ├── 事件监听器注册
    │   （消息、编辑、删除、反应...）
    │
    ├── 入站消息处理器
    │   ├── 访问控制（DM Policy + 群组策略）
    │   ├── 消息标准化（→ InboundEnvelope）
    │   ├── 媒体处理（图片、音频、视频转录）
    │   └── 提及门控（群组中是否需要 @机器人）
    │
    └── 出站消息分发
        ├── Markdown → 平台格式转换
        ├── 消息分块（长消息拆分）
        ├── 媒体上传
        └── 打字指示器
```

### 6.2 多账号支持

Telegram、Discord、Slack 支持在一个 Gateway 下运行多个 Bot 账号：

```json5
{
  channels: {
    telegram: {
      botToken: "默认账号 Token",
      accounts: {
        alerts: {
          botToken: "告警账号 Token",
          healthMonitor: { enabled: true }
        }
      }
    }
  }
}
```

账号级别的配置与顶层配置浅合并（shallow merge），账号特定值优先。

### 6.3 健康监控

`src/gateway/channel-lifecycle.ts` 实现 Channel 健康监控：
- `gateway.channelHealthCheckMinutes`（默认 5 分钟）间隔检查
- `gateway.channelStaleEventThresholdMinutes`（默认 30 分钟）无事件阈值
- `gateway.channelMaxRestartsPerHour`（默认 10 次）最大重启次数
- 自动重启断连的 Channel Monitor

---

## 七、安全架构

### 7.1 认证层次

| 层 | 机制 | 配置位置 |
|---|------|---------|
| Gateway WS/HTTP | Token / Password / None | `gateway.auth.mode` |
| 设备配对 (iOS/Android/macOS) | Challenge-Response 签名 | 自动 |
| Channel DM | dmPolicy: pairing / allowlist / open / disabled | `channels.*.dmPolicy` |
| Channel 群组 | requireMention + allowFrom | `channels.*.groups` |
| 工具执行 | 级联策略链 | `tools.global.*` / `agents.*.tools.*` |

### 7.2 敏感字段处理

- `src/config/zod-schema.sensitive.ts`：`.register(sensitive)` 标记敏感字段
- `src/logging/redact.ts`：结构化日志中自动脱敏
- OAuth 令牌存储在 `~/.openclaw/auth/` 加密 JSON 文件中

---

## 八、对 U 盘项目的关键技术洞察

### 8.1 便携化关键环境变量

```bash
# 这两个变量是实现 U 盘便携化的唯一关键
export OPENCLAW_CONFIG_PATH="/path/to/usb/data/.openclaw/openclaw.json"
export OPENCLAW_STATE_DIR="/path/to/usb/data/.openclaw/"
```

验证依据：`src/config/paths.ts` 中定义了所有路径常量，均尊重这些环境变量。

### 8.2 简约 UI 与 Gateway 通信的最佳路径

基于 UI 源码分析，推荐通信方式：

```javascript
// 1. 建立 WebSocket 连接
const ws = new WebSocket('ws://localhost:18789');

// 2. 发送认证（如果配置了 auth）
ws.send(JSON.stringify({
  type: 'connect',
  params: {
    protocolVersion: { min: 3, max: 3 },
    auth: { mode: 'token', token: '...' },
    client: { name: 'simple-ui', version: '1.0.0' }
  }
}));

// 3. 收到 HelloOk + 状态快照

// 4. 发送消息（通过 chat.send RPC）
// ⚠️ 已验证：方法名是 chat.send，不是 agent.run（从 OpenClaw control-ui 编译产物确认）
// ⚠️ agent.run / agent.text.delta 不存在，那是幻觉
ws.send(JSON.stringify({
  id: 'req-1',
  type: 'req',                        // 注意：type 是 "req" 不是 "request"
  method: 'chat.send',
  params: {
    sessionKey: 'agent:main:main',    // 默认 session key
    message: '用户输入',
    deliver: false,                   // false = 只返回给 operator UI，不推送到外部频道
    idempotencyKey: crypto.randomUUID()
  }
}));

// 5. 监听流式回复
// ⚠️ 已验证：事件名是 "chat"，payload 字段在 event.payload 里（不是顶层）
// ⚠️ delta 是累积全文（每次 delta 包含完整文本，不是增量片段）
ws.onmessage = (e) => {
  const frame = JSON.parse(e.data);
  if (frame.type === 'event' && frame.event === 'chat') {
    const p = frame.payload;  // 注意：是 payload，不是 data
    // p.sessionKey — 用于过滤当前 session 的事件
    // p.runId      — 本次 run 的 ID
    // p.state      — "delta" | "final" | "aborted" | "error"
    // p.message    — { role, content: [{type:"text", text:...}] | string }
    // p.errorMessage — 当 state === "error" 时
    if (p.state === 'delta') {
      // 提取累积文本（每次 delta 是完整文本，直接替换不累加）
    } else if (p.state === 'final') {
      // 对话完成
    }
  }
};
```

### 8.3 配置写入路径

简约 UI 的 "首次配置向导" 需要写入 `openclaw.json`。推荐路径：

```javascript
// 方式 1（推荐）：通过 Gateway RPC
ws.send(JSON.stringify({
  id: 'config-1',
  type: 'request',
  method: 'config.patch',
  params: {
    path: 'agent.model',
    value: 'deepseek/deepseek-chat'
  }
}));

// 方式 2：直接文件操作（非首次启动时 Gateway 未运行的情况）
// 写入 JSON5 到 OPENCLAW_CONFIG_PATH
```

### 8.3.1 Provider 配置同步（v1.1.28 更新）

PocketClaw server.js 的 `syncInternalConfig()` 现在为**所有 7 个 provider** 写入完整的 `models.providers` 配置到 OpenClaw 内部 config，而不仅仅是 minimax。每个 provider 配置包含 `baseUrl`、`api`（如 openai-completions / anthropic-messages）、`models[]`。

所有 provider 的端点、API 类型、模型列表统一定义在 `portable/system/shared-config.json` 中。

**Provider 名称映射**：auth-profiles.json 中的 provider 字段必须匹配 OpenClaw 对模型前缀的期望：
- UI 中的 "kimi" → auth-profiles 中写为 `"moonshot"`（因为模型 ID 是 `moonshot/kimi-k2.5`）
- UI 中的 "glm" → auth-profiles 中写为 `"zhipu"`（因为模型 ID 是 `zhipu/glm-5`）
- 其他 provider（minimax, deepseek, qwen, openai, anthropic）名称不变

**当前支持的 7 个 provider 及模型（v1.1.28）**：
| Provider | 模型 | API 类型 |
|----------|------|---------|
| minimax | MiniMax-M2.7, MiniMax-M2.7-highspeed | anthropic-messages |
| deepseek | deepseek-chat (V3.2), deepseek-reasoner | openai-completions |
| moonshot | kimi-k2.5, kimi-k2-thinking, moonshot-v1-128k | openai-completions |
| qwen | qwen3.5-plus, qwen3-max, qwen-plus | openai-completions |
| zhipu | glm-5, glm-4.7, glm-4.7-flash | openai-completions |
| openai | gpt-5.4, gpt-5.4-mini, o4-mini | openai-completions |
| anthropic | claude-sonnet-4-6, claude-opus-4-6, claude-haiku-4-5 | anthropic-messages |

### 8.4 不需要修改的部分

OpenClaw 的以下设计对我们的项目非常友好：
- **MIT 许可证**：完全自由使用、修改、分发
- **单进程设计**：启动一个命令即可
- **环境变量覆盖**：不需要修改 OpenClaw 源码即可重定向数据目录
- **JSON5 配置**：人类可读，易于预生成模板
- **内建 WebChat**：即使简约 UI 没做好，用户也能用原生 WebChat

### 8.5 需要格外注意的坑

| 坑点 | 原因 | 解决方案 |
|------|------|---------|
| 配置 Schema 严格模式 | `.strict()` 拒绝所有未知键名，打字错误直接崩溃 | 使用 `openclaw doctor` 验证 |
| Node.js 版本要求 | 硬性要求 ≥22 | U 盘内捆绑正确版本 |
| 首次启动需要 API Key | 没有 API Key，Agent 无法运行 | 简约 UI 的配置向导必须引导设置 |
| Windows 长路径 | node_modules 嵌套可能超过 260 字符限制 | 使用 pnpm（扁平化 node_modules） |
| 端口占用 | 默认 18789，可能被其他实例占用 | 检测端口或使用随机端口 |
| 配置热重载竞争 | 同时通过 UI 和文件编辑修改配置可能冲突 | 优先使用 RPC（config.patch）|
| 通道凭证安全 | WhatsApp 凭证存储在 `~/.openclaw/credentials/` | U 盘丢失 = 凭证泄露 |
| auth-profiles provider 名称 | OpenClaw 按模型前缀匹配 provider（`moonshot/kimi-k2.5` → provider `moonshot`），不是 UI 展示名 | kimi→moonshot, glm→zhipu 映射（见 8.3.1） |

---

## 九、总结与架构图

### 9.1 一句话总结各模块

| 模块 | 一句话 |
|------|--------|
| Gateway (`src/gateway/`) | 单进程 WebSocket+HTTP 服务器，是整个系统的心脏 |
| Protocol (`src/gateway/protocol/`) | v3 版本 JSON RPC，TypeBox 验证，支持流式事件 |
| Config (`src/config/`) | JSON5 → Zod 验证 → 热重载 → Doctor 自愈 |
| Agent (`src/agents/`) | 嵌入 Pi Agent Core，负责提示词构建和工具编排 |
| Routing (`src/routing/`) | 绑定规则 + 会话键 → 决定消息给哪个 Agent 的哪个会话 |
| Channels (`src/telegram/` etc.) | 平台适配器，统一的 Monitor → Envelope → Reply 模式 |
| Memory (`src/memory/`) | SQLite + 向量嵌入 + BM25 混合搜索 |
| Tools (`src/tools/`) | 注册表 + 级联策略 + 沙箱执行 |
| Plugins (`src/plugins/`) | npm 包 + workspace 发现 + SDK 子路径导出 |
| UI (`ui/`) | Lit Web Components，WS RPC 客户端 |
| Doctor (`src/commands/doctor*`) | 配置迁移 + 状态修复 + 安全审计 |

### 9.2 对 Claude Code 开发的建议

基于以上分析，在 Claude Code 中开发 U 盘产品时应遵循以下原则：

1. **不要 Fork OpenClaw**——将其作为 npm 依赖使用，通过环境变量控制
2. **简约 UI 完全独立**——React SPA，通过 WS RPC 与 Gateway 通信
3. **启动脚本的核心**——设置 `PATH`（Node.js）+ `OPENCLAW_CONFIG_PATH` + `OPENCLAW_STATE_DIR`
4. **预生成配置模板**——提供合理的默认 `openclaw.json`
5. **更新机制**——替换 `app/` 目录中的 OpenClaw npm 包 + 简约 UI 构建产物

---

## 十、PocketClaw 集成经验总结（v1.2.x 系列）

### 10.1 插件安装位置（关键）

| 位置 | 能否工作 | 原因 |
|------|----------|------|
| `app/core/node_modules/` | ✅ | 与 openclaw 同级，Node.js require() 能解析 openclaw/plugin-sdk |
| `$OPENCLAW_HOME/node_modules/` | ❌ | openclaw 不在此目录树，require("openclaw/plugin-sdk") 失败 |
| `$OPENCLAW_HOME/extensions/` | ✅ | OpenClaw 原生 extensions 目录（`openclaw plugins install` 使用） |

**结论：** 便携 U 盘场景下，社区插件（qqbot、weixin）必须 npm install 到 `app/core/node_modules/`（与 openclaw 主包同级）。内置插件（feishu）在 OpenClaw 的 `dist/extensions/` 中自动发现，不需要额外安装。

### 10.2 插件发现机制

OpenClaw 通过 `manifest-registry` 扫描三个路径发现插件：
1. **stock**: `dist/extensions/`（内置，如 feishu）
2. **global**: `$OPENCLAW_STATE_DIR/extensions/`（`openclaw plugins install` 安装到这里）
3. **workspace**: `workspace/.openclaw/extensions/`

对于 npm 安装的插件（不在上述路径），必须在 `openclaw.json` 中配置 `plugins.load.paths` 显式注册：
```json
{
  "plugins": {
    "load": {
      "paths": [
        "/absolute/path/to/node_modules/@tencent-connect/openclaw-qqbot"
      ]
    }
  }
}
```

### 10.3 内置 vs 社区插件

| 插件 | 类型 | npm 包 | 安装方式 |
|------|------|--------|----------|
| 飞书 | 内置 (3.22+) | @openclaw/feishu | **不安装** — 已在 dist/extensions/feishu/ |
| QQ Bot | 社区 | @tencent-connect/openclaw-qqbot | npm install 到 app/core/node_modules/ |
| 微信 ClawBot | 社区 | @tencent-weixin/openclaw-weixin | npm install 到 app/core/node_modules/ |

**警告：** 绝对不要 npm install 内置插件（如 @openclaw/feishu），会引入冲突的 openclaw 依赖导致 ERR_PACKAGE_PATH_NOT_EXPORTED。

### 10.4 Control UI

OpenClaw npm 包**不含预编译 Control UI**。Gateway 在 `dist/control-ui/index.html` 或 `cwd/dist/control-ui/index.html` 查找。需要从 OpenClaw 源码仓库构建 Lit SPA：

```bash
git clone --depth 1 https://github.com/openclaw/openclaw.git
cd openclaw && pnpm install && node scripts/ui.js build
# 产物在 dist/control-ui/
```

PocketClaw CI 构建后放置到 `portable/dist/control-ui/`，gateway 通过 cwd 发现。

### 10.5 配置同步注意事项

- `syncInternalConfig` 的 `models.providers` 应该 **MERGE**（保留用户添加的模型），不是覆盖
- `agents.defaults.model` 必须有默认值（`minimax/MiniMax-M2.7`），否则 OpenClaw 回退到 `anthropic/claude-opus-4-6`
- `agents.defaults.workspace` 必须显式设置为 `$OPENCLAW_HOME/workspace/`（否则默认 `~/.openclaw/workspace/`）
- channels 配置只在对应插件已安装时透传
- `anthropic-version` 头应使用 `2025-01-01`（不是过期的 `2023-06-01`）
