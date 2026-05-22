# workways

Reusable workflows, skills, and methods extracted from real projects. Distributed as a scaffolder — `npx workways add <cluster>` copies files into your repo so you own and edit them, rather than depending on `workways` at runtime.

## Quickstart

```bash
npx workways list                  # see available clusters
npx workways add pr-screenshots    # copy one cluster into cwd
npx workways add --all             # copy everything
```

Flags: `--dest <dir>`, `--force`, `--dry-run`.

## Clusters

### `method`
Shipping methodology: atomic-PR, ephemeral worktree, manual-QA gate, PR-screenshot rule. Drops a `docs/methods/` Markdown bundle you can adapt and link from your `CLAUDE.md` / `CONTRIBUTING.md`.

### `pr-screenshots`
End-to-end pipeline for embedding screenshots/videos in **private-repo** PR descriptions:
- `scripts/screenshot.sh` — iOS-sim screenshot helper, names by branch + route
- `scripts/gh-attach/` — Playwright wrapper that borrows your Chrome session, uploads to `github.com/user-attachments`, and rewrites the PR body in place
- `docs/methods/pr-screenshots.md` — the convention

### `rn-e2e`
Full parallel-Appium-on-iOS toolkit for React Native / Expo apps — run multiple e2e suites concurrently from separate worktrees without sim, Metro, or DerivedData collisions:
- `scripts/sim-lock/` — auto-discovers a free iOS sim from a candidate list, boots it, holds a UDID-keyed lock; exports `IOS_UDID` / `IOS_DEVICE_NAME`
- `scripts/metro-lock/` — allocates a free Metro port from a range, holds a port-keyed lock; `with-derived-data.sh` redirects Xcode `DerivedData` into a per-worktree dir so parallel `expo run:ios` builds don't corrupt each other
- `scripts/e2e/run-with-metro.sh` — spawns `expo start` on the locked port, waits for `/status`, runs wdio, tears Metro down on exit (`E2E_METRO_EXTERNAL=1` to skip)
- `e2e/` — wdio + Mocha harness with per-spec webm recording (`startRecordingScreen` → ffmpeg → `e2e/recordings/`), native-build and Expo-Go wdio configs, accessibility-id selector helpers, and a `version-footer` spec that asserts build-mode-aware version strings
- `docs/methods/parallel-appium.md` — composition diagram, the Metro-port-baked-into-`.app` gotcha (and the `buildReactNativeFromSource: true` workaround), and conventions for reserving a sim for manual QA
- `docs/proof/PARALLEL-VALIDATION.md` — captured evidence from cumbreTrial #82/#87: two worktrees, two sims, two Metros, `login-invalid` green on both concurrently with `lsof` showing each app on its own bundler port

### `zsh-keybindings`
Fix Option+Left / Option+Right in zsh so they jump word-by-word (matching Claude Code, browsers, and every native macOS text field). Without this you get garbage like `;3C;3D` in your prompt.
- `shell/option-arrow.zsh` — drop-in `bindkey` rules; `source` from `~/.zshrc`
- `docs/methods/zsh-keybindings.md` — explainer with debugging tips for non-standard terminals

## Philosophy

Scaffold, don't depend. Half of this is bash + Markdown — that has to live in your repo anyway. The Node/Playwright pieces you'll want to customize. Owning the files makes both natural.

## License

MIT
