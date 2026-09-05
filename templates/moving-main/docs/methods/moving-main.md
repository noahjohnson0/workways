# Merging onto a moving main

Written for repos where several agents work at once, each in its own git worktree,
each opening its own PR. The base branch moves under you while you work. Most of
the pain in that setup is not merge conflicts, it is trusting a signal that was
computed against a base that no longer exists.

Five failure modes, each with the check that catches it.

## 1. The base moved while you were waiting

CI on a long PR can take 20 minutes. In that window another agent can merge two
PRs, one of which rewrites the very workflow that is testing you.

Re-fetch immediately before merging, not just at the start:

```sh
git fetch origin
git rev-list --left-right --count origin/main...HEAD   # behind / ahead
```

If a PR has gone `CONFLICTING`, look at what actually overlaps before opening an
editor. Usually it is two agents appending rows to the same Markdown table:

```sh
base=$(git merge-base HEAD origin/main)
comm -12 <(git diff --name-only $base HEAD | sort) \
         <(git diff --name-only $base origin/main | sort)
```

That prints only the files touched by both sides. A three-file overlap where two
auto-merge is a two-minute rebase, not a rewrite.

**Tracker and changelog files are conflict magnets.** Every agent appends a row
for its own issue. The resolution is nearly always "keep both sides", so read the
conflict, confirm both hunks are additive, and take both.

## 2. `push` and `pull_request` CI runs disagree on the same SHA

This one costs the most time because the failure looks real.

GitHub runs a `push`-triggered workflow using the workflow file **on your branch**.
It runs a `pull_request`-triggered workflow using the workflow file from the
**merge of your head into the base**. If someone just changed CI on main, one
commit produces two runs, with different jobs, and they can disagree.

Real example: one SHA, two runs. The `push` run used the branch's older
unsharded job and failed one scenario. The `pull_request` run used main's new
7-way sharded job and passed everything.

Before believing a red check, look at what produced it:

```sh
gh run list --branch <branch> --limit 5 \
  --json databaseId,event,headSha,conclusion \
  --jq '.[]|"\(.databaseId) \(.event) \(.headSha[0:8]) \(.conclusion)"'
```

Two runs on one SHA with different `event` values and different conclusions means
your branch's CI config is stale. Rebase onto the new base and let it re-run.
Do not go debugging the test.

## 3. A stale per-worktree asset cache fails tests that are fine

Engines that import assets into a build cache (Godot's `.godot/`, Unity's
`Library/`, anything with a generated import directory) keep that cache
**per worktree**, and it is gitignored, so a rebase never updates it. Pull in a
commit that adds an asset and your worktree fails on a missing resource that
exists in the tree.

The tell is a failure that names a file path rather than an assertion:

```
ERROR: Unable to open file: res://.godot/imported/panel_popup.png-<hash>.ctex
```

Re-import before you believe any local failure that follows a rebase:

```sh
godot --headless --path . --editor --quit
```

Run imports **one at a time**. Concurrent imports across worktrees race and
segfault, and the resulting flake looks like a real bug in whatever ran next.

## 4. Flaky or real

A failing check is a claim, not a verdict. Rank the evidence:

1. **Did the same SHA pass elsewhere?** Another run, another shard, same commit.
   Strong evidence of flake.
2. **Does the diff touch the failing area at all?** A change to AI economy code
   has no business breaking multiplayer lobby handshakes.
3. **Reproduce it alone.** Good suites take a filter argument so you can run the
   one failing scenario in the foreground instead of the whole matrix.

Only after those three should you treat it as a regression.

## 5. CI does not run everything in the repo

A PR that adds a test is not the same as a PR that adds a *gate*. New test files
are frequently never wired into the workflow, so the behavior they cover has no
protection the moment the author stops watching.

Check before merging, and say so in the merge note:

```sh
grep -o 'tests/[A-Za-z0-9_./-]*' .github/workflows/*.yml | sort -u
```

Diff that against the test files the PR adds. Anything in the PR but not in the
workflow is a test you must run by hand now, and a follow-up issue to file.

## Merging

Never merge on a green you saw a few minutes ago. Gate on the conclusions at the
moment of merge, and refuse on failure. `scripts/merge-when-green.sh` does this:
it polls until no check is pending, exits non-zero if any failed, and only then
squash-merges.

## Cleaning up

`gh pr merge --delete-branch` runs local git cleanup that fails when the base
branch is checked out in another worktree:

```
failed to run git: fatal: 'main' is already used by worktree at /path/to/repo
```

**The merge still happened.** The cleanup did not, and the remote branch may
survive. Always verify rather than trusting the exit code:

```sh
gh pr view <n> --json state,mergedAt
git ls-remote --heads origin <branch>          # empty means actually deleted
git push origin --delete <branch>              # if it survived
git worktree remove <path> --force
```

Worktrees accumulate fast in this model. `git worktree list` reaching thirty-plus
entries, most on long-merged branches, is normal and worth a periodic prune.

## The short version

- Re-fetch right before merging, not once at the start.
- Check the `event` on a failing run before debugging the test.
- Re-import assets after any rebase before trusting a local failure.
- Same SHA green somewhere else means flake.
- Grep the workflow for the tests a PR adds.
- Verify the merge and the branch deletion separately from the command's exit code.
