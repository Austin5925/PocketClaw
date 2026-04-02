# 口袋龙虾 v1.2.30 版本更新

## 新功能

- **智谱 GLM 5.1 系列**：新增 GLM 5.1（最新旗舰，200K 上下文）和 GLM 5 Turbo（Agent 优化版），移除旧版 GLM 4.7 系列
- **模型描述优化**：9 家模型提供商描述更新，突出各自核心优势
- **频道官方图标**：飞书（Lark 三色 logo）、QQ（Simple Icons 企鹅）、微信（Simple Icons 气泡）替换原有 emoji
- **频道配置引导**：每个频道卡片顶部增加"第一步：前往平台创建应用并获取凭证"链接
- **海外模型标签**：Anthropic/GPT/Gemini 卡片标记"需海外网络"，验证失败时提示检查代理
- **已预装 66 个 AI 技能**：落地页显示技能提示（写作、编程、翻译、教育等）
- **代理设置说明**：增加格式示例和"留空使用系统代理"提示

## Bug 修复

- **端口占用检测（P0）**：server.js 启动时检测端口 3210 是否被占用，给出明确错误而非静默失败
- **OpenClaw 非消费级功能关闭**：禁用 heartbeat（30 分钟系统消息）、Bonjour 网络广播、浏览器控制（18791 端口）、Canvas 文件服务器
- **模型选择器交互**：点击下拉框外部区域自动关闭；下拉框改为浮层覆盖（不推挤页面），高度增加 50%
- **Gateway 启动提示**："检测中..."改为"正在启动 AI 引擎，通常需要 10-20 秒"
- **一键更新失败**：手动更新方法自动展开
- **微信标签**："实验性功能"改为"开发中，暂不支持"

## 模型列表

### 国内模型（6 家）
| 提供商 | 模型 |
|--------|------|
| MiniMax（推荐） | M2.7, M2.7 Highspeed, M2.5, M2.1 |
| DeepSeek | deepseek-chat, deepseek-reasoner |
| Kimi | kimi-k2.5, kimi-k2-thinking |
| 通义千问 | qwen3.5-plus, qwen3-max, qwen-turbo |
| 智谱 GLM | **glm-5.1**, glm-5, **glm-5-turbo**, glm-4.5-air |
| 豆包 | doubao-seed-2-0-pro/lite/mini |

### 海外模型（3 家，需海外网络）
| 提供商 | 模型 |
|--------|------|
| Claude (Anthropic) | claude-sonnet-4-6, claude-opus-4-6, claude-haiku-4-5 |
| GPT (OpenAI) | gpt-5.4, gpt-5.4-mini, gpt-4o-mini |
| Gemini (Google) | gemini-3.1-pro, gemini-3-flash, gemini-3.1-flash-lite |

## 频道接入
| 平台 | 状态 | 连接方式 |
|------|------|---------|
| 飞书 | ✅ 可用 | WebSocket（无需公网） |
| QQ | ✅ 可用 | WebSocket（无需公网） |
| 微信 | 🚧 开发中 | iLink 长轮询（Phase 28 实现） |
