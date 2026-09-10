# Facebook Marketplace (browser-attach subskill)

## Login
- **Requires a logged-in session** — this is the whole reason to use the attach
  setup. Sign into Facebook once in the dedicated `--user-data-dir` profile; it
  persists. Marketplace is unusable logged out.

## Location & radius
- Search URL `https://www.facebook.com/marketplace/search/?query=<q>` **redirects
  to a location-scoped URL**: `.../marketplace/<location_id>/search/?query=<q>`.
  The `<location_id>` and default radius come from the account's saved Marketplace
  location.
- You **can** override the radius per-request with URL params:
  `&latitude=42.4668&longitude=-70.9495&radius=60`. **`radius` is in kilometres**,
  not miles: `radius=60` renders in the UI as "Within 37 mi". Confirm which one you
  got by reading the location filter button, not by assuming.
- Those params come with a catch: for some queries FB ignores the search entirely
  and serves its generic "Suggested nearby" filler feed (cars, monitors, random
  household goods) with an empty search box. If a query returns obvious filler,
  **retry without the lat/long/radius params** and let it inherit the account's
  saved location. That recovered a whole category of queries that looked like
  zero-inventory dead ends.
- **Set location + radius once in the FB UI** (Marketplace -> location picker) as
  the baseline; it sticks in the profile. Verify by reading the city labels on
  results (they show "City, ST").

## Query strategy
- **Brand and model names are bad queries.** "proliant", "poweredge",
  "supermicro" mostly return unrelated filler. The generic category word
  ("server", "desktop computer", "workstation") on **default relevance sort**
  surfaces the branded listings, brand names included. Search broad, filter in
  code.
- **Do not add `sortBy=creation_time_descend` by reflex.** Newest-first hurts
  recall badly on thin inventory; the default relevance sort finds more real
  matches. Use newest-first only when recency is the actual requirement.
- **Skip `deliveryMethod=local_pick_up`.** It collapses results to near-zero even
  in a metro area. Pull everything and filter on the city / "Partner listing"
  signals below, which also lets you keep shipped listings as a deliberate choice
  instead of never seeing them.
- Run several overlapping queries and dedupe on item id. Any single query misses
  things a near-synonym catches.

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

## Claude-in-Chrome extension gotchas
These bite specifically on the extension route (`mcp__claude-in-chrome__*`):

- **`javascript_tool` results truncate around 1100 characters.** Return counts and
  small slices, never a full dataset. To get bulk data out, have the page or the
  agent write to disk instead of returning it through the tool result.
- **`browser_batch` times out over roughly 30 seconds of work.** Budget about one
  navigate + one wait + one script per batch. A five-page batch with scroll waits
  will time out (the navigations still happen, so state moves on without a result).
- **A literal `\n` inside a JS string in a `browser_batch` item breaks the script**
  with `SyntaxError: Invalid or unexpected token`. Use `String.fromCharCode(10)`.
- **Never return `location.search`, cookies, or anything that looks like query-string
  data.** The whole result comes back as `[BLOCKED: Cookie/query string data]`, even
  when the useful part of the payload is harmless.
- **`computer` scroll actions return a screenshot each**, which is expensive in a
  long scrape. Scroll with `javascript_tool` instead:
  `for (let i=0;i<4;i++){ window.scrollTo(0,document.body.scrollHeight);
  await new Promise(r=>setTimeout(r,1500)); }`
- **Tab ids are not stable when subagents are running.** Another agent can claim
  the tab you were using, and you get `Tab N is not in the same group as the
  current tab`. On any tab error, call `tabs_context_mcp` and re-create your own
  tab rather than retrying the old id.
- `localStorage` on the page origin survives navigations, so it works as a scratch
  accumulator across searches. Reading it back out is subject to the truncation and
  blocking rules above, so treat it as working state, not as the export path.
