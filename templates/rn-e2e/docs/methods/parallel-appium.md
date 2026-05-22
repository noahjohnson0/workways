# Parallel Appium on iOS simulators

How to run multiple Appium / WebdriverIO suites against an Expo / React-Native
app **concurrently from separate git worktrees**, without the runs trampling
each other.

The naive setup has three shared global resources that collide the moment you
try to run two suites at once:

1. **The iOS simulator** — Appium binds to a device by name; two sessions on
   the same sim race for the foreground.
2. **The Metro bundler port** — defaults to 8081, and the `.app` you built has
   that port baked in (`RCTBundleURLProvider`). Two Metros can't bind 8081;
   one app silently loads the other's JS.
3. **Xcode DerivedData** — two `xcodebuild` invocations writing to the same
   `~/Library/Developer/Xcode/DerivedData/<workspace>-<hash>` corrupt each
   other's intermediates.

The pieces in this cluster solve those three collisions with cooperative
file-locks plus a per-worktree DerivedData redirect.

## Scripts (copied by `npx workways add rn-e2e`)

| Path | Role |
| --- | --- |
| `scripts/lib/lockfile.mjs` | Shared `flock`-style helper. Atomic create + heartbeat + stale-PID recovery. |
| `scripts/sim-lock/sim-lock.mjs` | Auto-discovers a free iOS sim from a list of candidates, boots it, holds a lock keyed on the UDID. |
| `scripts/sim-lock/with-lock.sh` | Wrapper that acquires a sim lock, exports `IOS_UDID` + `IOS_DEVICE_NAME` into the child process, releases on exit. |
| `scripts/metro-lock/metro-lock.mjs` | Allocates a free port from a candidate range (default 8081–8090), holds a lock keyed on the port. |
| `scripts/metro-lock/with-metro.sh` | Wrapper that acquires a port lock and exports `RCT_METRO_PORT`. |
| `scripts/metro-lock/with-derived-data.sh` | Redirects Xcode `DerivedData` into a per-worktree directory by exporting `EXPO_USE_CUSTOM_DERIVED_DATA_DIR` + setting Xcode build settings. Needed so two parallel `expo run:ios` builds don't fight. |
| `scripts/e2e/run-with-metro.sh` | Spawns `npx expo start --port $RCT_METRO_PORT` in the background, waits for `/status`, runs the wdio suite, tears Metro down on exit. Honors `E2E_METRO_EXTERNAL=1` to skip auto-start. |
| `e2e/wdio.conf.ts` | Pins the Appium session to `IOS_UDID` / `IOS_DEVICE_NAME` / `IOS_PLATFORM_VERSION`. Records per-spec webm via `startRecordingScreen`. |
| `e2e/wdio.expo-go.conf.ts` | Same harness but targets pre-installed Expo Go + deep-links to Metro — no `.app` rebuild needed. |

## Composing them

Two worktree shells, identical command:

```bash
scripts/sim-lock/with-lock.sh \
  -- scripts/metro-lock/with-metro.sh \
  -- scripts/metro-lock/with-derived-data.sh \
  -- scripts/e2e/run-with-metro.sh
```

Each layer exports the variable the next layer reads:

- `with-lock.sh` → `IOS_UDID`, `IOS_DEVICE_NAME`
- `with-metro.sh` → `RCT_METRO_PORT`
- `with-derived-data.sh` → `EXPO_USE_CUSTOM_DERIVED_DATA_DIR`, an Xcode build
  settings override pointing at `~/Library/Developer/Xcode/DerivedData/<repo>-wt-<hash>`
- `run-with-metro.sh` → starts Metro on `$RCT_METRO_PORT`, runs wdio, cleans up

You can stop at any layer — e.g. drop `with-derived-data.sh` if you're only
running one build at a time.

## The Metro-port-baked-into-the-`.app` gotcha

`RCT_METRO_PORT` is read **at native build time** by `RCTBundleURLProvider`.
That means a `.app` built against port 8082 will *always* connect to 8082,
even if Metro is now serving on 8083. Two ways to handle this:

- **Test-dev loop (fast)** — leave the `.app` alone, just hot-reload JS. As
  long as Metro is on the port the `.app` was built for, this works.
- **New port (slow)** — rebuild the `.app` with the new port baked in:
  ```bash
  scripts/metro-lock/with-metro.sh --from-env RCT_METRO_PORT \
    -- npx expo run:ios --device "iPhone 16"
  ```

If you're using **`ios.buildReactNativeFromSource: true`**, the port is
honored per-build cleanly. With the prebuilt `React.xcframework` it's
effectively frozen at 8081 — parallel suites against the same `.app` cannot
work without source builds.

## Reserving sims for manual QA

Pin one sim for Appium, leave another free for hands-on QA:

- `IOS_DEVICE_NAME=iPhone 16` in `.env.test` → owned by e2e
- `npx expo run:ios --device "iPhone 16 Pro"` → free for manual screenshots

Both can be open in Simulator.app at the same time. Don't point manual builds
at the e2e sim while a suite is running — Appium will fight you for the
foreground.

## Validation

`docs/proof/PARALLEL-VALIDATION.md` is the original capture from
cumbreTrial #82 / #87: two worktrees, two sims (iPhone 16 + iPhone 16 Pro),
two Metros (8082 + 8083), `login-invalid` passing on both concurrently with
`lsof` proving each app was talking to its own bundler. Keep it as evidence
that the locking strategy actually composes — the failure modes that remain
(`create-user`, `login-valid`, `reset-password`) are Firebase-side
contention, not infrastructure collisions.
