# PocketClaw

**便携 AI 助手 — 插上 U 盘，双击即用**

基于 [OpenClaw](https://github.com/openclaw/openclaw) (MIT) 构建的便携 U 盘 AI 助手。将完整的 AI 助手装进 U 盘，插上任何 Mac 或 Windows 电脑即可使用，**无需安装任何软件，无需打开命令行**。

## 使用方法

只需两步：

### 第一步：双击启动

将 U 盘插入电脑，打开 U 盘，找到启动文件并双击：

- **Windows 用户** → 双击 `启动 PocketClaw.exe`
- **Mac 用户** → 双击 `启动 PocketClaw.app`

> **Mac 用户注意**：如果提示"无法打开"，请右键点击文件，选择"打开"，然后在弹窗中再点一次"打开"。这是 macOS 的安全提示，只需操作一次。

### 第二步：开始使用

浏览器会自动打开。按照页面引导：

1. 选择 AI 模型（推荐 DeepSeek，国内免翻墙）
2. 输入 API Key（[如何获取？](docs/TUTORIAL.md)）
3. 开始聊天！

就是这么简单。关闭启动窗口即可停止。

## 特性

- **零安装** — 不需要安装任何软件，不需要打开命令行
- **双击即用** — 一个文件启动一切，开箱即用，无需等待
- **小白友好** — 简洁中文界面，引导式配置
- **多模型支持** — DeepSeek、Kimi、通义千问、Claude、GPT 等
- **跨平台** — macOS (Apple Silicon / Intel) + Windows 10/11
- **一键更新** — 界面内检查更新
- **完全开源** — MIT 许可证，代码透明
- **高级模式** — 随时切换到 OpenClaw 原生管理界面

## 系统要求

- **macOS**: Apple Silicon (M1/M2/M3/M4) 或 Intel, macOS 12 以上
- **Windows**: Windows 10 或 11, 64 位
- **内存**: 2GB 以上（推荐 4GB）
- **U 盘**: 2GB 以上（推荐 4GB+ USB 3.0 高速 U 盘）
- **网络**: 聊天时需要联网（调用云端 AI 模型）

## 遇到问题？

- [使用教程](docs/TUTORIAL.md) — 详细图文指南
- [常见问题](docs/FAQ.md) — 常见问题解答
- [提交反馈](https://github.com/ausdin/PocketClaw/issues) — 在 GitHub 上反馈问题

## 面向开发者

详见 [贡献指南](docs/CONTRIBUTING.md)。

## 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Node.js 22 (便携二进制) |
| AI 核心 | OpenClaw (MIT) |
| 启动器 | Go 编译（.exe / .app） |
| 简约 UI | React + TypeScript + Tailwind CSS |
| 构建 | Vite |
| 通信 | WebSocket |

## 许可证

[MIT](LICENSE) — 基于 OpenClaw (MIT) 构建，简约 UI 和工具链为原创。
