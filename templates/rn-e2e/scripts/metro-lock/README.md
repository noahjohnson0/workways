# metro-lock

Coordinate Metro (React Native dev server) ports across worktrees and parallel Claude sessions.

## Why

A Debug `.app` baked by `expo run:ios` hard-codes its JS dev URL at build time using `RCT_METRO_PORT` (default `8081`). If two worktrees both run `expo run:ios` without port discipline:

1. Worktree A binds 8081 for Metro.
2. Worktree B's Metro can't bind 8081, falls back to 8082 — but B's `.app` was built pointing at 8081 → silently loads worktree A's JS.

`metro-lock` keeps that from happening: each worktree gets a unique port, the `.app` is built with that port, and `expo start` (or `expo run:ios`'s embedded Metro) listens on the same one.

## Setup

Zero-config. The default pool is `[8081, 8082, 8083, 8084]`. Override by writing `~/.workways/metro-pool.json`:

```json
{ "ports": [8081, 8082, 8083, 8084, 8085] }
```

`metro-lock claim-any` also probes the OS — if a port is held by some other process outside the lock system, it skips that port too.

## CLI

```
node scripts/metro-lock/metro-lock.mjs <cmd>
```

- `list` — show all current Metro port holders.
- `status <port>` — exit 0=free, 2=stale (dead PID), 3=held.
- `acquire <port> [--pid N] [--label X] [--force]`
- `release <port> [--pid N] [--force]`
- `claim-any` — pick first free port from the pool, lock it, print `PORT=<n>` on stdout.
- `for-worktree [path]` — print port held by a lock matching cwd's git toplevel (exit 1 if none).

## `with-metro.sh` wrapper

```
scripts/metro-lock/with-metro.sh <port> -- <cmd...>
scripts/metro-lock/with-metro.sh --from-env RCT_METRO_PORT -- <cmd...>
scripts/metro-lock/with-metro.sh --claim-any -- <cmd...>
```

Acquires before running, releases on EXIT/INT/TERM. Exports `RCT_METRO_PORT` so:
- `expo run:ios` bakes the JS dev URL with the right port.
- `expo start` listens on that same port automatically (it reads `RCT_METRO_PORT`).

## Composing with sim-lock

The clean way to launch manual QA in a worktree:

```
scripts/sim-lock/with-lock.sh --claim-any -- \
scripts/metro-lock/with-metro.sh --claim-any -- \
  npx expo run:ios --device "$IOS_DEVICE_NAME"
```

Both locks are released when the inner command exits.
