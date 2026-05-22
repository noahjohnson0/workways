# sim-lock

Coordinate iOS simulator usage across worktrees and parallel Claude sessions.

`xcrun simctl` only reports whether a sim is *booted* — it can't tell you whether another worktree's e2e run or QA session is actively driving it. `sim-lock` adds a lightweight intent layer: each sim gets a lockfile under `~/.cumbre/sim-locks/<udid>.lock` containing the PID, worktree, branch, and started-at of whoever claimed it. The status line reads these locks so every session can see at a glance which sim it owns.

## Convention

**One sim per phone model.** Don't create `iPhone 16 #2` or `iPhone 16 #3` for parallelism — the lock *is* the queue. Currently:

- **iPhone 16** — e2e (`npm run e2e:ios`)
- **iPhone 16 Pro** — manual QA (`npx expo run:ios --device "iPhone 16 Pro"`)

If both are busy, the next caller fails fast with a clear "held by <branch>" message instead of fighting for the foreground.

## Setup

Zero-config in the common case. `sim-lock claim-any` auto-discovers iPhone simulators via `xcrun simctl list devices available --json` — no pool file required. To pin a specific subset, drop a `~/.cumbre/sim-pool.json` (overrides discovery):

```json
{
  "sims": [
    { "udid": "0DDE1018-EA8A-4630-9CE0-07D51508FD59", "name": "iPhone 16" },
    { "udid": "8F9BDE7B-E344-4B8D-A914-E89191AA8301", "name": "iPhone 16 Pro" }
  ]
}
```

For `npm run e2e:ios:locked` to bind Appium to a fixed sim, add `IOS_UDID=<the UDID>` to `.env.test`. Otherwise use `with-lock.sh --claim-any -- …` for elastic allocation.

If you have **zero** iPhone sims (fresh Xcode) or all candidates are busy, `claim-any` will (on a TTY) prompt to:
- run `xcodebuild -downloadPlatform iOS` to install the runtime (multi-GB; `[sim-lock]` heartbeat prints every 5 min so you know it's alive), and/or
- run `xcrun simctl create` to spin up a new iPhone simulator on the newest installed runtime.

On a non-TTY (CI, piped stdin), it prints the manual commands and exits non-zero instead of hanging. Pass `--no-provision` to opt out of the prompt explicitly.

## CLI

```
node .claude/skills/cumbre/scripts/sim-lock/sim-lock.mjs <cmd>
```

- `list` — show all current holders, with stale (dead PID) annotation.
- `status <udid>` — exit 0 free, 2 stale, 3 held.
- `acquire <udid> [--pid N] [--label X] [--force]` — atomic; conflicts fail with the holder's info, stale locks are taken over silently.
- `release <udid> [--pid N] [--force]` — only the holder (matching `--pid`) can release, unless `--force`.
- `claim-any [--no-provision]` — pick first free sim from the pool (or auto-discovered set), lock it, print `UDID=...` on stdout. On a TTY, prompts to create/download more when none are free.
- `discover` — list auto-discovered iPhone sims (UDID, name, runtime); no locking.
- `for-worktree [path]` — print the sim name held by a lock matching cwd's git toplevel (used by the status line).

Status messages (`acquired …`, `released …`) go to stderr so machine-readable output stays clean on stdout.

## `with-lock.sh` wrapper

```
.claude/skills/cumbre/scripts/sim-lock/with-lock.sh <udid> -- <cmd...>
.claude/skills/cumbre/scripts/sim-lock/with-lock.sh --from-env IOS_UDID -- <cmd...>
.claude/skills/cumbre/scripts/sim-lock/with-lock.sh --claim-any -- <cmd...>
```

Acquires before running the command, releases on EXIT/INT/TERM. Exports `IOS_UDID` into the child env so `wdio.conf.ts` picks it up (it prefers `IOS_UDID` over `IOS_DEVICE_NAME` + `IOS_PLATFORM_VERSION`).

`npm run e2e:ios:locked` is a shortcut for `with-lock.sh --from-env IOS_UDID -- npm run e2e:ios`.

## Status line

The repo's `.claude/settings.json` calls `sim-lock for-worktree` from inside the status line, so you'll see `Sim: iPhone 16 Pro` while a lock is held by anything under the current worktree, and `Sim: -` otherwise. The lookup is JSON-only (no `simctl` shell-out) so it's cheap.

## Stale recovery

If a process holding a lock crashes, the file stays behind. The next `acquire` call checks `kill -0 <pid>` — if the PID is dead, it silently overwrites. Use `--force` if you ever need to bulldoze a live holder (e.g., the PID belongs to a hung Appium that won't die on its own).
