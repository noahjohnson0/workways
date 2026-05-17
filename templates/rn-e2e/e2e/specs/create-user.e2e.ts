// Two cases share one spec file:
//   1. Successful registration — uses a timestamped email so re-runs never collide.
//   2. Duplicate-email rejection — uses NEW_USER_EMAIL (already registered by case 1
//      on its first ever run, or pre-seeded). #31 still tracks fixture teardown if
//      we ever want full state isolation.
import { A11Y, sel } from '../helpers/selectors';
import { waitForAlert, dismissAlert } from '../helpers/alerts';
import { dismissKeyboard } from '../helpers/keyboard';

describe('Create user', () => {
  beforeEach(async () => {
    const bundleId = process.env.IOS_BUNDLE_ID!;
    try { await driver.terminateApp(bundleId); } catch { /* not running */ }
    await driver.activateApp(bundleId);
  });

  const password = () => requireEnv('NEW_USER_PASSWORD');
  const fullName = () => requireEnv('NEW_USER_FULL_NAME');
  const username = () => requireEnv('NEW_USER_USERNAME');

  async function fillForm(email: string) {
    await $(sel(A11Y.loginCreateAccountLink)).waitForDisplayed({ timeout: 15000 });
    await $(sel(A11Y.loginCreateAccountLink)).click();

    await $(sel(A11Y.registerFullNameInput)).waitForDisplayed({ timeout: 10000 });
    await $(sel(A11Y.registerFullNameInput)).setValue(fullName());
    await $(sel(A11Y.registerEmailInput)).setValue(email);
    await $(sel(A11Y.registerUsernameInput)).setValue(username());
    // setValue drops chars on iOS secureTextEntry; addValue types one at a time.
    await $(sel(A11Y.registerPasswordInput)).click();
    await $(sel(A11Y.registerPasswordInput)).addValue(password());
    await dismissKeyboard();
  }

  it('registers a new account and navigates away from the register screen', async () => {
    // Timestamped email keeps every run fresh.
    const email = `e2e+${Date.now()}@e2e.test`;
    await fillForm(email);

    await $(sel(A11Y.registerSubmitBtn)).click();

    // Success unmounts the register screen.
    await $(sel(A11Y.registerSubmitBtn)).waitForExist({
      timeout: 20000,
      reverse: true,
    });

    let alertShown = false;
    let alertText = '';
    try {
      alertText = await driver.getAlertText();
      alertShown = true;
    } catch {
      // expected — no alert on success
    }
    if (alertShown) {
      throw new Error(`Unexpected alert after Sign Up: "${alertText}"`);
    }
  });

  it('shows a "Sign up failed" alert when the email is already in use', async () => {
    const email = requireEnv('NEW_USER_EMAIL');
    await fillForm(email);

    await $(sel(A11Y.registerSubmitBtn)).click();

    const alertText = await waitForAlert(15000);
    expect(alertText).toContain('Sign up failed');
    expect(alertText).toContain('already exists');

    await dismissAlert();

    // Still on the register screen.
    await expect($(sel(A11Y.registerSubmitBtn))).toBeDisplayed();
  });
});

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} must be set in .env.test`);
  return v;
}
