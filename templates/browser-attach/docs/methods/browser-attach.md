# Method: attach to your real Chrome instead of spawning an automated one

## The problem

Browser-automation MCPs (`chrome-devtools-mcp`, Playwright) launch Chrome with
`--enable-automation`. That switch sets `navigator.webdriver = true` and shows
the "Chrome is being controlled by automated test software" banner. **Any site
reads that flag in one line of JS.** Consequences seen in the wild:

- eBay redirects to a `splashui/challenge` CAPTCHA.
- Google refuses sign-in ("This browser or app may not be secure").
- Fresh, not-logged-in instances get rate-limited fast.

Driving a flagged browser is the *opposite* of stealthy — it advertises
automation and carries none of your logins.

## The insight

The detection comes from the **launch flag, not the CDP connection**. If a human
launches Chrome normally (no `--enable-automation`) but with a remote-debugging
port, you can attach over CDP and remote-control it. `navigator.webdriver` stays
`false`, there's no banner, and you're in the user's real, logged-in session.

## Setup

1. Quit Chrome fully (`killall "Google Chrome"`) — otherwise the debug flag is
   silently dropped ("Opening in existing browser session").
2. User launches a debug instance with a **non-default profile** (Chrome 136+
   blocks remote debugging on the default profile as anti-malware hardening):
   ```bash
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
     --remote-debugging-port=9222 --user-data-dir="$HOME/chrome-attach"
   ```
3. Verify: `curl -s http://127.0.0.1:9222/json/version`.
4. Add `--browserUrl=http://127.0.0.1:9222` to the chrome-devtools MCP `args` in
   `~/.claude.json` (gated by the self-modification guard; user approves), then
   **restart Claude Code** — MCP config loads only at startup.
5. Confirm: `list_pages` shows the user's tabs; `navigator.webdriver === false`.

## What it does and doesn't buy you

- **Defeats:** the automation-flag detection (`webdriver`, the banner) and the
  not-logged-in penalty. Good enough for Facebook Marketplace, eBay (with a warm
  search), and most ordinary sites.
- **Does NOT defeat:** edge/behavioral bot protection (Akamai, Cloudflare
  Turnstile, PerimeterX) that fingerprints request patterns, IP reputation, and
  mouse/timing. eBay's `/sch` endpoint, for instance, still "Access Denied"s a
  cold deep-link — you work around it per-site (search from the homepage).
- **Google sign-in** resists even this.

## Rules of thumb

- If a plain `WebFetch`/`WebSearch` gets the data, use that — no browser, no
  fingerprint at all.
- Scrape with `evaluate_script` returning JSON; a11y `take_snapshot` on busy
  pages blows the token budget (200k+ chars seen).
- Read/browse only. Don't message, buy, or post through the user's logged-in
  accounts without explicit authorization.

The per-site quirks (selectors, anti-bot workarounds) live in the
`browser-attach` skill under `.claude/skills/browser-attach/sites/`.
