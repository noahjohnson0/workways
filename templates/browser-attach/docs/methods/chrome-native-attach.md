# Method: drive your actual daily-driver Chrome via the Claude extension

Companion to [`browser-attach.md`](./browser-attach.md). Same goal, different
mechanism, different tradeoffs. **Read the routing table below before picking
one.**

## Two routes, and how to choose

| | CDP attach (`browser-attach.md`) | Extension + native messaging (this doc) |
|---|---|---|
| Chrome you drive | a **second** Chrome you launch on a throwaway profile | your **actual** running Chrome, default profile |
| Your existing logins | no, the profile starts empty and you re-login per site | yes, real cookies, real sessions, day one |
| Chrome launch flags | `--remote-debugging-port` + `--user-data-dir` required | none, Chrome runs bare |
| Chrome 136+ default-profile block | you dodge it with a custom profile | not applicable, no debug port involved |
| Setup surface | MCP config edit + Claude Code restart | install extension, restart Chrome, sign in |
| `navigator.webdriver` | `false` | `false` |
| Works under corp MDM | usually | often blocked, see below |
| Tooling | `chrome-devtools-mcp` / Playwright | built-in `mcp__claude-in-chrome__*` tools |

Rough rule: **if you need your own logins, use the extension.** If you need a
clean, disposable, scriptable browser (scraping, CI-ish work, or you don't want
your real session touched), use CDP attach.

## The thing that trips everyone up

People try to CDP-attach to the Chrome they already have open. It cannot work,
and the failure modes are all misleading:

1. You add `--remote-debugging-port=9222` to your normal Chrome. Chrome 136+
   **silently refuses** it because you're on the default user-data-dir. Nothing
   listens on 9222.
2. So you add `--user-data-dir=$HOME/chrome-attach`. Now the port works, but you
   have a brand new signed-out browser. Every site treats you as a stranger.
3. So you sign into that profile, and Google refuses, or Playwright dies with
   `Target page, context or browser has been closed`.

None of this is a misconfiguration you can fix. Remote debugging on the default
profile was removed deliberately as anti-malware hardening (malware was using it
to read cookies out of live sessions). There is no supported flag to re-enable
it. **Stop debugging that path.** The extension exists precisely because of it.

## How the extension route actually works

The connection direction is inverted from CDP, which is why it sidesteps the
whole problem. Nothing outside Chrome opens a socket into Chrome. Chrome reaches
*out* and spawns the Claude Code binary:

```
Chrome (your normal window, zero launch flags, signed in)
  └─ Claude extension (MV3 service worker)
       │  uses chrome.tabs / chrome.tabGroups / chrome.scripting
       │  and chrome.debugger (in-process DevTools, no TCP port)
       │
       └─ chrome.runtime.connectNative("com.anthropic.claude_code_browser_extension")
            └─ spawns ~/.claude/chrome/chrome-native-host   (a 4-line sh wrapper)
                 └─ exec <claude binary> --chrome-native-host   [stdio JSON]
                      └─ your session's mcp__claude-in-chrome__* tools
```

Three pieces have to line up:

**1. The extension**, installed into the profile you actually use:
```
~/Library/Application Support/Google/Chrome/Default/Extensions/<ext-id>/<version>/
```
Its manifest requests `tabs`, `tabGroups`, `debugger`, `scripting`,
`nativeMessaging`, and `<all_urls>`. The `tabGroups` permission is what puts
agent tabs into a dedicated tab group in your real window instead of scattering
them.

**2. The native messaging host manifest**, which tells Chrome what to spawn:
```
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.anthropic.claude_code_browser_extension.json
```
```json
{
  "name": "com.anthropic.claude_code_browser_extension",
  "description": "Claude Code Browser Extension Native Host",
  "path": "/Users/<you>/.claude/chrome/chrome-native-host",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://<ext-id>/"]
}
```

**3. The host wrapper** at the `path` above, which is just:
```sh
#!/bin/sh
exec "/Users/<you>/.local/share/claude/versions/<version>" --chrome-native-host
```

There is **nothing to add to `~/.claude.json` or `settings.json`.** The browser
tools are built in. The only persisted state is a few booleans
(`cachedChromeExtensionInstalled`, `claudeInChromeDefaultEnabled`,
`hasCompletedClaudeInChromeOnboarding`).

Note also: a desktop-app variant of this manifest
(`com.anthropic.claude_browser_extension.json`, pointing into
`/Applications/Claude.app/Contents/Helpers/`) may sit alongside it. That is for
the Claude desktop app, not Claude Code. Don't confuse them when debugging.

## Setup on a new machine

1. Install the extension from `https://claude.ai/chrome` into the Chrome
   **you already use**. Do not make a new profile. The whole point is your
   existing session.
2. **Fully quit and relaunch Chrome.** The native messaging manifest is only read
   at browser startup. Skipping this is the single most common "installed but
   nothing happens".
3. Sign into claude.ai in that Chrome, with the **same account Claude Code is
   authenticated as.** A mismatch produces a generic "extension is not connected"
   error that says nothing about accounts.
4. Verify the wiring from a shell:
   ```bash
   cat ~/Library/"Application Support"/Google/Chrome/NativeMessagingHosts/com.anthropic.claude_code_browser_extension.json
   ls -l ~/.claude/chrome/chrome-native-host
   sh -c 'grep exec ~/.claude/chrome/chrome-native-host'   # target must exist
   ```
5. Smoke test in this order, smallest first:
   - `tabs_context_mcp` with `createIfEmpty: true` returns the tab group's IDs
   - `tabs_create_mcp` puts a new tab in that group, in your real window
   - `navigate` then `read_page` reads the URL back

## Diagnosing "extension is not connected"

Work down this list. The error text is the same for all of them.

- **Chrome was not restarted** after install. Fix first, it's free.
- **Account mismatch** between the claude.ai login in Chrome and Claude Code.
- **Stale host wrapper.** The wrapper hardcodes a version path under
  `~/.local/share/claude/versions/`. If Claude Code updated and the wrapper
  wasn't regenerated, it `exec`s a binary that no longer exists and fails
  silently. `ls` the target.
- **Corp MDM policy.** Check `Default/Managed Extension Settings` and any
  `NativeMessagingBlocklist` / `ExtensionInstallBlocklist` policy. A blocked
  native messaging host lets the extension install and appear healthy while
  permanently refusing to connect. This one you cannot fix yourself, escalate to
  IT.

## Two red herrings you will find while investigating

**`DevToolsActivePort`.** The file
`~/Library/Application Support/Google/Chrome/DevToolsActivePort` exists with a
port number even on a flagless Chrome, and that port really is bound on
`127.0.0.1`. It is Chrome's internal DevTools socket, not a general CDP endpoint,
and it is not what the extension uses. Attaching to it is not the answer.

**MCP servers that lie about being healthy.** `claude mcp list` reports a stdio
server as connected once the process spawns, before any real work happens. So:
- a `chrome-devtools` entry pointing at `--browserUrl=http://127.0.0.1:9222`
  shows a green check even when nothing is listening on 9222, then fails on the
  first actual call
- a `playwright` entry with `--browser chrome` shows a green check and then
  **launches its own fresh Chrome**, it never attaches to yours

If you're on the extension route, delete both entries. Leaving them in place
guarantees a confusing session later where you can't tell which mechanism was
supposed to be driving.

Confirm with the ground truth instead of the health check:
```bash
ps -o command= -p $(pgrep -x "Google Chrome" | head -1)   # any flags at all?
lsof -nP -iTCP:9222 -sTCP:LISTEN                          # anything really there?
curl -s -m2 http://127.0.0.1:9222/json/version
```
A bare `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` with no
arguments means you are on the extension route, whatever the MCP list claims.

## macOS permissions: none needed

Worth stating because it's a natural place to go hunting. The extension route
needs **no** TCC grants. Not Accessibility, not Screen Recording, not Apple
Events. Chrome's "Allow JavaScript from Apple Events" setting is irrelevant and
should stay off. If you're granting permissions to make this work, you're on the
wrong trail.

## Same limits as the CDP route

Both routes defeat the automation **flag**, and neither defeats behavioral or
edge bot protection (Akamai, Cloudflare Turnstile, PerimeterX). The extension
route carries more risk in one direction, though: you are operating inside the
user's real, fully signed-in session. **Read and browse. Do not message, post,
purchase, or change account settings through it without explicit per-action
authorization.** Per-site quirks live in the `sites/` files next to the skill.
