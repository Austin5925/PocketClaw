#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION_FILE="$BASE_DIR/version.txt"
BACKUP_DIR="$BASE_DIR/data/backups"
GITHUB_REPO="Austin5925/PocketClaw"

log() { echo "[PocketClaw Update] $*"; }
error() { echo "[ERROR] $*" >&2; exit 1; }

get_current_version() {
    if [ -f "$VERSION_FILE" ]; then
        cat "$VERSION_FILE" | tr -d '[:space:]'
    else
        echo "0.0.0"
    fi
}

get_latest_version() {
    local latest
    latest=$(curl -sfL "https://api.github.com/repos/$GITHUB_REPO/releases/latest" \
        | grep '"tag_name"' | head -1 | sed 's/.*"v\([^"]*\)".*/\1/')
    echo "${latest:-}"
}

backup_current() {
    local version="$1"
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_path="$BACKUP_DIR/app-${version}-${timestamp}"

    log "Backing up current version to $backup_path..."
    mkdir -p "$backup_path"
    cp -R "$BASE_DIR/app" "$backup_path/" 2>/dev/null || true
    cp "$VERSION_FILE" "$backup_path/" 2>/dev/null || true

    # Keep only last 5 backups
    local count=$(ls -d "$BACKUP_DIR"/app-* 2>/dev/null | wc -l)
    if [ "$count" -gt 5 ]; then
        ls -dt "$BACKUP_DIR"/app-* | tail -n +6 | xargs rm -rf
    fi

    log "Backup complete"
}

download_update() {
    local version="$1"
    local url="https://github.com/$GITHUB_REPO/releases/download/v${version}/PocketClaw-v${version}-update.zip"
    local tmpfile="/tmp/pocketclaw-update-${version}.zip"

    log "Downloading update v${version}..."
    curl -fSL "$url" -o "$tmpfile" || error "Download failed"

    # Verify checksum if SHA256SUMS.txt is available
    local sums_url="https://github.com/$GITHUB_REPO/releases/download/v${version}/SHA256SUMS.txt"
    local sums_file="/tmp/pocketclaw-sha256sums.txt"
    if curl -sfL "$sums_url" -o "$sums_file" 2>/dev/null; then
        local expected
        expected=$(grep "update.zip" "$sums_file" | awk '{print $1}')
        if [ -n "$expected" ]; then
            local actual
            actual=$(shasum -a 256 "$tmpfile" | awk '{print $1}')
            if [ "$expected" != "$actual" ]; then
                rm -f "$tmpfile" "$sums_file"
                error "Checksum verification failed (expected $expected, got $actual)"
            fi
            log "Checksum verified"
        fi
        rm -f "$sums_file"
    fi

    log "Extracting update..."
    unzip -qo "$tmpfile" -d "$BASE_DIR" || error "Extraction failed"

    rm -f "$tmpfile"
    echo "$version" > "$VERSION_FILE"
    log "Update extracted"
}

run_migration() {
    local migrate_script="$SCRIPT_DIR/migrate.js"
    if [ -f "$migrate_script" ]; then
        log "Running migration..."
        local arch="$(uname -m)"
        local node_bin
        if [ "$arch" = "arm64" ]; then
            node_bin="$BASE_DIR/app/runtime/node-darwin-arm64/bin/node"
        else
            node_bin="$BASE_DIR/app/runtime/node-darwin-x64/bin/node"
        fi
        if [ -f "$node_bin" ]; then
            "$node_bin" "$migrate_script" "$BASE_DIR" || log "Migration had warnings"
        fi
    fi
}

main() {
    log "=== PocketClaw Update ==="

    local current=$(get_current_version)
    log "Current version: v${current}"

    log "Checking for updates..."
    local latest=$(get_latest_version)

    if [ -z "$latest" ]; then
        error "Could not check for updates. Check your network connection."
    fi

    log "Latest version: v${latest}"

    if [ "$current" = "$latest" ]; then
        log "Already up to date!"
        exit 0
    fi

    log "Update available: v${current} -> v${latest}"

    backup_current "$current"
    download_update "$latest"
    run_migration

    log "=== Update Complete ==="
    log "Please restart PocketClaw to apply the update."
}

main "$@"
