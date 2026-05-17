/**
 * iOS accessibility id helpers. Tests use these names; the React Native
 * components set matching `testID` / `accessibilityLabel` props.
 *
 * On iOS, Appium maps a RN `testID` (or `accessibilityLabel`) to the element's
 * `name` attribute, addressable via `~<id>` (accessibility-id selector).
 */
export const A11Y = {
  // login.tsx
  loginEmailInput: 'login-email-input',
  loginPasswordInput: 'login-password-input',
  loginSubmitBtn: 'login-submit-btn',
  loginResetPasswordLink: 'login-reset-password-link',
  loginCreateAccountLink: 'login-create-account-link',

  // register.tsx
  registerFullNameInput: 'register-fullname-input',
  registerEmailInput: 'register-email-input',
  registerUsernameInput: 'register-username-input',
  registerPasswordInput: 'register-password-input',
  registerSubmitBtn: 'register-submit-btn',

  // forgot-password.tsx
  forgotEmailInput: 'forgot-email-input',
  forgotSubmitBtn: 'forgot-submit-btn',

  // (tabs) root — used to assert post-login nav
  tabsHomeMarker: 'tabs-home-marker',
} as const;

export const sel = (id: string) => `~${id}`;
