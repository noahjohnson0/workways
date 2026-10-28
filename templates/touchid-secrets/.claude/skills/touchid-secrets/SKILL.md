---
name: touchid-secrets
description: Read or store a password, API key or token that a script in this repo needs, through the Touch ID-gated keychain helper scripts/tpkc. Use when a task needs a credential, when a tool asks for a password, or when the user wants a secret saved for scripts or agents instead of an env var or .env file.
---

# touchid-secrets

Secrets for this repo live in the macOS login keychain and are read through `scripts/tpkc/tpkc`, which requires the user's fingerprint on every read. Full method and rationale: `docs/methods/touchid-secrets.md`.

## Read a secret

```bash
scripts/tpkc/tpkc get <service> <account> "<who is asking and why>"
```

- Tell the user a Touch ID prompt is coming first. Put the task in the reason string; it is shown in the dialog.
- Capture stdout into a variable or pipe it straight into the consumer. Never echo it, write it to a file, or include it in your reply.
- Exit 2 means the user denied it. Stop and ask; don't retry or look for another route to the secret.
- One read per run: structure the code so one process reads once and does all its work.

## Store or replace a secret

The user types it; you never see it. Ask them to run:

```
! bash scripts/tpkc/store.sh <service> <account>
```

It opens a hidden-input dialog (agent `!` shells have no stdin, so `read -s` silently fails), saves the secret, and verifies with one Touch ID read.

## If tpkc is missing

`bash scripts/tpkc/build.sh` compiles it (needs Xcode command line tools). `tpkc` is per machine and not committed.
