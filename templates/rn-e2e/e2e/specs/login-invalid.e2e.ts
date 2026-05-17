import { A11Y, sel } from '../helpers/selectors';
import { waitForAlert, dismissAlert } from '../helpers/alerts';
import { dismissKeyboard } from '../helpers/keyboard';

describe('Login — invalid credentials', () => {
  beforeEach(async () => {
    // ensure clean app state
    const bundleId = process.env.IOS_BUNDLE_ID!;
    try { await driver.terminateApp(bundleId); } catch { /* may not be running */ }
    await driver.activateApp(bundleId);
  });

  it('shows a "Sign-in failed" alert and stays on the login screen', async () => {
    const email = $(sel(A11Y.loginEmailInput));
    const password = $(sel(A11Y.loginPasswordInput));
    const submit = $(sel(A11Y.loginSubmitBtn));

    await email.waitForDisplayed({ timeout: 15000 });
    await email.setValue('not-a-real-user+e2e@e2e.test');
    await password.click();
    await password.addValue('definitely-wrong-password');
    await dismissKeyboard();
    await submit.click();

    const alertText = await waitForAlert(15000);
    expect(alertText).toContain('Sign-in failed');

    await dismissAlert();

    // Login screen should still be present (submit button still visible)
    await expect($(sel(A11Y.loginSubmitBtn))).toBeDisplayed();
  });
});
