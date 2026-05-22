/**
 * Verifies the login version footer renders the *right* string for whichever
 * build is under test:
 *   - Expo Go (`IOS_BUNDLE_ID=host.exp.Exponent`) → `branch @ shortsha`
 *   - Native dev/release build → `v{APP_VERSION} (build {BUILD})` (or `v{APP_VERSION}` if no build).
 *
 * The expected string is computed from app.json + `git rev-parse` so a stale
 * footer (e.g. a worktree showing a different branch's commit) fails the test.
 */

import { A11Y, sel } from '../helpers/selectors';
import {
  expectedExpoGoLabel,
  expectedNativeBuildLabel,
  isExpoGoMode,
} from '../helpers/version';

describe('Login version footer', () => {
  beforeEach(async () => {
    const bundleId = process.env.IOS_BUNDLE_ID!;
    try { await driver.terminateApp(bundleId); } catch { /* not running */ }
    await driver.activateApp(bundleId);

    // In Expo Go mode we have to deep-link the Metro URL after activating the
    // app; for native builds the bundleId launch is enough.
    if (isExpoGoMode()) {
      const port = process.env.RCT_METRO_PORT ?? '8081';
      const host = process.env.METRO_HOST ?? '127.0.0.1';
      await (driver as any).execute('mobile: deepLink', {
        url: `exp://${host}:${port}`,
        bundleId: 'host.exp.Exponent',
      });
    }
  });

  it('renders the expected label for this build', async () => {
    const label = $(sel(A11Y.loginVersionLabel));
    await label.waitForDisplayed({ timeout: 30000 });
    const text = (await label.getText()).trim();

    const expected = isExpoGoMode()
      ? expectedExpoGoLabel()
      : expectedNativeBuildLabel(process.env.E2E_EXPECTED_BUILD ?? null);

    expect(text).toBe(expected);
  });

  it('label format matches the mode (regex sanity)', async () => {
    const label = $(sel(A11Y.loginVersionLabel));
    await label.waitForDisplayed({ timeout: 30000 });
    const text = (await label.getText()).trim();

    if (isExpoGoMode()) {
      // `<branch> @ <shortsha>` — branch may contain `/` or `-`; sha is hex.
      expect(text).toMatch(/^[\w./-]+ @ [0-9a-f]{4,40}$/);
    } else {
      // `v1.2.3` or `v1.2.3 (build <anything-nonempty>)`
      expect(text).toMatch(/^v\d+\.\d+\.\d+(?: \(build .+\))?$/);
    }
  });
});
