# Recording a headless webm with Playwright

How to capture a short screen-recording of a running web page with no display
and no human at the keyboard, for a PR description, a writeup, or proof that a
flow works. Pairs with `scripts/record-webm.mjs`.

The use case that prompted this: recording a `serveoptions` picker cycling
sixteen font options on a live dev site, headless, to embed in a blog post.

## The shape

```bash
npm i -D playwright && npx playwright install chromium

# static capture
node scripts/record-webm.mjs --url http://localhost:3000 --out demo.webm

# drive a control on a timer (e.g. a "next option" pill)
node scripts/record-webm.mjs --url http://localhost:3000 --out demo.webm \
  --click "button[aria-label='Next font']" --steps 16 --dwell 820
```

## The non-obvious parts (each cost a take)

- **`recordVideo` goes on the context, not the page, not `launch()`.** You set
  it in `browser.newContext({ recordVideo: { dir, size } })`. There is no
  `page.startRecording()`.
- **Closing the context is what writes the file.** The `.webm` is finalized on
  `context.close()`. If you read the directory before closing, or the process
  exits early, you get a truncated or empty file. Close the context, then look
  for the file.
- **Headless renders video fine.** You do not need `xvfb`, a virtual display, or
  a real GPU. Chromium headless renders into the recording the same as headed.
- **The filename is random.** Playwright names the file itself
  (`<hash>.webm`) inside the dir you gave. Record into a temp dir, then find the
  single `*.webm` and rename it to your target path.
- **Video size is fixed by `recordVideo.size`, independent of
  `deviceScaleFactor`.** A `deviceScaleFactor: 2` sharpens `page.screenshot()`
  stills but does nothing for the video resolution. Set `size` to what you want
  the webm to be (match it to the viewport to avoid letterboxing).
- **Dwell on each state.** When driving a control, wait ~0.8s after each action
  so each state actually reads on camera. Clicking with no pause produces a
  blur no one can follow.
- **Target controls by accessible name.** `page.locator("button[aria-label=
  '...']")` or `getByRole('button', { name: '...' })` is stabler than nth-child
  selectors when the UI shifts.

## Post-processing

Playwright writes **VP8**. It plays everywhere but is larger than it needs to be.
Re-encode to VP9 (smaller, same visual quality) and drop the audio track:

```bash
ffmpeg -y -i demo.webm -c:v libvpx-vp9 -b:v 0 -crf 34 -an -pix_fmt yuv420p demo.vp9.webm
```

`-crf 34` is a good web default; lower is higher quality and bigger. For an
autoplaying loop on a page, embed it muted:

```html
<video src="/demo.webm" autoplay loop muted playsinline controls></video>
```

(In JSX/MDX use camelCase: `autoPlay`, `playsInline`.)

## Stills for free

The same script can also `await page.screenshot({ path })` at any point in the
sequence, so one headless run yields both the video and the cover/inline stills.
Use `deviceScaleFactor: 2` on the context for crisp 2x screenshots; it will not
change the video.
