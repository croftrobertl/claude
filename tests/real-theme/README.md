# tests/real-theme/ — the real page, captured 2026-10-26

What this is, and why it is not a reproduction.

0.36.0's card suite reproduced the theme's **clipping** and not its
**stacking**. Its hit-test — added precisely because geometry assertions
cannot see a card that is painted over — therefore passed while, on the real
theme, the top half of the card was invisible at 390, 768 and 1440 in both
switch states. **A reproduction tests the rules someone thought to reproduce.**

## How it was captured

The live-swap method, 2026-10-26, against
`https://doracanalcourt.com/submit-booking/`:

- a **GET** of the live page. Nothing was submitted, nothing was written, and
  no booking was created or touched.
- its **thirty stylesheets downloaded in document order** into `css/`, named
  `01-` to `30-` so the order is in the filename. Order is the whole point:
  Seasons found that reordering the sheets broke the cascade.
- its **eighteen inline `<style>` blocks left exactly where they were** in
  `page-local-css.html` — the Elementor kit is inline on this site, so a
  fixture that drops them is missing most of the button and field rules.
- **fonts localised** into `font/` (Raleway, all forty-five `@font-face`
  rules, plus the theme's three icon fonts) so text metrics are the site's
  own rather than a fallback face's.

Files:

| file | what it is |
|---|---|
| `live-submit-booking.html` | the live page byte for byte, as served |
| `page-local-css.html` | the same page with the thirty `<link>`s pointed at `css/` |
| `css/NN-*.css` | each stylesheet, numbered in document order |
| `font/*` | the font files those stylesheets reference |
| `manifest.json` | order, local name, original URL and byte count of each sheet |

The suite also writes `measured.json` (every state and width it measured),
which is **gitignored on purpose**: it is rewritten on every run, so tracking
it dirties the tree after each test pass and says nothing a later reader
needs. The durable records are the pinned facts below and the three-width
table in the release check list.

## What is real and what is derived

- **Real**: the whole document, every stylesheet, the header, the menu and its
  eight-link Browse Cottages dropdown, and the `lost` state's dead end. The
  page was fetched with no cookies, which is exactly the `lost` state.
- **Derived**: the `taken` state's wrapper content. It is the bare text node
  the Director read on live for 0.35.2 — "Accommodation is already booked." —
  put back into the real wrapper. Reaching that state for real needs a booked
  stay, and nothing is submitted on live.
- **Ours**: the `DCC_RESTORE` payload, which is what the server would print.
  Its strings are compared against the shipped PHP by
  `tests/restore/run.php`, so this copy cannot drift from what is sent.
- **Ours**: the `dcc_layout` body class and `checkout-layout.css` for the
  switch-on state — exactly what `Assets::enqueue()` and the body-class filter
  print when `Layout::active()` is true. The live page was captured with the
  switch **off**, which is how it is on live today.

Three icon fonts (Font Awesome's `fa-brands`/`fa-solid`, Elementor's
`eicons`) could not be localised: their `url()`s are relative to directories
that are not on the page. They carry glyphs only and no text the card or the
menu measures, so they are left remote and blocked by the suite.

## Facts this fixture pinned, measured in Chromium on the live page

```
header#masthead            position: relative  z-index: 999
  #site-header-main        position: absolute  z-index: 251    (the menu)
    .site-header-bottom-fixed, once pinned     z-index: 9999
  #header-image-main       position: relative  z-index: auto   overflow: HIDDEN
    #header-image-main-inside                  z-index: auto   overflow: HIDDEN
      #header-page-title   position: absolute  z-index: 11     (the theme's title)
#content
  #container.one-column
    main#main              position: relative  z-index: 9      overflow: hidden
      article.hentry       matrix3d(...)  → its own stacking context
```

`#masthead` (999) and `main` (9) are siblings in the root stacking context, so
everything in the header paints above everything in the content and **a card
in the content can never reach it**. That is 0.36.0's defect, and no z-index on
the card could have fixed it.

Two further facts that decided the fix:

- `#header-image-main` **and** `#header-image-main-inside` are both
  `overflow: hidden` (Bravada `style.css`, one rule, at all three widths), and
  that clip is what crops the cottage photo to the 420px band. So the card is a
  **sibling after** the band, not a child of it.
- the theme has exactly **two** rules reaching arbitrary descendants of
  `#masthead`, and both name `.header-image` — checked across all thirty
  stylesheets. Moving the card in restyles nothing.

## Refreshing it

**After any Bravada or Elementor update**, and after any theme or Customizer
change that touches the header:

```bash
php tests/real-theme/refresh.php      # prints what to run; it does not fetch
node tests/real-theme/browser.js
```

The capture's date is asserted by the suite, so a stale fixture is visible
rather than silent. If the header's shape has changed, `cardHome()` in
`restore.js` returns null and the card falls back to the content — which is
wrong on this theme but is a card, not a blank page.
