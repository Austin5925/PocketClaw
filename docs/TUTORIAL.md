# PocketClaw 使用教程

## 准备工作

### 你需要

1. 一个 4GB+ 的 U 盘（推荐 USB 3.0 SSD 型）
2. 一台 Mac 或 Windows 电脑
3. 网络连接（用于首次初始化和 AI 对话）
4. 一个 AI 模型的 API Key

### 获取 API Key

推荐使用 DeepSeek（性价比最高）：

1. 访问 https://platform.deepseek.com
2. 注册账号
3. 进入"API Keys"页面
4. 创建新的 API Key
5. 复制保存（只显示一次！）

## 步骤一：初始化

将 U 盘插入电脑，打开终端/命令提示符：

**macOS：**
```bash
cd /Volumes/你的U盘名/portable
bash system/setup.sh
```

**Windows：**
```
cd E:\portable
system\setup.bat
```

初始化过程会下载 Node.js 运行时和 OpenClaw 核心，大约 2.3GB，请耐心等待。

## 步骤二：启动

- **macOS**: 双击 `Mac-Start.command` 文件
- **Windows**: 双击 `Windows-Start.bat` 文件

> 如果 macOS 提示"无法打开"，右键选择"打开"，然后点击"打开"确认。

启动后浏览器会自动打开。

## 步骤三：首次配置

1. **选择 AI 模型** — 点击你想使用的模型提供商
2. **输入 API Key** — 粘贴你之前获取的 Key
3. **点击"开始使用"** — 完成！

## 日常使用

### 聊天

在主面板点击"开始聊天"，输入问题，按 Enter 发送。

### 切换模型

进入"设置"页面，选择新的模型，输入对应的 API Key，点击"保存设置"。

### 检查更新

进入"设置"页面，滚动到"系统更新"，点击"检查更新"。

### 高级模式

在主面板点击"切换到高级模式"，可以使用 OpenClaw 原生管理界面，配置聊天平台、技能等。

### 管理菜单

- **macOS**: 双击 `Mac-Menu.command`
- **Windows**: 双击 `Windows-Menu.bat`

提供启动、更新、重新初始化等功能。

## 常见问题

见 [FAQ.md](FAQ.md)。

## 安全提示

- API Key 存储在 U 盘的配置文件中，请妥善保管 U 盘
- 建议在模型提供商处设置 API Key 使用限额
- 不要在不信任的电脑上使用
