#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNTIME_DIR="$BASE_DIR/app/runtime"
CORE_DIR="$BASE_DIR/app/core"

NODE_VERSION="22.22.1"
NODE_BASE_URL="https://nodejs.org/dist/v${NODE_VERSION}"

log() { echo "[PocketClaw Setup] $*"; }
error() { echo "[ERROR] $*" >&2; exit 1; }

download_node() {
    local platform="$1"
    local arch="$2"
    local ext="$3"
    local dirname="node-${platform}-${arch}"
    local target_dir="$RUNTIME_DIR/$dirname"

    if [ -d "$target_dir/bin" ] || [ -f "$target_dir/node.exe" ]; then
        log "$dirname already exists, skipping"
        return 0
    fi

    local filename="node-v${NODE_VERSION}-${platform}-${arch}.${ext}"
    local url="${NODE_BASE_URL}/${filename}"

    log "Downloading $filename ..."
    mkdir -p "$target_dir"

    if [ "$ext" = "tar.gz" ]; then
        curl -fSL "$url" | tar xz -C "$RUNTIME_DIR" --strip-components=1 \
            --transform "s|^[^/]*|$dirname|" 2>/dev/null || \
        curl -fSL "$url" | tar xz -C "/tmp" && \
            mv "/tmp/node-v${NODE_VERSION}-${platform}-${arch}"/* "$target_dir/" && \
            rm -rf "/tmp/node-v${NODE_VERSION}-${platform}-${arch}"
    elif [ "$ext" = "zip" ]; then
        local tmpzip="/tmp/${filename}"
        curl -fSL "$url" -o "$tmpzip"
        unzip -qo "$tmpzip" -d "/tmp"
        mv "/tmp/node-v${NODE_VERSION}-${platform}-${arch}"/* "$target_dir/"
        rm -f "$tmpzip"
        rm -rf "/tmp/node-v${NODE_VERSION}-${platform}-${arch}"
    fi

    log "$dirname downloaded successfully"
}

install_openclaw() {
    log "Installing OpenClaw..."
    mkdir -p "$CORE_DIR"

    local node_bin=""
    local os_type="$(uname -s)"
    local arch_type="$(uname -m)"

    if [ "$os_type" = "Darwin" ]; then
        if [ "$arch_type" = "arm64" ]; then
            node_bin="$RUNTIME_DIR/node-darwin-arm64/bin/node"
        else
            node_bin="$RUNTIME_DIR/node-darwin-x64/bin/node"
        fi
    elif [ "$os_type" = "Linux" ]; then
        node_bin="$RUNTIME_DIR/node-linux-x64/bin/node"
    else
        error "Unsupported OS: $os_type. Use setup.bat for Windows."
    fi

    if [ ! -f "$node_bin" ]; then
        error "Node.js binary not found at $node_bin. Download it first."
    fi

    local npm_bin="$(dirname "$node_bin")/../lib/node_modules/npm/bin/npm-cli.js"
    export PATH="$(dirname "$node_bin"):$PATH"

    log "Using Node.js: $("$node_bin" --version)"

    "$node_bin" "$npm_bin" install --prefix "$CORE_DIR" openclaw@latest

    log "OpenClaw installed successfully"
    "$node_bin" "$npm_bin" list --prefix "$CORE_DIR" openclaw 2>/dev/null || true
}

setup_data() {
    log "Setting up data directories..."
    mkdir -p "$BASE_DIR/data/.openclaw"
    mkdir -p "$BASE_DIR/data/memory"
    mkdir -p "$BASE_DIR/data/backups"

    if [ ! -f "$BASE_DIR/data/.openclaw/openclaw.json" ]; then
        cp "$SCRIPT_DIR/../data/.openclaw/openclaw.json" "$BASE_DIR/data/.openclaw/openclaw.json" 2>/dev/null || true
    fi
    log "Data directories ready"
}

main() {
    log "=== PocketClaw Setup ==="
    log "Base directory: $BASE_DIR"

    local mode="${1:-all}"

    case "$mode" in
        node)
            log "Downloading Node.js runtimes..."
            download_node "darwin" "arm64" "tar.gz"
            download_node "darwin" "x64" "tar.gz"
            download_node "win" "x64" "zip"
            ;;
        openclaw)
            install_openclaw
            ;;
        all)
            log "Downloading Node.js runtimes..."
            download_node "darwin" "arm64" "tar.gz"
            download_node "darwin" "x64" "tar.gz"
            download_node "win" "x64" "zip"
            install_openclaw
            setup_data
            ;;
        *)
            echo "Usage: $0 [node|openclaw|all]"
            exit 1
            ;;
    esac

    log "=== Setup Complete ==="
}

main "$@"
