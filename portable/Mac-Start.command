#!/bin/bash
# PocketClaw macOS 首次启动助手
# 功能：清除系统安全隔离标记，避免 Gatekeeper "无法验证" 警告
# 使用方法：首次使用时双击本文件，之后直接双击"启动PocketClaw.app"即可

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  ╔═══════════════════════════════════╗"
echo "  ║    PocketClaw macOS 首次初始化    ║"
echo "  ╚═══════════════════════════════════╝"
echo ""
echo "[PocketClaw] 正在清除 macOS 安全隔离标记..."

if xattr -cr "$SCRIPT_DIR" 2>/dev/null; then
    echo "[PocketClaw] ✓ 清除完成"
else
    echo "[PocketClaw] （已跳过，可能无需清除）"
fi

APP="$SCRIPT_DIR/启动PocketClaw.app"
if [ ! -d "$APP" ]; then
    echo ""
    echo "[错误] 未找到 启动PocketClaw.app，请确认文件完整。"
    echo "按 Enter 键退出..."
    read -r
    exit 1
fi

echo ""
echo "[PocketClaw] 正在启动 PocketClaw..."
open "$APP"

echo ""
echo "[PocketClaw] 已启动！"
echo "[PocketClaw] 之后可以直接双击 启动PocketClaw.app 打开，无需再运行本脚本。"
echo ""
echo "（3 秒后自动关闭此窗口）"
sleep 3
