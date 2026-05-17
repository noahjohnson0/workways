#!/usr/bin/env bash
# with-metro — run a command while holding a Metro port lock; release on exit.
#
# Usage:
#   with-metro.sh <port> -- <cmd...>
#   with-metro.sh --from-env RCT_METRO_PORT -- <cmd...>
#   with-metro.sh --claim-any -- <cmd...>
#
# Exports RCT_METRO_PORT=<port> so `expo run:ios` bakes the JS dev URL with the
# right port and `expo start` listens on that same port. Composes with
# with-lock.sh:
#
#   with-lock.sh --claim-any -- with-metro.sh --claim-any -- \
#     npx expo run:ios --device "iPhone 16 Pro"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
METRO_LOCK="$SCRIPT_DIR/metro-lock.mjs"

PORT=""
MODE="explicit"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-env)
      MODE="env"
      ENV_VAR="${2:?--from-env requires a variable name}"
      shift 2
      ;;
    --claim-any) MODE="any"; shift ;;
    --) shift; break ;;
    -*) echo "with-metro: unknown flag $1" >&2; exit 2 ;;
    *)
      PORT="$1"; shift
      if [[ "${1:-}" == "--" ]]; then shift; break; fi
      ;;
  esac
done

if [[ $# -eq 0 ]]; then
  echo "with-metro: missing command (use -- to separate)" >&2
  exit 2
fi

case "$MODE" in
  env)
    PORT="${!ENV_VAR:-}"
    [[ -n "$PORT" ]] || { echo "with-metro: $ENV_VAR is empty" >&2; exit 2; }
    node "$METRO_LOCK" acquire "$PORT" --pid "$$"
    ;;
  any)
    OUT="$(node "$METRO_LOCK" claim-any --pid "$$")"
    PORT="$(printf '%s\n' "$OUT" | sed -n 's/^PORT=//p')"
    [[ -n "$PORT" ]] || { echo "with-metro: claim-any did not return a PORT" >&2; exit 4; }
    ;;
  explicit)
    [[ -n "$PORT" ]] || { echo "with-metro: missing <port>" >&2; exit 2; }
    node "$METRO_LOCK" acquire "$PORT" --pid "$$"
    ;;
esac

cleanup() {
  node "$METRO_LOCK" release "$PORT" --pid "$$" || true
}
trap cleanup EXIT INT TERM

export RCT_METRO_PORT="$PORT"
"$@"
