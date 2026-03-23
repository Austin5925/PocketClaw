# 贡献指南

感谢你对口袋龙虾的关注！欢迎提交 Issue 和 Pull Request。

## 开发环境

1. Clone 仓库
2. 进入 `ui/` 目录
3. 运行 `pnpm install`
4. 运行 `pnpm dev` 启动开发服务器

## 代码规范

- TypeScript 严格模式
- ESLint + Prettier 格式化
- 提交前运行 `pnpm lint && pnpm test && pnpm build`

## Commit 规范

使用 Conventional Commits：

```
feat(ui): add model selection page
fix(portable): fix Windows path issue
docs: update tutorial
```

## 提交 Issue

- Bug: 包含复现步骤、系统环境、错误日志
- Feature: 说明使用场景和期望行为

## 许可证

贡献的代码将采用 MIT 许可证。
