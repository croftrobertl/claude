'use strict';
/**
 * 0.57.0 — STATS, ROB'S PICK C "TITLE BANDS" (2026-11-04), in a real page
 * with the shipped (minified) staff.js, the sample bookings of
 * stats-053-fixture.js, at 320 / 390 / 1440:
 *   1  every section's title on a light-blue (#e7eef8) band, 8px radius, its
 *      content on white below; 30px between sections
 *   2  one type scale: range 28 (fitRange may step it down at 320, as
 *      before), headline 24, section titles 19/700 centred and balanced,
 *      body 16, small labels 14 — nothing else; no uppercase anywhere
 *   3  Booking Pace its own section, titled through blockHead with its ⓘ;
 *      its key a 14px caption with no button
 *   4  all 14 ⓘ open, nothing painted over any of them
 *   5  the KPI tiles and the heat map at full width at 320; no sideways scroll
 * STILLS_OUT=<dir>: before (0.56.0, git dec1902) / after stills of the whole
 * panel, and the panel heights.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright-core');
const S = require('./staff-harness.js');
const H = require('./harness.js');
const X = require('./stats-053-fixture.js');
const { check, done } = H.reporter();

const OUT = process.env.STILLS_OUT || '';
const REPO = path.resolve(__dirname, '../..');
const OLD = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-0570-'));
execSync(`git -C ${REPO} archive dec1902 | tar -x -C ${OLD}`);
fs.symlinkSync(path.join(__dirname, 'node_modules'), path.join(OLD, 'tests/browser/node_modules'));
fs.symlinkSync(path.join(REPO, 'tools/node_modules'), path.join(OLD, 'tools/node_modules'));
const S_OLD = require(path.join(OLD, 'tests/browser/staff-harness.js'));
// 0.57.1 (Rob): the tiles' figures 22 (were 24) — the one step off the 0.57.0
// scale — and their "nights" 14 (was 0.6em of the figure, 14.4).
const SCALE = [28, 24, 22, 19, 16, 14];

(async () => {
  const browser = await chromium.launch(S.CHROMIUM);
  const open = async (w, harness = S, scale = 1) => {
    const html = harness.boardShell({ today: X.TODAY, cottages: X.COTTAGES, bookings: X.BOOKINGS, bodyStyle: 'padding:0 16px', head: harness.raleway() });
    const ctx = await browser.newContext(w < 700 ? { viewport: { width: w, height: 900 }, isMobile: true, hasTouch: true, deviceScaleFactor: scale } : { viewport: { width: w, height: 900 }, deviceScaleFactor: scale });
    await ctx.route('https://staff.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    const p = await ctx.newPage();
    p.__errors = [];
    p.on('pageerror', e => p.__errors.push(e.message));
    await p.goto('https://staff.test/');
    await p.waitForFunction(() => document.querySelector('.mphbac-staff-title').textContent !== '');
    await p.evaluate(() => document.fonts.ready);
    await p.evaluate(() => { document.querySelector('.mphbac-staff-stats').open = true; });
    await p.waitForSelector('.mphbac-staff-stats-top');
    await p.waitForTimeout(500);
    return { ctx, p };
  };
  const heights = {};
  for (const w of [320, 390, 1440]) {
    console.log(`\n-- ${w}px --`);
    const { ctx, p } = await open(w);
    const m = await p.evaluate(() => {
      const q = (s, r = document) => [...r.querySelectorAll(s)];
      const out = document.querySelector('.mphbac-staff-stats-out');
      const blocks = q('.mphbac-staff-stats-out > .mphbac-staff-stats-block').map(b => {
        const band = b.querySelector(':scope > .mphbac-staff-stats-hrow'), c = band && getComputedStyle(band), h = b.querySelector('.mphbac-staff-stats-h');
        return { cls: b.className.replace('mphbac-staff-stats-block ', ''), mt: getComputedStyle(b).marginTop, bg: c && c.backgroundColor, radius: c && c.borderRadius,
          title: h && h.textContent, size: h && getComputedStyle(h).fontSize, weight: h && getComputedStyle(h).fontWeight, align: h && getComputedStyle(h).textAlign, wrap: h && getComputedStyle(h).textWrap,
          below: band ? getComputedStyle(b).backgroundColor : null };
      });
      const sizes = new Set();
      for (const e of q('*', out)) {
        if (!e.getClientRects().length || e.closest('.mphbac-sr-only, .mphbac-staff-tipbox')) continue;
        if ([...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) sizes.add(parseFloat(getComputedStyle(e).fontSize));
      }
      const upper = q('*', document.querySelector('.mphbac-staff-stats')).filter(e => e.getClientRects().length && e.textContent.trim() && getComputedStyle(e).textTransform === 'uppercase').map(e => e.className);
      const pace = document.querySelector('.mphbac-staff-stats-block.is-curve');
      const key = pace && pace.querySelector('.mphbac-staff-curve-key');
      return { blocks, sizes: [...sizes].sort((a, b) => b - a), upper,
        range: parseFloat(getComputedStyle(document.querySelector('.mphbac-staff-stats-range')).fontSize), headline: getComputedStyle(document.querySelector('.mphbac-staff-stats-headline')).fontSize,
        // Null-safe: a missing heading must FAIL the check, not crash the suite.
        pace: pace && { title: (pace.querySelector('.mphbac-staff-stats-h') || {}).textContent || null,
          tip: (b => b ? b.getAttribute('data-tip') : null)(pace.querySelector('.mphbac-staff-stats-hrow .mphbac-staff-tip')),
          keySize: key && getComputedStyle(key).fontSize, keyButtons: key ? key.querySelectorAll('button').length : -1, keyText: key && key.textContent,
          afterTop: pace.previousElementSibling && pace.previousElementSibling.classList.contains('mphbac-staff-stats-top'), beforeTiles: pace.nextElementSibling && pace.nextElementSibling.classList.contains('mphbac-staff-stats-kpis') },
        outW: out.getBoundingClientRect().width, kpis: document.querySelector('.mphbac-staff-stats-kpis').getBoundingClientRect().width, heat: document.querySelector('.mphbac-staff-heat').getBoundingClientRect().width,
        hscroll: document.documentElement.scrollWidth > innerWidth, panel: Math.round(document.querySelector('.mphbac-staff-stats').getBoundingClientRect().height) };
    });
    heights[w] = { after: m.panel };
    check(`${w}px: eight sections, each title on a #e7eef8 band, 8px radius, its content on white below`,
      m.blocks.length === 8 && m.blocks.every(b => b.bg === 'rgb(231, 238, 248)' && b.radius === '8px' && b.below === 'rgba(0, 0, 0, 0)'), m.blocks.map(b => [b.cls, b.bg, b.radius]));
    check(`${w}px: 30px between sections`, m.blocks.every(b => b.mt === '30px'), m.blocks.map(b => b.mt));
    check(`${w}px: every section title 19px/700, centred, balanced: ${m.blocks.map(b => b.title).join(' · ')}`,
      m.blocks.every(b => b.size === '19px' && b.weight === '700' && b.align === 'center' && /balance/.test(b.wrap)), m.blocks.map(b => [b.title, b.size]));
    check(`${w}px: range ${m.range}px (28, or fitRange's step down at 320), headline 24px`, (w === 320 ? m.range <= 28 && m.range >= 18 : m.range === 28) && m.headline === '24px', [m.range, m.headline]);
    check(`${w}px: every size in Stats on the scale (28 / 24 / 19 / 16 / 14, and the tiles' 22): ${m.sizes.join('/')}`,
      m.sizes.every(x => SCALE.includes(x) || (w === 320 && x === m.range)), m.sizes);
    check(`${w}px: no uppercase anywhere in Stats (Nights by Cottage's headers in Title Case)`, m.upper.length === 0, m.upper);
    check(`${w}px: Booking Pace its own section, after the headline and before the tiles, titled with its ⓘ`,
      m.pace && m.pace.title === 'Booking Pace' && m.pace.tip === 'curve' && m.pace.afterTop && m.pace.beforeTiles, m.pace);
    check(`${w}px: …its key a 14px caption, no button: "${m.pace && m.pace.keyText}"`, m.pace && m.pace.keySize === '14px' && m.pace.keyButtons === 0 && m.pace.keyText === 'Blue this year, dashed last year.', m.pace);
    check(`${w}px: the KPI tiles and the heat map the panel's full width (${Math.round(m.outW)}px); no sideways scroll`,
      Math.abs(m.kpis - m.outW) < 0.5 && Math.abs(m.heat - m.outW) < 0.5 && !m.hscroll, [m.kpis, m.heat, m.outW]);
    const tips = await p.evaluate(async () => {
      const out = [];
      for (const btn of document.querySelectorAll('.mphbac-staff-stats-out .mphbac-staff-tip')) {
        btn.scrollIntoView({ block: 'center' }); btn.click();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const box = btn._box || document.getElementById(btn.getAttribute('aria-controls')), b = box.getBoundingClientRect();
        let bad = 0;
        for (let x = 1; x < 8; x++) for (let y = 1; y < 8; y++) { const px = b.left + b.width * x / 8, py = b.top + b.height * y / 8; if (px < 0 || py < 0 || px >= innerWidth || py >= innerHeight) continue; const at = document.elementFromPoint(px, py); if (at && !box.contains(at)) bad++; }
        out.push({ key: btn.getAttribute('data-tip'), shown: !box.hidden && b.height > 10, bad });
        btn.click(); btn.click(); document.body.click();
      }
      return out;
    });
    check(`${w}px: all 14 ⓘ open, nothing painted over any (Booking Pace's included)`, tips.length === 14 && tips.every(t => t.shown && !t.bad) && tips.some(t => t.key === 'curve'), tips.filter(t => !t.shown || t.bad));
    check(`${w}px: no page errors`, p.__errors.length === 0, p.__errors);
    if (OUT) {
      await p.evaluate(() => window.scrollTo(0, 0));
      await ctx.close();
      for (const [when, harness] of [['BEFORE', S_OLD], ['AFTER', S]]) {
        const { ctx: c2, p: p2 } = await open(w, harness, w === 1440 ? 1 : 2);
        heights[w][when.toLowerCase()] = await p2.evaluate(() => Math.round(document.querySelector('.mphbac-staff-stats').getBoundingClientRect().height));
        await (await p2.$('.mphbac-staff-stats')).screenshot({ path: path.join(OUT, `Availability Calendar - 0.57.0 ${when} Stats ${w}px.png`) });
        await c2.close();
      }
    } else {
      await ctx.close();
    }
  }
  console.log('\n   PANEL HEIGHTS: ' + JSON.stringify(heights));
  if (OUT) fs.writeFileSync(path.join(OUT, 'Availability Calendar - 0.57.0 panel heights.json'), JSON.stringify(heights, null, 2));
  await browser.close();
  fs.rmSync(OLD, { recursive: true, force: true });
  done();
})().catch(e => { console.error(e); fs.rmSync(OLD, { recursive: true, force: true }); process.exit(1); });
