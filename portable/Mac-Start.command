#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/app"
DATA_DIR="$SCRIPT_DIR/data"
SYSTEM_DIR="$SCRIPT_DIR/system"

GATEWAY_PORT=18789
UI_PORT=3210

log() { echo "[PocketClaw] $*"; }
error() { echo "[PocketClaw ERROR] $*" >&2; }

detect_node() {
    local arch="$(uname -m)"
    if [ "$arch" = "arm64" ]; then
        NODE_BIN="$APP_DIR/runtime/node-darwin-arm64/bin/node"
    else
        NODE_BIN="$APP_DIR/runtime/node-darwin-x64/bin/node"
    fi
}

auto_setup() {
    detect_node

    if [ ! -f "$NODE_BIN" ] || [ ! -d "$APP_DIR/core/node_modules" ]; then
        log "首次启动，正在自动初始化（需要联网，约 5-15 分钟）..."
        log "请不要关闭此窗口。"
        echo ""
        bash "$SYSTEM_DIR/setup.sh"
        echo ""
        log "初始化完成！"
        detect_node
    fi

    if [ ! -f "$NODE_BIN" ]; then
        error "Node.js 运行时未找到，初始化可能失败。"
        error "请检查网络连接后重试。"
        echo "按 Enter 键退出..."
        read -r
        exit 1
    fi

    export PATH="$(dirname "$NODE_BIN"):$PATH"
}

cleanup() {
    log "正在关闭..."
    [ -n "${GATEWAY_PID:-}" ] && kill "$GATEWAY_PID" 2>/dev/null
    [ -n "${UI_PID:-}" ] && kill "$UI_PID" 2>/dev/null
    wait 2>/dev/null
    log "已退出"
}
trap cleanup EXIT INT TERM

start_gateway() {
    log "正在启动 AI 引擎..."
    export OPENCLAW_HOME="$DATA_DIR/.openclaw"

    local openclaw_bin="$APP_DIR/core/node_modules/.bin/openclaw"
    "$openclaw_bin" gateway --port "$GATEWAY_PORT" &
    GATEWAY_PID=$!

    local retries=0
    while ! curl -sf "http://127.0.0.1:$GATEWAY_PORT/health" >/dev/null 2>&1; do
        retries=$((retries + 1))
        if [ $retries -gt 30 ]; then
            error "AI 引擎启动超时，请重试。"
            echo "按 Enter 键退出..."
            read -r
            exit 1
        fi
        sleep 1
    done
    log "AI 引擎已启动"
}

start_ui() {
    log "正在启动界面..."
    "$NODE_BIN" "$SYSTEM_DIR/server.js" &
    UI_PID=$!
    sleep 1
}

main() {
    echo ""
    echo "  ╔══════════════════════════════╗"
    echo "  ║       PocketClaw 启动中      ║"
    echo "  ║    便携 AI 助手 · 插上即用   ║"
    echo "  ╚══════════════════════════════╝"
    echo ""
    log "版本: $(cat "$SCRIPT_DIR/version.txt" 2>/dev/null || echo '未知')"

    auto_setup
    start_gateway
    start_ui

    log "正在打开浏览器..."
    open "http://localhost:$UI_PORT"

    echo ""
    log "PocketClaw 已启动！"
    log "如果浏览器没有自动打开，请手动访问: http://localhost:$UI_PORT"
    echo ""
    log "关闭此窗口即可停止 PocketClaw"

    wait
}

main "$@"
