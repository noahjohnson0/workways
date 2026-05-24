# Facebook Marketplace (browser-attach subskill)

## Login
- **Requires a logged-in session** — this is the whole reason to use the attach
  setup. Sign into Facebook once in the dedicated `--user-data-dir` profile; it
  persists. Marketplace is unusable logged out.

## Location & radius
- Search URL `https://www.facebook.com/marketplace/search/?query=<q>` **redirects
  to a location-scoped URL**: `…/marketplace/<location_id>/search/?query=<q>`.
  The `<location_id>` and radius come from the account's saved Marketplace
  location — there's no clean URL param for "40-min radius around <town>".
- **Set location + radius once in the FB UI** (Marketplace → location picker);
  it sticks in the profile. After that, every search is already scoped. Verify by
  reading the city labels on results (they show "City, ST").

## Scraping results
- Listings are anchors: `a[href*="/marketplace/item/"]`. The anchor's `innerText`
  carries price + title + city on separate lines; the item id is in the href:
  `/marketplace/item/(\d+)`.
- React markup uses **obfuscated/randomized class names** — do NOT key off
  classes. Parse via the item-link anchors + innerText regex.
  ```js
  () => {
    const out = [], seen = new Set();
    document.querySelectorAll('a[href*="/marketplace/item/"]').forEach(a => {
      const txt = (a.innerText||'').trim(); if (!txt) return;
      const price = (txt.match(/\$[\d,]+/)||[])[0];
      const lines = txt.split('\n').map(s=>s.trim()).filter(Boolean);
      const id = a.href.match(/item\/(\d+)/)?.[1];
      const partner = /Partner listing/i.test(txt);          // see below
      const city = lines.find(l => /, [A-Z]{2}$/.test(l)) || null;
      const title = lines.filter(l => !/^\$|Partner listing|Just listed/i.test(l))
                         .sort((a,b)=>b.length-a.length)[0];
      if (price && id && !seen.has(id)) { seen.add(id);
        out.push({ price, title, city, partner,
                   url: 'https://facebook.com/marketplace/item/'+id }); }
    });
    return out;
  }
  ```

## "Partner listing" = NOT local
- Rows tagged **"Partner listing"** (and with **no city** line) are FB's online /
  dropship commerce inventory, not local pickup. They pollute searches for
  physical goods and are usually overpriced. **Filter them out when you want
  local pickup** (`!partner && city`).

## Lazy loading
- Results load on scroll. Scroll to the bottom several times with waits, then
  scrape:
  ```js
  async () => { for (let i=0;i<6;i++){ window.scrollTo(0, document.body.scrollHeight);
    await new Promise(r=>setTimeout(r,900)); }
    return document.querySelectorAll('a[href*="/marketplace/item/"]').length; }
  ```

## Etiquette / safety
- **Never message a seller or make an offer on the user's behalf** unless they
  explicitly tell you to. Surface listings (price, title, city, item URL) and let
  them reach out.
- To enrich a listing, open its `/marketplace/item/<id>` URL in a new tab and
  scrape description / posted date / seller — still read-only.
