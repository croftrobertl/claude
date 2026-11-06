'use strict';
/**
 * 0.58.0 — NO STATUS CHANGES WITHOUT A TAP, ON THE PAGE (Rob, 2026-11-06).
 *
 * The staff page as live renders it (tests/render/render.php), every request
 * answered by the plugin's own handlers (tests/render/ajax.php) over
 * fixture-0474.php's "checkin" site: Rob's check-in day D, with
 *   #22 Boathouse   Ann out D, Bea in D (a turnover) — Occupied tapped when
 *                   Ann checked in
 *   #23 Lighthouse  an Airbnb stay out D — Not Ready tapped D−1
 *   #33 Pineapple   Cal in D at 2 PM — Not Ready tapped D−1 6 PM (Rob's 11/6)
 *   #35 Blue Heron  Dee in D — Ready tapped D−1 5 PM
 *   #36 Sunshine    in D−2, out D+1 — Occupied tapped at check-in
 *   #31 #32 #34     never tapped (a dock block, a cancelled and a pending
 *                   booking out D)
 *
 * THE WALK: one page, left open from 11:55 PM on D−1 to D+15, its clock
 * driven by Playwright (the 3-minute refresh really fires), and the site's
 * day moved with it (MPHBAC_SHIFT_DAYS: every booking n days earlier). At
 * every step the board's refresh fetches the signs again; every sign must
 * be exactly what was tapped. 0.57.1 showed #33 and #35 Occupied from
 * midnight on D, #22 Not Ready on D and #36 Not Ready from D+1 (checkouts).
 * Then one tap through the page, and the same signs after it.
 *
 * STILLS_OUT=<dir>: the board and the Daily list on the check-in day at
 * 1:08 AM, at 375 (2×) and 1440.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const H = require('./harness.js');
const S = require('./staff-harness.js');
const site = require('./site-0474.js');
const { check, done } = H.reporter();

const CASE = '18102:afeefb0';
const ORIGIN = 'https://example.test';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mphbac-walk-'));
const STATE = path.join(TMP, 'state.json');
const OUT = process.env.STILLS_OUT || '';
const T = { b22: 1071, b23: 1069, b31: 1067, b32: 1065, b33: 1604, b34: 1607, b35: 1740, b36: 1742 };
const REFRESH_MS = 3 * 60 * 1000;

// THE SITE'S DAY, Eastern, and an Eastern wall-clock time on day D+k.
const TZ = 'America/New_York';
const ymd = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const D0 = ymd(new Date());
function eastern(k, hh, mm = 0) {
  const base = new Date(D0 + 'T12:00:00Z');
  base.setUTCDate(base.getUTCDate() + k);
  const day = base.toISOString().slice(0, 10);
  for (const off of [-4, -5]) {                       // EDT or EST, whichever that day keeps
    const t = new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00${off === -4 ? '-04:00' : '-05:00'}`);
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t);
    if (ymd(t) === day && parts === `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`) return t;
  }
  throw new Error('no Eastern time for ' + day);
}
const sec = d => Math.floor(d.getTime() / 1000);

// THE TAPS, as staff made them before the walk (the plugin's own options).
const tapped = (ready, at) => ({ v: 2, manual: { ready, at }, cleared: 0, log: [[at, ready ? 1 : 0]] });
const occupiedTap = at => ({ v: 2, manual: null, cleared: at, log: [[at, 2]] });
function seed() {
  fs.writeFileSync(STATE, JSON.stringify({
    ['mphbac_ready_' + T.b22]: occupiedTap(sec(eastern(-4, 15, 10))),
    ['mphbac_ready_' + T.b23]: tapped(false, sec(eastern(-1, 11))),
    ['mphbac_ready_' + T.b33]: tapped(false, sec(eastern(-1, 18))),
    ['mphbac_ready_' + T.b35]: tapped(true, sec(eastern(-1, 17))),
    ['mphbac_ready_' + T.b36]: occupiedTap(sec(eastern(-2, 15, 30))),
  }));
}
const WANT = { [T.b22]: 'occupied', [T.b23]: 'notready', [T.b31]: 'none', [T.b32]: 'none', [T.b33]: 'notready', [T.b34]: 'none', [T.b35]: 'ready', [T.b36]: 'occupied' };

function ajax(body, env) {
  const r = spawnSync('php', [path.resolve(__dirname, '../render/ajax.php'), site.HERE, body], {
    encoding: 'utf8', maxBuffer: 64 << 20,
    env: { ...process.env, MPHBAC_FIXTURE_0474: 'checkin', MPHBAC_STATE: STATE, ...env },
  });
  const m = (r.stderr || '').match(/STATUS (\d+)( nonce)?/);
  return { status: m ? +m[1] : 500, nonce: !!(m && m[2]), body: r.stdout };
}

function page(r) {
  const [post, wid] = r.case.split(':');
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:Raleway,Georgia,serif}${H.THEME}${S.raleway()}</style>
<style id="elementor">${r.css}</style>
<style id="plugin">${S.css()}</style></head>
<body class="elementor-kit-9 elementor-kit-331">
<div class="elementor elementor-${post}"><section class="elementor-section">
<div class="elementor-element elementor-element-${wid} elementor-widget elementor-widget-${r.type}">
<div class="elementor-widget-container">${r.html}</div></div></section></div>
<script>${S.staffJsShipped().replace(/<\/script/gi, '<\\/script')}</script>
</body></html>`;
}

async function open(browser, width, at, shift, opts = {}) {
  const r = site.render(site.HERE, CASE, 'checkin');
  const touch = width < 1000;
  const ctx = await browser.newContext({ viewport: { width, height: opts.height || 800 }, hasTouch: touch, isMobile: touch, deviceScaleFactor: opts.scale || 1, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  p.__errors = []; p.__months = []; p.__ready = []; p.__shift = shift;
  p.on('pageerror', e => p.__errors.push(e.message));
  await p.clock.install({ time: at });
  const html = page(r);
  await p.route(ORIGIN + '/**', async route => {
    const req = route.request();
    if (req.url().endsWith('/wp-admin/admin-ajax.php')) {
      const body = req.postData() || '';
      const a = ajax(body, { MPHBAC_SHIFT_DAYS: String(p.__shift) });
      if (/action=mphbac_staff_month/.test(body)) p.__months.push({ shift: p.__shift, status: a.status, turnover: (() => { try { return JSON.parse(a.body).data.turnover; } catch (e) { return null; } })() });
      if (/action=mphbac_staff_ready/.test(body)) p.__ready.push({ body, status: a.status });
      return route.fulfill({ status: a.status, contentType: 'application/json', body: a.body, headers: a.nonce ? { 'X-MPHBAC-Staff': 'nonce' } : {} });
    }
    if (new URL(req.url()).pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    return route.fulfill({ status: 404, body: '' });
  });
  await p.goto(ORIGIN + '/');
  await p.waitForSelector('.mphbac-staff-chart', { timeout: 15000 });
  await p.waitForFunction(() => document.querySelectorAll('.mphbac-staff-rowlabel[data-type]').length === 8);
  await p.clock.runFor(500);
  return { ctx, p };
}

const label = id => `.mphbac-staff-rowlabel[data-type="${id}"]`;
const signs = p => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.mphbac-staff-rowlabel[data-type]')].map(l => {
  const d = l.querySelector('.mphbac-staff-ready');
  return [l.dataset.type, d ? (d.classList.contains('is-ready') ? 'ready' : d.classList.contains('is-occupied') ? 'occupied' : 'notready') : 'none'];
})));
const same = (a, b) => Object.keys(b).every(k => a[k] === b[k]) && Object.keys(a).length === Object.keys(b).length;
const fmt = s => Object.entries(s).map(([k, v]) => '#' + Object.keys(T).find(x => T[x] === +k).slice(1) + ' ' + v).join(', ');

(async () => {
  const browser = await chromium.launch(H.CHROMIUM);

  console.log('-- 1. THE WALK: one page left open from the evening before check-in to 15 days on --');
  seed();
  const stored0 = fs.readFileSync(STATE, 'utf8');
  {
    const { ctx, p } = await open(browser, 390, eastern(-1, 23, 55), -1);
    const s0 = await signs(p);
    check(`D−1 11:55 PM (the evening before): every sign as tapped — ${fmt(s0)}`, same(s0, WANT), s0);
    const STEPS = [
      [0, 0, 1, 'D 12:01 AM — PAST MIDNIGHT, check-in day'],
      [0, 1, 8, 'D 1:08 AM — when Rob saw #33 already Occupied'],
      [0, 11, 0, 'D 11:00 AM — checkout time; Ann (#22) and the Airbnb guest (#23) out'],
      [0, 14, 0, 'D 2:00 PM — Cal\'s arrival (#33)'],
      [0, 15, 0, 'D 3:00 PM — MotoPress\'s check-in time'],
      [0, 23, 59, 'D 11:59 PM'],
      [1, 9, 0, 'D+1 9:00 AM — the morning after the turnover; #36 checks out'],
      [2, 11, 0, 'D+2 — Dee (#35) checks out'],
      [3, 11, 0, 'D+3 — Cal (#33) checks out'],
      [4, 11, 0, 'D+4 — Bea (#22) checks out'],
      [15, 9, 0, 'D+15 — past the old 14-day automatic Not Ready'],
    ];
    let now = eastern(-1, 23, 55);
    for (const [k, hh, mm, words] of STEPS) {
      const to = eastern(k, hh, mm);
      const before = p.__months.length;
      p.__shift = k;
      // Forward to the step, then far enough for the 3-minute refresh to have
      // fired at the new time (a jump of days fires it once).
      await p.clock.fastForward(Math.max(1000, to - now));
      now = to;
      if (p.__months.length === before) { await p.clock.runFor(REFRESH_MS + 1000); now = new Date(now.getTime() + REFRESH_MS + 1000); }
      await p.clock.runFor(300);
      const got = await signs(p), last = p.__months[p.__months.length - 1];
      check(`${words}: the board refreshed from the server (200) and every sign is as tapped`,
        p.__months.length > before && last.status === 200 && last.shift === k && same(got, WANT), { refreshed: p.__months.length - before, last: last && [last.status, last.shift], got: fmt(got) });
    }
    check('no tap was sent on the whole walk, and the stored taps are byte for byte as seeded', p.__ready.length === 0 && fs.readFileSync(STATE, 'utf8') === stored0);
    check('no page errors on the walk', p.__errors.length === 0, p.__errors);

    console.log('\n-- 2. a tap is the only thing that changes one --');
    await p.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'center' }), label(T.b33));
    await p.click(label(T.b33), { button: 'right' });
    await p.clock.runFor(200);
    const btns = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-readypop button')].map(b => b.textContent));
    check('#33 (Not Ready): the popup offers "Ready" and "Occupied" — one tap, no dialog after it', JSON.stringify(btns) === '["Ready","Occupied"]', btns);
    await p.locator('.mphbac-staff-readypop button', { hasText: /^Occupied$/ }).click();
    for (let i = 0; i < 20 && !p.__ready.length; i++) await p.clock.runFor(100);
    await p.clock.runFor(300);
    const after = await signs(p);
    check('Occupied tapped on #33 (the check-in record): saved (200), #33 gray, every other sign unchanged',
      p.__ready.length === 1 && p.__ready[0].status === 200 && after[T.b33] === 'occupied' && same({ ...after, [T.b33]: 'notready' }, WANT), [p.__ready, fmt(after)]);
    check('...no dialog, no confirmation, nothing else on screen', await p.evaluate(() => !document.querySelector('[role="alertdialog"], dialog[open]') && document.querySelector('.mphbac-staff-readypop').hidden));
    p.__shift = 16;
    const before = p.__months.length;
    await p.clock.runFor(REFRESH_MS + 1000);
    await p.clock.runFor(300);
    const later = await signs(p);
    check('the next refresh, a day later: #33 still Occupied, the rest as tapped', p.__months.length > before && later[T.b33] === 'occupied' && same({ ...later, [T.b33]: 'notready' }, WANT), fmt(later));
    await ctx.close();
  }

  console.log('\n-- 3. a page opened fresh at each moment shows the same --');
  seed();
  for (const [k, hh, mm] of [[-1, 23, 59], [0, 0, 1], [0, 1, 8], [0, 14, 1], [1, 0, 1], [3, 12, 0]]) {
    const { ctx, p } = await open(browser, 1440, eastern(k, hh, mm), k, { height: 900 });
    const s = await signs(p);
    check(`opened at D${k ? (k > 0 ? '+' : '−') + Math.abs(k) : ''} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}: every sign as tapped`, same(s, WANT) && p.__errors.length === 0, [fmt(s), p.__errors]);
    await ctx.close();
  }

  console.log('\n-- 4. THE DAILY LIST AND STATS read no status --');
  {
    const { ctx, p } = await open(browser, 390, eastern(0, 1, 8), 0);
    await p.selectOption('.mphbac-staff-period', 'day');
    await p.clock.runFor(600);
    const ag = await p.evaluate(() => {
      const el = document.querySelector('.mphbac-staff-agenda');
      return { shown: !!el && !el.hidden, text: el ? el.textContent : '', dots: el ? el.querySelectorAll('.mphbac-staff-ready').length : -1,
        groups: [...document.querySelectorAll('.mphbac-staff-group')].map(g => [g.className.replace('mphbac-staff-group ', ''), (g.querySelector('.mphbac-staff-group-count') || {}).textContent]) };
    });
    check('the Daily list on D: Arriving 3 (Bea, Cal, Dee), Departing and In House from the bookings', ag.shown && /Bea/.test(ag.text) && /Cal/.test(ag.text) && /Dee/.test(ag.text), ag.groups);
    check('...and it shows no status and no "Occupied": the list is who is booked, not a cottage status', ag.dots === 0 && !/Occupied|Not Ready|Ready/i.test(ag.text), ag);
    await ctx.close();
    const js = fs.readFileSync(path.join(site.HERE, 'assets/js/staff.js'), 'utf8');
    const from = js.indexOf('// ---- the cottage status'), to = js.indexOf("gridEl.addEventListener('scroll', function () { closeReady(false); }");
    const at = [...js.matchAll(/ready\.map|stateOf\(/g)].map(m => m.index);
    const uses = at.length, statsReads = from < 0 || to < from || at.some(i => i < from || i > to);
    check('in staff.js the statuses (ready.map) are read only by the board\'s sign and its popup — never by Stats or the Daily list', uses > 0 && !statsReads, uses);
  }

  if (OUT) {
    console.log('\n-- stills: the check-in day at 1:08 AM --');
    seed();
    for (const w of [375, 1440]) {
      const { ctx, p } = await open(browser, w, eastern(0, 1, 8), 0, { scale: w < 1000 ? 2 : 1, height: w < 1000 ? 812 : 900 });
      const s = await signs(p);
      check(`(stills ${w}px) the board on D at 1:08 AM: every sign as tapped`, same(s, WANT), fmt(s));
      const box = await p.locator('.mphbac-staff-chart').boundingBox();
      await p.screenshot({ path: path.join(OUT, `Availability Calendar - 0.58.0 Board ${w}px.png`), clip: { x: 0, y: 0, width: w, height: Math.min(w < 1000 ? 812 : 900, box.y + box.height + 16) } });
      // The popup on #34, never tapped: all three statuses (0.58.0).
      await p.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'center' }), label(T.b34));
      if (w < 1000) {
        const b = await p.locator(label(T.b34)).boundingBox(), cdp = await ctx.newCDPSession(p);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + 24, y: b.y + b.height / 2 }] });
        await p.clock.runFor(650);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await p.click(label(T.b34), { button: 'right' });
      }
      await p.clock.runFor(200);
      const pop = await p.evaluate(sel => { const q = document.querySelector('.mphbac-staff-readypop'), r = q.getBoundingClientRect(), l = document.querySelector(sel).getBoundingClientRect();
        return { open: !q.hidden, buttons: [...q.querySelectorAll('button')].map(x => x.textContent), beside: r.left >= l.right, inView: r.left >= 0 && r.right <= document.documentElement.clientWidth && r.top >= 0 && r.bottom <= innerHeight }; }, label(T.b34));
      check(`(stills ${w}px) #34, never tapped: the popup offers all three, beside the name, on screen`,
        pop.open && JSON.stringify(pop.buttons) === '["Ready","Not Ready","Occupied"]' && pop.beside && pop.inView, pop);
      await p.screenshot({ path: path.join(OUT, `Availability Calendar - 0.58.0 Popup Never Tapped ${w}px.png`) });
      await p.keyboard.press('Escape');
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.selectOption('.mphbac-staff-period', 'day');
      await p.clock.runFor(600);
      await p.screenshot({ path: path.join(OUT, `Availability Calendar - 0.58.0 Daily ${w}px.png`), fullPage: true });
      check(`(stills ${w}px) no page errors`, p.__errors.length === 0, p.__errors);
      await ctx.close();
    }
  }

  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  done();
})().catch(e => { console.error(e); fs.rmSync(TMP, { recursive: true, force: true }); process.exit(2); });
