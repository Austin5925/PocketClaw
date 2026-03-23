#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNTIME_DIR="$BASE_DIR/app/runtime"
CORE_DIR="$BASE_DIR/app/core"

NODE_VERSION="22.22.1"
OPENCLAW_VERSION="2026.3.22"
# Chinese mirror (faster in mainland China), fall back to official
NODE_MIRROR_URL="https://npmmirror.com/mirrors/node/v${NODE_VERSION}"
NODE_OFFICIAL_URL="https://nodejs.org/dist/v${NODE_VERSION}"

# SHA256 checksums from https://nodejs.org/dist/v22.22.1/SHASUMS256.txt
declare -A NODE_SHA256=(
    ["darwin-arm64"]="679ad4966339e4ef4900f57996714864e4211b898825bb840c3086c419fbcef2"
    ["darwin-x64"]="07b13722d558790fca20bb1ecf61bde24b7a4863111f7be77fc57251a407359a"
    ["win-x64"]="877cb93829e14fffbbc7903e7d8037336c9a79f3ea43c5d0b8c2379b79da56de"
)

log() { echo "[口袋龙虾] $*"; }
error() { echo "[ERROR] $*" >&2; exit 1; }

verify_sha256() {
    local file="$1"
    local expected="$2"
    local actual
    if command -v shasum &>/dev/null; then
        actual=$(shasum -a 256 "$file" | awk '{print $1}')
    elif command -v sha256sum &>/dev/null; then
        actual=$(sha256sum "$file" | awk '{print $1}')
    else
        log "WARNING: No SHA256 tool found, skipping verification"
        return 0
    fi
    if [ "$actual" != "$expected" ]; then
        error "SHA256 verification failed for $(basename "$file")\n  Expected: $expected\n  Got:      $actual"
    fi
    log "SHA256 verified: $(basename "$file")"
}

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
    local mirror_url="${NODE_MIRROR_URL}/${filename}"
    local official_url="${NODE_OFFICIAL_URL}/${filename}"
    local hash_key="${platform}-${arch}"
    local expected_hash="${NODE_SHA256[$hash_key]:-}"

    log "Downloading $filename ..."
    mkdir -p "$target_dir"

    # Download to temp file first (for SHA256 verification)
    local tmpfile="/tmp/pocketclaw-${filename}"

    # Try Chinese mirror first, fall back to official
    if ! curl -fSL --connect-timeout 10 "$mirror_url" -o "$tmpfile" 2>/dev/null; then
        curl -fSL "$official_url" -o "$tmpfile"
    fi

    # Verify SHA256
    if [ -n "$expected_hash" ]; then
        verify_sha256 "$tmpfile" "$expected_hash"
    fi

    # Extract
    if [ "$ext" = "tar.gz" ]; then
        local tmpdir="/tmp/pocketclaw-node-$$"
        mkdir -p "$tmpdir"
        tar xz -C "$tmpdir" < "$tmpfile"
        mv "$tmpdir/node-v${NODE_VERSION}-${platform}-${arch}"/* "$target_dir/"
        rm -rf "$tmpdir"
    elif [ "$ext" = "zip" ]; then
        unzip -qo "$tmpfile" -d "/tmp"
        mv "/tmp/node-v${NODE_VERSION}-${platform}-${arch}"/* "$target_dir/"
        rm -rf "/tmp/node-v${NODE_VERSION}-${platform}-${arch}"
    fi

    rm -f "$tmpfile"
    log "$dirname downloaded successfully"
}

install_openclaw() {
    log "Installing OpenClaw v${OPENCLAW_VERSION}..."
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

    "$node_bin" "$npm_bin" install --prefix "$CORE_DIR" "openclaw@${OPENCLAW_VERSION}"

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
    log "=== 口袋龙虾 Setup ==="
    log "Base directory: $BASE_DIR"

    local mode="${1:-all}"
    local os_type="$(uname -s)"
    local arch_type="$(uname -m)"

    case "$mode" in
        node)
            log "Downloading Node.js runtimes..."
            if [ "$os_type" = "Darwin" ]; then
                # Mac: only download current architecture
                if [ "$arch_type" = "arm64" ]; then
                    download_node "darwin" "arm64" "tar.gz"
                else
                    download_node "darwin" "x64" "tar.gz"
                fi
            else
                # CI / Linux: download all platforms
                download_node "darwin" "arm64" "tar.gz"
                download_node "darwin" "x64" "tar.gz"
                download_node "win" "x64" "zip"
            fi
            ;;
        openclaw)
            install_openclaw
            ;;
        all)
            log "Downloading Node.js runtimes..."
            if [ "$os_type" = "Darwin" ]; then
                if [ "$arch_type" = "arm64" ]; then
                    download_node "darwin" "arm64" "tar.gz"
                else
                    download_node "darwin" "x64" "tar.gz"
                fi
            else
                download_node "darwin" "arm64" "tar.gz"
                download_node "darwin" "x64" "tar.gz"
                download_node "win" "x64" "zip"
            fi
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
