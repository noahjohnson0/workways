#!/usr/bin/env node
// record-webm.mjs - record a headless webm of a local page, optionally driving a
// control on a timer (e.g. cycling a serveoptions picker). Scaffolded by
// `npx workways add pr-screenshots`. Needs Playwright: `npm i -D playwright &&
// npx playwright install chromium`.
//
// Usage:
//   node scripts/record-webm.mjs --url http://localhost:3000 --out demo.webm
//   node scripts/record-webm.mjs --url http://localhost:3000 --out demo.webm \
//     --click "button[aria-label='Next font']" --steps 16 --dwell 820 \
//     --width 1280 --height 720 --settle 1300
//
// Flags:
//   --url     page to record (required)
//   --out     output .webm path (default ./demo.webm)
//   --click   selector to click each step (optional; omit for a static capture)
//   --steps   how many clicks (default 0)
//   --dwell   ms to wait after each click so each state reads (default 800)
//   --settle  ms to wait after first load before recording action (default 1200)
//   --width / --height  viewport + video size (default 1280x720)
//
// Why a separate file from screenshot.sh: a webm needs a live browser context
// with recordVideo enabled for its whole lifetime, which is a different shape
// from a one-shot screenshot.

import { chromium } from 'playwright';
import { mkdtempSync, readdirSync, renameSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const url = arg('url');
if (!url) {
  console.error('ERROR: --url is required');
  process.exit(1);
}
const out = resolve(arg('out', './demo.webm'));
const clickSel = arg('click', null);
const steps = parseInt(arg('steps', '0'), 10);
const dwell = parseInt(arg('dwell', '800'), 10);
const settle = parseInt(arg('settle', '1200'), 10);
const W = parseInt(arg('width', '1280'), 10);
const H = parseInt(arg('height', '720'), 10);

const recDir = mkdtempSync(join(tmpdir(), 'webm-'));

const browser = await chromium.launch(); // headless by default; renders fine
const context = await browser.newContext({
  viewport: { width: W, height: H },
  // recordVideo MUST be set on the context, not the page, and the size is fixed
  // here (deviceScaleFactor would only sharpen screenshots, not the video).
  recordVideo: { dir: recDir, size: { width: W, height: H } },
});
const page = await context.newPage();

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(settle);

if (clickSel && steps > 0) {
  const target = page.locator(clickSel);
  for (let i = 0; i < steps; i++) {
    await target.click();
    await page.waitForTimeout(dwell);
  }
}

// Closing the context is what flushes and finalizes the .webm. Skip it and you
// get a truncated or empty file.
await context.close();
await browser.close();

const file = readdirSync(recDir).find((f) => f.endsWith('.webm'));
if (!file) {
  console.error('ERROR: no webm produced');
  rmSync(recDir, { recursive: true, force: true });
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
renameSync(join(recDir, file), out);
rmSync(recDir, { recursive: true, force: true });
console.log(`wrote ${out}`);
console.log('Playwright records VP8. To shrink / re-encode to VP9:');
console.log(`  ffmpeg -y -i ${out} -c:v libvpx-vp9 -b:v 0 -crf 34 -an -pix_fmt yuv420p ${out.replace(/\.webm$/, '.vp9.webm')}`);
