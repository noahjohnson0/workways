# eBay (browser-attach subskill)

## Anti-bot behavior
- The **`/sch` search endpoint is Akamai-protected**. A cold deep-link straight
  to a sorted search URL (e.g. `…/sch/i.html?_nkw=RTX+3090&_sop=15`) returns an
  **"Access Denied"** page — even with `navigator.webdriver === false` and a
  logged-in session. The block is on request pattern, not the automation flag.
- The CAPTCHA you get on a *fresh/flagged* browser is a different wall:
  redirect to `…/splashui/challenge…`. The attach setup avoids that one; Akamai
  "Access Denied" is the one you still have to work around.
- The **homepage (`https://www.ebay.com/`) loads fine.** Only the search
  endpoint is defended on cold hits.

## The workaround: search like a human (warm referrer)
1. Navigate to `https://www.ebay.com/`.
2. Fill the search box and submit from there, so the request to `/sch` carries a
   warm referrer + session:
   ```js
   () => {
     const input = document.querySelector('#gh-ac');          // search box
     input.focus();
     input.value = 'RTX 3090 24GB';
     input.dispatchEvent(new Event('input', { bubbles: true }));
     document.querySelector('#gh-search-btn').click();         // submit button
     return input.value;
   }
   ```
   Form action resolves to `https://www.ebay.com/sch/i.html`. This passes where
   the cold deep-link was denied.

## Scraping results
- Result rows: `li.s-item, li.s-card`
- Title: `.s-item__title`, `.s-card__title`, or a `[role=heading]` inside the row
- Price: `.s-item__price`, `.s-card__price`
- Detect a block before parsing: check for `Access Denied` in body text or a
  `splashui` URL.
- Robust fallback: iterate `li`, regex the innerText for `\$[\d,]+\.\d{2}`, take
  the longest non-price line as the title.

## Useful query params (apply AFTER you're on a warm search)
- `_sop=15` — sort price + shipping, low → high (`_sop=16` = high → low)
- `LH_ItemCondition=3000` — used/pre-owned only
- `LH_ItemCondition=1000` — brand new
- `_nkw=` — keyword

## Gotchas
- eBay's match net is loose: a "3080" can show up in a "3090" search. Filter on
  the title, not the query.
- Filter out the **"Shop on eBay"** placeholder rows (junk $20 entries).
- A "Brand New" card priced far under the used market is almost always scam bait
  — flag it, don't trust it.
