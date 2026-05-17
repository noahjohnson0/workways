# Shipping methodology

How features ship: **GitHub issue → ephemeral git worktree → atomic PR → manual QA on real device/sim → merge.**

Each step exists to prevent a specific failure mode. Skipping any of them is fine — just know which mode you're accepting.

## 1. One atomic PR per feature

- Exactly **one** feature / logical change per PR. No bundling unrelated fixes, refactors, or cleanups.
- Target **< 10 files changed**. If the change naturally grows past that, split into a stack of incremental PRs (scaffolding → wiring → polish) rather than one mega-PR.
- If mid-PR you discover an unrelated bug or cleanup, open a separate issue/PR — don't tack it on.

**Why:** Review quality collapses past ~10 files. Reverts become surgical instead of nuclear. Stacks let reviewers approve foundations before debating polish.

## 2. Ephemeral git worktree per change

Each PR gets its own worktree (e.g. `.worktrees/issue-42-fix-login/`) created off `main` and deleted after merge. Heavy deps (`node_modules`, `ios/build`, simulator caches) are **symlinked** from the primary checkout so worktrees stay cheap.

**Why:** Lets you context-switch between in-flight work without stashing or losing simulator state. Parallel review/QA across worktrees without `git stash` roulette. See the `rn-e2e` cluster for the simulator/Metro coordination that makes this safe.

## 3. Manual QA gate before merge

Automated checks (lint, typecheck, e2e) verify code correctness, not **feature** correctness. Before merge, a human runs the app on the real target (iOS sim / device / production-like environment) and confirms the change actually does what the PR claims.

- **Do not merge** before the human confirms QA passed.
- Reviewer can be anyone with the device/sim — doesn't have to be the author.
- After confirmation: `gh pr merge`.

**Why:** Type-correct broken UI ships all the time. The 30-second visual check catches what no test suite will.

## 4. Screenshot in every PR description

Every PR body **must** include at least one screenshot of the affected UI, captured from the primary target (iOS sim for mobile, browser for web). See the `pr-screenshots` cluster for the capture + private-repo embedding pipeline.

**Why:** Async reviewers shouldn't have to clone, build, and run to know what they're approving. For private repos, screenshots must be embedded via `github.com/user-attachments/...` URLs (raw GitHub URLs require auth and don't render) — `gh-attach` handles this.

## Adapting

This methodology assumes: a small team, mostly mobile/UI work, GitHub as the source of truth. Adjust the file-count cap, the QA gate, and the screenshot rule to your context — but keep the spirit: **one change at a time, verified visually, before it touches main**.
