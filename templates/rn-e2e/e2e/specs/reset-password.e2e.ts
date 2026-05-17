import { A11Y, sel } from '../helpers/selectors';
import { waitForAlert, dismissAlert } from '../helpers/alerts';

describe('Reset password', () => {
  beforeEach(async () => {
    const bundleId = process.env.IOS_BUNDLE_ID!;
    try { await driver.terminateApp(bundleId); } catch { /* not running */ }
    await driver.activateApp(bundleId);
  });

  it('shows a "Check your email" confirmation after submitting an email', async () => {
    const email = process.env.TEST_USER_EMAIL;
    if (!email) {
      throw new Error('TEST_USER_EMAIL must be set in .env.test');
    }

    // Navigate from login → forgot-password
    await $(sel(A11Y.loginResetPasswordLink)).waitForDisplayed({ timeout: 15000 });
    await $(sel(A11Y.loginResetPasswordLink)).click();

    const emailInput = $(sel(A11Y.forgotEmailInput));
    await emailInput.waitForDisplayed({ timeout: 10000 });
    await emailInput.setValue(email);

    await $(sel(A11Y.forgotSubmitBtn)).click();

    const alertText = await waitForAlert(15000);
    expect(alertText).toContain('Check your email');

    await dismissAlert();

    // After dismiss, screen navigates back to login.
    await $(sel(A11Y.loginSubmitBtn)).waitForDisplayed({ timeout: 10000 });
  });
});
