---
name: browser-attach
description: >-
  Drive the user's REAL logged-in Chrome over CDP without the automation
  fingerprint that gets you CAPTCHA'd or blocked. Use when a task needs a
  logged-in browser session (Facebook Marketplace, eBay search, any site that
  blocks headless/automated browsers) instead of server-side fetch. Reads a
  per-site subskill under sites/ on demand. NOT for tasks where a plain
  WebFetch/WebSearch suffices — those have zero fingerprint, prefer them.
---

# browser-attach

Remote-control a Chrome the **user launched themselves**, instead of letting an
automation MCP spawn its own. The detection that flags bots
(`navigator.webdriver === true` + the "Chrome is being controlled by automated
test software" banner) comes from the `--enable-automation` launch switch — NOT
from the CDP connection. So a human-launched Chrome that you merely attach to
looks like an ordinary browser: `webdriver` is `false`, no banner, real cookies.

## When to use this vs. just fetching

- **Need a logged-in session or a site blocks bots** → use this skill.
- **Just need public data / prices / text** → use WebFetch/WebSearch. No browser,
  no fingerprint, nothing to detect. Don't reach for the browser by default.

## One-time setup (per machine)

1. **Quit Chrome fully** — otherwise the debug flag is silently dropped and you
   get "Opening in existing browser session":
   ```bash
   killall "Google Chrome"
   ```
2. **User launches Chrome with a debug port and a NON-DEFAULT profile.** Chrome
   136+ refuses remote debugging on the default profile (anti-malware hardening),
   so a dedicated profile dir is mandatory. Have the user run it themselves
   (e.g. via Claude Code's `! ` prefix) so no automation flags are added:
   ```bash
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
     --remote-debugging-port=9222 \
     --user-data-dir="$HOME/chrome-attach"
   ```
   This dedicated profile starts logged out — the user signs into the sites they
   want once, and it persists across sessions.
3. **Verify the port is live:**
   ```bash
   curl -s http://127.0.0.1:9222/json/version
   ```
4. **Point the chrome-devtools MCP at it.** In `~/.claude.json`, under
   `mcpServers["chrome-devtools"].args`, add the attach flag:
   ```jsonc
   "args": ["chrome-devtools-mcp@latest", "--browserUrl=http://127.0.0.1:9222"]
   ```
   Editing `~/.claude.json` is gated by the self-modification guard — the user
   has to approve it. MCP config only loads at **startup**, so after the edit the
   user must fully restart Claude Code; the Chrome on 9222 must stay running.
5. **Confirm the attach worked:** `list_pages` shows the user's real tabs (not
   `about:blank`), and `evaluate_script` returns `navigator.webdriver === false`.

## Working pattern

- **Scrape with `evaluate_script` returning structured JSON, not
  `take_snapshot`.** A11y snapshots of busy result pages blow the token limit
  (200k+ chars seen). Return only the fields you need.
- **Lazy-load content by scrolling**, then scrape:
  ```js
  async () => { for (let i=0;i<6;i++){ window.scrollTo(0, document.body.scrollHeight);
    await new Promise(r=>setTimeout(r,900)); } return document.querySelectorAll('…').length; }
  ```
- **Open a new tab** (`new_page`) for your work so you don't disturb the user's
  current tab.

## Per-site knowledge (lazy-loaded)

Before working a specific site, READ the matching file — each captures that
site's anti-bot quirks, login needs, and scrape selectors. Only load the one you
need:

- eBay → `sites/ebay.md`
- Facebook Marketplace → `sites/facebook.md`
- Adding a new site → copy `sites/_new-site.md` and fill it in.

## Hard limits (be honest about these)

- This defeats the automation **flag**. It does **not** defeat edge/behavioral
  bot protection (Akamai, Cloudflare Turnstile, PerimeterX) that fingerprints
  request patterns, IP reputation, and mouse/timing. Per-site workarounds live in
  the `sites/` files.
- **Google sign-in resists even this** — its detection goes well beyond the flag.
- **Read/browse only.** Do not message, buy, post, or otherwise act as the user
  through their logged-in accounts unless they explicitly authorize that action.
