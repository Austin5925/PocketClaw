# Changelog

All notable changes to this project will be documented in this file.

## [1.2.0] - 2026-03-23

### Added

- **品牌重塑**: 所有用户可见文本从 "PocketClaw" 更名为 "口袋龙虾"，终端 banner、UI 标题、日志前缀全部更新
- **OpenClaw Logo**: 替换 emoji 龙虾为 OpenClaw 官方 SVG 龙虾 logo（红色渐变卡通风格），Sidebar 和 favicon 统一
- **每个 Provider 独立 API Key 卡片**: 设置页从单输入框改为 9 张 provider 配置卡片（国内 6 + 海外 3），支持独立保存、验证、设为默认
- **飞书/QQ/微信频道配置**: 在设置页和 Channels 页面添加飞书（WebSocket 模式）、QQ 机器人（官方平台）、微信（实验性）的配置入口
- **4 步引导流程**: Onboarding 从 2 步扩展为：欢迎 → 选模型 → 配频道（可选）→ 进入简约聊天
- **一键更新**: 设置页新增 "一键更新" 按钮，后台从 GitHub Release 下载、校验、备份、解压，支持进度显示
- **频道配置透传**: server.js 和 Go launcher 同步 `channels.*` 配置到 OpenClaw 内部 config，支持 hot-reload 启动频道监控

### Fixed

- **AI 空气泡 (P0)**: Gateway 发送空内容 delta/final 事件时产生空白气泡。修复三层防御：final 空内容转系统消息、ChatBubble 空内容返回 null、历史消息过滤空 assistant
- **Windows 首次启动失败 (P0)**: `syncInternalConfig` 在空 config 时被跳过，导致 gateway auth 配置缺失，UI 无法连接。修复：始终执行 sync
- **setup.bat 自拷贝 bug**: `copy "X" "X"` 源=目标=空操作，改为创建空 JSON 文件
- **Gateway 日志丢失**: supervisor 模式下 gateway stdout/stderr 被丢弃，现写入 pocketclaw.log
- **WS 重连过早放弃**: maxReconnectAttempts 从 5 提升到 20（~5 分钟）
- **Settings 返回按钮**: 指向不存在的 /dashboard 路由，改为 /
- **Dashboard hasApiKey**: 未经过 getProviderConfigKey 映射，导致 Kimi/GLM 等 provider 误判
- **关于页面链接**: 移除 GitHub 链接，反馈改为 mailto:ausdina@proton.me

### Changed

- **OpenClaw 升级**: 2026.3.13 → 2026.3.22（原生 MiniMax M2.7、Gateway 冷启动优化、exec 沙箱）

## [1.1.35] - 2026-03-21

### Fixed

- **路由守卫阻止进入主界面 (P0)**: `isConfigured` 检查拒绝 masked API key（`****xxxx`），而 `GET /api/config` 始终返回 masked key → 任何页面加载/导航后 `isConfigured = false` → 永远重定向回 onboarding。修复：masked key 表示服务端存有真实 key，视为已配置
- **Onboarding 存储 config key 不一致 (P0)**: Kimi/GLM/豆包/Gemini 的模型前缀（moonshot/zhipu/volcengine/google）与 config key（kimi/glm/doubao/gemini）不同，Onboarding 用 `model.split("/")[0]` 存储，但 `isConfigured` 用 `getProviderConfigKey()` 查找 → key 找不到。修复：Onboarding 统一使用 `getProviderConfigKey()`
- **Chat 页面模型切换误判 (P1)**: `hasApiKey` 和 `handleModelChange` 中的 masked key 检查导致已配置的 provider 显示"请先配置 API Key"

## [1.1.34] - 2026-03-21

### Fixed

- **"failed to fetch" 崩溃修复 (P0)**: `validateKeyRequest` 中 timeout + error 事件双重写入 response 导致 Node.js 崩溃（`ERR_HTTP_HEADERS_SENT`）。添加 `res.headersSent` 守卫
- **API Key 被覆盖修复 (P0)**: GET `/api/config` 返回 masked key `****xxxx` → 前端 deepMerge 保留 → PUT 回写覆盖真实 key → 所有 provider 失效。修复：服务端检测 `****` 前缀时保留文件中的真实 key；前端不加载 masked key 到输入框
- **OpenAI/Anthropic 配置缺失修复 (P0)**: `shared-config.json` 缺少 openai/anthropic 顶级配置（无 baseUrl/api/models），`syncInternalConfig` 不写入 OpenClaw → 这两个 provider 始终不可用
- **Provider ID 映射修复 (P1)**: Kimi 模型前缀 `moonshot/` 但 config 在 `kimi` 下，GLM 模型前缀 `zhipu/` 但 config 在 `glm` 下 → API Key 检查失败。添加 `getProviderConfigKey()` 统一映射

### Added

- **豆包 (Doubao) provider**: 字节跳动/火山引擎出品，Seed 2.0 Pro/Lite/Mini 三个模型，中国大陆端点直达
- **Gemini provider**: Google Gemini 3.1 Pro / 3 Flash / 3.1 Flash Lite，标注需海外网络
- **端到端 provider 链路测试**: 11 个集成测试覆盖全部 9 个 provider 的完整配置链（PUT → 文件写入 → auth-profiles → models.providers → masked key 保护）

### Changed

- `o4-mini` 模型改为 `gpt-4o-mini`（更经济的测试用模型）
- Provider 总数从 7 个扩展到 9 个（新增豆包 + Gemini）

## [1.1.33] - 2026-03-20

### Security

- **敏感文件权限收紧**: `openclaw.json`、`auth-profiles.json` 从 `0644` 改为 `0600`（仅所有者可读写），`.openclaw/` 目录从 `0755` 改为 `0700`，日志文件 `pocketclaw.log` 改为 `0600`
- **Node.js 下载 SHA256 校验**: `setup.sh`、`setup.bat` 和 CI 构建中下载 Node.js 后验证 SHA256 哈希值，防止中间人攻击和镜像篡改
- **固定 OpenClaw 版本**: `openclaw@latest` 改为 `openclaw@2026.3.13`，确保可复现构建，消除供应链风险
- **HTTP 安全响应头**: 所有 HTTP 响应添加 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Content-Security-Policy`、`Referrer-Policy: no-referrer`
- **移除环境变量 API key 传递**: 删除 `setProviderEnvVars()`，API key 仅通过 `auth-profiles.json` 和 `models.providers` 配置传递（环境变量在 `/proc/pid/environ` 可被读取）

### Fixed

- **无 API Key 可直接使用**: 移除配置模板中的默认 model（强制通过 onboarding 选择），Chat 页面发送消息和切换模型前校验当前 provider 有 API Key

## [1.1.32] - 2026-03-20

### Fixed

- **Mac "Node.js 未找到" 根因修复 (P0)**: 根因是 macOS App Translocation — 用户双击 `.app` 时 macOS 将其复制到临时目录运行，导致 Go 启动器算出的 `baseDir` 指向临时路径，找不到同级的 `app/runtime/`。改用 `.command` 脚本作为唯一入口，通过 `POCKETCLAW_BASE` 环境变量传递真实目录，彻底绕过 Translocation
- **Windows Smart App Control 拦截 (P0)**: Go 编译的 `.exe` 未签名被 SAC 直接拦截且无法绕过。改用 `启动PocketClaw.bat` 调用 Node.js（有 Node.js Foundation 签名）运行 `server.js --supervisor` 模式，SAC 不再拦截
- **setup.sh macOS tar 不兼容**: 移除 macOS BSD tar 不支持的 `--transform` 参数，改用 `/tmp` 解压 + `mv` 方式；Mac 上只下载当前 CPU 架构的 Node.js

### Changed

- **Mac 启动方式**: `启动PocketClaw.command` 替代 `.app` 成为唯一入口。`.app` 移入 `system/` 目录，用户目录只保留一个可执行文件
- **Windows 启动方式**: `启动PocketClaw.bat` 替代 `.exe` 成为主入口（Node.js --supervisor 模式）。`.exe` 移入 `system/` 目录
- **Node.js 下载源**: 新增 npmmirror.com 中国镜像为首选，nodejs.org 作为 fallback
- **恢复 Channels/Skills 页面**: 回滚 v1.1.31 的页面移除，为预装 skills 做准备

### Added

- **预装 66 个 ClawHub Skills**: CI 构建时自动安装 66 个精选 skill（中文/翻译/写作/教育/效率/编程/数据/图表/求职/生活/娱乐），开箱可用
- **server.js --supervisor 模式**: 完整的进程管理器，启动配置同步 + gateway 子进程 + 健康检查 + 浏览器打开 + 干净退出，替代 Windows 上的 Go 启动器
- **Go 启动器 POCKETCLAW_BASE 支持**: `resolveBaseDir()` 优先读取环境变量，避免 macOS App Translocation 问题
- **Go 启动器 SIGHUP 信号处理**: Mac Terminal 关闭时 Go 进程能收到信号并干净退出

## [1.1.31] - 2026-03-20

### Fixed

- **Mac "Node.js 未找到" (P0)**: `setup.sh` 的 `BASE_DIR` 路径计算错误（`../..` 跳了两级，应该只跳一级 `..`），导致 Node.js 下载到错误目录。同时启动器新增自动初始化：当 Node.js 或 OpenClaw 缺失时自动调用 `setup.sh` / `setup.bat` 下载，无需用户手动操作
- **WebSocket 断线重连后 pending 状态卡死**: 重连成功后现在会清理 `runIdToMsgId`、取消 send timeout、重置 pending 状态，再重新加载 history

### Changed

- **隐藏 Channels / Skills 页面**: OpenClaw 协议仅支持只读状态 RPC，无管理操作能力。移除侧栏入口避免用户困惑，保留 History 页面（sessions RPC 完整支持交互）
- **Provider 映射集中化**: `shared-config.json` providers 新增 `openclawId` 字段（kimi→moonshot, glm→zhipu），server.js 和 launcher 从中读取而非各自硬编码，消除 3 文件 2 语言的映射散布

### Added

- **Server API 集成测试**: 15 个测试覆盖 `/api/config` CRUD、`/api/version`、`/api/health`、`/api/validate-key`、静态文件服务、SPA fallback，使用 Node.js 内置 test runner

## [1.1.30] - 2026-03-20

### Fixed

- **chat.send requires idempotencyKey**: v1.1.29 removed `idempotencyKey` from `chat.send` params alongside the `ownRunIds` cleanup — but it's a required field in OpenClaw's RPC schema. Restored as `crypto.randomUUID()` (generated per-call, not tracked). This was never the regression cause in v1.1.27/v1.1.28 (that was `ownRunIds` triggering `chat.history` reload); v1.1.29 introduced a NEW error by over-removing.

## [1.1.29] - 2026-03-20

### Fixed

- **Simple mode chat regression (P0)**: Removed `ownRunIds` cross-client sync mechanism that was fundamentally broken — `idempotencyKey` (client UUID) ≠ `runId` (server UUID), so every AI response was misidentified as "cross-client" and triggered a `chat.history` reload that wiped in-progress assistant bubbles. Root cause of "AI 未返回内容" since v1.1.27
- **Launcher auth-profiles provider mismatch**: `writeAuthProfiles()` now maps kimi→moonshot and glm→zhipu (matching server.js), so OpenClaw resolves auth correctly for all providers at startup
- **Launcher only synced MiniMax config**: `syncConfigToOpenClaw()` now loads ALL provider configs (deepseek, moonshot, qwen, zhipu) from shared-config.json — previously only MiniMax had baseUrl/api/models in OpenClaw's internal config
- **WebSocket hardcoded to gateway port**: UI now connects via the server.js WS proxy (`ws://localhost:3210/ws`) instead of directly to `ws://localhost:18789/` — works regardless of port configuration

### Changed

- **Build format**: `build-portable.sh` now produces `.zip` instead of `.tar.gz` for better cross-platform compatibility (Windows users can extract natively)

## [1.1.28] - 2026-03-20

### Changed

- **All provider models updated to SOTA**: Each provider now offers 2-3 latest models verified from OpenClaw source and official APIs:
  - MiniMax: M2.7 + M2.7-highspeed
  - DeepSeek: deepseek-chat (V3.2) + deepseek-reasoner (replaces deprecated deepseek-coder)
  - Kimi: kimi-k2.5 (256K) + kimi-k2-thinking (replaces moonshot-v1-128k)
  - Qwen: qwen3.5-plus + qwen3-max + qwen-plus (replaces qwen-max)
  - GLM: glm-5 + glm-4.7 + glm-4.7-flash (replaces glm-4-plus/glm-4)
  - Anthropic: claude-sonnet-4-6 + claude-opus-4-6 + claude-haiku-4-5 (updated to 4.6 family)
  - OpenAI: gpt-5.4 + gpt-5.4-mini + o4-mini (replaces gpt-4o)
- **All provider API chains now work end-to-end**: DeepSeek, Moonshot, Qwen, Zhipu all have full provider configs (baseUrl, api, models) in shared-config.json + synced to OpenClaw internal config — previously only MiniMax was configured

### Fixed

- **Auth-profiles provider mismatch**: Kimi API keys were stored under provider "kimi" but OpenClaw looks for "moonshot" (model prefix); same for GLM→zhipu. Added provider name mapping so auth-profiles match OpenClaw's expected provider names

## [1.1.27] - 2026-03-20

### Fixed

- **Cross-client user message sync**: Simple mode now reloads chat history when receiving AI responses initiated by another client (advanced mode), so user questions appear on both sides
- **"Sender (untrusted metadata)" in sidebar**: Stripped OpenClaw envelope metadata prefixes from session titles and message previews — sidebar now shows clean user text instead of internal transcript markup
- **Envelope in chat history**: User messages loaded from history are cleaned of envelope prefixes for display

## [1.1.26] - 2026-03-20

### Fixed

- **Chat silent failure (3 bugs)**: Verified from OpenClaw dist source (`broadcastInternal` at line 21050) that chat events ARE wrapped under `payload` — devdocs `testing-and-sessions.md` had this wrong. Fixed three silent-failure bugs in `useGateway.ts` that were masking the true error:
  - **Bug A**: `chat.send` RPC `ok=false` silently dropped when no delta received yet — now surfaces immediately
  - **Bug B**: `state: "error"` chat event silently dropped when runId not in map (error before first delta) — now shown as error bubble
  - **Bug C**: `state: "final"` silently dropped when runId not in map (throttled deltas or no-agent path) — now creates assistant bubble or shows "AI 未返回内容"
- All three bugs caused "60s timeout then nothing" — any gateway-side failure is now immediately visible in the UI

## [1.1.25] - 2026-03-20

### Fixed

- **Prettier format**: `websocket.ts` long string literal was wrapped by Prettier (signature fallback value). No logic change.

## [1.1.24] - 2026-03-20

### Fixed

- **macOS Gatekeeper "无法验证" warning**: Rewrote `Mac-Start.command` as a first-launch helper — double-clicking it runs `xattr -cr` to remove the quarantine flag from the entire PocketClaw folder, then opens `启动PocketClaw.app`. The `.command` file shows a friendlier "open in Terminal?" dialog (with a direct Open button) vs the .app's "can't verify" dialog that requires System Preferences. After running once, the .app can be opened directly without any warning.
- **release.yml**: `Mac-Start.command` is now included in the mac zip (previously removed); `Mac-Menu.command` still excluded.

## [1.1.23] - 2026-03-20

### Fixed

- **Launcher: restore dangerouslyDisableDeviceAuth=true**: Belt-and-suspenders fix alongside v1.1.22 — even if `signChallenge` produces invalid keys, gateway won't verify device identity in local no-auth deployments (`gateway.auth.mode = "none"`). Removed in Phase 14.2 under the assumption that real Ed25519 would always work; restored after confirming it can silently fail.

## [1.1.22] - 2026-03-20

### Fixed

- **Simple mode chat broken**: `sendConnectFrame` was `async` with errors swallowed by `void` — if `signChallenge` threw (crypto.subtle unavailable, Ed25519 not supported, etc.), the connect frame was never sent, handshake never completed, and all messages silently timed out. Added try/catch with fallback to dummy device fields so the connect frame is always sent.

## [1.1.21] - 2026-03-20

### Security

- **Real Ed25519 device identity**: Browser now generates a persistent Ed25519 keypair (localStorage), signs gateway challenges with the correct payload (clientId, clientMode, scopes verified from OpenClaw source), and removes `dangerouslyDisableDeviceAuth` — Phase 14.2

### Changed

- `websocket.ts`: `sendConnectFrame` is now async; adds `deviceFamily: "desktop"` to connect frame

## [1.1.20] - 2026-03-20

### Fixed

- **Sidebar real-time updates**: Session list now refreshes immediately after each `chat.final` event so `lastMessagePreview` and `updatedAt` reflect the latest message — Phase 16.4

### Added

- **macOS ad-hoc codesign**: CI now runs `codesign --force --deep --sign -` on the .app bundle, allowing Gatekeeper bypass via right-click → Open — Phase 13.3
- **system/package.json**: Node.js >=22 engine requirement prevents silent breakage on upgrades — Phase 15.4
- **shared-config.json**: Single source of truth for all 9 provider IDs, env vars, validation URLs, and MiniMax model list; server.js and launcher both load from it — Phase 15.5

## [1.1.19] - 2026-03-20

### Fixed

- **Provider API key validation**: All 7 providers now validated — deepseek/moonshot/kimi/qwen/zhipu/openai use `GET /models` (zero token cost); minimax/anthropic use `POST /messages` — Phase 12.2
- **Semver comparison**: `useUpdate` now uses proper semver compare; `1.9.0 < 1.10.0` no longer broken — Phase 13.2
- **useConfig deep merge**: `updateConfig` now deep-merges nested objects, preventing sibling field loss on provider switch — Phase 15.3

### Added

- **React Error Boundary**: Root `<ErrorBoundary>` wraps the entire app; crashes show a 刷新页面 button instead of white screen — Phase 14.4
- **Send timeout**: `chat.send` auto-clears pending state after 60s with no delta, shows 请求超时 error — Phase 15.2
- **Test coverage**: 3 new tests — semver ordering, deep merge, timeout — Phase 15.7

### Security

- **API key masking**: `GET /api/config` now returns masked keys (last 4 chars only) — Phase 14.1
- **Localhost binding**: Server now binds to `127.0.0.1` only, no LAN exposure — Phase 13.5
- **Body size limit**: 1 MB max on all POST/PUT endpoints — Phase 15.6
- **CLAUDE.md removed from git**: Added to `.gitignore` and untracked — Phase 13.1

## [1.1.18] - 2026-03-20

### Fixed

- **Chat reply never displayed (always "...")**: Root cause: `state`/`message`/`runId` were in `event.payload`, not top-level. Fixed payload reading path — Phase 12.1
- **Cross-client message sync**: Replaced `pendingIdRef` with `runIdToMsgId` Map; all gateway `chat` events now handled regardless of sender — Phase 16.1/16.3
- **Handler registration race**: `GatewayWebSocket` now created in render body (lazy ref) so child effects can register handlers before parent effect fires — Phase 16.1
- **Session key mismatch**: Removed strict sessionKey filter that was dropping valid events; server-authoritative `mainSessionKey` now synced via hello-ok snapshot — Phase 16.2
- **secrets.reload**: Called on every WebSocket connect to force gateway to re-read auth-profiles.json — previously API key was not loaded on startup

### Added

- **Session history on connect**: `chat.history` loaded on every (re)connect — Phase 15.1/16.2
- **Sessions list on connect**: `sessions.list` called on connect to populate sidebar — Phase 16.2

## [1.1.16] - 2026-03-19

### Fixed

- **Onboarding bypass bug**: `isConfigured` guard moved to App-level `RequireConfig` wrapper
- **secrets.reload RPC**: Added `operator.admin` scope (required by OpenClaw) and call on every WS connect

## [1.1.0] - 2026-03-19

### Fixed (v1.0.1 — v1.0.28)

- **Gateway connection**: Implemented OpenClaw Protocol v3 challenge-response handshake with proper client ID (`openclaw-control-ui`), operator role/scopes, and device identity fields
- **API key delivery**: Agent auth reads from `auth-profiles.json`, not global config. Server now creates this file on every config save (fixed timing: onboarding saves AFTER gateway starts)
- **MiniMax endpoint**: Switched from international `api.minimax.io` to China `api.minimaxi.com` for domestic API keys
- **Config validation**: Complete `models.providers.minimax` entry (baseUrl, api, name, models) to pass Zod strict mode
- **Gateway auth**: Use `gateway.auth.mode: "none"` for local loopback (no token mismatch)
- **Config sync**: Direct JSON file write instead of spawning `openclaw config set` processes (~60s → instant)
- **Onboarding flow**: `isConfigured` now requires both model AND API key (template ships with model pre-set, was skipping onboarding)
- **Windows encoding**: `SetConsoleOutputCP(65001)` via Windows API for proper Chinese console display; added `查看日志.bat` for log viewing
- **CI/CD**: `go build main.go` → `go build .` for multi-file Go packages with build tags

### Changed

- Default model upgraded from MiniMax-M2.5 to **MiniMax-M2.7**
- Launcher rewritten as Go binary (.exe / .app) replacing batch/shell scripts
- README now bilingual (Chinese default + English)

### Added

- `devdocs/openclaw-architecture-deep-dive.md` — OpenClaw source architecture reference
- `查看日志.bat` — Windows log viewer with UTF-8 support
- `README_EN.md` — English README

## [1.0.0] - 2026-03-17

### Added

- **Portable Framework**: USB-bootable OpenClaw deployment with Mac/Windows support
  - `Mac-Start.command` / `Windows-Start.bat` launch scripts
  - `setup.sh` / `setup.bat` for Node.js + OpenClaw download and initialization
  - Portable Node.js runtime embedding (Mac ARM64/x64, Windows x64)
  - `OPENCLAW_HOME` redirection to USB data directory

- **Simple UI**: React 18 SPA with 4 core pages
  - Onboarding wizard (model selection + API Key input)
  - Dashboard (model status, gateway health, quick actions)
  - Chat interface (WebSocket messaging, streaming response)
  - Settings (model switching, API Key management, version info)
  - "Advanced Mode" toggle to OpenClaw native Control UI

- **Communication Layer**: Gateway WebSocket integration
  - `useGateway` hook with auto-reconnect and streaming support
  - `useConfig` hook for configuration read/write via REST API
  - WebSocket proxy in UI server

- **Update Mechanism**: Version checking and update scripts
  - GitHub Releases integration
  - `useUpdate` hook for UI-integrated version checking
  - `migrate.js` for configuration compatibility across versions

- **Build & CI/CD**
  - GitHub Actions CI (lint, typecheck, test, build)
  - GitHub Actions Release (auto-publish on version.txt change)

- **Testing**: 12 unit tests across 3 hook test suites

- **Documentation**: README, tutorial, FAQ, contributing guide
