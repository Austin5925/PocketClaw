#!/bin/bash
clear
echo ""
echo "  🦞 PocketClaw"
echo ""
echo "  正在启动，请稍候..."
echo "  （此窗口为 PocketClaw 运行窗口，请勿关闭）"
echo ""

DIR="$(cd "$(dirname "$0")" && pwd)"

# Clear macOS quarantine to prevent App Translocation
xattr -cr "$DIR" 2>/dev/null

export POCKETCLAW_BASE="$DIR"

if [ "$(uname -m)" = "arm64" ]; then
    "$DIR/system/启动PocketClaw.app/Contents/MacOS/PocketClaw-arm64"
else
    "$DIR/system/启动PocketClaw.app/Contents/MacOS/PocketClaw-x64"
fi
