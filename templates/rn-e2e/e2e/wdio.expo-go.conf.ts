/**
 * Expo Go run: drives the pre-installed Expo Go app (bundle id host.exp.Exponent)
 * and deep-links it to Metro. Only the version-footer spec is exercised here —
 * the auth specs assume a native build with our bundle id.
 *
 * Pair with `npm run e2e:ios:expo-go` (sets IOS_BUNDLE_ID + composes sim/metro locks).
 */
import path from 'node:path';
import { config as baseConfig } from './wdio.conf';

export const config: WebdriverIO.Config = {
  ...baseConfig,
  specs: [path.resolve(__dirname, 'specs', 'version-footer.e2e.ts')],
};
