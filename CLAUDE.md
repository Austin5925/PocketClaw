# PocketClaw

面向电脑小白的便携 U 盘 AI 助手产品。目标用户是非技术背景的普通人，主要面向中国大陆受众。
核心体验：插上 U 盘 → 双击一个文件 → 浏览器自动打开 → 开始用。
用户永远不需要打开命令行、不需要安装任何软件、不需要知道任何技术概念。
首次启动自动检测并完成初始化，无需手动 setup。

## 项目结构

- `ui/` — 简约 UI 源码（React 18 + TypeScript + Tailwind CSS + Vite）
- `launcher/` — Go 启动器源码（交叉编译为 .exe / .app）
- `portable/` — U 盘文件骨架（启动器产物、运行时、配置模板、系统工具）
- `scripts/` — 构建和发布脚本
- `docs/` — 面向用户的文档
- `devdocs/` — 开发内部文档（已 gitignore，不公开），包含 research.md、plan.md、openclaw-architecture-deep-dive.md

## 技术栈

- **运行时**: Node.js ≥22 便携二进制
- **AI 核心**: OpenClaw (MIT)
- **启动器**: Go（交叉编译，Windows 和 macOS 平台特定 build tags）
- **简约 UI**: React 18 + TypeScript + Tailwind CSS 3 + Vite 5
- **路由**: React Router 6
- **通信**: WebSocket 连接 OpenClaw Gateway Protocol v3 (ws://localhost:18789)
- **UI 服务**: Express 静态文件服务器 (端口 3210) + WS 代理
- **默认模型**: MiniMax M2.7（中国大陆端点 api.minimaxi.com）
- **包管理**: pnpm
- **测试**: Vitest + React Testing Library
- **代码规范**: ESLint + Prettier

## OpenClaw 集成关键点

- **Gateway Protocol v3**: challenge-response 握手 → connect frame（client.id: openclaw-control-ui, role: operator, scopes: operator.read/write）
- **Auth**: gateway.auth.mode = "none"（本地部署），dangerouslyDisableDeviceAuth = true（scoped to controlUi）
- **API Key 存储**: `auth-profiles.json`（agent auth store），不在全局 config models.providers 中
- **MiniMax 端点**: 必须用 `api.minimaxi.com/anthropic`（CN），默认的 `api.minimax.io` 是国际端点
- **models.providers**: 条目必须完整（baseUrl + api + models[].id + models[].name），Zod strict 拒绝不完整条目
- **配置同步**: server.js 在每次 `/api/config` PUT 时同步 auth-profiles.json + internal config
- **架构参考**: `devdocs/openclaw-architecture-deep-dive.md`

## 开发规范

### Git

- **仅使用 master 分支**，直接开发，不使用 feature branch
- **Conventional Commits**: `<type>(<scope>): <subject>`，type 包括 feat/fix/docs/style/refactor/test/chore/perf
- subject 用英文，不超过 72 字符，每个 commit 只做一件事
- 完成一批功能后自动 commit + push，不需要等用户指示
- CHANGELOG.md 由 Claude 维护，按版本分组

### 代码

- TypeScript 严格模式 (`strict: true`)，禁止使用 `any`
- 组件文件 PascalCase，Hook 文件 `use<Name>.ts`，工具函数 camelCase
- CSS 优先 Tailwind utility class，避免自定义 CSS
- 只在逻辑不自明处加注释，公共函数/Hook 需 JSDoc

### 测试

- 核心 Hook（useGateway、useConfig）必须有单元测试
- 页面组件建议有测试
- 端到端验证由 Claude 进行，需要人类帮助时再提出

## 常用命令

```bash
# UI 开发
cd ui && pnpm install        # 安装依赖
cd ui && pnpm dev            # 启动开发服务器
cd ui && pnpm build          # 构建生产版本
cd ui && pnpm lint           # ESLint 检查
cd ui && pnpm test           # 运行测试

# 本地预检（commit 前，必须全部通过）
cd ui && pnpm lint && pnpm test && pnpm build

# Go launcher（必须用 go build . 不是 go build main.go）
cd launcher && go vet .
cd launcher && GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o "../portable/启动 PocketClaw.exe" .
cd launcher && GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o "../portable/PocketClaw-arm64" .
```

## 用户体验原则

- **用户永远不接触命令行** — 所有操作通过双击文件或 Web UI 完成
- **首次启动自动初始化** — 启动脚本检测到缺少运行时/OpenClaw 时自动运行 setup
- **所有提示使用中文** — 启动窗口、错误信息、UI 界面全部中文
- **交付形式** — Windows: `启动 PocketClaw.exe`（Go 编译）；Mac: `启动 PocketClaw.app`（.app bundle）
- **启动器源码** — `launcher/main.go` + build-tagged 平台文件
- **自动发布** — 修改 `portable/version.txt` 并 push 到 master，GitHub Actions 自动打 tag + 发布 Release
- **面向对象** — 非技术背景用户（电脑小白），不能假设用户知道任何技术概念

## 注意事项

- `devdocs/plan.md` 是权威实施计划，任务状态在此追踪
- OpenClaw Gateway 默认端口 18789，简约 UI 服务端口 3210
- `portable/app/core/` 和 `portable/app/runtime/` 通过 setup 脚本下载，不进 git
- 用户数据目录 `portable/data/` 中只有配置模板进 git
- Windows 日志文件（UTF-8）在 CMD 默认 GBK 下显示乱码，使用 `查看日志.bat` 查看
