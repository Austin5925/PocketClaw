#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PORTABLE_DIR="$PROJECT_ROOT/portable"
RELEASE_DIR="$PROJECT_ROOT/release"
VERSION=$(cat "$PORTABLE_DIR/version.txt" 2>/dev/null | tr -d '[:space:]')

log() { echo "[Release] $*"; }

log "=== PocketClaw Release v${VERSION} ==="

FULL_PACKAGE="$RELEASE_DIR/PocketClaw-v${VERSION}-full.tar.gz"
UPDATE_PACKAGE="$RELEASE_DIR/PocketClaw-v${VERSION}-update.tar.gz"

if [ ! -f "$FULL_PACKAGE" ] || [ ! -f "$UPDATE_PACKAGE" ]; then
    log "Build artifacts not found, building first..."
    bash "$SCRIPT_DIR/build-portable.sh"
fi

if git tag -l "v${VERSION}" | grep -q "v${VERSION}"; then
    log "Tag v${VERSION} already exists"
else
    log "Creating git tag v${VERSION}..."
    git tag -a "v${VERSION}" -m "Release v${VERSION}"
    log "Tag created. Push with: git push origin v${VERSION}"
fi

log "=== Release artifacts ready ==="
log "Full:   $FULL_PACKAGE"
log "Update: $UPDATE_PACKAGE"
log ""
log "To publish:"
log "  1. git push origin v${VERSION}"
log "  2. GitHub Actions will create the release automatically"
log "  3. Or manually: gh release create v${VERSION} $FULL_PACKAGE $UPDATE_PACKAGE"
