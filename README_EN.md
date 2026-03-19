# PocketClaw

**Portable AI Assistant — Plug in a USB drive, double-click, and go**

[中文](README.md)

A portable USB AI assistant built on [OpenClaw](https://github.com/openclaw/openclaw) (MIT). Carry a full AI assistant on a USB drive and use it on any Mac or Windows computer — **no installation required, no command line needed**.

## How to Use

Just two steps:

### Step 1: Double-click to launch

Plug in the USB drive, open it, and double-click the launcher:

- **Windows** → Double-click `启动 PocketClaw.exe`
- **Mac** → Double-click `启动 PocketClaw.app`

> **Mac users**: If you see "cannot be opened", right-click the file, select "Open", then click "Open" again in the dialog. This is a one-time macOS security prompt.

### Step 2: Start using

Your browser will open automatically. Follow the on-screen guide:

1. Choose an AI model (MiniMax recommended for users in China)
2. Enter your API Key ([How to get one?](docs/TUTORIAL.md))
3. Start chatting!

That's it. Close the launcher window to stop.

## Features

- **Zero installation** — No software to install, no command line
- **Double-click to start** — One file launches everything
- **Beginner-friendly** — Clean Chinese UI with guided setup
- **Multi-model support** — MiniMax, DeepSeek, Kimi, Qwen, Claude, GPT, and more
- **Cross-platform** — macOS (Apple Silicon / Intel) + Windows 10/11
- **One-click updates** — Check for updates from the UI
- **Fully open-source** — MIT license, transparent code
- **Advanced mode** — Switch to the native OpenClaw Control UI anytime

## System Requirements

- **macOS**: Apple Silicon (M1/M2/M3/M4) or Intel, macOS 12+
- **Windows**: Windows 10 or 11, 64-bit
- **RAM**: 2GB+ (4GB recommended)
- **USB**: 2GB+ (4GB+ USB 3.0 recommended)
- **Network**: Internet required for AI model API calls

## Need Help?

- [Tutorial](docs/TUTORIAL.md) — Step-by-step guide
- [FAQ](docs/FAQ.md) — Frequently asked questions
- [Report Issues](https://github.com/Austin5925/PocketClaw/issues) — GitHub issue tracker

## For Developers

See [Contributing Guide](docs/CONTRIBUTING.md).

### Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 (portable binary) |
| AI Core | OpenClaw (MIT) |
| Launcher | Go compiled (.exe / .app) |
| Simple UI | React 18 + TypeScript + Tailwind CSS |
| Build | Vite 5 |
| Protocol | WebSocket (OpenClaw Gateway Protocol v3) |

### Local Development

```bash
# UI development
cd ui && pnpm install && pnpm dev

# Build
cd ui && pnpm build

# Checks
cd ui && pnpm lint && pnpm test

# Launcher (Go cross-compile)
cd launcher && GOOS=windows GOARCH=amd64 go build -o "../portable/启动 PocketClaw.exe" .
```

## License

[MIT](LICENSE) — Built on OpenClaw (MIT). Simple UI and toolchain are original work.
