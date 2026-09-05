#!/usr/bin/env bash
# Poll a PR's checks and squash-merge only if every one of them succeeded.
#
# The point is that the green you saw five minutes ago is not the green you are
# merging on. This re-reads the conclusions at merge time and refuses on any
# failure, so an unattended agent cannot merge a red PR.
#
# Usage: merge-when-green.sh <pr-number> [max-polls] [sleep-seconds]
set -uo pipefail

PR="${1:?usage: merge-when-green.sh <pr-number> [max-polls] [sleep-seconds]}"
MAX_POLLS="${2:-60}"
SLEEP="${3:-30}"

checks() {
  gh pr view "$PR" --json statusCheckRollup \
    --jq '[.statusCheckRollup[]|"\(.name)=\(.status):\(.conclusion)"]|join(" ")'
}

for _ in $(seq 1 "$MAX_POLLS"); do
  out="$(checks)"

  # No checks configured at all: nothing to gate on, do not pretend otherwise.
  if [ -z "$out" ]; then
    echo "[$(date +%H:%M:%S)] no checks reported on #$PR; not merging"
    exit 2
  fi

  if printf '%s' "$out" | grep -q "IN_PROGRESS\|QUEUED\|PENDING"; then
    sleep "$SLEEP"
    continue
  fi

  echo "[$(date +%H:%M:%S)] checks done: $out"

  if printf '%s' "$out" | grep -q "FAILURE\|CANCELLED\|TIMED_OUT\|STARTUP_FAILURE"; then
    echo "not merging: at least one check did not succeed"
    echo "before debugging, confirm the run event matches your branch's workflow:"
    echo "  gh run list --branch \$(git branch --show-current) --limit 5 \\"
    echo "    --json databaseId,event,headSha,conclusion \\"
    echo "    --jq '.[]|\"\\(.databaseId) \\(.event) \\(.headSha[0:8]) \\(.conclusion)\"'"
    exit 1
  fi

  echo "[$(date +%H:%M:%S)] merging #$PR"
  gh pr merge "$PR" --squash --delete-branch

  # gh's local cleanup fails when the base branch is checked out in another
  # worktree, and that exit code says nothing about whether the merge landed.
  # Verify both facts directly.
  gh pr view "$PR" --json state,mergedAt --jq '"state=\(.state) mergedAt=\(.mergedAt)"'
  branch="$(gh pr view "$PR" --json headRefName --jq .headRefName)"
  if [ -n "$(git ls-remote --heads origin "$branch")" ]; then
    echo "remote branch $branch survived; deleting"
    git push origin --delete "$branch"
  fi
  exit 0
done

echo "timed out waiting for checks on #$PR"
exit 3
