/**
 * Compute the version-footer label the running app *should* render, given:
 *   - app.json (APP_VERSION)
 *   - git HEAD (branch + short sha)
 *   - the e2e run mode (Expo Go vs native build)
 *
 * Mirrors the formatting logic in app/login.tsx so the spec catches drift.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');

function git(args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function appVersion(): string {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  return j?.expo?.version ?? '0.0.0';
}

export const isExpoGoMode = (): boolean =>
  (process.env.IOS_BUNDLE_ID ?? '') === 'host.exp.Exponent';

export function expectedExpoGoLabel(): string {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const commit = git(['rev-parse', '--short', 'HEAD']);
  const parts = [branch, commit].filter(Boolean);
  if (parts.length === 0) {
    throw new Error('expectedExpoGoLabel: git rev-parse returned nothing — is this a git checkout?');
  }
  return parts.join(' @ ');
}

/**
 * Native build label. `buildNumber` is what `expo run:ios` bakes into the .app
 * (CFBundleVersion). When unset, login.tsx renders just `v{APP_VERSION}`.
 */
export function expectedNativeBuildLabel(buildNumber?: string | null): string {
  const v = appVersion();
  if (buildNumber && buildNumber.length > 0) return `v${v} (build ${buildNumber})`;
  return `v${v}`;
}
