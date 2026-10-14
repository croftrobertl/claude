'use strict';
/**
 * SCREENSHOT EVERY LIVE INSTANCE UNDER TWO SET-UPS AND COMPARE (0.46.6).
 *
 *   node tests/render/shoot.js A B [--out DIR] [--mask-part-a] [--only CASE]
 *
 *   A, B   <plugin_dir>=<mode>, mode as tests/render/render.php takes it:
 *          live | blind | strip:<keys>. For example, 0.46.5 against this
 *          checkout, both from live's settings:
 *            node tests/render/shoot.js /path/to/0.46.5/mphb-availability-calendar=live \
 *                 mphb-availability-calendar=live --mask-part-a
 *
 * Each of the eleven live instances is rendered by render.php from the
 * exported settings, under each plugin tree, and put on a page shaped like
 * live's: the theme first, the Elementor per-post CSS, then that tree's OWN
 * shipped stylesheet and script (widget.min.css / .min.js, staff.css /
 * staff.min.js — what each version actually sends). Availability comes from
 * one fixed fixture through a mocked admin-ajax, on a pinned clock, so the
 * only thing that differs between A and B is the plugin.
 *
 * States: the opening view; one page back (‹); the booking popup; the
 * cottage info popup (V1); the staff board (V3). Widths 390, 768, 1280.
 *
 * --mask-part-a paints out, in BOTH screenshots, the two places 0.46.6's
 * Part A changes on purpose: the overview calendar's legend, and its past
 * day cells. Everything else must be pixel-identical. Exit status 1 on any
 * difference.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('../browser/node_modules/playwright-core');
const H = require('../browser/harness.js');
const SH = require('../browser/staff-harness.js');
const FIX = require('../browser/board-fixture.js');

const LIVE = path.join(__dirname, 'live-state-0.46.5.json');
const RENDER = path.join(__dirname, 'render.php');
const TODAY = '2026-10-14';
const CLOCK = new Date('2026-10-14T16:00:00Z');   // noon on the property's clock

function render(dir, cas, mode) {
  return JSON.parse(execFileSync('php', [RENDER, dir, LIVE, cas, mode], { encoding: 'utf8', maxBuffer: 64 << 20 }));
}

/** A deterministic month of statuses: past before today, else a fixed mix. */
const MOCK = `
  (function () {
    var TODAY = ${JSON.stringify(TODAY)};
    function days(from, to) { var out = [], d = new Date(from + 'T00:00:00'), e = new Date(to + 'T00:00:00');
      while (d <= e) { out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')); d.setDate(d.getDate() + 1); }
      return out; }
    function json(o) { return Promise.resolve(new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } })); }
    window.fetch = function (url, opts) {
      var p = new URLSearchParams(String(opts && opts.body || ''));
      var action = p.get('action');
      if (action === 'mphbac_query') {
        var ids = p.getAll('room_type_ids[]'), av = {};
        ids.forEach(function (id, n) { av[id] = {};
          days(p.get('from'), p.get('to')).forEach(function (d) {
            var k = (parseInt(d.slice(8), 10) * 7 + n * 3 + parseInt(d.slice(5, 7), 10)) % 5;
            av[id][d] = d < TODAY ? 'past' : (k < 2 ? 'booked' : 'available');
          }); });
        return json({ success: true, data: { rooms: window.__rooms || [], availability: av, from: p.get('from'), to: p.get('to'), bookedThrough: null } });
      }
      if (action === 'mphbac_info') return json({ success: true, data: { html: '<h3>About this cottage</h3><p>Two bedrooms, a dock and a porch over the canal.</p>' } });
      return json({ success: false, data: {} });
    };
  })();`;

function pageFor(r, dir) {
  const [post, wid] = r.case.split(':');
  const staff = r.type === 'dccac_staff';
  const read = f => fs.readFileSync(path.join(dir, f), 'utf8');
  const css = read(staff ? 'assets/css/staff.css' : 'assets/css/widget.min.css');
  const js = read(staff ? 'assets/js/staff.min.js' : 'assets/js/widget.min.js');
  let html = r.html;
  let pre = '';
  if (staff) {
    pre = SH.boardShell({ today: TODAY, cottages: FIX.COTTAGES, bookings: FIX.BOOKINGS, details: FIX.DETAILS })
      .match(/<script>\s*window\.__reqs[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g, '');
  } else {
    // The rooms the page embeds are what the mocked endpoint answers with.
    const cfg = JSON.parse(html.match(/data-config="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'"));
    const rooms = Object.entries(cfg.roomTitles).map(([id, title]) => {
      const m = title.match(/^Cottage (\d+): (.+)$/);
      return { id: +id, title, number: m ? m[1] : '', abbrev: m ? m[2] : title };
    });
    pre = 'window.__rooms = ' + JSON.stringify(rooms) + ';' + MOCK;
    // No embedded first paint: both set-ups draw from the same mocked fetch.
    html = html.replace(/(data-config="[^"]*?)&quot;initial&quot;:\{[\s\S]*?\},&quot;checkoutUrl/, '$1&quot;initial&quot;:null,&quot;checkoutUrl');
  }
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:Raleway,Georgia,serif}${H.THEME}
/* The harness's own: a focused field's caret blinks, and would differ shot to shot. */
*{caret-color:transparent!important}</style>
<style id="elementor">${r.css}</style>
<style id="plugin">${css}${r.tokens}</style>
<script>${pre}</script></head>
<body class="elementor-kit-9">
<div class="elementor elementor-${post}"><div class="elementor-element elementor-element-${wid} elementor-widget elementor-widget-${r.type}">
<div class="elementor-widget-container"><div style="padding:24px 18px">${html}</div></div></div></div>
<script>${js}</script>
</body></html>`;
}

const STATES = {
  mphbac_calendar: ['open', 'back', 'booking', 'info'],
  dccac_single: ['open', 'back', 'booking'],
  dccac_staff: ['open'],
};

async function drive(p, state) {
  await p.mouse.move(0, 0);
  if (state === 'back') { await p.click('.mphbac-nav-prev'); }
  if (state === 'booking') { await p.click('.mphbac-cell-status.is-available.is-clickable'); }
  if (state === 'info') { await p.click('.mphbac-row-toggle--info'); }
  await p.mouse.move(0, 0);
  // Let the state settle FIRST: the booking popup focuses its check-in
  // field on a timer after it opens, and the grid's re-render fades in.
  await p.waitForTimeout(state === 'open' ? 600 : 1200);
  // Then take focus off: a focused date field's highlighted segment and
  // ring differ shot to shot. Done the same way for every version, so it
  // cannot hide a change.
  await p.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  // And repaint the grid's box from scratch: after a re-render its rounded,
  // shadowed corner can keep a compositor layer from the loading state and
  // anti-alias 4 pixels differently from one shot to the next.
  await p.evaluate(() => document.querySelectorAll('.mphbac-grid-wrap').forEach(g => { g.style.display = 'none'; void g.offsetHeight; g.style.display = ''; }));
  await p.waitForTimeout(500);
}

async function shots(browser, spec, cases, widths) {
  const [dir, mode] = spec.split('=');
  const out = {};
  for (const cas of cases) {
    const r = render(dir, cas, mode);
    const html = pageFor(r, dir);
    for (const w of widths) {
      for (const state of STATES[r.type]) {
        // Reduced motion: a ‹ click sets is-loading, whose infinite pulse
        // promotes a compositor layer, and the card's rounded shadow then
        // rasterises a few pixels differently shot to shot. Same for A and B.
        const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
        const p = await ctx.newPage();
        await p.clock.setFixedTime(CLOCK);
        const errors = [];
        p.on('pageerror', e => errors.push(e.message));
        await p.setContent(html);
        await p.waitForSelector(r.type === 'dccac_staff' ? '.mphbac-staff-grid, .mphbac-staff-bar' : '.mphbac-grid', { timeout: 8000 });
        await drive(p, state);
        out[`${cas}|${w}|${state}`] = { type: r.type, version: r.version, errors,
          png: await p.screenshot({ fullPage: true, animations: 'disabled',
            mask: globalThis.__maskPartA && r.type === 'mphbac_calendar'
              ? [p.locator('.mphbac-legend'), p.locator('.mphbac-grid .mphbac-cell-status.is-past')] : [] }),
          facts: await p.evaluate(() => {
            const leg = document.querySelector('.mphbac-legend');
            return { legend: leg ? [...leg.querySelectorAll('.mphbac-legend-item')].map(x => x.textContent.trim()) : null,
              past: [...document.querySelectorAll('.mphbac-grid .mphbac-cell-status.is-past')].map(c => getComputedStyle(c).visibility).slice(0, 1),
              firstDay: (document.querySelector('.mphbac-grid .mphbac-cell-status') || {}).dataset?.date || null };
          }) };
        await ctx.close();
      }
    }
  }
  return out;
}

/** Count differing pixels between two PNGs, in the browser. */
async function pixelDiff(browser, a, b) {
  const p = await browser.newPage();
  const r = await p.evaluate(async ([a, b]) => {
    const load = async s => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; };
    const [ia, ib] = [await load(a), await load(b)];
    if (ia.width !== ib.width || ia.height !== ib.height) return { size: [ia.width, ia.height, ib.width, ib.height], n: -1 };
    const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
    const x = c.getContext('2d');
    x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
    x.clearRect(0, 0, c.width, c.height); x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0, box = [1e9, 1e9, -1, -1];
    for (let i = 0; i < da.length; i += 4) {
      if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) {
        n++; const px = (i / 4) % c.width, py = Math.floor(i / 4 / c.width);
        box = [Math.min(box[0], px), Math.min(box[1], py), Math.max(box[2], px), Math.max(box[3], py)];
      }
    }
    return { n, box };
  }, [a.toString('base64'), b.toString('base64')]);
  await p.close();
  return r;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const [A, B] = args.filter(a => a.includes('='));
  const outDir = opt('--out');
  globalThis.__maskPartA = args.includes('--mask-part-a');
  const live = JSON.parse(fs.readFileSync(LIVE, 'utf8'));
  let cases = live.widgets.map(w => w.post_id + ':' + w.widget_id);
  if (opt('--only')) cases = cases.filter(c => opt('--only').split(',').includes(c));
  const widths = [390, 768, 1280];
  const browser = await chromium.launch(H.CHROMIUM);
  const sa = await shots(browser, A, cases, widths);
  const sb = await shots(browser, B, cases, widths);
  let bad = 0, n = 0;
  for (const k of Object.keys(sa)) {
    n++;
    const a = sa[k], b = sb[k];
    const same = a.png.equals(b.png);
    const d = same ? { n: 0 } : await pixelDiff(browser, a.png, b.png);
    const errs = [...a.errors, ...b.errors];
    if (!same || errs.length) bad++;
    console.log(`${same && !errs.length ? 'SAME ' : 'DIFF '} ${k.padEnd(32)} ${a.type.padEnd(16)}`
      + (same ? '' : ` ${d.n} px ${JSON.stringify(d.box || d.size)}`)
      + (errs.length ? ' ERRORS ' + errs.join(' / ') : '')
      + ` legend A=${JSON.stringify(a.facts.legend)} B=${JSON.stringify(b.facts.legend)} first A=${a.facts.firstDay} B=${b.facts.firstDay}`);
    if (outDir) {
      fs.mkdirSync(outDir, { recursive: true });
      const f = k.replace(/[|:]/g, '_');
      fs.writeFileSync(path.join(outDir, f + '_A.png'), a.png);
      fs.writeFileSync(path.join(outDir, f + '_B.png'), b.png);
    }
  }
  await browser.close();
  console.log(`\n${n} screenshots compared, ${bad} differ` + (globalThis.__maskPartA ? ' (Part A masked)' : ''));
  process.exit(bad ? 1 : 0);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(2); });
module.exports = { render, pageFor, shots, pixelDiff, STATES, TODAY, CLOCK };
