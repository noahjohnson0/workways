import { A11Y, sel } from '../helpers/selectors';
import { dismissKeyboard } from '../helpers/keyboard';

describe('Login — valid credentials', () => {
  beforeEach(async () => {
    const bundleId = process.env.IOS_BUNDLE_ID!;
    try { await driver.terminateApp(bundleId); } catch { /* not running */ }
    await driver.activateApp(bundleId);
  });

  it('signs in and navigates away from the login screen', async () => {
    const email = process.env.TEST_USER_EMAIL;
    const password = process.env.TEST_USER_PASSWORD;
    if (!email || !password) {
      throw new Error('TEST_USER_EMAIL / TEST_USER_PASSWORD must be set in .env.test');
    }

    const emailInput = $(sel(A11Y.loginEmailInput));
    const passwordInput = $(sel(A11Y.loginPasswordInput));
    const submit = $(sel(A11Y.loginSubmitBtn));

    await emailInput.waitForDisplayed({ timeout: 15000 });
    await emailInput.setValue(email);
    await passwordInput.click();
    await passwordInput.addValue(password);
    await dismissKeyboard();
    await submit.click();

    // Successful sign-in unmounts the login screen.
    await $(sel(A11Y.loginSubmitBtn)).waitForExist({
      timeout: 20000,
      reverse: true,
    });

    // No iOS alert should have appeared.
    let alertShown = false;
    try {
      await driver.getAlertText();
      alertShown = true;
    } catch {
      // expected
    }
    expect(alertShown).toBe(false);
  });
});
