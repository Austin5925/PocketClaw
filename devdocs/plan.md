# PocketClaw 实施计划

> 基于 `devdocs/research.md` 和 `devdocs/openclaw-architecture-deep-dive.md` 制定
> 默认分支：`master`（直接开发，不使用 feature branch）
> 最后更新：2026-03-23

---

## 版本历史

### v1.0.x（基础架构上线）— ✅ 已完成

共 28 个版本迭代（v1.0.0 — v1.0.28），实现了便携框架 + 简约 UI + OpenClaw 对接。

### v1.1.0 — v1.1.15（UI 重设计 + bug 修复）— ✅ 已完成

- UI 重设计：侧栏布局 + 会话管理 + Channels/Skills/History 页面
- Markdown 渲染 + 流式 cursor + 复制/重新生成 + 深色模式
- GatewayContext 单 WS 连接共享
- secrets.reload RPC + operator.admin scope
- RequireConfig 守卫 + Onboarding 流程修复
- 更新机制修复（.tar.gz→.zip、SHA256 校验、app/core 包含）

---

## v1.1.16 — v1.2.0 规划

### Phase 12：核心对话功能修复（v1.1.16 — v1.1.18）

> **目标**：修复简约模式对话不显示回复、所有 provider API Key 验证
> **状态**：✅ 已完成

| # | 任务 | 优先级 | 依据 |
|---|------|--------|------|
| 12.1 | **简约模式对话回复不显示（一直 ...）**：✅ **已修复 v1.1.16**。根因：`state`/`message` 在 `event.payload` 里，不是顶层（之前 "顶层" 说法是幻觉）。修复：从 `data.payload.state` 读取，添加 `sessionKey` 过滤，delta 累积全文替换。 | P0 | 用户报告 v1.1.15 仍然存在 |
| 12.2 | **所有 provider 的 API Key 验证**：当前 PROVIDER_API_URLS 只有 minimax。添加 6 个 provider 端点（已验证）。5 个用 `GET /models`（免费无 token 消耗），Anthropic 用 `POST /v1/messages`。 | P0 | server.js validate-key 端点不完整 |

**Provider 验证端点（已通过 curl 实测）**：

| Provider | 验证 URL | 方法 | Auth Header |
|----------|---------|------|-------------|
| minimax | `https://api.minimaxi.com/anthropic/v1/messages` | POST | `x-api-key` + `anthropic-version: 2023-06-01` |
| deepseek | `https://api.deepseek.com/models` | GET | `Authorization: Bearer` |
| moonshot | `https://api.moonshot.cn/v1/models` | GET | `Authorization: Bearer` |
| qwen | `https://dashscope.aliyuncs.com/compatible-mode/v1/models` | GET | `Authorization: Bearer` |
| zhipu | `https://open.bigmodel.cn/api/paas/v4/models` | GET | `Authorization: Bearer` |
| openai | `https://api.openai.com/v1/models` | GET | `Authorization: Bearer` |
| anthropic | `https://api.anthropic.com/v1/messages` | POST | `x-api-key` + `anthropic-version: 2023-06-01` |

### Phase 13：基础设施修复（v1.1.19 — v1.1.21）

> **目标**：修复版本比较、macOS 兼容性、CLAUDE.md gitignore
> **状态**：⬜ 部分完成（13.1/13.2/13.3/13.5 ✅；13.4 待验证）

| # | 任务 | 优先级 | 依据 |
|---|------|--------|------|
| 13.1 | **CLAUDE.md 加入 .gitignore** | P0 | CLAUDE.md 含项目内部指令，不应公开 |
| 13.2 | **版本比较改为语义化**：当前 `latest !== current` 字符串比较。`v1.1.15` vs `1.1.15` 不匹配，`1.9.0` vs `1.10.0` 排序错误。实现 semver 比较函数（不引入 npm 依赖，手写 ~20 行） | P0 | useUpdate.ts 功能性 bug |
| 13.3 | **macOS .app 签名**：当前完全未签名，Gatekeeper 显示 "无法验证安全性" 且只有"完成/废纸篓"选项。方案：CI 中 `codesign --force --deep --sign -`（ad-hoc 签名，免费，允许右键→打开绕过） | P0 | 用户报告 Mac 无法打开 |
| 13.4 | **macOS Node.js 路径验证**：用户报告 "Node.js 未找到"。CI 下载 Node.js 到 `app/runtime/node-darwin-arm64/bin/node`，launcher 查找同路径。需要下载实际 Mac release zip 验证目录结构完整性 | P0 | 用户报告 |
| 13.5 | **server.js 绑定 127.0.0.1**：当前 `http.createServer` 未指定 host，Node.js 默认监听 `0.0.0.0`。添加 `server.listen(UI_PORT, "127.0.0.1")` 防止局域网暴露。对开箱即用**无影响**（用户只访问 localhost） | P1 | 安全 review |

### Phase 14：安全增强（v1.1.22 — v1.1.24）

> **目标**：解决安全审查指出的关键问题，不增加开箱即用难度
> **状态**：⬜ 部分完成（14.1/14.4 ✅；14.2/14.3 未开始）

**分析结论**：以下三项安全改进对用户**无感知**（不影响开箱即用体验），但显著降低 U 盘丢失和公共网络场景下的风险。

| # | 任务 | 优先级 | 对开箱即用的影响 | 依据 |
|---|------|--------|-----------------|------|
| 14.1 | **server.js /api/config 脱敏**：GET 返回时隐藏 apiKey 后 4 位以外的字符（仅影响前端显示，不影响实际存储）。禁止通过 GET 获取完整 Key | P0 | 无影响 | 同网段 GET 可读取完整 API Key |
| 14.2 | **启用真实 Ed25519 device identity**：deviceIdentity.ts 已有完整实现但未使用。启用后：生成密钥对（localStorage 持久化）→ 签名 challenge → gateway 验证。然后 REMOVE `dangerouslyDisableDeviceAuth`。对用户**无感知** | P1 | 无影响（自动在浏览器生成密钥） | 当前 dummy device = 零安全 |
| 14.3 | **API Key 加密存储**：方案评估 → 选择 AES-256-GCM 对称加密，key 派生自机器特征（hostname + username hash）。U 盘在其他电脑上需要重新输入 Key。对用户影响：**换电脑时需重新配置**（可接受，类似浏览器 cookie） | P2 | 轻微影响（换电脑需重配） | U 盘丢失 = Key 泄露 |
| 14.4 | **React Error Boundary**：在 App 根组件添加 ErrorBoundary。捕获任何 runtime error，显示友好的 "出错了，请刷新页面" 提示（含刷新按钮），替代白屏 | P0 | 无影响 | 白屏对小白用户致命 |

### Phase 15：代码质量（v1.1.25 — v1.1.27）

> **目标**：消除技术债务，增强稳定性
> **状态**：✅ 已完成（所有子项 15.1-15.7 均已完成）

| # | 任务 | 优先级 | 依据 |
|---|------|--------|------|
| 15.1 | **WS 重连后恢复 session 历史**：断线重连后调用 `chat.history` 重新加载当前 session 消息。当前重连后显示空聊天框 | P0 | code review |
| 15.2 | **chat.send 超时机制**：发送后 60 秒无 delta/final 事件 → 自动清除 pending 状态 + 显示超时提示 → 用户可重新输入。防止输入框永久禁用 | P0 | code review |
| 15.3 | **useConfig 深合并**：`{ ...config, ...updates }` → `deepMerge`。防止切换 provider 时旧 provider 的 apiKey 残留，新 provider 嵌套字段被覆盖 | P1 | code review |
| 15.4 | **server.js 独立 package.json**：`system/` 目录加 `package.json`，声明 Node.js 版本要求。防止 OpenClaw 升级后隐式依赖断裂 | P1 | code review |
| 15.5 | **配置同步双写统一**：提取 provider 列表、auth-profiles 格式、minimax CN 端点配置到 `system/shared-config.json`。launcher 和 server.js 都读取同一份定义 | P1 | code review（双实现漂移风险） |
| 15.6 | **server.js 请求 body size 限制**：限制 POST/PUT body 为 1MB，防止内存耗尽 | P2 | 配合 127.0.0.1 绑定后风险降低 |
| 15.7 | **增加测试覆盖**：server.js API endpoints（config GET/PUT、validate-key）+ WS 握手 connect frame 验证 + useGateway chat 事件处理 | P1 | 12 个测试只覆盖 hooks |

### Phase 16：跨客户端消息同步（v1.2.0）

> **目标**：简约模式和高级模式消息双向同步
> **状态**：✅ 已完成（v1.1.18-v1.1.20）
> **依据**：所有 4 个子项均已实现

| # | 任务 | 优先级 | 依据 |
|---|------|--------|------|
| 16.1 | **消息存储改为 gateway-driven**：发送消息后不在本地创建 placeholder，而是等待 gateway 的 chat delta 事件。所有消息来源统一为 gateway 事件流 | P0 | 当前本地 state 和 gateway 事件不同步 |
| 16.2 | **页面加载时从 gateway 获取历史**：mount 时调用 `chat.history` 获取当前 session 的历史消息，替代空 state | P0 | 当前每次 mount 都是空白 |
| 16.3 | **监听跨客户端消息**：处理所有 `event: "chat"` 事件（不仅是自己发的），移除 `pendingIdRef` 跟踪。用 `runId` + `sessionKey` 匹配消息 | P0 | 高级模式发的消息简约模式看不到 |
| 16.4 | **sessions 实时更新**：⚠️ 经验证 OpenClaw 无 `sessions.subscribe` RPC，也无 session 相关事件（仅有 chat/agent/presence）。改为：在 `chat.final` 时触发 `sessions.list` 刷新，确保侧栏 lastMessagePreview 及时更新 | P1 | 经 control-ui source 验证 |

### Phase 17：稳定性修复 + 全 Provider 支持（v1.1.26 — v1.1.28）

> **目标**：消除 chat 静默失败、完善跨客户端同步、全 provider API 链路打通
> **状态**：✅ 已完成

| # | 任务 | 优先级 | 依据 |
|---|------|--------|------|
| 17.1 | **Chat 静默失败修复（3 个 bug）**：✅ v1.1.26。chat.send ok=false 静默丢弃、error 事件 runId 不在 map 中被忽略、final 事件 runId 不在 map 中被忽略。修复后任何 gateway 侧错误立即在 UI 显示 | P0 | 用户报告 "60s 超时然后什么都不显示" |
| 17.2 | **跨客户端用户消息同步**：✅ v1.1.27。新增 `ownRunIds` ref 追踪自己发起的 run；非自己发起的 run 在 `final` 时重新加载 `chat.history`，确保高级模式发的用户问题也显示 | P0 | 高级模式发消息后简约模式只显示 AI 回复不显示用户问题 |
| 17.3 | **"Sender (untrusted metadata)" 清理**：✅ v1.1.27。OpenClaw 信封元数据前缀从 session 标题、消息预览、聊天历史中清除 | P1 | 侧栏显示内部标记而非用户文本 |
| 17.4 | **全 Provider 模型更新 + API 链路**：✅ v1.1.28。7 个 provider 各 2-3 个 SOTA 模型；shared-config.json 统一定义；syncInternalConfig 写入所有 provider 的 models.providers 配置；auth-profiles provider 名称映射（kimi→moonshot, glm→zhipu） | P0 | 之前只有 minimax 有完整 API 链路 |

### Phase 18：启动体验重做 + 预装 Skills（v1.1.32）

> **目标**：修复 Mac/Windows 启动拦截问题，预装 66 个 ClawHub skills
> **状态**：✅ 已完成

| # | 任务 | 优先级 | 依据 |
|---|------|--------|------|
| 18.1 | **Mac 启动重做**：✅ v1.1.32。根因是 macOS App Translocation — `.app` 被复制到临时目录运行，Go 二进制算出的 baseDir 指向临时路径。改用 `.command` 脚本为唯一入口，通过 `POCKETCLAW_BASE` 环境变量传递真实目录。`.app` 移入 `system/` 目录。Go 增加 SIGHUP 信号处理。Terminal 显示友好中文 banner | P0 | 用户报告 Mac "找不到 Node.js"，多版本未解决 |
| 18.2 | **Windows SAC 绕过**：✅ v1.1.32。Go 编译的 `.exe` 无签名被 Smart App Control 拦截且无法绕过。改用 `启动PocketClaw.bat` 调用 Node.js（有 Foundation 签名）运行 `server.js --supervisor` 模式。`.exe` 移入 `system/`。server.js 新增 --supervisor 模式：启动配置同步 + gateway 子进程管理 + 健康检查 + 浏览器打开 + 进程清理 | P0 | 用户朋友报告 Windows SAC 拦截 |
| 18.3 | **Channels/Skills 页面恢复**：✅ v1.1.32。回滚 v1.1.31 的移除，为预装 skills 保留入口 | P1 | 预装 skills 需要查看入口 |
| 18.4 | **预装 66 个 ClawHub Skills**：✅ v1.1.32。CI 构建时从 ClawHub 安装 66 个精选 skill（中文/翻译/写作/教育/效率/编程/数据/图表/求职/生活/娱乐），列表定义在 `system/bundled-skills.txt` | P1 | 用户需求 |
| 18.5 | **setup.sh Mac 兼容修复**：✅ v1.1.32。移除 `--transform`（macOS BSD tar 不支持），添加 npmmirror.com 中国镜像，Mac 只下载当前架构 | P1 | setup.sh 在 macOS 上失败 |

### Phase 19：安全加固（v1.1.33）

> **目标**：在不影响开箱即用的前提下修复安全漏洞，堵住 API key 泄露和供应链风险
> **状态**：✅ 已完成

| # | 任务 | 优先级 | 依据 |
|---|------|--------|------|
| 19.1 | **敏感文件权限收紧**：`openclaw.json`、`auth-profiles.json` 从 `0644` 改为 `0600`，`.openclaw/` 目录从 `0755` 改为 `0700`，日志文件 `pocketclaw.log` 改为 `0600`。同时修改 server.js 中 `fs.writeFileSync` 和 Go launcher 中 `os.WriteFile`/`os.OpenFile`/`os.MkdirAll` 的权限参数 | P0 | 多用户系统下 API key 可被其他用户读取 |
| 19.2 | **Node.js 下载 SHA256 校验**：`setup.sh`、`setup.bat` 和 `release.yml` 中下载 Node.js 后验证 SHA256 哈希。从 nodejs.org 官方 `SHASUMS256.txt` 获取期望哈希值，校验失败则终止 | P0 | 中间人攻击/镜像篡改风险 |
| 19.3 | **固定 OpenClaw 版本**：`setup.sh`、`setup.bat` 中 `openclaw@latest` 改为固定版本号 `openclaw@X.Y.Z`，确保可复现构建 | P0 | 供应链风险：不同时间安装的版本可能不同 |
| 19.4 | **HTTP 安全响应头**：server.js 的所有 HTTP 响应添加 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Content-Security-Policy: default-src 'self'; ...`、`Referrer-Policy: no-referrer` | P1 | 防御本地恶意扩展的 iframe/XSS 攻击 |
| 19.5 | **移除环境变量 API key 传递**：删除 `setProviderEnvVars()` 函数，OpenClaw 通过 `auth-profiles.json` 文件获取 API key（已有此机制）。环境变量方式在 `/proc/pid/environ` 可被读取 | P1 | API key 通过环境变量暴露 |
| 19.6 | **日志敏感信息过滤**：Gateway/UI 进程的 stdout/stderr 输出到日志文件前过滤 API key 模式（`sk-`、`Bearer `等）。日志文件权限 `0600` 在 19.1 中同时修复 | P1 | 日志可能含 API key 且权限宽松 |
| 19.7 | **默认 API key 漏洞修复**：移除配置模板中的默认 model（强制通过 onboarding 选择）；Chat 页面模型切换时校验目标 provider 有 API key；sendMessage 前验证当前 provider 有 API key | P0 | 用户报告可不输入 key 直接使用 |

**P2（记录但不在 v1.1.33 实施）**：
- 自动生成 gateway auth token（防本地恶意进程连 gateway）
- API key 加密存储（单用户 USB 场景下 0600 已够）
- xattr -cr 范围精准化（仅清除 .app 和 .command）

### Phase 20：Provider 链路修复 + 扩展（v1.1.34）

> **目标**：彻底修复所有 provider 链路的 "failed to fetch" 问题，新增豆包/Gemini 两个 provider，端到端测试保障，研究聊天平台集成
> **状态**：✅ 已完成
> **最后更新**：2026-03-21

#### 20.A — P0: 修复 "failed to fetch" 及 provider 链路崩溃

**问题复现**：Windows 新机器上选择 GLM 或 OpenAI + 正确 API Key → "failed to fetch"；之后切回 MiniMax 也失败。

**根因分析（4 个独立 bug，互相放大）**：

| # | 任务 | 优先级 | 文件 | 根因 |
|---|------|--------|------|------|
| 20.1 | **`validateKeyRequest` 双重写入崩溃** | P0 | `server.js:335-342` | `timeout` 事件调用 `apiReq.destroy()` → 触发 `error` 事件 → 两个 handler 各写一次 response → Node.js 崩溃 `ERR_HTTP_HEADERS_SENT` → 后续所有请求都失败。修复：在 `jsonResponse` 前加 `res.headersSent` 守卫 |
| 20.2 | **Masked API Key 被回写覆盖真实 Key** | P0 | `server.js:203-233`, `useConfig.ts:5-30`, `Settings.tsx:18-27` | GET `/api/config` 返回 masked key `****xxxx` → 存入前端 `config` state → `deepMerge(config, updates)` 保留所有 provider 的 masked key → PUT 写回 → 真实 key 被覆盖 → 所有 provider 失效（解释了 "切回 MiniMax 也失败" 的现象）|
| 20.3 | **`shared-config.json` 缺少 OpenAI/Anthropic 配置** | P0 | `shared-config.json` | `syncInternalConfig` 遍历顶级 key 写入 `models.providers`，但 openai 和 anthropic 只在 `providers[]` 数组中有验证条目，无顶级配置（无 baseUrl/api/models）→ OpenClaw 找不到这两个 provider 的路由 |
| 20.4 | **Chat.tsx provider ID 不一致** | P1 | `config.ts:49,63`, `Chat.tsx:82-86` | Kimi model 前缀是 `moonshot/` 但 config 存在 `kimi` 下；GLM model 前缀是 `zhipu/` 但 config 存在 `glm` 下 → `config?.[providerId]?.apiKey` 查找失败 → 即使有 key 也显示 "请先配置 API Key" |

**20.1 修复方案**：

```javascript
// server.js validateKeyRequest — 加 headersSent 守卫
apiReq.on("error", () => {
  if (!res.headersSent) jsonResponse(res, 200, { valid: true });
});
apiReq.on("timeout", () => {
  apiReq.destroy();
  if (!res.headersSent) jsonResponse(res, 200, { valid: true });
});
```

**20.2 修复方案（服务端 + 前端双重修复）**：

服务端（server.js PUT handler）— 检测 masked key 并保留真实 key：
```javascript
const parsed = JSON.parse(body);
let existing = {};
try { existing = JSON.parse(fs.readFileSync(configPath, "utf-8")); } catch {}
// 对每个 provider：如果传入的 apiKey 以 **** 开头，用 existing 中的真实 key 替换
for (const key of Object.keys(parsed)) {
  if (parsed[key]?.apiKey && typeof parsed[key].apiKey === "string"
      && parsed[key].apiKey.startsWith("****")) {
    if (existing[key]?.apiKey) parsed[key].apiKey = existing[key].apiKey;
  }
}
```

前端（Settings.tsx）— 不加载 masked key 到 input：
```typescript
// 检测到 masked key 时不填入 input
if (providerConfig?.apiKey && !String(providerConfig.apiKey).startsWith("****")) {
  setApiKey(String(providerConfig.apiKey));
} else {
  setApiKey("");  // placeholder 显示 "输入 API Key"
}
```

前端（useConfig.ts）— updateConfig 发送时排除 masked 字段：
```typescript
// 发送前过滤 masked apiKey 字段，不让 **** 值传到服务端
```

**20.3 修复方案**：在 `shared-config.json` 添加 openai 和 anthropic 的完整顶级配置：

```json
"openai": {
  "baseUrl": "https://api.openai.com/v1",
  "api": "openai-completions",
  "models": [
    { "id": "gpt-5.4", "name": "GPT 5.4" },
    { "id": "gpt-5.4-mini", "name": "GPT 5.4 Mini" },
    { "id": "o4-mini", "name": "o4-mini" }
  ]
},
"anthropic": {
  "baseUrl": "https://api.anthropic.com",
  "api": "anthropic-messages",
  "models": [
    { "id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6" },
    { "id": "claude-opus-4-6", "name": "Claude Opus 4.6" },
    { "id": "claude-haiku-4-5", "name": "Claude Haiku 4.5" }
  ]
}
```

**20.4 修复方案**：在 `config.ts` 添加 provider ID 映射函数，所有需要从 model 前缀查找 config key 的地方统一使用：

```typescript
// Model 前缀 → config key 映射（moonshot→kimi, zhipu→glm）
export const PROVIDER_CONFIG_KEY: Record<string, string> = {
  moonshot: "kimi",
  zhipu: "glm",
};
export function getProviderConfigKey(model: string): string {
  const prefix = model.split("/")[0] ?? "";
  return PROVIDER_CONFIG_KEY[prefix] ?? prefix;
}
```

涉及修改：`Chat.tsx`（handleSend、handleModelChange、hasApiKey 计算）、`Settings.tsx`（provider config 查找）、`useConfig.ts`（isConfigured 检查）

---

#### 20.B — P0: 新增豆包 (Doubao) 和 Gemini

| Provider | 公司 | Base URL | API 类型 | 验证方式 | 环境变量 | API Key 获取 | 中国可用 |
|----------|------|----------|----------|----------|----------|-------------|----------|
| 豆包 (doubao) | 字节跳动/火山引擎 | `https://ark.cn-beijing.volces.com/api/v3` | openai-completions | Bearer | `ARK_API_KEY` | [console.volcengine.com](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey) | ✅ 直达 |
| Gemini (gemini) | Google | `https://generativelanguage.googleapis.com/v1beta/openai` | openai-completions | Bearer | `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/app/apikey) | ❌ 被墙 |

**豆包 SOTA 模型**（已查证火山方舟文档，模型 ID 支持直接传入无需创建推理端点）：

| Model ID | 名称 | 上下文 |
|----------|------|--------|
| `doubao-seed-2-0-pro-260215` | 豆包 Seed 2.0 Pro（旗舰） | 256K |
| `doubao-seed-2-0-lite-260215` | 豆包 Seed 2.0 Lite | 256K |
| `doubao-seed-2-0-mini-260215` | 豆包 Seed 2.0 Mini（高速） | 256K |

> 注意：豆包无 GET `/models` 端点（已查证 [GitHub issue](https://github.com/volcengine/volc-sdk-python/issues/46)），验证方式需用 POST `/chat/completions` 发一条轻量请求。

**Gemini SOTA 模型**（已查证 Google AI 文档，当前 3.x 系列全部为 preview 状态）：

| Model ID | 名称 | 上下文 |
|----------|------|--------|
| `gemini-3.1-pro-preview` | Gemini 3.1 Pro（旗舰） | 1M |
| `gemini-3-flash-preview` | Gemini 3 Flash（高速） | 1M |
| `gemini-3.1-flash-lite-preview` | Gemini 3.1 Flash Lite（低价） | 1M |

> 注意：Gemini 3.x 目前全部为 `-preview` 后缀。无独立 `gemini-3.1-flash`（Google 从 3.0 Flash 直接跳到 3.1 Flash-Lite）。2.5 系列（`gemini-2.5-pro`/`gemini-2.5-flash`）为 GA 但 2026-06-17 过期。

**验证方式差异**：

| Provider | 验证 URL | 方法 | Auth Header |
|----------|---------|------|-------------|
| doubao | `https://ark.cn-beijing.volces.com/api/v3/chat/completions` | POST | `Authorization: Bearer` |
| gemini | `https://generativelanguage.googleapis.com/v1beta/openai/models` | GET | `Authorization: Bearer` |

**涉及修改的文件**：

| 文件 | 改动 |
|------|------|
| `portable/system/shared-config.json` | 添加 doubao、gemini 的 `providers[]` 验证条目 + 顶级配置（baseUrl/api/models）|
| `ui/src/utils/config.ts` | MODEL_PROVIDERS 数组添加 doubao 和 gemini；doubao 标注 "字节跳动出品"，gemini 标注 "需海外网络" |
| `launcher/main.go` | `syncConfigToOpenClaw` 和 `writeAuthProfiles` 的 provider 列表新增 doubao、gemini |

**OpenClaw provider 名称映射**：doubao 和 gemini 在 OpenClaw 中没有内建 provider，需要确认 OpenClaw 是否接受自定义 provider key。方案：
- 如果 OpenClaw `models.providers` 接受任意 key（Zod passthrough）→ 直接用 `doubao`/`gemini`
- 如果 OpenClaw 只接受预定义 key（Zod strict）→ 需要映射到 OpenClaw 已知的 provider 名或使用 `custom` 类型
- **实施前必须验证**：读取 OpenClaw 源码中 `models.providers` 的 Zod schema 定义

---

#### 20.C — P1: 端到端 Provider 链路集成测试

**现状问题**：现有 12 个测试只覆盖 UI hooks 和组件渲染，不覆盖配置写入 → 同步 → OpenClaw 可用的完整链路。v1.1.28 声称 "全 provider 链路打通" 但 Windows 实测多个 provider 失败。

**测试范围**（9 个 provider × 完整链路）：

```
用户输入 API Key → PUT /api/config
  → server.js 解析 JSON
  → 写入 openclaw.json（不含 masked key）
  → syncAuthProfiles() 写入 auth-profiles.json
    → 验证 provider 名称映射正确（kimi→moonshot, glm→zhipu, doubao→?, gemini→?）
    → 验证 profileKey 格式正确（`{provider}:default`）
  → syncInternalConfig() 写入内部 openclaw.json
    → 验证 models.providers 条目完整（baseUrl + api + models + apiKey）
    → 验证 gateway auth 配置正确
```

**测试实现方案**：

1. **server.js 函数测试**（Node.js 层，不需要 HTTP 服务器）：
   - 提取 `syncAuthProfiles`、`syncInternalConfig`、masked key 保护逻辑为可测试的纯函数
   - 使用临时目录 (`os.tmpdir()`) 避免污染真实配置
   - 每个 provider 一个 test case，验证输入 config → 输出文件内容

2. **HTTP 集成测试**（启动 server.js → 发请求 → 验证文件）：
   - 在测试中启动 server.js HTTP server（随机端口）
   - PUT `/api/config` → GET `/api/config` → 验证 masked 返回
   - PUT 含 masked key 的 config → 验证真实 key 未被覆盖
   - POST `/api/validate-key` 模拟超时 → 验证无崩溃

3. **9 个 Provider 矩阵**：

| Provider | UI ID | Model 前缀 | Config Key | OpenClaw Provider | 验证方法 |
|----------|-------|-----------|------------|-------------------|----------|
| MiniMax | minimax | minimax/ | minimax | minimax | POST |
| DeepSeek | deepseek | deepseek/ | deepseek | deepseek | GET |
| Kimi | kimi | moonshot/ | kimi | moonshot | GET |
| 通义千问 | qwen | qwen/ | qwen | qwen | GET |
| 智谱 GLM | glm | zhipu/ | glm | zhipu | GET |
| OpenAI | openai | openai/ | openai | openai | GET |
| Anthropic | anthropic | anthropic/ | anthropic | anthropic | POST |
| 豆包 | doubao | doubao/ | doubao | doubao(待验证) | POST |
| Gemini | gemini | gemini/ | gemini | gemini(待验证) | GET |

**文件**：新增 `tests/provider-chain.test.js`（Node.js 原生测试，不依赖 Vitest 因为测的是 server.js 而非 UI）

---

#### 20.D — P2: OpenClaw 聊天平台集成研究

**目标**：评估是否在简约 UI 中直接配置聊天平台（不用跳转 OpenClaw 高级模式）。

**已调研的架构信息**（来自 `openclaw-architecture-deep-dive.md` 第六章 + Web 调研）：

OpenClaw 通过 `config.channels` 配置聊天平台，每个平台一个 Channel Monitor：

| 平台 | SDK | 配置要求 | 复杂度 |
|------|-----|---------|--------|
| Telegram | grammY | `botToken`（从 BotFather 获取） | 低 — 填一个 token 即可 |
| Discord | @buape/carbon | `token`（bot token） | 低 — 填一个 token |
| Feishu/Lark | 飞书开放平台 SDK | `appId` + `appSecret`，支持 WebSocket 模式（无需公网 webhook） | 中 |
| WhatsApp | Baileys | QR 码配对（`openclaw channels login`） | 高 — 需要交互式配对 |
| Slack | Bolt | `botToken` + `appToken`（Socket Mode） | 中 |
| Signal | signal-cli | 需要安装 signal-cli | 高 |
| QQ | 社区插件 | 未公开文档 | 未知 |
| 微信 | 社区插件（iPad 协议） | 未公开文档 | 高 |

**可行性评估**：

- **可在简约 UI 集成的平台**：Telegram、Discord（只需填 token）、Feishu（填 appId + appSecret）
- **不适合简约 UI 的平台**：WhatsApp（需 QR 配对）、Signal（需安装外部工具）、QQ/微信（社区插件，不稳定）
- **配置写入方式**：写入 `openclaw.json` 的 `channels` 字段，OpenClaw 的 chokidar 文件监听会自动 hot-reload

**结论**：Telegram/Discord/Feishu 可以在简约 UI 设置页添加配置表单。但需要：
1. 用户理解如何创建 Bot（需图文引导）
2. 处理 `dmPolicy`/`groupPolicy` 等访问控制配置
3. 写入 OpenClaw 的内部 `openclaw.json`（非用户级 `openclaw.json`）

**建议**：v1.1.34 不实施 UI 集成，仅在 Settings 页 "聊天平台" 区域添加各平台的配置引导链接（指向 OpenClaw 文档页），降低用户理解成本。完整 UI 集成留到 v1.2.x。

---

#### 20.E — P2: FAQ 及用户体验改进

从 OpenClaw 项目和用户反馈整理关键 FAQ，在 UI 中提供帮助信息：

| FAQ | 内容 | 展示位置 |
|-----|------|---------|
| API Key 从哪里获取？ | 每个 provider 的注册和获取步骤（已有 `apiKeyUrl` 字段） | 设置页 API Key 输入框旁 |
| 为什么显示 "failed to fetch"？ | 常见原因：网络问题、API Key 无效、provider 端点不可达 | Toast 错误信息增强 |
| 为什么显示 "连接失败"？ | 端口占用（18789/3210）、防火墙、Gateway 未启动 | 聊天页连接状态区域 |
| 数据存在哪里？ | U 盘内 `data/` 目录，不上传任何数据到外部 | 设置页 "关于" 区域 |
| 如何更新？ | 下载更新包覆盖 `app/` 和 `system/` 目录 | 设置页 UpdateChecker 旁 |
| 海外 API 需要什么条件？ | OpenAI/Anthropic/Gemini 需要海外网络环境 | 模型选择时提示 |
| 豆包需要创建推理端点吗？ | 不需要，直接传 model ID 即可（火山方舟预置推理） | 豆包 provider 说明 |

**实施方式**：在 Settings 页各 provider 卡片中添加简短说明文字 + "获取 API Key" 链接（已有 `apiKeyUrl` 数据基础）。

---

#### 20.F — P2: 其他改进

| # | 任务 | 优先级 | 依据 |
|---|------|--------|------|
| 20.F1 | **validateKeyRequest 超时优化**：当前全局 10s 超时。中国用户访问 OpenAI/Anthropic/Gemini 端点可能超时。按 provider 区分：国内 provider 5s，海外 provider 15s | P2 | 用户体验 |
| 20.F2 | **Sidebar 未提交改动检查**：git status 显示 Sidebar.tsx 有改动（已确认为干净状态，无待处理改动） | — | 已排除 |
| 20.F3 | **错误信息国际化增强**：validateKeyRequest 失败时返回更具体的中文错误信息（区分网络超时/key 无效/provider 不可达） | P2 | 用户体验 |

---

#### 实施顺序与 Commit 计划

| 顺序 | Commit | 内容 | 对应任务 |
|------|--------|------|---------|
| 1 | `fix(server): prevent validateKeyRequest double-write crash` | 加 `res.headersSent` 守卫 | 20.1 |
| 2 | `fix(config): prevent masked API key from overwriting real keys` | 服务端 masked key 保护 + 前端修复 | 20.2 |
| 3 | `fix(config): add OpenAI and Anthropic to shared-config.json` | 补全缺失的 provider 配置 | 20.3 |
| 4 | `fix(ui): unify provider ID mapping across Chat and Settings` | 添加 `getProviderConfigKey` + 修复所有引用 | 20.4 |
| 5 | `feat(providers): add Doubao and Gemini providers` | 9 个 provider 完整配置 + UI + Go launcher | 20.B |
| 6 | `test(providers): add end-to-end provider chain integration tests` | 9 provider × 完整链路测试 | 20.C |
| 7 | `docs: update FAQ and platform integration research` | FAQ 信息 + 平台研究文档 | 20.D + 20.E |
| 8 | `chore: bump version to 1.1.34` | version.txt + CHANGELOG.md | — |

**前置验证（实施前必须完成）**：
- [ ] 验证 OpenClaw `models.providers` 的 Zod schema 是否接受自定义 provider key（doubao/gemini）
- [ ] 用真实 API Key 测试豆包 POST 验证（确认 model ID 格式正确）
- [ ] 用真实 API Key 测试 Gemini GET /models 验证
- [ ] 确认 doubao 端点 `ark.cn-beijing.volces.com` 在中国大陆可直达

---

### Phase 21：稳定性修复 + 空气泡消除（v1.2.0）

> **目标**：消除 AI 空气泡、修复 Windows 首次启动失败、增强 WS 连接韧性
> **状态**：⬜ 未开始
> **最后更新**：2026-03-23

#### 21.A — P0: 空气泡修复（3 个独立 bug）

**现象**：用户截图显示简约模式中 AI 发送空白气泡（无文字、无动画、只有白色圆角框）

**根因链路**（已从源码验证）：

1. Gateway 发出 `state: "delta"` 事件，但 `message.content` 为空数组（例如纯 `tool_use` 块）
2. `useGateway.ts:163-186` 的 `extractText()` 只提取 `type: "text"` 的 content block → 返回 `""`
3. 创建 assistant bubble：`{content: "", pending: true}` → 此时显示三点动画（正常）
4. 后续 delta 也为空 → `else if (text)` 守卫（行 187）跳过更新
5. `state: "final"` 到达 → `useGateway.ts:200-203`：`text ? { content: text } : {}` — text 是 `""`（falsy），不更新 content，只设 `pending: false`
6. **最终状态**：`content: ""`, `pending: false` → `ChatBubble.tsx:48` 的 `message.content ? <ReactMarkdown> : null` 渲染 null，但外层 div（`rounded-2xl px-4 py-3 bg-white shadow-sm ring-1`）仍然渲染 = **空气泡**

| # | Bug | 文件:行号 | 修复 |
|---|-----|----------|------|
| 21.A1 | Delta 空文本创建空 bubble，final 不更新也不清理 | `useGateway.ts:195-205` | final handler 中，如果 content 最终为空，转为 system 消息 "AI 未返回内容"（与行 230-240 的逻辑对齐） |
| 21.A2 | ChatBubble 不过滤空 content 的已完成 bubble | `ChatBubble.tsx:32-87` | `role === "assistant" && !pending && !content` → return null（防御层） |
| 21.A3 | 历史消息含纯 tool_use 块时显示空 bubble | `useGateway.ts:285-299` | history loader 过滤 `role === "assistant" && content === ""` 的消息 |

**Commit**: `fix(chat): prevent empty assistant bubbles from delta/final/history paths`

---

#### 21.B — P0: Windows 首次启动失败修复

**现象**：其他 Windows 机器上首次启动后 "登不上去"（WS 连接失败或 Gateway 认证失败）

**根因**（从 server.js:473 验证）：

```javascript
// server.js line 473 — BUG：首次运行时 config = {}
if (config && Object.keys(config).length > 0) {
  syncAuthProfiles(config);
  syncInternalConfig(config);  // 这里写 gateway.auth.mode = "none" + dangerouslyDisableDeviceAuth = true
  log("配置同步完成");
}
```

首次运行 `openclaw.json` 为空 `{}`，`Object.keys({}).length` 为 0 → **跳过 syncInternalConfig** → gateway 未收到 `auth.mode: "none"` → gateway 默认要求 device auth → UI 的 dummy identity 被拒绝 → "Gateway 认证失败"。Go launcher（Mac）没有此问题，因为它始终执行 sync（`launcher/main.go:78`）。

| # | Bug | 文件 | 修复 |
|---|-----|------|------|
| 21.B1 | 空 config 跳过 syncInternalConfig | `server.js:473` | 移除条件判断，始终执行 `syncInternalConfig`（即使 config 为空，也要写 gateway auth 配置） |
| 21.B2 | setup.bat 自拷贝 bug（`copy "X" "X"` 源=目标） | `setup.bat:92-93` | 修正源路径为 `data\.openclaw\openclaw.template.json` 或直接创建空 JSON |
| 21.B3 | Gateway stdout/stderr 被丢弃，无法诊断崩溃 | `server.js:493-494` | 将 gateway 输出写入日志文件 `data/pocketclaw.log` |

**Commit**: `fix(supervisor): always sync gateway auth config on startup, fix setup.bat self-copy`

---

#### 21.C — P1: WS 连接韧性增强

| # | 问题 | 文件 | 修复 |
|---|------|------|------|
| 21.C1 | WS 重连上限仅 5 次（~31s），gateway 启动慢时 UI 永久放弃 | `websocket.ts:25` | `maxReconnectAttempts: 5` → `20`（~5 分钟） |
| 21.C2 | 放弃后无操作按钮，用户无法恢复 | `Chat.tsx` header 区域 | 添加 "刷新重试" 按钮，点击时重置 WS 并重连 |
| 21.C3 | supervisor 无端口冲突检测，占用时静默挂起 | `server.js` supervisor 启动逻辑 | 启动前检测 3210/18789 端口，占用时打印中文错误并退出 |
| 21.C4 | Mac Go launcher 无健康检查超时，gateway 静默崩溃时无限轮询 | `launcher/main.go` | 添加 120s 超时上限 |
| 21.C5 | Settings 返回按钮指向 `/dashboard`（路由不存在） | `Settings.tsx:64` | 改为 `to="/"` |
| 21.C6 | Dashboard.tsx 的 hasApiKey 不经过 getProviderConfigKey 映射 | `Dashboard.tsx:21-22` | 使用 `getProviderConfigKey` 统一映射 |

**Commit**: `fix(ws): increase reconnect limit and add retry button, fix port detection`

---

### Phase 22：品牌重塑 — PocketClaw → 口袋龙虾（v1.2.1）

> **目标**：所有用户可见文本从 "PocketClaw" 改为 "口袋龙虾"，替换 emoji 龙虾为 OpenClaw 官方 Logo SVG
> **状态**：⬜ 未开始

#### 22.A — 品牌名称替换

**影响范围**（29 个文件中的用户可见文本，不改文件名/环境变量/仓库名）：

| 类别 | 文件 | 改动 |
|------|------|------|
| UI | `Sidebar.tsx:56` | `"PocketClaw"` → `"口袋龙虾"` |
| UI | `Onboarding.tsx:71` | `"欢迎使用 PocketClaw"` → `"欢迎使用口袋龙虾"` |
| UI | `Settings.tsx:138` | `"PocketClaw — 便携 AI 助手"` → `"口袋龙虾 — 便携 AI 助手"` |
| UI | `Dashboard.tsx:42` | `"PocketClaw"` → `"口袋龙虾"` |
| UI | `ui/index.html` | `<title>PocketClaw</title>` → `<title>口袋龙虾</title>` |
| 启动器 | `启动PocketClaw.bat:5` | `"PocketClaw"` → `"口袋龙虾"` |
| 启动器 | `启动PocketClaw.command:4` | `"🦞 PocketClaw"` → `"口袋龙虾"` |
| 服务端 | `server.js:548,551,560,562` | 日志文本中的 "PocketClaw" |
| 脚本 | `setup.sh`/`setup.bat` | 日志前缀 `[PocketClaw Setup]` → `[口袋龙虾]` |
| 脚本 | `update.sh`/`update.bat` | 日志前缀 `[PocketClaw Update]` → `[口袋龙虾]` |
| Go | `launcher/main.go` | 日志文本、窗口标题 |
| 内部 | `App.tsx:18` | 错误日志 `[PocketClaw]` → `[口袋龙虾]` |
| 文档 | `README.md`/`README_EN.md`/`FAQ.md`/`TUTORIAL.md` | 品牌名称（标题和正文） |
| 元数据 | `package.json:4`, `Info.plist:8,10` | description/bundle name |

**不改的内容**：
- 文件名：`启动PocketClaw.bat`、`启动PocketClaw.command`（改文件名会导致 CI、路径引用、用户习惯全部失效）
- 环境变量：`POCKETCLAW_BASE`、`OPENCLAW_HOME`
- GitHub 仓库名：`Austin5925/PocketClaw`
- 代码内部变量名、CSS 类名
- CHANGELOG.md 中的历史版本记录

**Commit**: `chore: rebrand all user-facing text from PocketClaw to 口袋龙虾`

---

#### 22.B — Logo 替换

**当前状态**：
- `Sidebar.tsx:43,54`：🦞 emoji
- `启动PocketClaw.command:4`：🦞 emoji
- `ui/public/logo.svg`：圆脸机器人 SVG（仅作为 favicon）

**Logo 来源**（已确认）：
- 文件：`github.com/openclaw/openclaw` → `ui/public/favicon.svg`
- 许可：MIT（ByteDance Ltd.）
- 描述：红色渐变卡通龙虾（120x120 viewBox），有身体、两只钳子、触角、大眼睛（带青色高光），友好可爱风格
- 颜色：线性渐变 `#ff4d4d` → `#991b1b`，眼睛高光 `#00e5cc`

**SVG 代码**（已获取完整源码，直接内联到 Logo.tsx）：
```svg
<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="lobster-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff4d4d"/>
      <stop offset="100%" stop-color="#991b1b"/>
    </linearGradient>
  </defs>
  <path d="M60 10 C30 10 15 35 15 55 C15 75 30 95 45 100 L45 110 L55 110 L55 100 C55 100 60 102 65 100 L65 110 L75 110 L75 100 C90 95 105 75 105 55 C105 35 90 10 60 10Z" fill="url(#lobster-gradient)"/>
  <path d="M20 45 C5 40 0 50 5 60 C10 70 20 65 25 55 C28 48 25 45 20 45Z" fill="url(#lobster-gradient)"/>
  <path d="M100 45 C115 40 120 50 115 60 C110 70 100 65 95 55 C92 48 95 45 100 45Z" fill="url(#lobster-gradient)"/>
  <path d="M45 15 Q35 5 30 8" stroke="#ff4d4d" stroke-width="3" stroke-linecap="round"/>
  <path d="M75 15 Q85 5 90 8" stroke="#ff4d4d" stroke-width="3" stroke-linecap="round"/>
  <circle cx="45" cy="35" r="6" fill="#050810"/>
  <circle cx="75" cy="35" r="6" fill="#050810"/>
  <circle cx="46" cy="34" r="2.5" fill="#00e5cc"/>
  <circle cx="76" cy="34" r="2.5" fill="#00e5cc"/>
</svg>
```

**实施步骤**：
1. 创建 `ui/src/components/Logo.tsx`：内联 SVG 组件，支持 `size` prop
2. 替换 Sidebar 中的 🦞 emoji 为 `<Logo />` 组件
3. 替换 `ui/public/logo.svg`（favicon）为 OpenClaw 龙虾 logo
4. 终端 banner 中的 emoji 改为纯文字 "口袋龙虾"（不依赖终端 emoji 渲染）

**Commit**: `feat(ui): replace emoji with OpenClaw logo SVG component`

---

### Phase 23：设置页重设计 — 每个 Provider 独立 API Key（v1.2.2）

> **目标**：设置页从 "单 key 输入框" 改为 "每个 provider 一张配置卡片"
> **状态**：⬜ 未开始

#### 23.A — Per-Provider 卡片式设置

**当前问题**：`Settings.tsx` 只有一个 API Key 输入框，关联当前选中模型。用户必须先切换模型再输入 key，对电脑小白极不友好。

**新设计**：

```
┌─────────────────────────────────────────┐
│ ── 国内模型 ──                           │
│                                          │
│ ┌ 🌟 MiniMax (推荐) ──────────────────┐ │
│ │ 国产首选，中文能力强                 │ │
│ │ API Key: [________________] [验证] ✅ │ │
│ │ 模型: MiniMax-M2.7 / M2.7-highspeed │ │
│ │ [设为默认]  前往获取 API Key →       │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌ DeepSeek ───────────────────────────┐ │
│ │ 编程首选，性价比高                   │ │
│ │ API Key: [________________] [验证] ⚠️│ │
│ │ 前往获取 API Key →                   │ │
│ └──────────────────────────────────────┘ │
│ ... （共 6 个国内 + 3 个海外）           │
│                                          │
│ ── 海外模型（需海外网络）──              │
│ ... OpenAI / Claude / Gemini            │
└─────────────────────────────────────────┘
```

**技术要点**：

1. `Settings.tsx` 重写为遍历 `MODEL_PROVIDERS`（9 个 provider）生成卡片列表
2. 每张卡片有独立的 API Key 输入 + 保存/验证按钮 + 状态指示器
3. **独立保存**：每张卡片的保存只写该 provider 的 `{ [configKey]: { apiKey } }`，不影响其他 provider
4. **当前模型高亮**：选中的 provider 卡片左侧加蓝色边条
5. **一键验证**：调用 `/api/validate-key`，结果显示 ✅/❌
6. **分组**：国内 6 个在前（minimax/deepseek/kimi/qwen/glm/doubao），海外 3 个在后（openai/anthropic/gemini）
7. 海外 provider 标注 "需海外网络"

**涉及文件**：
- `Settings.tsx`（主重写）
- `ApiKeyInput.tsx`（可能需要适配 inline 模式）
- `useConfig.ts`（新增 `updateProviderKey(configKey, apiKey)` 方法）

**Commit**: `feat(settings): per-provider API key card layout with independent save`

---

#### 23.B — 关于页面链接修改

**当前内容** (`Settings.tsx:135-158`)：

```html
<a href="https://github.com/Austin5925/PocketClaw">GitHub</a>
<a href="https://github.com/Austin5925/PocketClaw/issues">反馈</a>
```

**修改后**：

```html
<p>口袋龙虾 — 便携 AI 助手</p>
<p>基于 OpenClaw (MIT) 构建</p>
<a href="mailto:ausdina@proton.me">反馈建议</a>
```

- 删除 GitHub 链接
- "反馈" 改为 `mailto:ausdina@proton.me`
- 不再显示任何 github.com 链接

**Commit**: `fix(settings): replace GitHub links with email feedback, remove public repo links`

---

### Phase 24：频道集成 — 飞书 + QQ + 微信（v1.2.3）

> **目标**：在简约模式设置页和 Channels 页面中直接配置飞书/QQ/微信频道
> **状态**：⬜ 未开始（前置研究已完成）
> **最后更新**：2026-03-23

#### 24.0 — 架构设计

**频道配置写入路径**：

```
用户在简约 UI 填入凭据 → PUT /api/config { channels: { feishu: {...} } }
  → server.js syncInternalConfig() 写入 OpenClaw 内部 openclaw.json 的 channels 字段
  → OpenClaw chokidar 热重载 → channel-lifecycle.ts 启动 channel monitor
  → Channels 页面通过 channels.status RPC 显示连接状态
```

**server.js syncInternalConfig 改动**：当前只同步 `gateway.*`, `agents.*`, `models.providers.*`。需要新增 `channels.*` 字段的透传：

```javascript
// 新增：透传 channels 配置到 OpenClaw 内部 config
if (config.channels) {
  internal.channels = config.channels;
}
```

**Go launcher syncConfigToOpenClaw 改动**：同样需要透传 channels 字段。

**UI 双入口**：
1. **Settings 页** — 每个频道一张配置卡片（填入凭据、保存、验证）
2. **Channels 页** — 显示频道连接状态 + "去配置" 快捷链接到 Settings 的对应区域

**Commit (架构)**: `feat(server): pass through channels config to OpenClaw internal config`

---

#### 24.A — 飞书接入（P0）

**可行性**：✅ 已验证可行

**插件信息**（已验证）：
- 官方插件：`@larksuite/openclaw-lark`（飞书开放平台团队维护，MIT 许可）
- GitHub：`larksuite/openclaw-lark`
- 最新版本：2026.3.17
- 安装命令：`openclaw plugins install @openclaw/feishu`（不是 npm 包名）
- 要求：Node.js ≥ 22，OpenClaw ≥ 2026.2.26（升级到 3.22 后满足）
- 插件已随 OpenClaw 3.22 **bundled 发布**，可能无需单独安装

**关键特性**：
- **WebSocket 是默认模式**（`connectionMode: "websocket"`），无需公网 URL、域名、端口转发
- 支持富文本、图片、音频、视频、文件
- **流式响应**：通过飞书交互卡片实时更新 AI 回复（`streaming: true` 默认开启）
- 双向消息、打字指示器
- 支持多账号、群组独立配置

**最小配置格式**（只需 2 个字段）：

```json5
{
  channels: {
    feishu: {
      enabled: true,
      appId: "cli_xxxxxxxxx",       // 飞书 App ID（格式 cli_xxx）
      appSecret: "your_app_secret"   // 飞书 App Secret
    }
  }
}
```

**所有可选字段及默认值**：

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `connectionMode` | `"websocket"` | 连接模式（websocket/webhook） |
| `domain` | `"feishu"` | 域名（"feishu" 中国/"lark" 国际） |
| `dmPolicy` | `"pairing"` | 私聊策略（pairing/allowlist/open/disabled） |
| `groupPolicy` | `"allowlist"` | 群聊策略 |
| `streaming` | `true` | 流式卡片输出 |
| `requireMention` | `false` | 群聊是否需要 @机器人 |
| `mediaMaxMb` | `30` | 媒体上传限制 |

**安装方式**：
- 方案 A（推荐）：CI 构建时预安装 `openclaw plugins install @openclaw/feishu`
- 方案 B：OpenClaw 3.22 bundled，可能无需额外安装（需验证）

**用户设置步骤**（已从飞书开放平台文档验证）：
1. 前往 [飞书开放平台](https://open.feishu.cn)，登录并创建 "企业自建应用"
2. 在 "应用能力" → "机器人" 中启用机器人能力
3. 在 "权限管理" 中配置必要权限（`im:message:send_as_bot`, `im:chat` 等）
4. 在 "事件与回调" → "事件配置" 中选择 **"使用长连接接收事件"**（WebSocket 模式）
5. 添加事件 `im.message.receive_v1`
6. 在 "凭证与基础信息" 页复制 **App ID**（`cli_xxxxxxxxx`）和 **App Secret**
7. 创建版本并发布（企业自建应用通常自动审批）
8. 在口袋龙虾设置页填入 App ID 和 App Secret → 保存
9. 在飞书中搜索并添加该机器人 → 开始对话

**简约 UI 配置卡片**：

```
┌ 🐦 飞书 ──────────────────────────────┐
│                                         │
│ App ID:     [____________________]      │
│ App Secret: [____________________]      │
│                                         │
│ [保存配置]                    [查看教程] │
│                                         │
│ 状态: 🟢 已连接 / 🔴 未配置            │
└─────────────────────────────────────────┘
```

**涉及文件**：
- `Settings.tsx` — 新增飞书配置卡片区域
- `Channels.tsx` — 飞书频道状态显示 + "去配置" 链接
- `server.js:syncInternalConfig` — 透传 channels.feishu
- `launcher/main.go:syncConfigToOpenClaw` — 同步透传
- `.github/workflows/release.yml` — CI 预安装飞书插件
- `bundled-skills.txt` 或新建 `bundled-plugins.txt` — 声明预装插件

**前置验证**：
- [ ] 在 OpenClaw 3.22 下测试 `openclaw plugins install @larksuiteoapi/feishu-openclaw-plugin` 是否成功
- [ ] 验证 WebSocket 模式在本地环境下是否自动连接
- [ ] 确认配置写入 openclaw.json 后 hot-reload 是否自动启动 feishu channel monitor
- [ ] 确认 `channels.status` RPC 返回飞书频道状态

**Commit**: `feat(channels): add Feishu channel configuration with WebSocket mode`

---

#### 24.B — QQ 机器人接入（P0）

**可行性**：✅ 已验证可行

**插件信息**（已验证）：
- 官方认证插件：`@tencent-connect/openclaw-qqbot`（MIT 许可）
- GitHub：`tencent-connect/openclaw-qqbot`
- 版本：v1.6.4
- 2.4 万+ 实例部署（腾讯云灯塔）

**关键特性**：
- 私聊、群 @mention、频道消息
- 富媒体：图片（jpg/png/gif/webp/bmp）、语音（自动转文字 STT）、视频、文件（≤20MB）
- 多 Bot 账号支持
- **无需公网 URL**：使用 QQ 开放平台 WebSocket 长连接
- 支持 `/bot-ping`、`/bot-version`、`/bot-help` 等斜杠命令
- 用户发送 "停止" 或 "/stop" 可中断任务

**最小配置格式**（只需 2 个字段）：

```json5
{
  channels: {
    qqbot: {
      enabled: true,
      appId: "YOUR_APPID",            // QQ Bot App ID（纯数字）
      clientSecret: "YOUR_SECRET"      // QQ Bot App Secret（注意字段名是 clientSecret 不是 token）
    }
  }
}
```

**关键可选字段**：

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `dmPolicy` | `"open"` | 私聊策略（open/pairing/allowlist/disabled） |
| `groupPolicy` | `"open"` | 群聊策略 |
| `requireMention` | `true` | 群聊需要 @机器人 |
| `textChunkLimit` | `1500` | 单条消息最大字符数 |
| `markdownSupport` | `true` | 启用 Markdown |
| `replyFinalOnly` | `false` | 只发最终回复，跳过中间日志 |

**QQ 平台限制**：

| 限制 | 值 |
|------|---|
| 被动回复时间窗口 | 私聊 60 分钟，群聊 5 分钟 |
| 每条消息最多回复 | 5 条 |
| 主动消息（私聊） | 每用户 4 条/月 |
| 主动消息（群聊） | 每群 4 条/月 |
| 每个 QQ 账号创建 Bot 数 | 最多 5 个 |

**安装方式**：CI 预安装 `openclaw plugins install @tencent-connect/openclaw-qqbot@latest`

**用户设置步骤**（已从 QQ 开放平台文档验证）：
1. 前往 [QQ 开放平台](https://q.qq.com)，用手机 QQ 扫码登录
2. 如果 QQ 号未实名，需先完成实名认证
3. 选择 "个人" 主体类型（**个人即可注册，2026 年 3 月起零门槛开放**）
4. 点击 "创建机器人" → 填写名称、描述、头像（240x240px+）
5. 进入 "开发管理" 页面 → 复制 **AppID** 和 **AppSecret**（⚠️ Secret 离开页面后无法再查看，必须立即保存）
6. 在 "沙箱配置" 中添加自己的 QQ 号为测试成员（沙箱模式即可使用，无需公开发布审核）
7. 在口袋龙虾设置页填入 App ID 和 Secret → 保存
8. 在 QQ 中搜索并添加该机器人 → 开始对话

**注意**：个人开发者可注册，门槛比飞书低（飞书需要企业账号）。沙箱模式足够个人使用，不需要通过腾讯公开审核。

**简约 UI 配置卡片**：

```
┌ 🐧 QQ 机器人 ─────────────────────────┐
│                                         │
│ App ID: [____________________]          │
│ Token:  [____________________]          │
│                                         │
│ [保存配置]                    [查看教程] │
│                                         │
│ 状态: 🟢 已连接 / 🔴 未配置            │
└─────────────────────────────────────────┘
```

**涉及文件**：同飞书（Settings.tsx、Channels.tsx、server.js、launcher/main.go、CI）

**前置验证**：
- [ ] 在 OpenClaw 3.22 下测试 `openclaw plugins install openclaw-qqbot` 是否成功
- [ ] 验证 QQ Bot WebSocket 连接在本地环境下是否正常工作
- [ ] 确认个人开发者注册流程和审核周期
- [ ] 测试群聊 @ 消息和私聊消息的完整链路

**Commit**: `feat(channels): add QQ Bot channel configuration`

---

#### 24.C — 微信接入研究（P1 — 需深入评估后决定方案）

**背景**：微信是中国用户入口最多的平台，必须想办法接入。但微信生态封闭，技术方案复杂度远高于飞书/QQ。

**已调研的所有方案**：

| # | 方案 | 项目/来源 | Stars | 需公网？ | 封号风险 | 复杂度 | 可行性评估 |
|---|------|----------|-------|---------|---------|--------|-----------|
| C1 | **wechat-openclaw-channel** | HenryXiaoYang/wechat-openclaw-channel | 611 | ❌ 不需要 | ⚠️ 中（使用 QClaw/WorkBuddy 协议） | 中 | ⭐⭐⭐ 最可行 |
| C2 | **OpenClawWeChat** (小程序方案) | hillghost86/OpenClawWeChat | 159 | ⚠️ 需要（小程序 → 服务端） | ❌ 无（官方小程序） | 高 | ⭐⭐ 需公网不适合 USB |
| C3 | **腾讯 ClawBot** | 腾讯官方微信内置 | — | ⚠️ 需要（ClawBot → 远程 gateway） | ❌ 无 | 高 | ⭐ 需公网不适合 USB |
| C4 | **openclaw-plugin-wecom** (企业微信) | sunnoy/openclaw-plugin-wecom | — | ⚠️ 需要 webhook | ❌ 无 | 高 | ⭐ 需企业认证 |
| C5 | **WeChatFerry (WCF)** | 社区 hook 工具 | — | ❌ 不需要 | ⚠️⚠️ 高（hook 注入） | 高 | ⭐⭐ 风险太高 |
| C6 | **wechaty** | 跨平台 IM SDK | — | ❌ 不需要 | ⚠️ 取决于 puppet | 高 | ⭐⭐ 依赖不稳定 |
| C7 | **微信公众号** | 官方平台 | — | ⚠️ 需要 webhook | ❌ 无 | 中 | ⭐ 需公网 |

**方案 C1 分析（最推荐）**：`wechat-openclaw-channel`

- 611 星，活跃维护
- 同时支持 **QClaw** 和 **WorkBuddy** 两种登录方式
- QClaw：基于 UOS 微信网页版协议，扫码登录，不需要公网
- WorkBuddy：基于 iPad 协议，更稳定但需要付费服务
- 作为 OpenClaw channel 插件运行，写入 `config.channels.wechat` 即可
- **风险**：非官方协议，有一定封号风险（但 QClaw 方式风险较低，已有大量用户验证）

**方案 C1 配置格式**（待最终验证）：

```json5
{
  channels: {
    wechat: {
      // QClaw 模式
      provider: "qclaw",
      // 扫码后自动生成 session
    }
  }
}
```

**实施建议**：

1. **v1.1.36 做**：
   - 预装 `wechat-openclaw-channel` 插件
   - Settings 页添加微信配置卡片（标注 "实验性功能"）
   - Channels 页显示微信连接状态
   - 首次配置需要扫码（在 UI 中展示二维码）

2. **需要进一步验证**：
   - [ ] 安装 `wechat-openclaw-channel`，确认配置格式和扫码流程
   - [ ] 测试 QClaw 模式在 Windows/Mac 上的兼容性
   - [ ] 评估扫码登录在简约 UI 中的 UX（是否需要显示终端二维码或生成 web 二维码）
   - [ ] 测试长期运行稳定性和掉线重连
   - [ ] 确认封号风险等级（QClaw vs WorkBuddy）

3. **备选方案**：如果 C1 方案风险过高或不稳定，退回到 "在设置页提供教程链接，引导用户在高级模式中配置"

**Commit**: `feat(channels): add WeChat channel configuration (experimental, QClaw mode)`

---

#### 24.D — Channels 页面增强

**当前状态**：`Channels.tsx` 只读显示 `channels.status` RPC 返回的频道状态，底部有 "通道配置请使用高级模式" 的提示。

**改造**：
1. 移除 "通道配置请使用高级模式" 提示
2. 每个频道卡片增加 "去配置" 按钮，跳转到 Settings 页的对应区域
3. 新增 "添加频道" 按钮，列出可配置的频道（飞书/QQ/微信）
4. 已配置的频道显示连接状态（🟢 已连接 / 🟡 连接中 / 🔴 未连接 / 错误信息）
5. 支持 "断开连接" / "重新连接" 操作（通过 RPC 控制）

**Commit**: `feat(channels): enhance Channels page with config links and connection controls`

---

### Phase 25：引导流程重设计（v1.2.4）

> **目标**：4 步引导 → 选模型 → 选频道 → 进入简约聊天
> **状态**：⬜ 未开始

#### 25.A — 4 步 Onboarding

**当前流程** (`Onboarding.tsx`)：2 步

```
步骤 1: 选择 AI 模型 → 步骤 2: 输入 API Key → 开始使用（跳转 /）
```

**新流程**：4 步

```
步骤 1: 欢迎页（口袋龙虾 Logo + 欢迎语 + "开始设置"）
步骤 2: 选择大模型 + 输入 API Key（沿用现有逻辑）
步骤 3: 连接频道（飞书/QQ/微信，可选，可跳过）
步骤 4: 设置完成 → 跳转到 http://localhost:3210/（简约聊天）
```

**步骤 1 — 欢迎页**：
```
┌──────────────────────────────────┐
│        [OpenClaw Logo]           │
│                                  │
│     欢迎使用口袋龙虾             │
│     便携 AI 助手，插上即用       │
│                                  │
│        [开始设置]                │
└──────────────────────────────────┘
```

**步骤 2 — 选择大模型**：
- 保留现有 ModelSelector + ApiKeyInput
- 增强：显示 provider 描述和推荐标签

**步骤 3 — 连接频道**（新增）：
```
┌──────────────────────────────────┐
│  连接聊天平台（可选）            │
│                                  │
│  ┌──────────┐  ┌──────────┐     │
│  │ 🐦 飞书   │  │ 🐧 QQ    │    │
│  │ [配置]    │  │ [配置]    │    │
│  └──────────┘  └──────────┘     │
│  ┌──────────┐                   │
│  │ 💬 微信   │                   │
│  │ [配置]    │                   │
│  └──────────┘                   │
│                                  │
│  [跳过]         [完成设置]       │
└──────────────────────────────────┘
```

点击 "配置" 展开内联表单（appId + token 等）。

**步骤 4**：保存所有配置 → `secrets.reload` → 跳转到 `/`（简约聊天）

**技术要点**：
1. `Onboarding.tsx` 从 2 步扩展到 4 步
2. 进度条从 2 段改为 4 段
3. 步骤 3 的频道配置写入 `channels` 字段
4. 最终目的地是 `navigate("/")`（简约聊天，不是高级模式）
5. `App.tsx:RequireConfig` 的 `isConfigured` 判断不变（model + apiKey 即可）

**Commit**: `feat(onboarding): redesign 4-step welcome flow with channel setup`

---

### Phase 26：OpenClaw 升级 + 一键更新机制（v1.2.5）

> **目标**：升级 OpenClaw 3.13 → 3.22，实现 UI 内一键更新
> **状态**：⬜ 未开始

#### 26.A — OpenClaw 3.13 → 3.22 升级

**版本信息**：OpenClaw 使用日期版本号 `2026.3.13` → `2026.3.22`（2026 年 3 月 22 日发布）。

**3.13 → 3.22 兼容性分析**（已全面验证，结论：**可安全升级，只需改版本号**）：

| 检查项 | 结果 | 说明 |
|--------|------|------|
| Gateway Protocol | ✅ 无变化 | 仍为 v3，challenge-response + connect frame 格式不变 |
| `models.providers` Zod Schema | ✅ 兼容 | `{ baseUrl, api, apiKey, models }` 仍为有效字段，新增可选字段不影响 |
| `auth-profiles.json` 格式 | ✅ 兼容 | `{ type: "api_key", provider, key }` 格式不变（breaking change 在 2026.2.19 已处理） |
| `gateway --allow-unconfigured` | ✅ 有效 | 仍为文档记录的有效标志 |
| `gateway.auth.mode = "none"` | ✅ 有效 | 本地 auth 绕过仍支持 |
| `dangerouslyDisableDeviceAuth` | ✅ 有效 | 3.22 安全加固不影响本地绕过 |
| MiniMax CN 端点 | ✅ 仍需手动配置 | 3.22 内置 MiniMax 但默认用国际端点 `api.minimax.io`，我们的 `api.minimaxi.com/anthropic` 覆盖仍必要 |
| `shared-config.json` 格式 | ✅ 兼容 | `syncInternalConfig` 写入的所有字段仍为 schema 接受的有效字段 |
| 环境变量 | ✅ 安全 | 仅移除了 `CLAWDBOT_*`/`MOLTBOT_*` 遗留变量，PocketClaw 不使用 |
| ClawHub skills 安装 | ✅ 兼容 | `npx clawhub@latest install` 路径不受影响 |

**3.22 新增收益**：
- Gateway 冷启动性能提升（编译 `dist/extensions` 代替 TypeScript 即时编译）
- 主模型预热（channel 启动前预加载模型）
- MiniMax M2.7 bundled 默认开启
- 快速模式 `/fast` 映射到 `-highspeed` 模型
- 内存插件改进（更好的 transcript 处理）
- 安全加固（exec 沙箱、SSRF 防护）

**升级步骤**（仅改 3 个文件的版本号）：

| # | 文件 | 改动 |
|---|------|------|
| 1 | `setup.sh:10` | `OPENCLAW_VERSION="2026.3.13"` → `"2026.3.22"` |
| 2 | `setup.bat:10` | 同上 |
| 3 | `.github/workflows/release.yml:91,201` | `openclaw@2026.3.13` → `openclaw@2026.3.22` |

**无需改动的文件**：`shared-config.json`、`server.js`、`launcher/main.go`、UI 代码（全部兼容）。

**前置验证**（部分已通过研究验证 ✅）：
- [✅] `models.providers` Zod schema 兼容性
- [✅] `gateway --allow-unconfigured` 有效性
- [✅] Gateway Protocol v3 handshake 无变化
- [✅] `auth-profiles.json` 格式兼容
- [ ] 本地 `npm install openclaw@2026.3.22` 实际安装测试
- [ ] 飞书插件 `@openclaw/feishu` 与 3.22 兼容性
- [ ] QQ Bot 插件 `@tencent-connect/openclaw-qqbot` 与 3.22 兼容性

**Commit**: `chore: upgrade OpenClaw from 2026.3.13 to 2026.3.22`

---

#### 26.B — 一键更新机制

**当前问题**：
- `UpdateChecker.tsx` 只显示 "有新版本可用，请通过菜单脚本更新"
- 用户需手动找到 `update.bat`/`update.sh` 并运行 — 电脑小白无法操作
- 更新脚本不在用户入口（`.bat` 启动文件）旁边

**方案**：在现有 `server.js` 中新增 `/api/update` 端点，实现 UI 内一键更新

**实现设计**：

```
用户点击 "一键更新" → POST /api/update
  → server.js 后台执行：
    1. 从 GitHub Releases 下载 PocketClaw-v{version}-update.zip
    2. SHA256 校验（下载 SHA256SUMS.txt 对比）
    3. 备份当前 app/ 和 system/ → data/backups/
    4. 解压覆盖 app/ 和 system/
    5. 运行 migrate.js
    6. 返回 { success: true, version: "1.1.37" }
  → 前端显示 "更新完成，请关闭窗口重新启动口袋龙虾"
```

**进度轮询**：

```
GET /api/update/status
→ { status: "idle" | "downloading" | "verifying" | "backing_up" | "extracting" | "migrating" | "complete" | "error",
   progress: 0-100,
   error?: "..." }
```

**server.js 新增代码**（~150 行）：

```javascript
// POST /api/update — 触发更新
function handleApiUpdate(req, res) {
  if (req.method !== "POST") { res.writeHead(405); res.end(); return; }
  if (updateState.status !== "idle") {
    jsonResponse(res, 409, { error: "更新已在进行中" });
    return;
  }
  startUpdate().then(() => jsonResponse(res, 200, { success: true }))
    .catch(err => jsonResponse(res, 500, { error: err.message }));
}

// GET /api/update/status — 查询进度
function handleApiUpdateStatus(res) {
  jsonResponse(res, 200, updateState);
}

async function startUpdate() {
  // 1. Check latest version from GitHub API
  // 2. Download update.zip
  // 3. Verify SHA256
  // 4. Backup current app/ and system/
  // 5. Extract (uses Node.js built-in zlib + tar for .zip)
  // 6. Run migrate.js
  // 7. Update version.txt
}
```

**UI 改造** (`UpdateChecker.tsx`)：

```
┌────────────────────────────────────────┐
│ 系统更新                               │
│                                        │
│ 当前版本：v1.1.36                      │
│ 最新版本：v1.1.37                      │
│                                        │
│ [一键更新]  [检查更新]                  │
│                                        │
│ ── 更新中（请勿关闭窗口）──            │
│ [████████████░░░░░░░░] 65% 正在解压... │
│                                        │
│ ── 更新完成 ──                         │
│ 请关闭此窗口，重新双击启动口袋龙虾     │
└────────────────────────────────────────┘
```

**自我覆盖安全**：
- 更新时 server.js 自身可能被覆盖 — 但 Node.js 已将文件加载到内存，不影响当前进程
- 更新完成后提示用户重启（重启后加载新的 server.js）
- 备份保留最近 5 个版本（复用 update.sh 的逻辑）
- 下载失败/校验失败时不执行覆盖，返回错误

**保底方案**：如果一键更新出问题，用户仍可手动运行 `system/update.bat`（保留脚本文件）。在 Settings 的更新区域添加 "手动更新" 折叠说明：

```
▶ 手动更新方法
  1. 在 system 文件夹中找到 update.bat（Windows）或 update.sh（Mac）
  2. 双击运行
  3. 等待完成后重新启动口袋龙虾
```

**涉及文件**：
- `server.js` — 新增 `/api/update` 和 `/api/update/status` 端点
- `UpdateChecker.tsx` — 重写为支持一键更新 + 进度显示
- `useUpdate.ts` — 新增 `triggerUpdate()` 和 `pollUpdateStatus()` 方法

**Commit**: `feat(update): add one-click update from settings UI with progress display`

---

#### 26.C — 版本号更新

**Commit**: `chore: bump version to 1.2.x, update CHANGELOG.md`

- `portable/version.txt` → `1.1.36`
- `CHANGELOG.md` 添加 v1.1.36 条目

---

### Phase 21-26 实施总顺序

| 顺序 | Commit | Phase | 需求 | P |
|------|--------|-------|------|---|
| 1 | `fix(chat): prevent empty assistant bubbles` | 21.A | 空气泡 | P0 |
| 2 | `fix(supervisor): always sync gateway auth config on startup` | 21.B | 首次启动 | P0 |
| 3 | `fix(ws): increase reconnect limit and add retry button` | 21.C | 连接韧性 | P1 |
| 4 | `chore: upgrade OpenClaw from 2026.3.13 to 2026.3.22` | 26.A | 引擎升级 | P0 |
| 5 | `chore: rebrand all user-facing text to 口袋龙虾` | 22.A | 品牌重塑 | P0 |
| 6 | `feat(ui): replace emoji with OpenClaw logo SVG` | 22.B | Logo | P1 |
| 7 | `feat(settings): per-provider API key card layout` | 23.A | 设置重设计 | P0 |
| 8 | `fix(settings): replace GitHub links with email feedback` | 23.B | 关于页面 | P1 |
| 9 | `feat(server): pass through channels config to OpenClaw` | 24.0 | 频道架构 | P0 |
| 10 | `feat(channels): add Feishu channel configuration` | 24.A | 飞书 | P0 |
| 11 | `feat(channels): add QQ Bot channel configuration` | 24.B | QQ | P0 |
| 12 | `feat(channels): add WeChat channel (experimental)` | 24.C | 微信 | P1 |
| 13 | `feat(channels): enhance Channels page with config and controls` | 24.D | 频道页面 | P1 |
| 14 | `feat(onboarding): redesign 4-step welcome flow` | 25.A | 引导流程 | P1 |
| 15 | `feat(update): add one-click update from settings UI` | 26.B | 一键更新 | P1 |
| 16 | `chore: bump version to 1.2.x, update CHANGELOG` | 26.C | 版本号 | — |

**前置验证清单**：

已完成（通过研究验证 ✅）：
- [✅] OpenClaw 3.22 的 `models.providers` Zod schema 兼容性 — 无 breaking changes
- [✅] OpenClaw 3.22 `gateway --allow-unconfigured` 有效性 — 仍有效
- [✅] Gateway Protocol v3 handshake 无变化 — 确认兼容
- [✅] OpenClaw Logo SVG 获取 + MIT 许可确认 — `openclaw/openclaw` 仓库 `ui/public/favicon.svg`
- [✅] 飞书插件配置格式确认 — `appId` + `appSecret`，WebSocket 默认
- [✅] QQ Bot 插件配置格式确认 — `appId` + `clientSecret`，个人可注册
- [✅] QQ 个人开发者注册可行性 — 2026.3 起零门槛开放

实施前必须完成（需要实际执行）：
- [ ] `npm install openclaw@2026.3.22` 本地安装测试
- [ ] `openclaw plugins install @openclaw/feishu` 在 3.22 下安装 + WebSocket 模式连接测试
- [ ] `openclaw plugins install @tencent-connect/openclaw-qqbot` 在 3.22 下安装 + 连接测试
- [ ] 微信 `wechat-openclaw-channel` 插件安装 + QClaw 模式扫码流程测试
- [ ] `channels.*` 配置写入 openclaw.json 后 hot-reload 验证（channel monitor 自动启动）
- [ ] `channels.status` RPC 返回格式验证（确认 Channels.tsx 可正确解析）
- [ ] 一键更新端点（`/api/update`）自我覆盖安全性测试
- [ ] CI 中预安装飞书 + QQ Bot 插件的命令正确性验证

---

## 里程碑

| 里程碑 | 内容 | 版本 | 状态 |
|--------|------|------|------|
| M1-M6 | v1.0.x 基础架构 | v1.0.0-v1.0.28 | ✅ |
| M7 | v1.1.0-v1.1.15 UI 重设计 + 关键 bug 修复 | v1.1.15 | ✅ |
| M8 | Phase 12：对话回复 + 全 provider 验证 | v1.1.16-v1.1.18 | ✅ |
| M9 | Phase 13：版本比较 + macOS + 安全绑定 | v1.1.19-v1.1.21 | 🔶 13.3/13.4 待验证 |
| M10 | Phase 14：安全增强 + Error Boundary | v1.1.22-v1.1.24 | 🔶 14.2/14.3 未开始 |
| M11 | Phase 15：代码质量 + 测试覆盖 | v1.1.25-v1.1.27 | ✅ |
| M12 | Phase 16：跨客户端消息同步 | v1.1.18-v1.1.20 | ✅ |
| M13 | Phase 17：稳定性修复 + 全 Provider | v1.1.26-v1.1.28 | ✅ |
| M14 | Phase 18：启动体验重做 + 预装 Skills | v1.1.32 | ✅ |
| M15 | Phase 19：安全加固 | v1.1.33 | ✅ |
| M16 | Phase 20：Provider 链路修复 + 扩展 | v1.1.34 | ✅ |
| M17 | Phase 21：稳定性修复 + 空气泡消除 | v1.2.0 | ⬜ |
| M18 | Phase 22：品牌重塑 口袋龙虾 + Logo | v1.2.1 | ⬜ |
| M19 | Phase 23：设置页重设计 + 关于页 | v1.2.2 | ⬜ |
| M20 | Phase 24：频道集成（飞书 + QQ + 微信） | v1.2.3 | ⬜ |
| M21 | Phase 25：4 步引导流程 | v1.2.4 | ⬜ |
| M22 | Phase 26：OpenClaw 3.22 升级 + 一键更新 | v1.2.5 | ⬜ |

---

## 技术架构参考

详见 `devdocs/openclaw-architecture-deep-dive.md`，关键要点：

- OpenClaw 是单 Node.js 进程，Gateway = 整个应用
- WebSocket Protocol v3：challenge-response + device identity + operator scopes（需 operator.admin 才能调 secrets.reload）
- API key 解析链：auth-profiles.json 内存快照 → 环境变量 → models.providers.*.apiKey → 失败
- auth-profiles.json 是**内存快照**（`runtimeAuthStoreSnapshots` Map），启动后不自动重读磁盘
- `secrets.reload` RPC 强制刷新快照（需 operator.admin scope）
- config hot-reload（chokidar 监听 openclaw.json）连带刷新 auth 快照
- MiniMax CN 端点：`api.minimaxi.com/anthropic`（非 `api.minimax.io`）

---

## Provider API 端点参考（已实测验证）

详见 Phase 12.2。关键发现：
- 5 个 OpenAI 兼容 provider 用 `GET /models` 验证（零 token 消耗）
- Anthropic 和 MiniMax 用 `POST` 验证
- 所有 7 个 provider 对无效 key 返回 HTTP 401

**v1.1.28 更新**：所有 7 个 provider 现在都有完整的 API 链路支持（baseUrl + api + models）。
Provider 配置统一定义在 `portable/system/shared-config.json`。
auth-profiles 使用 OpenClaw provider 名称：kimi→moonshot, glm→zhipu。

**v1.1.34 更新**：扩展到 9 个 provider，新增豆包（doubao）和 Gemini（gemini）。
- 豆包无 GET /models 端点，验证用 POST /chat/completions
- Gemini 3.x 系列全部 `-preview` 后缀（无 GA 版本）
- Gemini 端点在中国大陆被墙，UI 标注 "需海外网络"
- 修复 OpenAI/Anthropic 在 shared-config.json 中缺少顶级配置的问题
- 修复 masked API key 被 deepMerge 回写覆盖真实 key 的关键 bug

---

### Phase 26: v1.2.x 稳定化与频道集成（v1.2.0 — v1.2.13）

> **目标**: 简约模式重构 → PostSetup 落地页 + 18789 高级模式；QQ/飞书/微信频道端到端；更新机制修复
> **状态**: ✅ 已完成

| # | 任务 | 状态 | 版本 |
|---|------|------|------|
| 26.1 | 简约聊天替换为 PostSetup 落地页 | ✅ | v1.2.3 |
| 26.2 | Settings 左侧 Tab 导航（API Key / 频道 / 关于） | ✅ | v1.2.3 |
| 26.3 | QQ Bot 端到端（plugins.load.paths + 正确安装位置） | ✅ | v1.2.13 |
| 26.4 | 飞书端到端（内置插件，不额外安装） | ✅ | v1.2.12 |
| 26.5 | 微信 ClawBot 官方插件集成 | ✅ | v1.2.11 |
| 26.6 | 检查更新修复（CSP + GitHub API + 双版本显示） | ✅ | v1.2.7 |
| 26.7 | 一键更新下载修复（重试 + 超时 + drain） | ✅ | v1.2.13 |
| 26.8 | 默认模型改为 MiniMax（防止回退 Claude Opus） | ✅ | v1.2.7 |
| 26.9 | models.providers MERGE 不覆盖 | ✅ | v1.2.11 |
| 26.10 | HEARTBEAT 消息过滤 | ✅ | v1.2.7 |
| 26.11 | Chrome autofill 阻止 | ✅ | v1.2.4 |
| 26.12 | 66 ClawHub skills workspace 路径修复 | ✅ | v1.2.9 |

**经验教训**: 见 `devdocs/postmortem-v1.2.md`
