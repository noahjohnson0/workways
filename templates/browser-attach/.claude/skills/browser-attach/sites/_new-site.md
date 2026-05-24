# <Site name> (browser-attach subskill)

Copy this file to `sites/<site>.md`, fill it in, and add a line for it under
"Per-site knowledge" in `SKILL.md`. Keep it to what you actually learned by
driving the site — concrete selectors and quirks, not generic advice.

## Login
- Does it need a logged-in session? What persists in the dedicated profile?

## Anti-bot behavior
- What blocks you, and where? (CAPTCHA redirect? "Access Denied"? silent empty
  results?) Which endpoints are defended vs. open?
- Does the attach setup (webdriver=false, real session) get you through, or is
  there edge/behavioral protection on top?

## Workaround
- The exact sequence that works (e.g. warm referrer, type-and-submit, specific
  navigation order). Include the `evaluate_script` snippet.

## Scraping
- Stable selectors / parsing strategy. Note if classes are obfuscated (parse by
  hrefs + innerText regex instead).
- How to detect a block before parsing.

## URL params / filters
- Sort, condition, location, query params worth knowing.

## Gotchas & etiquette
- Mislabeled results, scam signals, placeholder rows.
- Anything you must NOT do on the user's behalf (message, buy, post).
