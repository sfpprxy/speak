#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE_DIR="${CACHE_DIR:-/tmp/npm-cache-speaker}"
ACCESS="${ACCESS:-public}"
TAG="${TAG:-latest}"

LOG_DIR="$REPO_ROOT/.publish-logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/publish-$(date +"%Y%m%d-%H%M%S").log"

exec > >(tee -a "$LOG_FILE") 2>&1

log() {
  printf '[%s] %s\n' "$(date +"%Y-%m-%d %H:%M:%S")" "$*"
}

die() {
  log "ERROR: $*"
  log "Quit. Log file: $LOG_FILE"
  exit 1
}

run_cmd() {
  log "+ $*"
  "$@"
}

publish_pkg_dir() {
  local pkg_dir="$1"
  local pkg_name

  pkg_name="$(cd "$pkg_dir" && npm pkg get name --json | tr -d '"')"
  if [[ -z "$pkg_name" || "$pkg_name" == "null" ]]; then
    die "Cannot read package name in $pkg_dir"
  fi

  (
    cd "$pkg_dir" || exit 1
    run_cmd npm publish --access "$ACCESS" --tag "$TAG" --cache "$CACHE_DIR"
  )
}

main() {
  cd "$REPO_ROOT" || die "Cannot cd to repo root"

  log "Repo root: $REPO_ROOT"
  log "Cache dir: $CACHE_DIR"
  log "Publish access: $ACCESS"
  log "Publish tag: $TAG"
  log "Log file: $LOG_FILE"

  run_cmd bun --version
  run_cmd npm --version
  run_cmd git status --short --branch

  run_cmd npm whoami --cache "$CACHE_DIR"

  publish_pkg_dir "$REPO_ROOT/packages/speak-darwin-arm64"
  publish_pkg_dir "$REPO_ROOT/packages/speak-darwin-x64"
  publish_pkg_dir "$REPO_ROOT/packages/speak-linux-x64-gnu"
  publish_pkg_dir "$REPO_ROOT/packages/speak-linux-arm64-gnu"
  publish_pkg_dir "$REPO_ROOT/packages/speak-linux-x64-musl"
  publish_pkg_dir "$REPO_ROOT/packages/speak-linux-arm64-musl"
  publish_pkg_dir "$REPO_ROOT/packages/speak-win32-x64-msvc"

  run_cmd npm publish --access "$ACCESS" --tag "$TAG" --cache "$CACHE_DIR"

  log "Publish flow finished successfully."
  log "Log file: $LOG_FILE"
}

main "$@"
