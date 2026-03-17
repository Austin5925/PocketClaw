# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-03-17

### Added

- **Portable Framework**: USB-bootable OpenClaw deployment with Mac/Windows support
  - `Mac-Start.command` / `Windows-Start.bat` launch scripts
  - `Mac-Menu.command` / `Windows-Menu.bat` management menus
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
  - Health check polling for gateway status
  - WebSocket proxy in UI server

- **Update Mechanism**: Version checking and update scripts
  - `update.sh` / `update.bat` with GitHub Releases integration
  - `useUpdate` hook for UI-integrated version checking
  - 5-snapshot backup rotation before updates
  - `migrate.js` for configuration compatibility across versions

- **Build & CI/CD**
  - `scripts/build-ui.sh` for UI build and deployment
  - `scripts/build-portable.sh` for full USB package creation
  - `scripts/release.sh` for GitHub Release artifact generation
  - GitHub Actions CI (lint, typecheck, test, build)
  - GitHub Actions Release (auto-publish on tag push)

- **Testing**: 12 unit tests across 3 hook test suites
  - `useConfig` tests (load, error, update)
  - `useGateway` tests (connect, send, clear, validation)
  - `useUpdate` tests (version check, update detection, error handling)

- **Documentation**
  - README with quick start guide and tech stack overview
  - User tutorial (TUTORIAL.md)
  - FAQ (FAQ.md)
  - Contributing guide (CONTRIBUTING.md)
  - GitHub issue templates (bug report, feature request)
