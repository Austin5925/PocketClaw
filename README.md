# PocketClaw

**便携 AI 助手 — 插上 U 盘，双击即用**

基于 [OpenClaw](https://github.com/openclaw/openclaw) (MIT) 构建的便携 U 盘 AI 助手产品。将完整的 AI 助手装进 U 盘，插上任何 Mac 或 Windows 电脑即可使用，无需安装任何软件。

## 特性

- **即插即用** — U 盘插入，双击启动，无需安装
- **简约界面** — 面向普通用户的简洁 Web UI，告别复杂配置
- **多模型支持** — DeepSeek、Kimi、通义千问、Claude、GPT 等主流模型
- **跨平台** — macOS (Apple Silicon / Intel) + Windows 10/11
- **一键更新** — 通过菜单脚本或 UI 检查并执行更新
- **完全开源** — MIT 许可证，透明可信
- **高级模式** — 随时切换到 OpenClaw 原生管理界面

## 快速开始

### 1. 初始化（首次使用）

```bash
# macOS
cd /Volumes/YOUR_USB/portable
bash system/setup.sh

# Windows
cd E:\portable
system\setup.bat
```

此步骤会下载 Node.js 运行时和 OpenClaw 核心（约 2.3GB，需联网）。

### 2. 启动

- **macOS**: 双击 `Mac-Start.command`
- **Windows**: 双击 `Windows-Start.bat`

浏览器会自动打开 `http://localhost:3210`。

### 3. 首次配置

1. 选择 AI 模型提供商（推荐 DeepSeek）
2. 输入 API Key
3. 开始聊天！

## 界面预览

- **配置向导** — 引导式首次设置
- **主面板** — 查看模型、状态、快速入口
- **聊天界面** — 简洁的 AI 对话窗口
- **设置页面** — 模型切换、Key 管理、版本更新

## 目录结构

```
portable/
├── Mac-Start.command       # macOS 启动
├── Windows-Start.bat       # Windows 启动
├── Mac-Menu.command        # macOS 管理菜单
├── Windows-Menu.bat        # Windows 管理菜单
├── app/
│   ├── core/               # OpenClaw 核心
│   ├── runtime/            # Node.js 便携运行时
│   └── ui/dist/            # 简约 UI
├── data/                   # 用户数据（配置/记忆/备份）
└── system/                 # 系统工具（setup/update/migrate）
```

## 开发

```bash
# 安装 UI 依赖
cd ui && pnpm install

# 开发模式
pnpm dev

# 类型检查
pnpm typecheck

# 测试
pnpm test

# 构建
pnpm build

# 代码检查
pnpm lint
```

## 系统要求

- **macOS**: Apple Silicon (M1-M4) 或 Intel, macOS 12+
- **Windows**: 10/11, 64-bit
- **RAM**: 2GB+（推荐 4GB+）
- **U 盘**: 4GB+, USB 3.0 SSD 型推荐
- **网络**: 首次初始化和 AI 对话需要联网

## 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Node.js 22 (便携二进制) |
| AI 核心 | OpenClaw (MIT) |
| 简约 UI | React 18 + TypeScript + Tailwind CSS |
| 构建 | Vite |
| 通信 | WebSocket (Gateway) |

## 许可证

[MIT](LICENSE) — 基于 OpenClaw (MIT) 构建，简约 UI 和工具链为原创。
