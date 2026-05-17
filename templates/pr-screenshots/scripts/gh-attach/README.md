# gh-attach

Upload local files (PNGs, MP4s, WebMs) to GitHub's `user-attachments` CDN and return the resulting `https://github.com/user-attachments/assets/...` URLs that render inline in PR descriptions and issue bodies — including for **private repos**.

## Why

GitHub renders videos and images inline in PR/issue markdown **only** when the URL points at `github.com/user-attachments/...`. Those URLs are minted server-side when a file is dragged into the comment editor. There's no public REST API for it.

Naïve attempts fail in two specific ways:

- **Google SSO** refuses to authenticate automation-flagged Chromium, so the script can't sign in by typing credentials.
- **`user_session`** is HttpOnly, so it can't be exfiltrated and re-injected as a header from outside a browser.

This script avoids both problems by **borrowing** session cookies from your real Chrome profile (decrypted via the macOS Keychain) and injecting them into a Playwright Chromium. You stay signed into Chrome normally — the script just reads the github.com cookies and uses them for the upload session.

## One-time setup

```bash
cd scripts/gh-attach
npm install
npx playwright install chromium
```

The first run prompts the macOS Keychain dialog for access to **"Chrome Safe Storage"** (the AES key Chrome uses to encrypt its cookie store). Click **Always Allow** so future runs are silent.

Sign into github.com in your normal Chrome — the script borrows from whichever Chrome profile holds a valid `user_session` cookie. Override with `WORKWAYS_GH_PROFILE=…` (Playwright profile path) and `WORKWAYS_GH_REPO=owner/name`.

## Usage

### Plain mode — print URLs to stdout

```bash
node gh-attach.mjs docs/screenshots/login.png e2e/recordings/login-valid.mp4
# → https://github.com/user-attachments/assets/abc-…
# → https://github.com/user-attachments/assets/def-…
```

One URL per file, in input order.

### PR mode — substitute placeholders in a PR body in place

Put placeholder strings in the PR description (e.g., `{{IMG_LOGIN}}`, `{{VID_LOGIN_VALID}}`), then:

```bash
node gh-attach.mjs --pr 52 \
  --replace docs/screenshots/login.png={{IMG_LOGIN}} \
  --replace e2e/recordings/login-valid.mp4={{VID_LOGIN_VALID}}
```

Uploads each file, fetches the current PR body via `gh pr view`, swaps each placeholder for its uploaded URL, and pushes the body back via `gh pr edit`.

## How it works

For each file:

1. Navigates to `github.com/<repo>/issues/new` (a throwaway compose page — never submitted).
2. Locates the hidden `<input type="file">` that GitHub's markdown editor uses for drag-drop uploads (`.js-manual-file-chooser`).
3. Calls Playwright's `setInputFiles()` on it — GitHub treats this identically to a drag-drop.
4. Waits until the textarea contains a `github.com/user-attachments/...` URL (GitHub rewrites the temporary `[Uploading…]()` placeholder once the S3 upload completes).
5. Extracts and returns the URL.

The compose page is discarded; nothing is posted.

## Failure modes

- **Not signed in / session expired**: the script detects this and pauses for an interactive sign-in.
- **GitHub changes the file-input selector**: update the `js-manual-file-chooser` selector in `gh-attach.mjs`. The fallback selectors handle a few known variants.
- **Upload times out** (default 180s per file): videos > 10 MB on slow connections may exceed this. Compress first (e.g., `ffmpeg -crf 28 -preset fast`) or bump the timeout in the script.
- **2FA / passkey on every run**: shouldn't happen — GitHub session cookies are good for ~7 days of inactivity and renew on each use. If they do, check the profile dir is being preserved between runs.

## Security note

The profile dir holds your real GitHub session cookies. Treat it like an SSH key — don't commit it, don't share it. The default path (`~/.workways/gh-attach-chromium`) is outside the repo for that reason.
