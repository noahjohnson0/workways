# metro-lock

Coordinate Metro (React Native dev server) ports across worktrees and parallel Claude sessions.

## Why

A Debug `.app` baked by `expo run:ios` hard-codes its JS dev URL at build time using `RCT_METRO_PORT` (default `8081`). If two worktrees both run `expo run:ios` without port discipline:

1. Worktree A binds 8081 for Metro.
2. Worktree B's Metro can't bind 8081, falls back to 8082 — but B's `.app` was built pointing at 8081 → silently loads worktree A's JS.

`metro-lock` keeps that from happening: each worktree gets a unique port, the `.app` is built with that port, and `expo start` (or `expo run:ios`'s embedded Metro) listens on the same one.

## Setup

Zero-config. The default pool is `[8081, 8082, 8083, 8084]`. Override by writing `~/.cumbre/metro-pool.json`:

```json
{ "ports": [8081, 8082, 8083, 8084, 8085] }
```

`metro-lock claim-any` also probes the OS — if a port is held by some other process outside the lock system, it skips that port too.

## CLI

```
node .claude/skills/cumbre/scripts/metro-lock/metro-lock.mjs <cmd>
```

- `list` — show all current Metro port holders.
- `status <port>` — exit 0=free, 2=stale (dead PID), 3=held.
- `acquire <port> [--pid N] [--label X] [--force]`
- `release <port> [--pid N] [--force]`
- `claim-any` — pick first free port from the pool, lock it, print `PORT=<n>` on stdout.
- `for-worktree [path]` — print port held by a lock matching cwd's git toplevel (exit 1 if none).

## `with-metro.sh` wrapper

```
.claude/skills/cumbre/scripts/metro-lock/with-metro.sh <port> -- <cmd...>
.claude/skills/cumbre/scripts/metro-lock/with-metro.sh --from-env RCT_METRO_PORT -- <cmd...>
.claude/skills/cumbre/scripts/metro-lock/with-metro.sh --claim-any -- <cmd...>
```

Acquires before running, releases on EXIT/INT/TERM. Exports `RCT_METRO_PORT` so:
- `expo run:ios` bakes the JS dev URL with the right port.
- `expo start` listens on that same port automatically (it reads `RCT_METRO_PORT`).

## DerivedData caveat (issue #82)

`metro-lock` bakes the right port into the *build*, but Xcode's `DerivedData`
is shared across worktrees by default. If worktree A built with port 8081,
its `.o` files sit in `~/Library/Developer/Xcode/DerivedData/cumbretrial-*`
with `RCT_METRO_PORT=8081` baked in as a preprocessor define. When worktree
B then builds with `RCT_METRO_PORT=8082`, Xcode reuses those objects (sources
unchanged), only re-links, and the resulting `.app` still points at 8081 —
loading JS from the wrong Metro.

The fix: give each worktree its own DerivedData via `xcodebuild
-derivedDataPath <path>`. `with-derived-data.sh` does this transparently by
shimming `xcodebuild` on `PATH` to inject the flag with a stable per-worktree
path (sha1 of the worktree's git toplevel).

```
.claude/skills/cumbre/scripts/metro-lock/with-derived-data.sh -- \
  npx expo run:ios --device "iPhone 16 Pro"
```

Skip it and you're back to the symptom: the app on the sim connects to
whichever Metro happened to bake the cache last, regardless of what port
`metro-lock` assigned this worktree.

## Composing with sim-lock

The clean way to launch manual QA in a worktree:

```
.claude/skills/cumbre/scripts/sim-lock/with-lock.sh --claim-any -- \
.claude/skills/cumbre/scripts/metro-lock/with-metro.sh --claim-any -- \
.claude/skills/cumbre/scripts/metro-lock/with-derived-data.sh -- \
  npx expo run:ios --device "$IOS_DEVICE_NAME"
```

Both locks are released when the inner command exits; the DerivedData shim
cleans up its temp PATH entry on exit (the per-worktree DerivedData dir
itself is intentionally persistent, for incremental rebuilds).
