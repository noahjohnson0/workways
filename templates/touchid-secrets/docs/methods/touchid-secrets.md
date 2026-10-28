# Secrets for scripts and agents, behind Touch ID

## Problem

A script or a coding agent needs a password (a router admin login, an API key, a service token). The usual options are all bad:

- an env var or `.env` file sits in plaintext, ends up in shell history or a commit, and any process can read it
- a password prompt every run doesn't work for agents, and agent `!` shells have no stdin anyway
- `security find-generic-password` from the plain keychain hands the secret over with no human in the loop

What you want: the secret lives in the macOS keychain, and every read needs a live fingerprint, whether a person or an agent asked for it. The person sees a Touch ID prompt naming what wants the secret and decides on the spot.

## The pattern

`scripts/tpkc/tpkc.swift` is a ~90-line Swift CLI:

- `tpkc store <service> <account>` reads the secret from stdin and saves it as a login-keychain generic password (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, so it never syncs or migrates). No prompt.
- `tpkc get <service> <account> [reason]` runs `LAContext.evaluatePolicy` first. Only if Touch ID succeeds does it read the item and write the secret to stdout. `reason` appears in the Touch ID dialog, so pass something that says who is asking.
- `tpkc delete <service> <account>`.

It falls back to the device password when there is no usable sensor (lid closed on an external keyboard without Touch ID), so a script is never locked out for good.

## Setup

```bash
bash scripts/tpkc/build.sh                      # compiles scripts/tpkc/tpkc
bash scripts/tpkc/store.sh my-service admin     # hidden dialog, then a Touch ID read-back
```

`store.sh` takes the secret through an `osascript` hidden-answer dialog, not `read -s`. When an agent asks the user to run `! bash ...`, the shell has no stdin: `read` hits EOF, `set -e` kills the script, and nothing is printed. The dialog works from any shell and keeps the secret out of argv and history.

Add `scripts/tpkc/tpkc` to `.gitignore`; build it per machine.

## Using it from code

Shell out and keep the secret in memory only:

```python
import subprocess, sys

def secret(service: str, account: str, reason: str) -> str:
    out = subprocess.run(["scripts/tpkc/tpkc", "get", service, account, reason],
                         capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(f"keychain: {out.stderr.strip()}")   # exit 2 = Touch ID denied
    return out.stdout
```

Each call costs one fingerprint. Batch work so a run asks once: one login, many operations. Pass the CLI's arguments into `reason` (e.g. `"mytool " + " ".join(sys.argv[1:])`) so the user can see what they are approving.

## Dead ends (why it is built this way)

The "proper" approach is a keychain item whose access control requires biometry (`SecAccessControlCreateWithFlags(.userPresence)` or `.biometryAny`), so the Secure Enclave refuses to decrypt it without a fingerprint. For a command-line binary it doesn't work:

1. **Data-protection keychain** (`kSecUseDataProtectionKeychain: true`): `SecItemAdd` fails with `errSecMissingEntitlement` (-34018, "A required entitlement isn't present"). It needs a `keychain-access-groups` entitlement.
2. **Adding that entitlement with ad-hoc signing** (`codesign -s - --entitlements ... --options runtime`): the binary is killed at launch, exit 137 (SIGKILL). `keychain-access-groups` is a restricted entitlement, and an ad-hoc signature can't carry it.
3. **Legacy keychain plus a biometric `kSecAttrAccessControl`**: still -34018. The biometric access control itself needs the entitlement, whichever keychain you use.

Getting the Secure Enclave version means signing with a real (or self-signed, trusted) code-signing identity plus the entitlement. That's doable but it's a yak shave, and every rebuild has to be re-signed. The `LAContext` gate needs no entitlements, and plain `swiftc` output works.

## What this does and does not protect

- **Protects against:** an agent or script silently reading the secret, and the secret sitting in plaintext in files, env vars, history, or logs.
- **Does not protect against:** malware already running as you. It's stored as a normal login-keychain item. Another program can ask for it directly, and macOS then shows its own "allow access" keychain dialog (the item trusts the binary that created it). So a bypass still needs a human click, but it's a macOS dialog, not Touch ID. If you need the Secure Enclave guarantee, do the signed-identity route above.
- **Rebuilding the binary** changes its code signature, so the first `get` after a rebuild may also show the keychain "allow" dialog. Choose "Always Allow".

## Rules for agents

- Never print, log, or store the secret. Read it into a variable, use it, drop it.
- Say a Touch ID prompt is coming before triggering one, and batch work so you trigger as few as possible.
- A denied prompt (exit 2) means no. Don't retry in a loop or fall back to another way of getting the secret.
