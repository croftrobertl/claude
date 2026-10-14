'use strict';
/**
 * PART A OF 0.46.7: THE LABELS ROB PICKED, IN TITLE CASE, NAMED AS THEY READ.
 *
 * Guests: "Check-In", "Check-Out" (the overview's date filters and every
 * booking popup) and "Estimated Total:" (the popup's estimate). Staff: "Go to
 * Date", and — checked in the PHP and JS suites that own them — the booking
 * sheet's Check-In / Check-Out rows, "In House", "View Photo ID", "All
 * Sources", "Next {n} Days", "Week Of".
 *
 * Rendered the real way (tests/render: the plugin's PHP from live's exported
 * settings — after the Website Director cleared the stored copies — and the
 * shipped widget.min.js / staff.min.js), then for each field: the visible
 * label is the new wording, and the accessible name a screen reader is given
 * is EXACTLY that text (the 0.46.5 rule, word for word — here also letter for
 * letter), computed by axe-core the way assistive technology does.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const H = require('./harness.js');
const S = require('../render/shoot.js');
const { check, done } = H.reporter();
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const PLUGIN = path.resolve(__dirname, '../../mphb-availability-calendar');
const LIVE6 = path.resolve(__dirname, '../render/live-state-0.46.6.json');

/** Render an instance from live's CURRENT export (0.46.6, keys cleared). */
function page(cas) {
  const r = JSON.parse(require('child_process').execFileSync('php',
    [path.resolve(__dirname, '../render/render.php'), PLUGIN, LIVE6, cas, 'live'], { encoding: 'utf8', maxBuffer: 64 << 20 }));
  return { r, html: S.pageFor(r, PLUGIN) };
}

(async () => {
  const browser = await chromium.launch(H.CHROMIUM);
  const open = async (html, w = 390) => {
    const p = await browser.newPage({ viewport: { width: w, height: 900 } });
    await p.clock.setFixedTime(S.CLOCK);
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    await p.setContent(html);
    await p.waitForTimeout(400);
    await p.addScriptTag({ content: AXE });
    return p;
  };
  // Visible label text and the input's accessible name, for each selector.
  const named = (p, sels) => p.evaluate(sels => { window.axe.setup(); try { return sels.map(sel => {
    const input = document.querySelector(sel);
    const label = input && input.closest('label');
    const shown = label ? (label.querySelector('.mphbac-filter-label, .mphbac-staff-field-label, span') || label).textContent.trim() : null;
    return { sel, shown, name: input ? window.axe.commons.text.accessibleText(input) : null };
  }); } finally { window.axe.teardown(); } }, sels);

  for (const [cas, who] of [['1005:5f8802c', '/cottages/'], ['620:b7318c3', 'home page']]) {
    const { r, html } = page(cas);
    const p = await open(html);
    const f = await named(p, ['.mphbac-input-checkin', '.mphbac-input-checkout']);
    check(`${who}: the date filters read "Check-In" and "Check-Out"`, f[0].shown === 'Check-In' && f[1].shown === 'Check-Out', f);
    check(`${who}: ...and each field's accessible name is exactly its label`, f.every(x => x.name === x.shown), f);
    await p.click('.mphbac-cell-status.is-available.is-clickable');
    await p.waitForTimeout(500);
    const s = await named(p, ['.mphbac-sheet-checkin', '.mphbac-sheet-checkout']);
    check(`${who}: the booking popup's fields read "Check-In" / "Check-Out", named exactly so`,
      s[0].shown === 'Check-In' && s[1].shown === 'Check-Out' && s.every(x => x.name === x.shown), s);
    const cfg = JSON.parse(r.html.match(/data-config="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    check(`${who}: the estimate is labelled "Estimated Total:"`, cfg.strings.priceLabel === 'Estimated Total:', cfg.strings.priceLabel);
    await p.close();
  }
  {
    const { r, html } = page('3301:6dbe1c8');
    const p = await open(html);
    await p.click('.mphbac-cell-status.is-available.is-clickable');
    await p.waitForTimeout(500);
    const s = await named(p, ['.mphbac-sheet-checkin', '.mphbac-sheet-checkout']);
    check('Cottage 34\'s booking popup: "Check-In" / "Check-Out", named exactly so', s[0].shown === 'Check-In' && s[1].shown === 'Check-Out' && s.every(x => x.name === x.shown), s);
    check('...and "Estimated Total:"', /Estimated Total:/.test(r.html));
    await p.close();
  }
  {
    const { r, html } = page('18102:afeefb0');
    const p = await open(html, 1280);
    await p.waitForSelector('.mphbac-staff-goto');
    const g = await named(p, ['.mphbac-staff-goto']);
    check('/staff/: the date field reads "Go to Date", and that is its accessible name', g[0].shown === 'Go to Date' && g[0].name === 'Go to Date', g);
    const cfg = JSON.parse(r.html.match(/data-staff-config="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    check('/staff/: the board is sent "In House", "View Photo ID", "Week Of", "All Sources", "Next {n} Days", "Check-In", "Check-Out"',
      cfg.strings.inHouse === 'In House' && cfg.strings.stInHouse === 'In House' && cfg.strings.viewPhoto === 'View Photo ID'
      && cfg.strings.stWeekOf === 'Week Of' && cfg.strings.stAllSources === 'All Sources' && cfg.strings.stPaceNext === 'Next {n} Days'
      && cfg.strings.checkIn === 'Check-In' && cfg.strings.checkOut === 'Check-Out', cfg.strings);
    check('...and sentence case stays where Rob kept it: the search placeholder', /placeholder="Name, phone, date, booking #"/.test(r.html));
    await p.close();
  }
  await browser.close();
  done();
})();
