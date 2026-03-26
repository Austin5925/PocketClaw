# 口袋龙虾 (PocketClaw)

**便携 AI 助手 — 插上 U 盘，双击即用**

[English](README_EN.md)

基于 [OpenClaw](https://github.com/openclaw/openclaw) (MIT) 构建的便携 U 盘 AI 助手。将完整的 AI 助手装进 U 盘，插上任何 Mac 或 Windows 电脑即可使用，**无需安装任何软件，无需打开命令行**。

## 快速开始

### Windows

1. 将 U 盘插入电脑
2. 打开 U 盘，双击 **`启动PocketClaw.bat`**
3. 浏览器自动打开，按引导完成设置

### macOS

1. 将 U 盘插入电脑
2. 打开 U 盘，**右键** `启动PocketClaw.command` → **打开**

> **首次打开提示"无法验证开发者"？** 这是 macOS 的安全限制。请右键点击文件 → 选择"打开" → 在弹窗中再次点击"打开"即可。之后双击就能正常启动。或者在"系统设置 → 隐私与安全性"中点击"仍要打开"。

3. 浏览器自动打开，按引导完成设置

### 首次设置

启动后浏览器会打开引导页面（4 步）：

1. **欢迎** — 确认开始
2. **选择模型 + API Key** — 推荐 MiniMax（国内免翻墙），[如何获取 API Key？](docs/api-keys.md)
3. **连接聊天平台**（可选）— 飞书、QQ、微信 ClawBot，[详细指南](docs/channels.md)
4. **完成** — 自动跳转到 AI 界面

设置完成后，以后每次插上 U 盘双击启动即可直接使用。

## 特性

- **零安装** — 不需要安装任何软件，不需要打开命令行
- **双击即用** — 一个文件启动一切，开箱即用
- **小白友好** — 简洁中文界面，4 步引导式配置
- **多模型支持** — MiniMax、DeepSeek、Kimi、通义千问、智谱、Claude、GPT、Gemini 等 9 家
- **聊天平台集成** — 飞书、QQ、微信 ClawBot（WebSocket/长连接，无需公网 IP）
- **跨平台** — macOS (Apple Silicon / Intel) + Windows 10/11
- **一键更新** — 界面内检查更新，一键升级
- **完全开源** — MIT 许可证，代码透明

## 修改配置

设置完成后，如果需要更换 API Key、切换模型、或修改频道配置：

- 打开浏览器访问 **http://localhost:3210/settings**
- 或在落地页点击"设置"

左侧 Tab 切换：模型 API Key / 频道接入 / 关于与更新。

## 系统要求

| | 要求 |
|---|---|
| **macOS** | Apple Silicon (M1/M2/M3/M4) 或 Intel, macOS 12+ |
| **Windows** | Windows 10 或 11, 64 位 |
| **内存** | 2GB+（推荐 4GB） |
| **U 盘** | 2GB+（推荐 4GB+ USB 3.0） |
| **网络** | 聊天时需要联网（调用云端 AI） |

## 遇到问题？

- [API Key 获取指南](docs/api-keys.md)
- [飞书 / QQ / 微信配置](docs/channels.md)
- [常见问题](docs/FAQ.md)
- [反馈建议](mailto:ausdina@proton.me)

## 面向开发者

详见 [贡献指南](docs/CONTRIBUTING.md)。

### 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Node.js 22 (便携二进制) |
| AI 核心 | OpenClaw (MIT) |
| 启动器 | Go + Node.js |
| 配置 UI | React 18 + TypeScript + Tailwind CSS |
| 构建 | Vite 5 |
| 通信 | WebSocket (OpenClaw Gateway Protocol v3) |

### 本地开发

```bash
# UI 开发
cd ui && pnpm install && pnpm dev

# 构建 + 检查
cd ui && pnpm lint && pnpm test && pnpm build

# Launcher（Go 交叉编译）
cd launcher && GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o "../portable/system/启动PocketClaw.exe" .
cd launcher && GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o "../portable/system/启动PocketClaw.app/Contents/MacOS/PocketClaw-arm64" .
```

## 许可证

[MIT](LICENSE) — 基于 OpenClaw (MIT) 构建。
