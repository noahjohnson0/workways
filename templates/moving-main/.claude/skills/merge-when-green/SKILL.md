---
name: merge-when-green
description: Land a PR safely when several agents are merging into the same base at once. Use when asked to merge a PR, when a PR shows conflicts or a red check, or when a CI failure needs to be judged flaky or real before merging.
---

# Merging onto a moving base

Assume the base branch moved while you were working and that some other agent is
mid-merge right now. Full background: `docs/methods/moving-main.md`.

## Before merging

1. **Re-fetch.** `git fetch origin && git rev-list --left-right --count origin/main...HEAD`
2. **If conflicting, scope it first.** Print only the files both sides touched:
   ```sh
   base=$(git merge-base HEAD origin/main)
   comm -12 <(git diff --name-only $base HEAD | sort) \
            <(git diff --name-only $base origin/main | sort)
   ```
   Tracker/changelog rows almost always resolve to "keep both". Read the hunks
   and confirm they are additive rather than assuming it.
3. **Rebase, then re-verify locally.** After any rebase that pulled in new
   assets, re-import before trusting a local test failure:
   `godot --headless --path . --editor --quit` (or the engine's equivalent).
   Run imports one at a time; concurrent imports across worktrees race.
4. **Check what CI actually gates**, after establishing how it finds tests.
   If the workflow names suites, grep it:
   `grep -o 'tests/[A-Za-z0-9_./-]*' .github/workflows/*.yml | sort -u`.
   If it calls a runner script instead
   (`grep -nE 'run:.*\.(py|sh|mjs|js)' .github/workflows/*.yml`), tests are
   probably auto-discovered: read that script and run its discovery function,
   because grepping the yaml for a filename will find nothing and prove
   nothing. Then confirm a selection/path-filter job does not skip the suite
   for the paths this PR touches. Run by hand only what is genuinely ungated,
   and say which when you report.

## Judging a red check

Do not debug the test first. In order:

1. **Compare run events on the same SHA.**
   ```sh
   gh run list --branch <branch> --limit 5 \
     --json databaseId,event,headSha,conclusion \
     --jq '.[]|"\(.databaseId) \(.event) \(.headSha[0:8]) \(.conclusion)"'
   ```
   A `push` run uses the workflow on your branch; a `pull_request` run uses the
   workflow from your head merged into the base. If someone changed CI on the
   base, the same commit yields two different runs and they can disagree. The
   fix is a rebase, not a code change.
2. **Ask whether the diff could plausibly touch the failing area.**
3. **Reproduce the single failing case in the foreground** if the suite takes a
   filter, before calling anything a regression.

## Merging and cleanup

Gate on the conclusions at merge time: `scripts/merge-when-green.sh <pr>`.

`gh pr merge --delete-branch` can report a git error while the merge itself
succeeded, because its local cleanup fails when the base branch is checked out in
another worktree. Verify separately, never from the exit code:

```sh
gh pr view <n> --json state,mergedAt
git ls-remote --heads origin <branch>   # empty means actually deleted
git worktree remove <path> --force
```

## Reporting

Say what you verified and what you did not. Manual/human acceptance gates in a PR
body stay open after merge; name them rather than implying CI covered them.
