#!/usr/bin/env bash
# Run the Expo Go-mode e2e suite (just the version-footer spec).
#
# Mirrors .claude/skills/cumbre/scripts/e2e/run-with-metro.sh but invokes the
# Expo-Go wdio config so we don't try to drive auth flows in Expo Go. Expects
# RCT_METRO_PORT (set by metro-lock/with-metro.sh) and IOS_UDID (set by
# sim-lock/with-lock.sh). Set E2E_METRO_EXTERNAL=1 to skip the metro auto-start.

set -euo pipefail

PORT="${RCT_METRO_PORT:?RCT_METRO_PORT must be set (use with-metro.sh)}"

METRO_PID=""
cleanup() {
  if [[ -n "$METRO_PID" ]]; then
    echo "[e2e:expo-go] stopping metro (pid $METRO_PID)"
    kill "$METRO_PID" 2>/dev/null || true
    wait "$METRO_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if [[ "${E2E_METRO_EXTERNAL:-}" != "1" ]]; then
  echo "[e2e:expo-go] starting metro on port $PORT"
  ( npx expo start --port "$PORT" ) > "/tmp/cumbre-e2e-metro-$PORT.log" 2>&1 &
  METRO_PID=$!

  echo "[e2e:expo-go] waiting for metro to come up..."
  for i in $(seq 1 60); do
    if curl -sf "http://127.0.0.1:$PORT/status" >/dev/null 2>&1; then
      echo "[e2e:expo-go] metro ready after ${i}s"
      break
    fi
    if ! kill -0 "$METRO_PID" 2>/dev/null; then
      echo "[e2e:expo-go] metro process died before becoming ready; tail of log:" >&2
      tail -40 "/tmp/cumbre-e2e-metro-$PORT.log" >&2 || true
      exit 1
    fi
    sleep 1
  done

  if ! curl -sf "http://127.0.0.1:$PORT/status" >/dev/null 2>&1; then
    echo "[e2e:expo-go] metro did not respond within 60s; aborting" >&2
    exit 1
  fi
else
  echo "[e2e:expo-go] E2E_METRO_EXTERNAL=1: assuming metro is already running on $PORT"
fi

npx wdio run e2e/wdio.expo-go.conf.ts
