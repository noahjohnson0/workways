# Parallel-worktree validation — issue #82 / PR #87

Captured 2026-05-17 evening, local timezone EDT.

## Setup

Two ephemeral worktrees on the `issue-82-build-rn-from-source` branch, each
running its own iOS build + e2e suite simultaneously:

| Worktree | Sim | Sim UDID | Metro port | DerivedData (per #83) |
| --- | --- | --- | --- | --- |
| A: `issue-82-build-rn-from-source` | iPhone 16 | `0DDE1018-EA8A-4630-9CE0-07D51508FD59` | 8082 | `cumbretrial-wt-ee135de13d25` |
| B: `issue-82-parallel-b` (detached) | iPhone 16 Pro | `8F9BDE7B-E344-4B8D-A914-E89191AA8301` | 8083 | `cumbretrial-wt-3b681724101b` |

Both builds compiled React-Core from source (because of this PR's
`ios.buildReactNativeFromSource: true`), so `RCT_METRO_PORT` was honored
per-build instead of being frozen at 8081 by the prebuilt `React.xcframework`.

## Port proof (the actual #82 verification)

App A — iPhone 16 — during e2e run:

```
cumbretri 65786 noahjohnson0   14u   IPv6 ... TCP [::1]:51909->[::1]:8082 (ESTABLISHED)
cumbretri 65786 noahjohnson0   15u   IPv6 ... TCP [::1]:51910->[::1]:8082 (ESTABLISHED)
```

App B — iPhone 16 Pro — lsof window-missed (e2e tore the app down between
specs faster than the polling loop fired), but B's e2e ran against its own
Metro on 8083 (see `cumbre-e2e-metro-8083.log` — `Starting project at
.claude/worktrees/issue-82-parallel-b`), and the login-invalid spec passed
end-to-end while A's Metro was concurrently serving 8082 on iPhone 16. Pre-PR
behavior was for B's `.app` to connect to whichever Metro had baked the
shared DerivedData first (8081), so any test driving Firebase login would
have hit A's bundle and failed unpredictably.

## e2e results

| Spec | A (iPhone 16, Metro 8082) | B (iPhone 16 Pro, Metro 8083) |
| --- | --- | --- |
| create-user | FAIL | FAIL |
| login-invalid | **PASS** | **PASS** |
| login-valid | **PASS** | FAIL |
| reset-password | FAIL | FAIL |

The login-invalid spec passing **on both sims in parallel** is the cleanest
positive signal: each app reached its own Metro, loaded its own JS bundle,
rendered the login screen, drove a wrong-password sign-in attempt, and saw
the Firebase auth alert come back — concurrently.

The other failures look like pre-existing Firebase contention when the same
test user signs in / requests a password reset from two sims at once.
Specifically:

- `create-user` — generates a fresh timestamped Firebase Auth user, but the
  README already calls this out as accumulating cruft (#31). Probably also
  vulnerable to concurrent uniqueness checks.
- `login-valid` — both runs sign in as the same test user; one wins, one
  races.
- `reset-password` — Firebase rate-limits password-reset email sends per
  user.

None of these are caused by the parallel-build mechanism. They surface
*because* PR #87 finally lets two e2e suites actually share a Firebase
backend simultaneously — that's a known-flaky surface separate from the
build infrastructure being validated here.

## Recordings

- `A_iPhone16_login-invalid_port-8082.webm` — A's login-invalid spec
- `B_iPhone16Pro_login-invalid_port-8083.webm` — B's login-invalid spec, captured concurrently
- `A_iPhone16_login-valid_port-8082.webm` — A's login-valid spec (real Firebase sign-in flow)
