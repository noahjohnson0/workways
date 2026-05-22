#!/usr/bin/env bash
# with-derived-data — isolate Xcode DerivedData per worktree.
#
# Why: Xcode's default DerivedData is shared across worktrees with the same
# project name, so `.o` files compiled with one worktree's RCT_METRO_PORT get
# reused by the next worktree's build — silently baking the wrong Metro port
# into the resulting .app. See issue #82.
#
# This wrapper computes a stable per-worktree DerivedData path (sha1 of the
# git toplevel) and shims `xcodebuild` on PATH to inject `-derivedDataPath`
# unless the caller already passed one. Works with `expo run:ios`, which
# spawns `xcodebuild` via PATH lookup.
#
# Usage:
#   with-derived-data.sh -- <cmd...>
#
# Composes inside with-metro.sh / with-lock.sh:
#   sim-lock/with-lock.sh --claim-any -- \
#   metro-lock/with-metro.sh --claim-any -- \
#   metro-lock/with-derived-data.sh -- \
#     npx expo run:ios --device "$IOS_DEVICE_NAME"

set -euo pipefail

if [[ "${1:-}" == "--" ]]; then shift; fi
if [[ $# -eq 0 ]]; then
  echo "with-derived-data: missing command (use -- to separate)" >&2
  exit 2
fi

WORKTREE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
HASH="$(printf '%s' "$WORKTREE_ROOT" | shasum | cut -c1-12)"
DD_ROOT="$HOME/Library/Developer/Xcode/DerivedData/cumbretrial-wt-$HASH"
mkdir -p "$DD_ROOT"

REAL_XCODEBUILD="$(/usr/bin/which xcodebuild 2>/dev/null || true)"
if [[ -z "$REAL_XCODEBUILD" ]]; then
  echo "with-derived-data: xcodebuild not found on PATH" >&2
  exit 4
fi

SHIM_DIR="$(mktemp -d -t with-derived-data.XXXXXX)"
trap 'rm -rf "$SHIM_DIR"' EXIT INT TERM

cat > "$SHIM_DIR/xcodebuild" <<SHIM
#!/usr/bin/env bash
# Auto-generated shim — injects -derivedDataPath unless caller already set it.
for arg in "\$@"; do
  if [[ "\$arg" == "-derivedDataPath" ]]; then
    exec "$REAL_XCODEBUILD" "\$@"
  fi
done
exec "$REAL_XCODEBUILD" -derivedDataPath "$DD_ROOT" "\$@"
SHIM
chmod +x "$SHIM_DIR/xcodebuild"

echo "with-derived-data: isolating DerivedData at $DD_ROOT" >&2
PATH="$SHIM_DIR:$PATH" "$@"
