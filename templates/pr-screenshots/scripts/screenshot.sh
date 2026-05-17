#!/usr/bin/env bash
# Wait until Expo web is serving on the given URL, then echo it.
# Usage: screenshot.sh [base-url]
# Default base-url: http://localhost:8081
#
# Intended to be called before driving chrome-devtools MCP tools to capture
# a screenshot for a PR description. Does NOT take the screenshot itself —
# that's done via the MCP browser tools after this script returns 0.

set -euo pipefail

URL="${1:-http://localhost:8081}"
TIMEOUT="${TIMEOUT:-60}"

echo "Waiting for Expo web at $URL (timeout ${TIMEOUT}s)..."

deadline=$(( $(date +%s) + TIMEOUT ))
while : ; do
  if curl -fsS --max-time 2 "$URL" >/dev/null 2>&1; then
    echo "READY $URL"
    exit 0
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "TIMEOUT: $URL not reachable after ${TIMEOUT}s" >&2
    exit 1
  fi
  sleep 1
done
