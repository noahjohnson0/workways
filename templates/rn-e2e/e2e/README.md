# e2e — Appium iOS suite

Four WebdriverIO + Mocha specs covering the auth flows wired to Firebase.

## Prereqs

1. **Xcode + iOS simulator** (`xcrun simctl list` shows the device named in `.env.test`).
2. **Appium 2** is installed as a devDependency, but the XCUITest driver also needs system tools:
   - `brew install --cask android-platform-tools` (not strictly needed for iOS-only)
   - `brew install carthage ios-deploy` (used by the XCUITest driver under the hood)
3. **Built `.app`** — Appium needs to install the app into the simulator. Build it once:
   ```
   npx expo run:ios --configuration Debug
   ```
   Then locate the resulting `.app` (typically `ios/build/Build/Products/Debug-iphonesimulator/<app>.app`) and set `IOS_APP_PATH` in `.env.test` to its absolute path.

## Setup

```
cp e2e/.env.test.example .env.test
# fill in TEST_USER_EMAIL / TEST_USER_PASSWORD + IOS_APP_PATH
npm install
```

## Run

```
npm run e2e:ios
```

This boots Appium (via `@wdio/appium-service`), starts a session against the simulator, installs the `.app`, and runs every `e2e/specs/**/*.e2e.ts` once. Assumes Metro is already running (or that you don't care which port).

## Run with cross-worktree locks + Metro auto-start (recommended)

```
npm run e2e:ios:locked
```

Wraps the suite in `with-lock.sh` (sim) → `with-metro.sh` (port) → `run-with-metro.sh`. Concretely it:

1. Acquires the simulator named by `IOS_UDID` (`.env.test`).
2. Acquires the Metro port named by `RCT_METRO_PORT` (`.env.test`).
3. Spawns `npx expo start --port $RCT_METRO_PORT` in the background, waits for `/status` to respond.
4. Runs wdio against Appium.
5. Stops Metro and releases both locks on exit.

**Test-dev loop**: with Metro auto-started, editing a JS file hot-reloads it into the test app between runs — no `.app` rebuild needed. To target a different Metro port, you must rebuild the `.app` once with that port baked in:

```
scripts/metro-lock/with-metro.sh --from-env RCT_METRO_PORT \
  -- npx expo run:ios --device "iPhone 16"
```

`RCT_METRO_PORT` in the built `.app` is set at build time via `RCTBundleURLProvider`. If it doesn't match what Metro is listening on at test time, the app loads stale (or wrong-worktree) JS.

**Escape hatch**: `E2E_METRO_EXTERNAL=1 npm run e2e:ios:locked` skips the auto-start and assumes you've got Metro running in another terminal on the right port.

## Running e2e and manual QA in parallel

The suite pins **iPhone 16 / iOS 18.5** via `IOS_DEVICE_NAME` and `IOS_PLATFORM_VERSION` in `.env.test`. Appium binds the session to that specific sim by name, so you can run a *different* sim concurrently for hands-on QA without collisions.

Convention:

- **iPhone 16** → reserved for `npm run e2e:ios` (Appium drives it).
- **iPhone 16 Pro** → manual QA. Boot it with:
  ```
  npx expo run:ios --device "iPhone 16 Pro"
  ```

Both sims can be open in Simulator.app at the same time. Don't point manual builds at the iPhone 16 while e2e is running — Appium will fight you for the foreground.

## Conventions

- Specs locate elements by accessibility id (`~<id>`). The mapping lives in `e2e/helpers/selectors.ts`; RN components set matching `testID` props.
- Native iOS alerts (RN's `Alert.alert`) are read with `driver.getAlertText()` — see `e2e/helpers/alerts.ts`.
- Each spec resets app state with `driver.terminateApp` + `activateApp` in `beforeEach` so order doesn't matter.

## Known limits

- No Android suite yet — would need `appium-uiautomator2-driver` and an Android build path.
- The create-user "success" case generates a fresh timestamped Firebase Auth user each run; those accounts accumulate over time. Add cleanup or use a dedicated test project.
- If you see `RCTThirdPartyComponentsProvider` crash on launch, your `ios/` was prebuilt before `react-native-svg` was installed — run `rm -rf ios && npx expo prebuild --platform ios --clean` then rebuild.
