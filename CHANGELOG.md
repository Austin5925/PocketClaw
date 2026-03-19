# Changelog

All notable changes to this project will be documented in this file.

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
