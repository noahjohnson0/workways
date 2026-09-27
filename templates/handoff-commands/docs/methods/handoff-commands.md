# Handing a command to the user: script it, don't one-line it

## Problem

Sometimes the agent can't run a command itself and has to ask the user to: a permission classifier denied it, it needs `sudo`, or it has to run in the user's own shell. In Claude Code that means asking them to type `! <command>`.

The tempting move is one long `cd ... && ... && ...` line. It breaks. The terminal wraps a long pasted command across lines, and the paste comes out mangled:

- a `cd` into a path split mid-word, so it lands in a directory that doesn't exist
- an `&&` landing at the start of a line, which zsh rejects with `parse error near '&&'`
- trailing typos from the wrapped tail

This has happened repeatedly. Each failure costs a round trip, and the user ends up debugging the agent's paste instead of doing the thing.

## Rule

Never hand the user a long one-liner. Write the steps to a short script file and have them run that.

1. Write `~/<task>.sh` with the Write tool (writing a file is allowed even when running the command was not).
2. Start it with `set -euo pipefail` and a comment saying what it does, so the user can read it before running it.
3. End it with a verification step that prints proof the thing worked, so the result is visible in the transcript without another round trip.
4. Ask them to run `! bash ~/<task>.sh`.

Any command the user has to type stays short enough to fit on one line: about 60 characters.

## Example

Instead of:

```
! cd ~/repos/some-project/deploy/proxmox && sudo cp runner.env /etc/runner/runner.env && sudo systemctl restart runner && systemctl status runner --no-pager
```

write `~/restart-runner.sh`:

```bash
#!/usr/bin/env bash
# Install the updated runner.env and restart the runner service.
set -euo pipefail

cd ~/repos/some-project/deploy/proxmox
sudo cp runner.env /etc/runner/runner.env
sudo systemctl restart runner

# Verify: the installed file matches and the service came back up.
sudo diff runner.env /etc/runner/runner.env && echo "runner.env installed"
systemctl is-active runner
```

and ask for:

```
! bash ~/restart-runner.sh
```

## Why

A script file can't be broken by line wrapping, `set -e` stops at the first failure instead of plowing on, and the verification step turns "did it work?" into output the agent can read. The only thing the user types is one short line.
