#!/usr/bin/env bash
# Save a secret to the keychain behind Touch ID, typed into a hidden macOS
# dialog (works from agent `!` shells, which have no stdin), then read it
# back once to prove the Touch ID gate works.
# Usage: bash scripts/tpkc/store.sh <service> <account>
set -euo pipefail
cd "$(dirname "$0")"
SERVICE=${1:?service}; ACCOUNT=${2:?account}
PW=$(osascript -e "text returned of (display dialog \"Secret for $SERVICE / $ACCOUNT:\" default answer \"\" with hidden answer with title \"tpkc\")")
[ -n "$PW" ] || { echo "nothing entered"; exit 1; }
printf '%s' "$PW" | ./tpkc store "$SERVICE" "$ACCOUNT"
unset PW
echo "verifying (Touch ID prompt incoming)..."
./tpkc get "$SERVICE" "$ACCOUNT" "verify $SERVICE" | wc -c | xargs -I{} echo "read back {} bytes"
