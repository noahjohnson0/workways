#!/usr/bin/env node
// Upload local files to GitHub's user-attachments CDN by driving a Playwright
// Chromium that's authenticated with cookies borrowed from the user's normal
// Chrome session.
//
// Why cookie-borrowing instead of signing the script in directly:
// Google SSO refuses to authenticate automation-flagged browsers and GitHub's
// `user_session` cookie is HttpOnly so it can't be set client-side. Instead
// we lift the existing github.com cookies out of the user's real Chrome
// profile (via the macOS Keychain "Chrome Safe Storage" entry — one-time
// allow on first run) and inject them into Playwright's context.
//
// Usage:
//   node gh-attach.mjs <file> [<file> ...]
//   node gh-attach.mjs --pr <num> --replace <local-path>=<placeholder> ...
//
// Plain mode prints one user-attachments URL per file on stdout (in input
// order). The --pr mode additionally edits the PR body, swapping each
// placeholder for its uploaded URL via the `gh` CLI.
//
// First run: macOS Keychain prompts once for "Chrome Safe Storage" access.
// Click "Always Allow" — subsequent runs are non-interactive.

import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import chromeCookies from 'chrome-cookies-secure';

const PROFILE_DIR =
  process.env.WORKWAYS_GH_PROFILE ??
  path.join(os.homedir(), '.workways', 'gh-attach-chromium');

const REPO_SLUG = process.env.WORKWAYS_GH_REPO ?? '<owner>/<repo>';

function parseArgs(argv) {
  const out = { files: [], pr: null, replace: [], headless: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pr') out.pr = argv[++i];
    else if (a === '--replace') out.replace.push(argv[++i]);
    else if (a === '--headless') out.headless = true;
    else if (a === '-h' || a === '--help') out.help = true;
    else out.files.push(a);
  }
  return out;
}

function usage() {
  console.error(`gh-attach — upload files to GitHub user-attachments.

  node gh-attach.mjs <file> [<file> ...]
  node gh-attach.mjs --pr <num> --replace <localPath>=<placeholder> [--replace ...]

Env:
  WORKWAYS_GH_PROFILE   Chromium profile dir (default: ~/.workways/gh-attach-chromium)
  WORKWAYS_GH_REPO             owner/name (default: <owner>/<repo>)
`);
}

// Pull github.com cookies from the user's normal Chrome / Chrome Beta /
// Edge / Brave / Opera profile (whichever has a valid session). The first
// call prompts macOS Keychain for the "Chrome Safe Storage" key — once
// allowed, future runs are silent.
async function loadCookiesFromChrome() {
  const browsers = ['Chrome', 'Chrome Beta', 'Chrome Canary', 'Edge', 'Brave', 'Opera'];
  for (const browser of browsers) {
    try {
      const cookies = await new Promise((resolve, reject) => {
        chromeCookies.getCookies(
          'https://github.com',
          'puppeteer',
          (err, c) => (err ? reject(err) : resolve(c)),
          undefined,
          browser,
        );
      });
      if (cookies && cookies.length) {
        const hasSession = cookies.some((c) => c.name === 'user_session');
        if (hasSession) {
          console.error(`[gh-attach] Borrowed ${cookies.length} github.com cookies from ${browser}.`);
          return cookies;
        }
      }
    } catch {
      /* try next browser */
    }
  }
  return null;
}

async function ensureSignedIn(context, page) {
  // /settings/profile redirects to /login when logged out and stays put when
  // logged in — a more reliable probe than the repo homepage (which can 404
  // for private repos before redirecting).
  const probe = async () => {
    await page.goto('https://github.com/settings/profile', { waitUntil: 'domcontentloaded' });
    return !page.url().includes('/login');
  };

  if (await probe()) return;

  // Try to borrow cookies from the user's existing Chrome session before
  // falling back to interactive sign-in (Google SSO refuses automation-flagged
  // Chromium, so interactive flow is fragile).
  const cookies = await loadCookiesFromChrome();
  if (cookies) {
    const normSameSite = (s) => {
      const v = String(s || 'Lax').toLowerCase();
      if (v === 'no_restriction' || v === 'none') return 'None';
      if (v === 'strict') return 'Strict';
      return 'Lax';
    };
    const pwCookies = cookies
      .filter((c) => c.name && typeof c.value === 'string')
      .map((c) => {
        // chrome-cookies-secure 'puppeteer' format returns `expires` in
        // milliseconds since 1601-01-01 (Chrome's internal epoch). Convert
        // to Unix seconds, falling back to -1 (session cookie).
        let exp = -1;
        const WEBKIT_EPOCH_MS = 11644473600000; // ms between 1601-01-01 and 1970-01-01
        if (typeof c.expires === 'number' && isFinite(c.expires)) {
          let unixSeconds;
          if (c.expires > 1e15) {
            // Microseconds since 1601 (raw Chrome SQLite value).
            unixSeconds = Math.floor((c.expires / 1000 - WEBKIT_EPOCH_MS) / 1000);
          } else if (c.expires > 1e12) {
            // Milliseconds since 1601.
            unixSeconds = Math.floor((c.expires - WEBKIT_EPOCH_MS) / 1000);
          } else if (c.expires > 1e10) {
            // Milliseconds since 1970.
            unixSeconds = Math.floor(c.expires / 1000);
          } else {
            // Seconds since 1970.
            unixSeconds = Math.floor(c.expires);
          }
          if (unixSeconds > 0 && unixSeconds < 253402300799) exp = unixSeconds;
        } else if (c.expires instanceof Date) {
          const s = Math.floor(c.expires.getTime() / 1000);
          if (s > 0) exp = s;
        }
        const prefixHost = c.name.startsWith('__Host-');
        const prefixSecure = c.name.startsWith('__Secure-') || prefixHost;
        const out = {
          name: c.name,
          value: c.value,
          expires: exp,
          httpOnly: !!c.httpOnly,
          // Cookie prefix requirements (RFC 6265bis §4.1.3) — Chrome's CDP
          // validates these strictly and rejects the whole batch if any one
          // violates them.
          secure: prefixSecure ? true : !!c.secure,
          sameSite: normSameSite(c.sameSite),
        };
        if (prefixHost) {
          // __Host- prefix: no Domain attribute; path must be /. Playwright
          // accepts either `url` OR (domain + path), so use `url` here.
          out.url = 'https://github.com/';
        } else {
          out.domain = c.domain || '.github.com';
          out.path = c.path || '/';
        }
        return out;
      });
    if (process.env.WORKWAYS_DEBUG) {
      // Values are intentionally omitted — they hold the user's session.
      const shape = pwCookies.map((c) => ({
        name: c.name, domain: c.domain, path: c.path, expires: c.expires,
        httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite,
      }));
      console.error('[gh-attach] cookie shape:', JSON.stringify(shape, null, 2));
    }
    await context.addCookies(pwCookies);
    if (await probe()) {
      console.error('[gh-attach] Signed in via borrowed cookies.');
      return;
    }
    console.error('[gh-attach] Borrowed cookies did not authenticate; falling through to manual sign-in.');
  }

  console.error('[gh-attach] Not signed in. A Chromium window is open — sign into github.com there.');
  console.error('[gh-attach] Waiting up to 10 minutes for sign-in to complete… (will detect automatically)');
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(3000);
    try {
      if (await probe()) {
        console.error('[gh-attach] Signed in. Continuing.');
        return;
      }
    } catch {
      /* transient navigation race; keep polling */
    }
  }
  throw new Error('Timed out waiting for sign-in.');
}

// Upload a single file by driving any markdown comment textarea on the
// repo (we use the "Leave a comment" composer at the bottom of a chosen
// host PR or issue). We never submit the comment — we only need GitHub
// to upload the file and rewrite the textarea to contain a
// `github.com/user-attachments/...` URL.
async function uploadOne(page, filePath, hostUrl) {
  await page.goto(hostUrl, { waitUntil: 'domcontentloaded' });

  // GitHub's markdown comment composer uses one of two DOMs depending on
  // whether the React-rewritten editor is enabled. Try both.
  // Be specific — there are several decoy textareas on a PR page (the
  // floating "Help us improve" feedback widget, search hint, etc).
  const textarea = page.locator(
    [
      'textarea[name="comment[body]"]',
      'textarea[name="pull_request_review[body]"]',
      'textarea[name="issue[body]"]',
      'textarea.js-comment-field',
    ].join(', ')
  ).first();
  await textarea.waitFor({ state: 'visible', timeout: 30000 });

  // Get the file input that belongs to *this* composer (each composer has
  // its own <file-attachment> wrapper with a hidden <input type=file>).
  // Resolving by DOM ancestry guarantees the upload URL lands in the
  // textarea we're watching, not some other composer on the page.
  const fileInputHandle = await textarea.evaluateHandle((ta) => {
    const wrapper = ta.closest('file-attachment, form');
    return wrapper && wrapper.querySelector('input[type=file]');
  });
  const fileInputEl = fileInputHandle.asElement();
  if (!fileInputEl) {
    throw new Error('No file input found near the comment textarea.');
  }

  // Clear the textarea so we can scan its full value for the new URL.
  await textarea.fill('');
  await fileInputEl.setInputFiles(filePath);

  // GitHub inserts a placeholder like "[Uploading file.png…]()" then
  // replaces it with the final markdown including a user-attachments URL.
  const handle = await textarea.elementHandle();
  const url = await page.waitForFunction(
    (ta) => {
      const v = ta.value || '';
      const m = v.match(/https:\/\/github\.com\/user-attachments\/(?:assets|files)\/[A-Za-z0-9-]+(?:\/[^\s)]+)?/);
      return m ? m[0] : false;
    },
    handle,
    { timeout: 180000, polling: 500 }
  );
  return await url.jsonValue();
}

function ghPrEdit(prNum, body) {
  const r = spawnSync('gh', ['pr', 'edit', String(prNum), '--body', body], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (r.status !== 0) throw new Error(`gh pr edit exited ${r.status}`);
}

function ghPrView(prNum) {
  const r = spawnSync('gh', ['pr', 'view', String(prNum), '--json', 'body', '-q', '.body'], {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`gh pr view exited ${r.status}`);
  return r.stdout;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.files.length && !args.replace.length)) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  let replacePairs = [];
  if (args.pr) {
    if (!args.replace.length) {
      console.error('[gh-attach] --pr requires at least one --replace <local>=<placeholder>');
      process.exit(1);
    }
    for (const r of args.replace) {
      const eq = r.indexOf('=');
      if (eq < 0) throw new Error(`bad --replace ${r}`);
      replacePairs.push({ local: r.slice(0, eq), placeholder: r.slice(eq + 1) });
    }
  }

  const allFiles = args.pr
    ? replacePairs.map((p) => path.resolve(p.local))
    : args.files.map((f) => path.resolve(f));

  for (const f of allFiles) {
    await fs.access(f).catch(() => {
      throw new Error(`File not found: ${f}`);
    });
  }

  await fs.mkdir(PROFILE_DIR, { recursive: true });
  console.error(`[gh-attach] Using profile: ${PROFILE_DIR}`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: args.headless,
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = context.pages()[0] ?? (await context.newPage());

  try {
    await ensureSignedIn(context, page);

    const hostUrl = args.pr
      ? `https://github.com/${REPO_SLUG}/pull/${args.pr}`
      : `https://github.com/${REPO_SLUG}/issues`;

    const urls = [];
    for (const f of allFiles) {
      console.error(`[gh-attach] Uploading ${path.basename(f)}…`);
      const url = await uploadOne(page, f, hostUrl);
      console.error(`[gh-attach]   → ${url}`);
      urls.push(url);
    }

    if (args.pr) {
      let body = ghPrView(args.pr);
      replacePairs.forEach((p, i) => {
        if (!body.includes(p.placeholder)) {
          console.error(`[gh-attach] WARNING: placeholder not found in PR body: ${p.placeholder}`);
        }
        body = body.split(p.placeholder).join(urls[i]);
      });
      ghPrEdit(args.pr, body);
      console.error(`[gh-attach] PR #${args.pr} body updated.`);
    } else {
      for (const u of urls) console.log(u);
    }
  } finally {
    await context.close();
  }
}

main().catch((e) => {
  console.error('[gh-attach] error:', e?.message ?? e);
  process.exit(1);
});
