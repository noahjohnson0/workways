/**
 * Helpers for working with native iOS system alerts (what React Native's
 * `Alert.alert` shows on iOS).
 */
export async function waitForAlert(timeout = 8000): Promise<string> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const text = await driver.getAlertText();
      if (text) return text;
    } catch {
      // not yet present
    }
    if (Date.now() - start > timeout) {
      throw new Error(`No iOS alert appeared within ${timeout}ms`);
    }
    await driver.pause(250);
  }
}

export async function dismissAlert(): Promise<void> {
  try {
    await driver.acceptAlert();
  } catch {
    // already gone
  }
}
