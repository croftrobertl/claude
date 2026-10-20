'use strict';
/**
 * 0.47.5 — NO LINE UNDER "VIEW PHOTO ID" (Rob, 2026-10-20).
 *
 * The staff booking sheet's Photo ID row used to carry a note under its
 * link: "Opens the guest's uploaded ID. Do not share or download." Rob asked
 * for it to go. Checked on the board as staff see it (staff-harness: the
 * shipped staff.js built from source, staff.css, the strings read from
 * class-staff-widget.php), at a phone and a desktop width:
 *   - the row holds the link and nothing else — no note element, no text,
 *     no empty block, no gap under the link (below it only the pill's 2px
 *     margin, the row's 6px padding and its 1px rule, as before the note);
 *   - the link is unchanged: the gated proxy (action mphbac_staff_photo, the
 *     nonce, the booking, the field — never an /uploads/ URL), a new tab,
 *     noopener, the label "View Photo ID", the pill;
 *   - the string is not sent to the page, and staff.css has no rule for it.
 */
const { chromium } = require('playwright-core');
const S = require('./staff-harness.js');
const H = require('./harness.js');
const F = require('./board-fixture.js');
const { check, done } = H.reporter();
const ORIGIN = 'http://staff.test/';
const NOTE = 'Opens the guest';

(async () => {
  const browser = await chromium.launch(H.CHROMIUM);
  const details = JSON.parse(JSON.stringify(F.DETAILS));
  details[1].sections.customer.push({ label: 'Photo ID', value: 'id.jpg', photo: { field: 'upload_id' } });
  const html = S.boardShell({ today: F.TODAY, cottages: F.COTTAGES, bookings: F.BOOKINGS, details, search: F.SEARCH });

  for (const [dev, opts] of [['phone 360px', { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true }],
                             ['desktop 1280px', { viewport: { width: 1280, height: 900 } }]]) {
    const ctx = await browser.newContext(opts);
    await ctx.route(ORIGIN + '**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(ORIGIN);
    await p.waitForTimeout(300);
    await p.click('.mphbac-staff-bar[data-booking-id="1"]');
    await p.waitForTimeout(500);
    const m = await p.evaluate(note => {
      const dd = document.querySelector('dd.mphbac-staff-photo');
      if (!dd) return null;
      const a = dd.querySelector('a');
      const u = new URL(a.href, location.href);
      const ar = a.getBoundingClientRect(), dr = dd.getBoundingClientRect();
      const cs = getComputedStyle(dd);
      return {
        children: [...dd.childNodes].map(n => n.nodeType === 1 ? n.tagName : '#' + n.nodeType + ':' + n.textContent),
        text: dd.textContent, label: a.textContent, target: a.target, rel: a.rel,
        action: u.searchParams.get('action'), nonce: u.searchParams.get('nonce'), booking: u.searchParams.get('booking_id'),
        field: u.searchParams.get('field'), uploads: /uploads/.test(a.href),
        pill: getComputedStyle(a).borderRadius, minH: getComputedStyle(a).minHeight,
        gapBelow: Math.round(dr.bottom - ar.bottom), padTop: cs.paddingTop, padBottom: cs.paddingBottom,
        noteEl: document.querySelectorAll('.mphbac-staff-photo-note').length,
        notePage: document.body.textContent.includes(note),
      };
    }, NOTE);
    check(`${dev}: the sheet has its Photo ID row (instrument check)`, m !== null, m);
    if (!m) { await ctx.close(); continue; }
    check(`${dev}: THE ROW HOLDS THE LINK AND NOTHING ELSE — no note under it`, JSON.stringify(m.children) === '["A"]' && m.text === 'View Photo ID', m.children);
    check(`${dev}: no .mphbac-staff-photo-note anywhere, and "Opens the guest's uploaded ID…" nowhere on the page`, m.noteEl === 0 && !m.notePage, m);
    check(`${dev}: no gap left under the link: the cell ends 9px below it — the pill's 2px margin, the row's own 6px padding and its 1px rule (with the note it was ~24px more)`,
      m.padBottom === '6px' && m.gapBelow === 9, [m.gapBelow, m.padTop, m.padBottom]);
    check(`${dev}: the link is unchanged — "View Photo ID", the gated proxy (action, nonce, booking, field), never /uploads/`,
      m.label === 'View Photo ID' && m.action === 'mphbac_staff_photo' && m.nonce === 'n' && m.booking === '1' && m.field === 'upload_id' && !m.uploads, m);
    check(`${dev}: ...opens in a new tab, noopener noreferrer nofollow, as the 44px pill`,
      m.target === '_blank' && m.rel === 'noopener noreferrer nofollow' && m.pill !== '0px' && m.minH === '44px', [m.target, m.rel, m.pill, m.minH]);
    check(`${dev}: no page errors`, errors.length === 0, errors);
    await ctx.close();
  }

  const cfg = S.boardStrings();
  check('the board is no longer sent the note (no photoNote among its strings)', !('photoNote' in cfg), Object.keys(cfg).filter(k => /photo/i.test(k)));
  check('...and View Photo ID still is', cfg.viewPhoto === 'View Photo ID', cfg.viewPhoto);
  const css = S.cssCode ? S.cssCode() : S.css().replace(/\/\*[\s\S]*?\*\//g, '');
  check('staff.css keeps no rule for the note (no empty block, no 6px margin under the link)', !/mphbac-staff-photo-note/.test(css));
  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
