#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
UI_DIR="$PROJECT_ROOT/ui"
DEST_DIR="$PROJECT_ROOT/portable/app/ui/dist"

log() { echo "[Build UI] $*"; }

log "Building PocketClaw UI..."

cd "$UI_DIR"

if [ ! -d "node_modules" ]; then
    log "Installing dependencies..."
    pnpm install
fi

log "Running type check..."
npx tsc --noEmit

log "Building..."
npx vite build

log "Copying to portable directory..."
rm -rf "$DEST_DIR"
mkdir -p "$DEST_DIR"
cp -R dist/* "$DEST_DIR/"

log "Build complete! Output: $DEST_DIR"
ls -lh "$DEST_DIR"
