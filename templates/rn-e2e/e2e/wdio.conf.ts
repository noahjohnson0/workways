import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.test') });

const requireEnv = (key: string): string => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var ${key} — set it in .env.test (see e2e/.env.test.example).`);
  return v;
};

const appPath = process.env.IOS_APP_PATH;
if (!appPath) {
  // eslint-disable-next-line no-console
  console.warn('[wdio] IOS_APP_PATH is empty; run `npx expo run:ios` and set IOS_APP_PATH in .env.test before `npm run e2e:ios`.');
}

export const config: WebdriverIO.Config = {
  runner: 'local',
  tsConfigPath: path.resolve(__dirname, 'tsconfig.json'),

  specs: [path.resolve(__dirname, 'specs', '**/*.e2e.ts')],
  maxInstances: 1,

  capabilities: [
    {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      ...(process.env.IOS_UDID
        ? { 'appium:udid': process.env.IOS_UDID }
        : {
            'appium:deviceName': process.env.IOS_DEVICE_NAME ?? 'iPhone 15',
            'appium:platformVersion': process.env.IOS_PLATFORM_VERSION ?? '17.5',
          }),
      'appium:bundleId': requireEnv('IOS_BUNDLE_ID'),
      ...(appPath ? { 'appium:app': appPath } : {}),
      'appium:newCommandTimeout': 240,
      'appium:autoAcceptAlerts': false,
    } as WebdriverIO.Capabilities,
  ],

  logLevel: 'info',
  bail: 0,
  waitforTimeout: 15000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 2,

  services: [
    [
      'appium',
      {
        args: { address: '127.0.0.1', port: 4723 },
        logPath: path.resolve(__dirname, '.tmp'),
      },
    ],
  ],
  port: 4723,

  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 120000,
  },

  // Per-test screen recording via Appium's mobile:startRecordingScreen, which
  // returns a properly finalized base64 mp4 on stop. We then transcode to webm
  // with ffmpeg. Output lives in e2e/recordings/ (gitignored). simctl recordVideo
  // was tried first but SIGINT-finalization wasn't reliable through xcrun.
  beforeTest: async function (test) {
    const outDir = path.resolve(__dirname, 'recordings');
    fs.mkdirSync(outDir, { recursive: true });
    const safeTitle = `${test.parent}__${test.title}`.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 120);
    const mp4Path = path.join(outDir, `${safeTitle}.mp4`);
    try { fs.unlinkSync(mp4Path); } catch {}
    console.log(`[wdio] beforeTest start recording -> ${mp4Path}`);
    try {
      await (driver as any).startRecordingScreen({ videoType: 'h264', timeLimit: 600 });
      (globalThis as any).__currentRecording = { mp4Path, safeTitle };
    } catch (e: any) {
      console.warn('[wdio] startRecordingScreen failed:', e?.message ?? e);
    }
  },
  afterTest: async function () {
    console.log('[wdio] afterTest enter');
    const rec = (globalThis as any).__currentRecording as { mp4Path: string; safeTitle: string } | undefined;
    if (!rec) { console.warn('[wdio] afterTest: no _currentRecording set'); return; }
    (globalThis as any).__currentRecording = undefined;
    const { mp4Path } = rec;

    let b64: string;
    try {
      b64 = await (driver as any).stopRecordingScreen();
    } catch (e: any) {
      console.warn('[wdio] stopRecordingScreen failed:', e?.message ?? e);
      return;
    }
    if (!b64) {
      console.warn(`[wdio] stopRecordingScreen returned empty for ${rec.safeTitle}`);
      return;
    }
    fs.writeFileSync(mp4Path, Buffer.from(b64, 'base64'));
    console.log(`[wdio] wrote ${mp4Path} (${b64.length} b64 chars)`);

    const webmPath = mp4Path.replace(/\.mp4$/, '.webm');
    const ff = spawnSync(
      'ffmpeg',
      ['-y', '-loglevel', 'error', '-i', mp4Path, '-c:v', 'libvpx-vp9', '-b:v', '1M', '-an', webmPath],
      { stdio: 'inherit' },
    );
    if (ff.status === 0) {
      fs.unlinkSync(mp4Path);
    } else {
      // eslint-disable-next-line no-console
      console.warn(`[wdio] ffmpeg failed (status ${ff.status}); keeping ${mp4Path}`);
    }
  },
};
