'use strict';
/**
 * 0.55.0 — "OPEN IN WP-ADMIN" FROM THE HOME SCREEN WEB APP OPENS IN CHROME
 * (Rob). Driven in a real page with the shipped (minified) staff.js; sample
 * bookings only (board-fixture.js, note-copy-054-fixture.js).
 *
 *   1  a normal tab: the https link, target=_blank, rel=noopener noreferrer —
 *      the pop-up byte-identical to 0.54.0's (5dae4cb), Notes and Copy
 *      included; a 1440px desktop admin sees exactly 0.54.0's
 *   2  the Home Screen web app (display-mode: standalone, or iOS's
 *      navigator.standalone): googlechromes:// (https) / googlechrome://
 *      (http), the same host, path and query; nothing else in the pop-up
 *      differs from the normal tab's
 *   3  Chrome not installed: the page stays visible → about 1.5s after the
 *      tap the https link opens; the page goes hidden (visibilitychange or
 *      pagehide) → it does not
 *   4  an adminUrl safeUrl() refuses (another origin, javascript:) is never
 *      turned into a Chrome link — no button at all
 * WHAT THIS CANNOT TEST: iOS handing googlechromes:// to Chrome. Chromium has
 * no Chrome-for-iOS to open, so the hand-off itself is for Rob's iPhone.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright-core');
const S = require('./staff-harness.js');
const H = require('./harness.js');
const N = require('./note-copy-054-fixture.js');
const { check, done } = H.reporter();

const REPO = path.resolve(__dirname, '../..');
const OLD = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-0550-'));
execSync(`git -C ${REPO} archive 5dae4cb | tar -x -C ${OLD}`);
fs.symlinkSync(path.join(REPO, 'tests/browser/node_modules'), path.join(OLD, 'tests/browser/node_modules'));
fs.symlinkSync(path.join(REPO, 'tools/node_modules'), path.join(OLD, 'tools/node_modules'));
const S_OLD = require(path.join(OLD, 'tests/browser/staff-harness.js'));
const OUT = process.env.STILLS_OUT || '';

// The server's answer: the plain edit address on the page's own origin.
const details = (origin, withLink = true) => {
  const d = JSON.parse(JSON.stringify(N.DETAILS));
  for (const id of [1, 7]) { if (withLink) d[id].adminUrl = origin + 'wp-admin/post.php?post=' + id + '&action=edit'; else delete d[id].adminUrl; }
  d[3].adminUrl = 'https://evil.example/wp-admin/post.php?post=3';
  d[2].adminUrl = 'javascript:alert(1)';
  return d;
};

(async () => {
  const browser = await chromium.launch(S.CHROMIUM);
  /** standalone: null (a tab) | 'media' (display-mode query) | 'ios' (navigator.standalone) */
  const open = async ({ w = 390, origin = 'https://staff.test/', standalone = null, id = 1, harness = S, withLink = true } = {}) => {
    const html = harness.boardShell({ today: N.F.TODAY, cottages: N.F.COTTAGES, bookings: N.F.BOOKINGS, details: details(origin, withLink), search: N.F.SEARCH });
    const ctx = await browser.newContext(w < 700 ? { viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: OUT ? 2 : 1 } : { viewport: { width: w, height: 900 } });
    if (standalone === 'ios') await ctx.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }); });
    if (standalone === 'media') await ctx.addInitScript(() => { const real = window.matchMedia.bind(window); window.matchMedia = q => /display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} } : real(q); });
    if (standalone === 'no') await ctx.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: false, configurable: true }); });
    await ctx.route(origin + '**', r => r.request().url().includes('/wp-admin/') ? r.fulfill({ body: '<!doctype html><title>wp-admin</title>', contentType: 'text/html' }) : r.fulfill({ body: html, contentType: 'text/html' }));
    const p = await ctx.newPage();
    p.__errors = [];
    p.on('pageerror', e => p.__errors.push(e.message));
    await p.goto(origin);
    await p.waitForFunction(() => document.querySelector('.mphbac-staff-bar'));
    await p.evaluate(() => document.fonts.ready);
    await p.click(`.mphbac-staff-bar[data-booking-id="${id}"]`);
    await p.waitForSelector('.mphbac-staff-sheet .mphbac-staff-section');
    await p.waitForTimeout(900);
    return { ctx, p };
  };
  const link = p => p.evaluate(() => { const a = document.querySelector('.mphbac-staff-adminlink'); return a ? { href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel'), text: a.textContent } : null; });
  const sheet = p => p.evaluate(() => document.querySelector('.mphbac-staff-sheet').outerHTML.replace(/(mphbac-staff-sheet(?:-title)?)-[a-z0-9]{6,8}\b/g, '$1-RANDOM'));

  console.log('-- 1. a normal browser tab: unchanged --');
  for (const [w, id] of [[390, 1], [390, 7], [1440, 1], [1440, 7]]) {
    const { ctx, p } = await open({ w, id });
    const l = await link(p), s = await sheet(p);
    await ctx.close();
    const { ctx: c0, p: p0 } = await open({ w, id, harness: S_OLD });
    const s0 = await sheet(p0);
    await c0.close();
    check(`${w}px, booking ${id}: the https link, a new tab, rel=noopener noreferrer, "Open in WP-Admin"`,
      l && l.href === `https://staff.test/wp-admin/post.php?post=${id}&action=edit` && l.target === '_blank' && l.rel === 'noopener noreferrer' && l.text === 'Open in WP-Admin', l);
    check(`${w}px, booking ${id}: the whole pop-up byte-identical to 0.54.0's — Notes and Copy included (${s.length} bytes)`, s === s0);
  }

  console.log('\n-- 2. the Home Screen web app: Chrome\'s scheme --');
  for (const standalone of ['media', 'ios']) {
    const { ctx, p } = await open({ standalone });
    const l = await link(p), s = await sheet(p);
    await ctx.close();
    const { ctx: c1, p: p1 } = await open({});
    const t = await sheet(p1);
    await c1.close();
    const how = standalone === 'media' ? 'matchMedia(display-mode: standalone)' : 'navigator.standalone === true';
    check(`${how}: googlechromes://staff.test/wp-admin/post.php?post=1&action=edit — same host, path and query — no target`,
      l && l.href === 'googlechromes://staff.test/wp-admin/post.php?post=1&action=edit' && l.target === null && l.text === 'Open in WP-Admin', l);
    // The link's opening tag set aside, the two pop-ups are the same bytes;
    // and the tag itself differs only by its href and the target.
    const TAG = /<a [^>]*class="mphbac-staff-adminlink"[^>]*>/;
    const attrs = h => { const m = h.match(TAG)[0]; return Object.fromEntries([...m.matchAll(/(\w[\w-]*)="([^"]*)"/g)].map(x => [x[1], x[2]])); };
    const sa = attrs(s), ta = attrs(t);
    check(`${how}: …and nothing else in the pop-up differs from the tab's (label, look, rel, Notes, Copy)`,
      s.replace(TAG, '<A>') === t.replace(TAG, '<A>') && sa.class === ta.class && sa.rel === ta.rel && !('target' in sa) && ta.target === '_blank'
      && Object.keys(sa).sort().join() === 'class,href,rel', [sa, ta]);
  }
  {
    const { ctx, p } = await open({ standalone: 'ios', origin: 'http://staff.test/' });
    const l = await link(p);
    check('an http page in the web app: googlechrome:// (no s) — Chrome\'s scheme for http', l && l.href === 'googlechrome://staff.test/wp-admin/post.php?post=1&action=edit', l);
    await ctx.close();
    const { ctx: c2, p: p2 } = await open({ standalone: 'no' });
    const l2 = await link(p2);
    check('navigator.standalone === false (Safari in a tab): the https link, as before', l2 && l2.href.startsWith('https://') && l2.target === '_blank', l2);
    await c2.close();
  }

  console.log('\n-- 3. Chrome not installed: the fallback --');
  const tap = async (p, hide) => {
    await p.evaluate(() => { window.__opened = []; window.open = (u, t) => { window.__opened.push([u, t, performance.now()]); return {}; }; });
    const t0 = await p.evaluate(() => performance.now());
    await p.tap('.mphbac-staff-adminlink');
    if (hide === 'visibility') await p.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    if (hide === 'pagehide') await p.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });
    await p.waitForTimeout(1200);
    const early = await p.evaluate(() => window.__opened.length);
    await p.waitForTimeout(900);
    const r = await p.evaluate(() => window.__opened);
    return { early, opened: r, after: r.length ? Math.round(r[0][2] - 0) : null, t0 };
  };
  {
    const { ctx, p } = await open({ standalone: 'ios' });
    const r = await tap(p, null);
    check('the page stays visible (no Chrome): nothing opens in the first 1.2s, then the https link opens, once, in a new window',
      r.early === 0 && r.opened.length === 1 && r.opened[0][0] === 'https://staff.test/wp-admin/post.php?post=1&action=edit' && r.opened[0][1] === '_blank', r);
    check('…about 1.5s after the tap (' + Math.round(r.opened[0] ? r.opened[0][2] - r.t0 : -1) + 'ms)', r.opened[0] && r.opened[0][2] - r.t0 >= 1400 && r.opened[0][2] - r.t0 <= 2100);
    check('…and the web app stays on /staff/ (no navigation)', p.url() === 'https://staff.test/' && p.__errors.length === 0, [p.url(), p.__errors]);
    await ctx.close();
  }
  for (const hide of ['visibility', 'pagehide']) {
    const { ctx, p } = await open({ standalone: 'ios' });
    const r = await tap(p, hide);
    check(`the page went hidden (${hide === 'visibility' ? 'visibilitychange, document.hidden' : 'pagehide'}): Chrome took it — the fallback never fires`, r.opened.length === 0, r.opened);
    await ctx.close();
  }
  {
    // A web app where window.open gives nothing back: the same tab goes.
    const { ctx, p } = await open({ standalone: 'ios' });
    await p.evaluate(() => { window.__openCalls = 0; window.open = () => { window.__openCalls++; return null; }; });
    await p.tap('.mphbac-staff-adminlink');
    // Not waitForURL: the aborted googlechromes:// attempt ends that wait at
    // once. The timer is 1.5s; the navigation that follows, well within 3.
    for (let i = 0; i < 30 && p.url() === 'https://staff.test/'; i++) await p.waitForTimeout(100);
    check('window.open refused: the web app itself goes to the https link', p.url() === 'https://staff.test/wp-admin/post.php?post=1&action=edit', p.url());
    await ctx.close();
  }
  {
    // A normal tab never arms it: a click there is the plain new-tab link.
    const { ctx, p } = await open({});
    await p.evaluate(() => { window.__opened = []; const real = window.open; window.open = (u, t) => { window.__opened.push(u); return null; }; });
    await p.evaluate(() => document.querySelector('.mphbac-staff-adminlink').addEventListener('click', e => e.preventDefault()));
    await p.click('.mphbac-staff-adminlink');
    await p.waitForTimeout(2000);
    check('in a normal tab there is no timer and no fallback (nothing calls window.open)', (await p.evaluate(() => window.__opened.length)) === 0);
    await ctx.close();
  }

  console.log('\n-- 4. safeUrl() first: a refused adminUrl is never made a Chrome link --');
  for (const id of [3, 2]) {
    const { ctx, p } = await open({ standalone: 'ios', id });
    const html = await p.evaluate(() => document.querySelector('.mphbac-staff-sheet').innerHTML);
    check(`booking ${id} (${id === 3 ? 'another origin' : 'javascript:'}), in the web app: no button, and no googlechrome anywhere`, (await link(p)) === null && !/googlechrome/.test(html));
    await ctx.close();
  }

  if (OUT) {
    // BEFORE: a password visitor in 0.54.0 (the server sent no link). AFTER:
    // the same visitor in 0.55.0 (the link sent; in the web app, Chrome's).
    for (const w of [390, 1440]) {
      const { ctx, p } = await open({ w, id: 7, harness: S_OLD, withLink: false });
      await p.evaluate(() => { const b = document.querySelector('.mphbac-staff-sheet-body'); b.scrollTop = b.scrollHeight; });
      await p.screenshot({ path: path.join(OUT, `Availability Calendar - 0.55.0 BEFORE password visitor pop-up ${w}px.png`) });
      await ctx.close();
      const { ctx: c2, p: p2 } = await open({ w, id: 7, standalone: w < 700 ? 'ios' : null });
      await p2.evaluate(() => { const b = document.querySelector('.mphbac-staff-sheet-body'); b.scrollTop = b.scrollHeight; });
      await p2.screenshot({ path: path.join(OUT, `Availability Calendar - 0.55.0 AFTER password visitor pop-up ${w}px.png`) });
      await c2.close();
    }
  }

  await browser.close();
  fs.rmSync(OLD, { recursive: true, force: true });
  done();
})().catch(e => { console.error(e); fs.rmSync(OLD, { recursive: true, force: true }); process.exit(1); });
