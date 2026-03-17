#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PORTABLE_DIR="$PROJECT_ROOT/portable"
RELEASE_DIR="$PROJECT_ROOT/release"
VERSION=$(cat "$PORTABLE_DIR/version.txt" 2>/dev/null | tr -d '[:space:]')

log() { echo "[Build Portable] $*"; }

log "=== Building PocketClaw v${VERSION} Portable Package ==="

# Step 1: Build UI
log "Step 1: Building UI..."
bash "$SCRIPT_DIR/build-ui.sh"

# Step 2: Download runtimes if not present
log "Step 2: Checking runtimes..."
if [ ! -d "$PORTABLE_DIR/app/runtime/node-darwin-arm64/bin" ]; then
    log "Downloading Node.js runtimes..."
    bash "$PORTABLE_DIR/system/setup.sh" node
fi

# Step 3: Install OpenClaw if not present
log "Step 3: Checking OpenClaw..."
if [ ! -d "$PORTABLE_DIR/app/core/node_modules" ]; then
    log "Installing OpenClaw..."
    bash "$PORTABLE_DIR/system/setup.sh" openclaw
fi

# Step 4: Build launchers
log "Step 4: Building launchers..."
if command -v go &>/dev/null; then
    cd "$PROJECT_ROOT/launcher"

    GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o "$PORTABLE_DIR/启动 PocketClaw.exe" main.go
    log "Windows .exe built"

    GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o "$PORTABLE_DIR/启动 PocketClaw.app/Contents/MacOS/PocketClaw-arm64" main.go
    log "Mac ARM64 binary built"

    GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -o "$PORTABLE_DIR/启动 PocketClaw.app/Contents/MacOS/PocketClaw-x64" main.go
    log "Mac x64 binary built"

    chmod +x "$PORTABLE_DIR/启动 PocketClaw.app/Contents/MacOS/launcher"
    chmod +x "$PORTABLE_DIR/启动 PocketClaw.app/Contents/MacOS/PocketClaw-arm64"
    chmod +x "$PORTABLE_DIR/启动 PocketClaw.app/Contents/MacOS/PocketClaw-x64"
else
    log "WARNING: Go not found, skipping launcher build"
fi

# Step 5: Package
log "Step 5: Packaging..."
mkdir -p "$RELEASE_DIR"

FULL_PACKAGE="$RELEASE_DIR/PocketClaw-v${VERSION}-full.tar.gz"
UPDATE_PACKAGE="$RELEASE_DIR/PocketClaw-v${VERSION}-update.tar.gz"

log "Creating full package..."
tar -czf "$FULL_PACKAGE" \
    -C "$PROJECT_ROOT" \
    --exclude='portable/data/.openclaw/credentials' \
    --exclude='portable/data/memory/*.md' \
    --exclude='portable/data/backups/*' \
    portable/

log "Creating update package (app/ only)..."
tar -czf "$UPDATE_PACKAGE" \
    -C "$PORTABLE_DIR" \
    app/ui/ \
    app/core/ \
    system/ \
    version.txt

log "=== Build Complete ==="
log "Full package:   $FULL_PACKAGE ($(du -h "$FULL_PACKAGE" | cut -f1))"
log "Update package: $UPDATE_PACKAGE ($(du -h "$UPDATE_PACKAGE" | cut -f1))"
