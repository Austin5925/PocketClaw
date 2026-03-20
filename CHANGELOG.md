# Changelog

All notable changes to this project will be documented in this file.

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
