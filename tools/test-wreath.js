'use strict';
/**
 * DCC Seasons — 4.14.2: where Christmas's wreath goes (the Director,
 * 2026-10-30). On the live home page at 390 the 4.14.1 corner wreath sat on
 * the menu button. Rob had already chosen the home page's place (option B
 * of the 4.14.0 stills, tools/wreath-lab.js): centred across the header
 * picture, centred between the bottom of the tagline and the bottom of the
 * picture. Every other page keeps it in the top-right corner, clear of the
 * keep-clear set. Everything here runs on the REAL theme (tools/real-theme),
 * at 390, 768 and 1440, and the keep-clear boxes are measured by
 * rt.keepClear, independently of the engine:
 *
 *  - home: in the picture, centred (within 1 px) both ways, at most 96 px,
 *    8 px or more clear of every keep-clear box and of the picture's edges;
 *  - another page (no body.home, no tagline): in the top-right corner of
 *    the picture, 8 px or more clear of every keep-clear box;
 *  - both: half opacity, never takes a click, scrolls with the picture;
 *  - the sleigh: every frame of a whole crossing (the moon and the team as
 *    the scene itself reports them, st.fgB) is 8 px or more clear of it.
 *
 *   node tools/test-wreath.js
 *   DCC_WREATH_MUT=corner|nokc|noband node tools/test-wreath.js   (must fail)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const MUT = process.env.DCC_WREATH_MUT || '';
/* a mutated copy of the js folder, served instead of the real one — set
 * BEFORE the harness is required: it reads DCC_ASSETS once, at load */
if (MUT) {
  const JS = path.join(__dirname, '..', 'dcc-seasons', 'assets', 'js'), d = fs.mkdtempSync(path.join(os.tmpdir(), 'dcc-wr-'));
  for (const f of fs.readdirSync(JS)) { fs.copyFileSync(path.join(JS, f), path.join(d, f)); }
  let e = fs.readFileSync(path.join(d, 'engine.js'), 'utf8'); const was = e;
  if (MUT === 'corner') { e = e.replace("tag = D.body.classList.contains('home') ?", "tag = false ?"); }
  if (MUT === 'title') { e = e.replace('for (i = 0; i < k.txt.length; i++) { tt = mx2(tt, k.txt[i][3]); }', 'for (i = 0; i < k.txt.length; i++) { tt = mx2(tt, k.txt[i][1]); }'); }
  if (MUT === 'nobelow') { e = e.replace('var av2 = ph - tt,', 'var av2 = ph - tt + 40,'); }
  if (MUT === 'noband') { e = e.replace('if (bt + KC > wrBox[1] && t - KC < wrBox[3]) { return false; }', ''); }
  if (e === was) { console.error('mutation did not apply'); process.exit(2); }
  fs.writeFileSync(path.join(d, 'engine.js'), e);
  process.env.DCC_ASSETS = d;
}
const { config, open, ROOT } = require('./harness');
const rt = require('./real-theme');

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}
const ROOM = [];
const gap = (a, b) => Math.max(b[0] - a[2], a[0] - b[2], b[1] - a[3], a[1] - b[3]);

async function visit(w, title, crossing) {
  const home = !title;
  const cfg = config(['--placement=content', '--layering=front', '--density=16', '--diag']);
  cfg.date = '2026-12-15'; cfg.forceHour = 12;
  cfg.vigOnly = 'sleighmoon'; cfg.vigFirst = 4000; cfg.vigGap = 1e9; cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1];
  let html = rt.page({ config: cfg });
  if (!home) { html = html.replace(/<body([^>]*) class="home /, '<body$1 class="').replace(/<p class="byline"[\s\S]*?<\/p>/, '').replace('itemprop="headline">DORA CANAL COURT<', 'itemprop="headline">' + title.replace(/&/g, '&amp;') + '<'); }
  const ses = await open(html, { viewport: { width: w, height: w < 768 ? 844 : 900 }, dsf: 2, ...rt.opts(w),
    init: 'Math.random = (() => { let a = ' + (w + (home ? 1 : 2)) + '; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();' });
  const pg = ses.page, errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  try {
    await pg.addStyleTag({ content: '.dcc-wx-banner{display:none!important} #dcc-seasons-diag,.dcc-seasons-diag{display:none!important}' });
    await pg.waitForFunction(() => { const s = window.DCCSeasonsEngine && window.DCCSeasonsEngine._state; return s && s.wreath.stat.placed > 0; }, null, { timeout: 30000, polling: 200 });
    const lbl = `${w}px ${home ? 'home page' : '"' + title + '"'}`;
    const k = await rt.keepClear(pg);
    const r = await pg.evaluate(() => {
      const s = window.DCCSeasonsEngine._state, a = document.querySelector('.dcc-seasons-accent'), b = a.getBoundingClientRect(), cs = getComputedStyle(a);
      const p = document.querySelector('#header-image-main-inside').getBoundingClientRect();
      const t = document.querySelector('#header-page-title p.byline');
      /* the title's LETTERS: a range per text node */
      let tb = 0, lines = 0; const tw = document.createTreeWalker(document.querySelector('#header-page-title .entry-title'), NodeFilter.SHOW_TEXT); let n;
      while ((n = tw.nextNode())) { const rg = document.createRange(); rg.selectNodeContents(n); for (const q of rg.getClientRects()) { if (q.height) { tb = Math.max(tb, q.bottom); lines++; } } }
      return { tb, lines, st: s.wreath, box: [b.left, b.top, b.right, b.bottom], pic: [p.left, p.top, p.right, p.bottom], tag: t ? t.getBoundingClientRect().bottom : null,
        op: cs.opacity, pe: cs.pointerEvents, svg: !!a.querySelector('svg'), inPic: a.parentNode && a.parentNode.id === 'header-image-main-inside', n: document.querySelectorAll('.dcc-seasons-accent').length };
    });
    const bw = r.box[2] - r.box[0], bh = r.box[3] - r.box[1];
    ok(r.n === 1 && r.inPic && r.svg, `${lbl}: one wreath, inside the header picture`, JSON.stringify(r));
    ok(r.op === '0.5' && r.pe === 'none', `${lbl}: half opacity, never takes a click`, r.op + ' ' + r.pe);
    const near = Object.entries(k).map(([n, bs]) => [n, Math.min(...bs.map(o => gap(r.box, o)))]).filter(([, g]) => g < 7.5);
    ok(!near.length, `${lbl}: 8 px or more clear of the title, tagline, menu bar, dial and menu button (${Object.entries(k).filter(([, bs]) => bs.length).map(([n, bs]) => n + ' ' + Math.round(Math.min(...bs.map(o => gap(r.box, o))))).join(', ')})`, JSON.stringify(near));
    ok(r.box[0] >= r.pic[0] + 7.5 && r.box[2] <= r.pic[2] - 7.5 && r.box[1] >= r.pic[1] + 7.5 && r.box[3] <= r.pic[3] - 7.5, `${lbl}: inside the picture with 8 px to spare`, JSON.stringify([r.box, r.pic]));
    if (home) {
      const cxp = (r.pic[0] + r.pic[2]) / 2, cxw = (r.box[0] + r.box[2]) / 2, above = r.box[1] - r.tag, below = r.pic[3] - r.box[3];
      ok(r.st.stat.mode === 'home' && Math.abs(cxw - cxp) <= 1, `${lbl}: Rob's B — centred across the picture (${cxw.toFixed(1)} vs ${cxp.toFixed(1)})`, JSON.stringify(r.st.stat));
      ok(Math.abs(above - below) <= 1 && above >= 7.5, `${lbl}: centred between the tagline and the picture's foot (${above.toFixed(1)} above, ${below.toFixed(1)} below)`, JSON.stringify([above, below]));
      ok(bw <= 96.5 && Math.abs(bh / bw - 52 / 44) < 0.01, `${lbl}: ${bw.toFixed(1)} px wide, never over 96, the drawing's own proportions`, JSON.stringify([bw, bh]));
    } else {
      const cxp = (r.pic[0] + r.pic[2]) / 2, cxw = (r.box[0] + r.box[2]) / 2, above = r.box[1] - r.tb, below = r.pic[3] - r.box[3];
      ROOM.push({ lbl, room: Math.round(r.pic[3] - r.tb), lines: r.lines, px: Math.round(bw), above: Math.round(above), below: Math.round(below) });
      ok(r.st.stat.mode === 'title' && Math.abs(cxw - cxp) <= 1, `${lbl}: Rob's B — centred across the picture, under the title (${r.lines} line${r.lines > 1 ? 's' : ''})`, JSON.stringify([r.st.stat, cxw, cxp]));
      ok(Math.abs(above - below) <= 1 && above >= 7.5, `${lbl}: centred between the title's letters and the picture's foot (${above.toFixed(1)} above, ${below.toFixed(1)} below, ${Math.round(r.pic[3] - r.tb)} px of room)`, JSON.stringify([above, below]));
      ok(bw <= 96.5 && Math.abs(bh / bw - 52 / 44) < 0.01, `${lbl}: ${bw.toFixed(1)} px wide, never over 96, the drawing's own proportions`, JSON.stringify([bw, bh]));
    }
    /* it scrolls with the picture */
    const y0 = r.box[1];
    const sy = await pg.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; const a = scrollY; window.scrollTo({ top: a + 150, behavior: 'instant' }); return scrollY - a; }); await pg.waitForTimeout(250);
    const y1 = await pg.evaluate(() => document.querySelector('.dcc-seasons-accent').getBoundingClientRect().top);
    ok(sy > 50 && Math.abs((y0 - y1) - sy) < 1.5, `${lbl}: scrolls away with the picture (moved ${(y0 - y1).toFixed(1)} px for a ${sy} px scroll)`, String([y0 - y1, sy]));
    await pg.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await pg.waitForTimeout(250);

    if (!crossing) { ok(!errs.length, `${lbl}: no page errors`, errs.join(' | ')); return; }
    /* the sleigh: a whole crossing, every frame, on the mocked clock */
    const sl = await pg.evaluate(async () => {
      const s = window.DCCSeasonsEngine._state;
      const t0 = Date.now();
      while (s.vig !== 'sleighmoon' && Date.now() - t0 < 30000) { await new Promise(r => setTimeout(r, 100)); }
      if (s.vig !== 'sleighmoon') { return { none: 1 }; }
      s.manual(true);
      const wb = s.wreath.box; let worst = 1e9, frames = 0, at = null;
      for (let i = 0; i < 30 * 14 && s.vig === 'sleighmoon'; i++) {
        s.tick(1000 / 30, 1);
        const st = s.vigSt; if (!st || !st.fgB) { continue; }
        frames++;
        for (const c of st.fgB) {
          const b = [c[0], c[1], c[0] + c[2], c[1] + c[3]];
          const g = Math.max(wb[0] - b[2], b[0] - wb[2], wb[1] - b[3], b[1] - wb[3]);
          if (g < worst) { worst = g; at = { i, b: b.map(Math.round), wb: wb.map(Math.round) }; }
        }
      }
      const sc = s.sleigh.scene;
      return { worst, frames, at, moon: sc ? [sc.mx, sc.my, sc.MR, sc.clear] : null };
    });
    ok(!sl.none && sl.frames > 60, `${lbl}: the sleigh's crossing played (${sl.frames} frames)`, JSON.stringify(sl));
    ok(sl.worst >= 7.5, `${lbl}: the moon and the team stay 8 px or more clear of the wreath in every frame (closest ${Math.round(sl.worst)} px; moon at ${sl.moon && sl.moon.slice(0, 2).join(',')})`, JSON.stringify(sl.at));
    /* 1: clear of everything; 2: the title's letters allowed (cut out in
     * front); 3: only the wreath kept; 0: none of those (the approved place) */
    ok(sl.moon && sl.moon[3] >= 1, `${lbl}: the moon found a place clear of the wreath (pass ${sl.moon && sl.moon[3]}: ${['the approved place', 'clear of everything', 'clear of all but the title\'s letters, which are cut out in front', 'clear of the wreath only'][sl.moon ? sl.moon[3] : 0]})`, JSON.stringify(sl.moon));
    ok(!errs.length, `${lbl}: no page errors`, errs.join(' | '));
  } finally { await ses.close(); }
}

(async () => {
  console.log(`\n  --- the wreath and the sleigh, on the real theme${MUT ? ' (MUTATION: ' + MUT + ')' : ''} ---`);
  const PAGES = ['Contact Us', 'Browse Cottages', 'Cottage 22: The Boathouse', 'Cottage 23: The Lighthouse', 'Cottage 31: Hibiscus Hut',
    'Cottage 32: Flamingo Bungalow', 'Cottage 33: Pineapple Place', 'Cottage 34: Coconut Cottage', 'Cottage 35: Blue Heron Hideaway', 'Cottage 36: Sunshine Suite'];
  for (const w of [390, 768, 1440]) {
    await visit(w, null, true);
    for (const t of PAGES) { await visit(w, t, t === 'Contact Us' || t === 'Cottage 35: Blue Heron Hideaway'); }
  }
  ROOM.sort((a, b) => a.room - b.room);
  console.log('\n  --- the room under each title, tightest first ---');
  ROOM.forEach(q => console.log(`    ${q.lbl}: ${q.room} px under the title (${q.lines} line${q.lines > 1 ? 's' : ''}), the wreath ${q.px} px, ${q.above} px above it and ${q.below} below`));
  if (!MUT) { fs.writeFileSync(path.join(ROOT, 'build', 'Seasons - 4.14.2 wreath room.json'), JSON.stringify(ROOM, null, 1)); }
  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
