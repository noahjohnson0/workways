# PR screenshots (for private repos)

Every PR description should include at least one screenshot of the affected UI. In **private repos** this requires a small workaround because `raw.githubusercontent.com` URLs require auth and don't render for collaborators.

## The pipeline

1. **Capture** with `scripts/screenshot.sh` — names files by branch + route, drops them in `docs/screenshots/`.
2. **Commit** the PNG to the PR branch (canonical copy lives in the repo, survives even if attachment URLs rot).
3. **Embed** in the PR body via `scripts/gh-attach/` — uploads to `github.com/user-attachments/...` (which **does** render in private repos) and rewrites the PR body in place.

## Workflow

```bash
# 1. Capture (after booting your sim and navigating to the screen)
scripts/screenshot.sh login

# 2. Commit
git add docs/screenshots/<branch>-login.png && git commit -m "screenshot: login"

# 3. Write your PR body with a placeholder
gh pr create --body "$(cat <<EOF
## Summary
- ...

## Screenshot
{{IMG_LOGIN}}
EOF
)"

# 4. Upload + rewrite
node scripts/gh-attach/gh-attach.mjs --pr <num> \
  --replace docs/screenshots/<branch>-login.png={{IMG_LOGIN}}
```

`gh-attach` works for `.mp4` / `.webm` videos too — same flow with `{{VID_*}}` placeholders. See `scripts/gh-attach/README.md` for setup (one-time Playwright install + Chrome session borrow).
