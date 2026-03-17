# PocketClaw

面向电脑小白的便携 U 盘 AI 助手产品。目标用户是非技术背景的普通人。
核心体验：插上 U 盘 → 双击一个文件 → 浏览器自动打开 → 开始用。
用户永远不需要打开命令行、不需要安装任何软件、不需要知道任何技术概念。
首次启动自动检测并完成初始化，无需手动 setup。

## 项目结构

- `ui/` — 简约 UI 源码（React 18 + TypeScript + Tailwind CSS + Vite）
- `portable/` — U 盘文件骨架（启动脚本、运行时、配置模板、系统工具）
- `scripts/` — 构建和发布脚本
- `docs/` — 面向用户的文档
- `devdocs/` — 开发内部文档（已 gitignore，不公开），包含 research.md 和 plan.md

## 技术栈

- **运行时**: Node.js ≥22 便携二进制
- **AI 核心**: OpenClaw (MIT)
- **简约 UI**: React 18 + TypeScript + Tailwind CSS 3 + Vite 5
- **路由**: React Router 6
- **通信**: WebSocket 连接 OpenClaw Gateway (ws://localhost:18789)
- **UI 服务**: Express 静态文件服务器 (端口 3210)
- **包管理**: pnpm
- **测试**: Vitest + React Testing Library
- **代码规范**: ESLint + Prettier

## 开发规范

### Git

- **仅使用 master 分支**，直接开发，不使用 feature branch
- **Conventional Commits**: `<type>(<scope>): <subject>`，type 包括 feat/fix/docs/style/refactor/test/chore/perf
- subject 用英文，不超过 72 字符，每个 commit 只做一件事
- 完成一批功能后自动 commit + push，不需要等用户指示
- CHANGELOG.md 由 Claude 维护，按版本分组
- Phase 完成时打 tag（如 `phase-1-done`），Release 打 `v1.0.0` 格式 tag

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

# 本地预检（commit 前）
cd ui && pnpm lint && pnpm test && pnpm build
```

## 用户体验原则

- **用户永远不接触命令行** — 所有操作通过双击文件或 Web UI 完成
- **首次启动自动初始化** — 启动脚本检测到缺少运行时/OpenClaw 时自动运行 setup
- **所有提示使用中文** — 启动窗口、错误信息、UI 界面全部中文
- **最终交付形式** — Windows: .exe 启动器；Mac: .app 启动器（包裹 shell 脚本）
- **面向对象** — 非技术背景用户（电脑小白），不能假设用户知道任何技术概念

## 注意事项

- `devdocs/plan.md` 是权威实施计划，任务状态在此追踪
- OpenClaw Gateway 默认端口 18789，简约 UI 服务端口 3210
- `portable/app/core/` 和 `portable/app/runtime/` 通过 setup 脚本下载，不进 git
- 用户数据目录 `portable/data/` 中只有配置模板进 git
