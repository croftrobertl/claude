# The real-theme fixture (captured 2026-10-25)

The live doracanalcourt.com home page, as a standing fixture for every
placement test (the Director, 2026-10-25). Captured by
`node tools/build-real-theme.js --date=2026-10-25`; served to the suites by
`tools/real-theme.js` (`page()`, `route`, `keepClear()`).

- `real-home.html` — the RENDERED home page at 1440 wide, after its own
  scripts ran: the title, tagline, menu bar, Sun-on-the-Canal dial and Hero
  Effects layers as the site draws them. Every `<script>` is removed, and
  so is everything Seasons put on the page; the suites add the build under
  test the way the plugin does.
- `assets/sheet-NN.css` — every stylesheet the page loaded, each in its own
  place in the cascade (moving them all to the end of `<head>` let the
  theme's base CSS override its own inline rules: Times New Roman 13px
  instead of Raleway 16px).
- `assets/*` — the fonts and the header photograph
  (`DCC-Photos-Canal-3-graded-1080.webp`, 1080x810, `cover`, centered; its
  waterline is 395/810 down, about y 200 in the 420px picture at every
  width). Every other image is a neutral placeholder; the theme sizes them.
- `capture.json` — the URL, the date, each stylesheet, what was kept and
  what was dropped.

**Checked against the live site** with `node tools/check-real-theme.js
--live`: the title's letters, the tagline, the menu bar, its pinned copy
and the menu button match the live page box for box at 390, 768, 1280 and
1440. The dial differs at 390 and 768 only (a live script moves it); both
positions are inside the menu bar's band.

Staging measured 13-15px higher than live on 2026-10-25 (the brief's 390
title line at 120-173 against live's 133-185): every placement keeps an 8px
margin and is re-measured on staging by the Director.

`tools/shot-keepclear.js` draws the keep-clear map on it.
