/**
 * Reliable iOS keyboard dismissal for Appium. `driver.hideKeyboard()` fails on
 * recent XCUITest with "Did not know how to dismiss the keyboard". Tapping the
 * status bar area (well above any input) consistently blurs the active field
 * and drops the keyboard.
 */
export async function dismissKeyboard(): Promise<void> {
  // Strategy 1: tap the keyboard's Return key. Most reliable on RN iOS — the
  // TextInput resigns first-responder when the user hits Return.
  try {
    await driver.execute('mobile: keys', { keys: ['\n'] });
    return;
  } catch {
    // fall through
  }
  // Strategy 2: tap a coordinate well above the keyboard inside the safe area.
  try {
    const { width } = await driver.getWindowRect();
    await driver.execute('mobile: tap', { x: Math.floor(width / 2), y: 120 });
  } catch {
    // give up — caller can decide if next step still works
  }
}
