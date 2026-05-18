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
Parallel React Native e2e tooling that survives multiple concurrent worktrees:
- `scripts/sim-lock/` — auto-discovers free iOS simulators, provisions on demand
- `scripts/metro-lock/` — per-worktree Metro port coordination
- `e2e/` — wdio harness with helpers and per-spec webm recording

### `zsh-keybindings`
Fix Option+Left / Option+Right in zsh so they jump word-by-word (matching Claude Code, browsers, and every native macOS text field). Without this you get garbage like `;3C;3D` in your prompt.
- `shell/option-arrow.zsh` — drop-in `bindkey` rules; `source` from `~/.zshrc`
- `docs/methods/zsh-keybindings.md` — explainer with debugging tips for non-standard terminals

## Philosophy

Scaffold, don't depend. Half of this is bash + Markdown — that has to live in your repo anyway. The Node/Playwright pieces you'll want to customize. Owning the files makes both natural.

## License

MIT
