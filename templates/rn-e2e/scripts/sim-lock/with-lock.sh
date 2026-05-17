#!/usr/bin/env bash
# with-lock — run a command while holding a sim lock; release on exit.
#
# Usage:
#   with-lock.sh <udid> -- <cmd...>
#   with-lock.sh --from-env IOS_UDID -- <cmd...>
#   with-lock.sh --claim-any -- <cmd...>      # picks from ~/.workways/sim-pool.json
#
# Exits with the wrapped command's status. Releases the lock on EXIT/INT/TERM.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIM_LOCK="$SCRIPT_DIR/sim-lock.mjs"

UDID=""
MODE="explicit"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-env)
      MODE="env"
      ENV_VAR="${2:?--from-env requires a variable name}"
      shift 2
      ;;
    --claim-any)
      MODE="any"
      shift
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "with-lock: unknown flag $1" >&2; exit 2 ;;
    *)
      UDID="$1"; shift
      if [[ "${1:-}" == "--" ]]; then shift; break; fi
      ;;
  esac
done

if [[ $# -eq 0 ]]; then
  echo "with-lock: missing command (use -- to separate)" >&2
  exit 2
fi

case "$MODE" in
  env)
    UDID="${!ENV_VAR:-}"
    [[ -n "$UDID" ]] || { echo "with-lock: $ENV_VAR is empty" >&2; exit 2; }
    node "$SIM_LOCK" acquire "$UDID" --pid "$$"
    ;;
  any)
    OUT="$(node "$SIM_LOCK" claim-any --pid "$$")"
    UDID="$(printf '%s\n' "$OUT" | sed -n 's/^UDID=//p')"
    [[ -n "$UDID" ]] || { echo "with-lock: claim-any did not return a UDID" >&2; exit 4; }
    ;;
  explicit)
    [[ -n "$UDID" ]] || { echo "with-lock: missing <udid>" >&2; exit 2; }
    node "$SIM_LOCK" acquire "$UDID" --pid "$$"
    ;;
esac

cleanup() {
  node "$SIM_LOCK" release "$UDID" --pid "$$" || true
}
trap cleanup EXIT INT TERM

export IOS_UDID="$UDID"
"$@"
