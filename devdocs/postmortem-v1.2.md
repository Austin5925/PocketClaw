# v1.2.x Postmortem: 从简约模式重构到频道集成

**时间范围**: 2026-03-23 至 2026-03-26
**版本范围**: v1.2.0 — v1.2.13
**作者**: Claude Code (自动生成)

---

## 概述

v1.2.x 系列的目标是将简约模式从内置聊天界面重构为 PostSetup 落地页 + 18789 高级模式，并端到端集成 QQ Bot、飞书、微信三个频道插件。过程中遭遇了 7 个主要事故，导致 13 个补丁版本。核心问题集中在：对 OpenClaw 内部机制（插件发现、npm 包内容、配置热重载）的假设与实际行为不符。

---

## 事故 1: Gateway 因 channels 配置崩溃 (v1.2.0 → v1.2.1)

### 症状
- 简约模式下 AI 无回复
- 高级模式出现 "control ui" 错误

### 时间线
| 版本 | 动作 | 结果 |
|------|------|------|
| v1.2.0 | syncInternalConfig 将 `channels.feishu` 写入 openclaw.json | Gateway 热重载时触发 plugin-not-found 错误 |
| v1.2.1 | 条件透传：仅当插件已安装时写入 channels 配置 | 修复 |

### 根因
`syncInternalConfig` 在同步配置时无条件将 `channels.feishu` 等字段写入 OpenClaw 的 `openclaw.json`。OpenClaw 3.13 在配置热重载时发现 `channels.feishu` 引用了 feishu 插件，但该插件未安装，触发 plugin-not-found 错误导致 gateway 功能异常。

### 修复
在 `syncInternalConfig` 中添加条件判断：只有当对应插件已安装（检查 node_modules 或 extensions 目录）时才透传 channels 配置。

### 教训
**永远不要写入引用未安装插件的配置字段。** OpenClaw 会在配置热重载时验证所有 channels 配置对应的插件是否存在。

---

## 事故 2: 18789 "Control UI assets not found" (v1.2.2 → v1.2.3)

### 症状
将前端重定向到 18789 端口后，页面显示 "Control UI assets not found" 错误。

### 时间线
| 版本 | 动作 | 结果 |
|------|------|------|
| v1.2.2 | 将默认前端从 3210 切换到 18789（OpenClaw Gateway） | 18789 返回错误页面 |
| v1.2.3 | 恢复 3210 为前端，CI 从 OpenClaw 源码构建 Control UI | 修复 |

### 根因
假设 OpenClaw 的 npm 包中包含预编译的 Control UI（Lit SPA）。实际上 npm 包**不含** Control UI 静态资源——Gateway 在 `dist/control-ui/index.html` 查找但找不到文件。Control UI 需要从 OpenClaw 的 GitHub 源码仓库单独构建。

### 修复
- 恢复 3210（Express 静态服务器）作为用户前端
- CI 流程中从 OpenClaw 源码仓库 clone 并构建 Control UI
- 构建产物放置到 `portable/dist/control-ui/`，Gateway 通过 cwd 发现

### 教训
**在依赖 npm 包中的特定文件之前，必须验证这些文件确实存在。** 不要假设 npm 包包含项目源码中的所有构建产物。

---

## 事故 3: 默认模型回退到 Claude Opus (v1.2.7)

### 症状
全新安装的 PocketClaw 默认使用 `anthropic/claude-opus-4-6`，该模型在中国大陆需要 VPN 才能访问。

### 根因
`syncInternalConfig` 在用户配置为空（首次安装）时未显式设置 `agents.defaults.model`。OpenClaw 回退到编译时的硬编码默认值 `anthropic/claude-opus-4-6`。

### 修复
在 `syncInternalConfig` 中始终设置 `agents.defaults.model` 为 `minimax/MiniMax-M2.7`，确保首次安装即使用国内可直连的模型。

### 教训
**面向中国用户的产品，必须显式设置所有默认值。** 不能依赖上游项目的默认配置，因为上游默认值通常面向国际用户。

---

## 事故 4: QQ Bot "unknown channel id" (v1.2.7 → v1.2.10)

### 症状
配置 QQ Bot 后，消息发送报 "unknown channel id" 错误，QQ Bot 无法工作。

### 时间线（四次失败尝试）
| 版本 | 尝试 | 结果 |
|------|------|------|
| v1.2.7 | Onboarding 使用 config key "qq" | 失败——OpenClaw 使用 "qqbot" |
| v1.2.8 | 修正为 "qqbot" | 失败——插件安装到错误目录 |
| v1.2.9 | 插件安装到 `$OPENCLAW_HOME/node_modules/` | 失败——OpenClaw 不扫描该目录 |
| v1.2.10 | 在 openclaw.json 中添加 `plugins.load.paths` 显式注册 | **修复** |

### 根因
OpenClaw 只通过 `manifest-registry` 扫描三个特定路径发现插件（stock extensions、global extensions、workspace extensions），**不会**扫描 `$OPENCLAW_HOME/node_modules/`。npm 安装到 node_modules 的插件必须通过 `plugins.load.paths` 配置显式注册。

### 修复
在 `openclaw.json` 中添加 `plugins.load.paths` 数组，包含每个 npm 安装插件的绝对路径。

### 教训
**在假设安装方式之前，必须阅读 OpenClaw 的实际插件发现代码（manifest-registry）。** npm install 不等于插件注册。

---

## 事故 5: 飞书 plugin-sdk/compat 错误 (v1.2.11 → v1.2.12)

### 症状
飞书插件加载失败，报错 `ERR_PACKAGE_PATH_NOT_EXPORTED`。

### 根因
CI 流程中通过 `npm install @openclaw/feishu` 安装了飞书插件。但飞书从 OpenClaw 3.22 开始已经是内置插件（位于 `dist/extensions/feishu/`）。npm 安装引入了一个独立的 `openclaw` 传递依赖，与主 openclaw 包产生冲突，导致 `plugin-sdk/compat` 子路径导出解析失败。

### 修复
- 从 CI 构建脚本中移除 `@openclaw/feishu` 的 npm install
- 依赖 OpenClaw 内置的 `dist/extensions/feishu/` 目录

### 教训
**内置插件（dist/extensions/ 中的）绝对不能通过 npm 再次安装。** 重复安装会引入冲突的传递依赖。

---

## 事故 6: 插件位置导致启动崩溃 (v1.2.11 → v1.2.13)

### 症状
Gateway 启动时崩溃，健康检查超时。

### 时间线
| 版本 | 尝试 | 结果 |
|------|------|------|
| v1.2.11 | 将社区插件安装到 `$OPENCLAW_HOME/node_modules/` | 崩溃——`require("openclaw/plugin-sdk")` 失败 |
| v1.2.12 | 移除 openclaw 传递依赖 | 仍然崩溃——插件仍找不到 plugin-sdk |
| v1.2.13 | 将社区插件安装到 `app/core/node_modules/`（与 openclaw 同级） | **修复** |

### 根因
Node.js 的 `require()` 从调用文件所在目录开始向上遍历 `node_modules` 目录链查找依赖。当插件位于 `$OPENCLAW_HOME/node_modules/` 时，其 `require("openclaw/plugin-sdk")` 会在 `$OPENCLAW_HOME/` 向上的目录链中查找 `openclaw` 包，但 `openclaw` 主包实际安装在 `app/core/node_modules/`——完全不同的目录树。因此 require 解析失败。

### 修复
将所有社区插件（qqbot、weixin）npm install 到 `app/core/node_modules/`，与 `openclaw` 主包处于同一 node_modules 目录。

### 教训
**Node.js require() 从文件自身目录向上解析。插件必须与其依赖的主包在同一个 node_modules 树中。** 这是 Node.js 模块解析的基本机制，便携 U 盘场景中尤其容易踩坑。

---

## 事故 7: 一键更新下载挂起 (v1.2.9)

### 症状
一键更新功能卡在 "下载中" 状态超过 30 分钟无响应。

### 根因
下载 GitHub Release 资产时遇到 302 重定向。代码未调用 `res.resume()` 消耗原始响应的 body，导致连接池阻塞。同时缺少重试机制和整体超时。

### 修复
- 对 302 响应调用 `res.resume()` 及时释放连接
- 添加最多 3 次重试
- 添加 5 分钟整体超时

### 教训
**所有 HTTP 响应都必须消耗（drain）body，即使不需要内容。** 网络操作必须有超时和重试机制。

---

## 关键架构决策总结

### 插件安装
- **社区插件**（qqbot、weixin）：必须 npm install 到 `app/core/node_modules/`（与 openclaw 同级）
- **内置插件**（feishu）：已在 OpenClaw `dist/extensions/` 中，**不要** npm install
- **插件发现**：npm 安装的插件需在 `openclaw.json` 的 `plugins.load.paths` 中显式注册

### 配置
- **OPENCLAW_HOME**：`data/.openclaw`（OpenClaw 配置/状态目录），**不是**插件安装位置
- **默认模型**：必须显式设置为 `minimax/MiniMax-M2.7`（中国用户）
- **channels 配置**：仅在对应插件已安装时透传

### UI 架构
- **Control UI**：需从 OpenClaw 源码仓库单独构建，npm 包不含
- **前端入口**：3210 端口（Express 静态服务器），不是 18789（Gateway）

---

## 统计

- **总版本数**: 14（v1.2.0 — v1.2.13）
- **主要事故**: 7
- **失败尝试总数**: ~15
- **根因分类**:
  - 对 OpenClaw 内部机制假设错误: 4（事故 1, 2, 4, 5）
  - Node.js 模块解析理解不足: 2（事故 5, 6）
  - 网络编程基础遗漏: 1（事故 7）
  - 产品默认值缺失: 1（事故 3）

### 事故 8: 空 channels:{} 再次导致启动崩溃（v1.2.15 → v1.2.16）

| 项 | 内容 |
|---|---|
| **症状** | v1.2.15 Windows 点击 .bat 无法启动，与 v1.2.0 事故症状相同 |
| **时间** | v1.2.15 引入，v1.2.16 修复 |
| **根因** | 为实现微信 auto-enable，将 channels 透传逻辑改为"总是写 channels 对象"（包括空 `{}`）。在用户未配置任何频道的全新安装上，写入 `channels: {}` 触发 OpenClaw Zod 校验失败 → gateway 无法启动 |
| **修复** | 恢复条件：只在 `config.channels` 有实际内容时才写入。微信 auto-enable 只在用户已有其他频道配置时追加 |
| **教训** | **同一个 bug 第二次发生**（v1.2.0 第一次）。channels 字段极其敏感，必须满足两个条件才能写入内部 config：(1) 有安装的插件 (2) 有实际配置内容。永远不要写空 channels 对象。 |
| **微信影响** | 1.2.16 的修复意味着微信不会在全新安装时自动启用。用户必须先在 Settings 频道接入 Tab 点击"启用"（写入 `channels["openclaw-weixin"]: { enabled: true }`），然后到 18789 控制台扫码配对。这是正确的用户流程——微信需要扫码，自动启用一个无法使用的空频道只会造成 OpenClaw 报错。 |

### 核心反思

v1.2.x 系列的大部分问题源于**对 OpenClaw 内部行为的假设**未经验证就编码。改进方向：
1. 集成第三方系统时，先阅读其源码中的关键路径（插件发现、配置加载、资产查找）
2. 在 `devdocs/openclaw-architecture-deep-dive.md` 中记录每一个验证过的行为
3. 便携 U 盘环境下 Node.js 模块解析与标准 npm 项目不同，必须特别注意目录结构
4. **channels 字段是高风险区域**——永远不要写入空对象或引用未安装插件的频道 ID。相同 bug 已出现两次（v1.2.0 和 v1.2.15），必须作为硬规则记住
