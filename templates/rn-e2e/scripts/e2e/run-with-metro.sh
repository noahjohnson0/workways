#!/usr/bin/env bash
# run-with-metro — start Metro on $RCT_METRO_PORT, wait until ready, run wdio,
# tear Metro down on exit.
#
# Designed to be wrapped by sim-lock/with-lock.sh + metro-lock/with-metro.sh
# (which acquire the locks and set IOS_UDID / RCT_METRO_PORT). Set
# E2E_METRO_EXTERNAL=1 if you already have Metro running on $RCT_METRO_PORT
# in another terminal — this script will skip the auto-start and just run wdio.

set -euo pipefail

PORT="${RCT_METRO_PORT:?RCT_METRO_PORT must be set (use with-metro.sh)}"

METRO_PID=""
cleanup() {
  if [[ -n "$METRO_PID" ]]; then
    echo "[e2e] stopping metro (pid $METRO_PID)"
    kill "$METRO_PID" 2>/dev/null || true
    wait "$METRO_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if [[ "${E2E_METRO_EXTERNAL:-}" != "1" ]]; then
  echo "[e2e] starting metro on port $PORT"
  # --port pins the port; backgrounded with output redirected to a log file.
  # (No --no-open: it isn't a valid `expo start` flag — Expo CLI exits with
  # "unknown or unexpected option" — and `expo start` is headless by default;
  # it only opens a target when you pass -a/-i/-w or press a key interactively.)
  ( npx expo start --port "$PORT" ) > "/tmp/cumbre-e2e-metro-$PORT.log" 2>&1 &
  METRO_PID=$!

  # Wait for Metro to respond on /status (RN packager returns "packager-status:running").
  echo "[e2e] waiting for metro to come up..."
  for i in $(seq 1 60); do
    if curl -sf "http://127.0.0.1:$PORT/status" >/dev/null 2>&1; then
      echo "[e2e] metro ready after ${i}s"
      break
    fi
    if ! kill -0 "$METRO_PID" 2>/dev/null; then
      echo "[e2e] metro process died before becoming ready; tail of log:" >&2
      tail -40 "/tmp/cumbre-e2e-metro-$PORT.log" >&2 || true
      exit 1
    fi
    sleep 1
  done

  if ! curl -sf "http://127.0.0.1:$PORT/status" >/dev/null 2>&1; then
    echo "[e2e] metro did not respond within 60s; aborting" >&2
    exit 1
  fi
else
  echo "[e2e] E2E_METRO_EXTERNAL=1: assuming metro is already running on $PORT"
fi

npx wdio run e2e/wdio.conf.ts
