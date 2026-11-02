'use strict';
/**
 * 0.50.0 — THE CLEANING SIGN: ANY COTTAGE, ANY TIME, AND A POPUP IN THE RIGHT
 * PLACE (Rob, via the WD).
 *
 * End to end on the staff page as live renders it (tests/render/render.php,
 * page 18102's widget from live's export), every request answered by the
 * plugin's own handlers (tests/render/ajax.php) over fixture-0474.php's
 * "staff" site. Signs at load:
 *   #22 Boathouse  out today (direct)        → Not Ready (automatic)
 *   #23 Lighthouse out today (Airbnb)        → Not Ready (automatic)
 *   #33 Pineapple  out 3 days ago            → Not Ready (automatic)
 *   #31 a dock block out today, #32 a cancelled booking, #34 a pending one,
 *   #35 out 15 days ago                      → no sign
 *   #36 Sunshine   a guest IN it, out tomorrow → no sign — the LOWEST row
 *
 * THE PAGE IS SHAPED LIKE LIVE'S WHERE IT MATTERS: the calendar sits inside an
 * ancestor with a transform, as Elementor's sections can be, below a tall
 * header, and the page is scrolled. A position: fixed popup INSIDE the board
 * is then placed against that ancestor, not the screen — on Rob's phone a
 * held #33 opened three rows up, over #23. The tests hold the lowest row, #36.
 * Chromium with touch emulation stands in for an iPhone (WebKit cannot be
 * installed here); the long press is real touch events through CDP.
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mphbac-ready-'));
const STATE = path.join(TMP, 'state.json');
const SQL = path.join(TMP, 'sql.log');
const OUT = process.env.READY_OUT || '';
const T = { b22: 1071, b23: 1069, b31: 1067, b32: 1065, b33: 1604, b34: 1607, b35: 1740, b36: 1742 };

function ajax(body, env = {}) {
  const r = spawnSync('php', [path.resolve(__dirname, '../render/ajax.php'), site.HERE, body], {
    encoding: 'utf8', maxBuffer: 64 << 20,
    env: { ...process.env, MPHBAC_FIXTURE_0474: 'staff', MPHBAC_STATE: STATE, MPHBAC_SQL_LOG: SQL, ...env },
  });
  const m = (r.stderr || '').match(/STATUS (\d+)( nonce)?/);
  return { status: m ? +m[1] : 500, nonce: !!(m && m[2]), body: r.stdout };
}

/** The staff page, its calendar inside a TRANSFORMED ancestor below a tall header. */
function page(r) {
  const [post, wid] = r.case.split(':');
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:Raleway,Georgia,serif}${H.THEME}${S.raleway()}</style>
<style id="elementor">${r.css}</style>
<style id="plugin">${S.css()}</style></head>
<body class="elementor-kit-9 elementor-kit-331">
<header style="height:640px;background:#eef2f7">Site header</header>
<div class="elementor elementor-${post}"><section class="elementor-section" style="transform:translate3d(0,0,0);margin:0 0 900px">
<div class="elementor-element elementor-element-${wid} elementor-widget elementor-widget-${r.type}">
<div class="elementor-widget-container">${r.html}</div></div></section></div>
<script>${S.staffJsShipped().replace(/<\/script/gi, '<\\/script')}</script>
</body></html>`;
}

async function open(browser, width, opts = {}) {
  const r = site.render(site.HERE, CASE, 'staff');
  const touch = width < 1000;
  const ctx = await browser.newContext({ viewport: { width, height: opts.height || 800 }, hasTouch: touch, isMobile: touch, deviceScaleFactor: opts.scale || 1, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  p.__errors = []; p.__ready = [];
  p.on('pageerror', e => p.__errors.push(e.message));
  await p.clock.setFixedTime(new Date());
  const html = page(r);
  await p.route(ORIGIN + '/**', async route => {
    const req = route.request();
    if (req.url().endsWith('/wp-admin/admin-ajax.php')) {
      const body = req.postData() || '';
      const isReady = body.includes('action=mphbac_staff_ready');
      if (isReady && p.__holdReady) await new Promise(res => setTimeout(res, p.__holdReady));
      const a = (isReady && p.__failReady) ? { status: 500, body: '' }
        : (isReady && p.__failJson) ? { status: 500, body: JSON.stringify({ success: false, data: { message: 'Could not save. Please try again.' } }) }
        : ajax(body, opts.env || {});
      if (isReady) p.__ready.push({ body, status: a.status });
      return route.fulfill({ status: a.status, contentType: 'application/json', body: a.body,
        headers: a.nonce ? { 'X-MPHBAC-Staff': 'nonce' } : {} });
    }
    if (new URL(req.url()).pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    return route.fulfill({ status: 404, body: '' });
  });
  await p.goto(ORIGIN + '/');
  await p.waitForSelector('.mphbac-staff-chart', { timeout: 15000 });
  await p.waitForTimeout(400);
  return { ctx, p };
}

const label = id => `.mphbac-staff-rowlabel[data-type="${id}"]`;
const signs = p => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.mphbac-staff-rowlabel[data-type]')].map(l => {
  const d = l.querySelector('.mphbac-staff-ready');
  return [l.dataset.type, d ? (d.classList.contains('is-ready') ? 'ready' : 'notready') : 'none'];
})));
const popup = p => p.evaluate(() => {
  const pop = document.querySelector('.mphbac-staff-readypop');
  const bs = pop ? [...pop.querySelectorAll('button')] : [];
  const r = pop ? pop.getBoundingClientRect() : null;
  const inView = el => { const q = el.getBoundingClientRect(); return q.left >= 0 && q.right <= document.documentElement.clientWidth && q.top >= 0 && q.bottom <= innerHeight; };
  return { open: !!pop && !pop.hidden, onBody: !!pop && pop.parentNode === document.body,
    name: pop ? (pop.querySelector('.mphbac-staff-readyname') || {}).textContent : '',
    buttons: bs.map(b => b.textContent), sizes: bs.map(b => [Math.round(b.getBoundingClientRect().width), Math.round(b.getBoundingClientRect().height)]),
    inView: bs.length > 0 && bs.every(inView), rect: r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null };
});
/** Where the popup is against the held name: beside it, at its height. */
const placement = (p, id) => p.evaluate(sel => {
  const a = document.querySelector(sel).getBoundingClientRect(), b = document.querySelector('.mphbac-staff-readypop').getBoundingClientRect();
  const mid = (b.top + b.bottom) / 2;
  return { beside: b.left >= a.right, level: mid >= a.top && mid <= a.bottom, gapPx: Math.round(b.left - a.right),
    labelTop: Math.round(a.top), labelBottom: Math.round(a.bottom), popMid: Math.round(mid) };
}, label(id));
const centre = (p, id) => p.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'center' }), label(id)).then(() => p.waitForTimeout(150));

/** A real long press: touch events through CDP, held `ms`. */
async function longPress(p, sel, ms = 650) {
  const b = await p.locator(sel).boundingBox();
  const x = b.x + Math.min(24, b.width / 2), y = b.y + b.height / 2;
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await p.waitForTimeout(ms);
  const mid = await popup(p);
  const selection = await p.evaluate(() => String(window.getSelection()));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(150);
  return { mid, selection };
}
async function tap(p, text) {
  const b = await p.locator('.mphbac-staff-readypop button', { hasText: new RegExp('^' + text + '$') }).boundingBox();
  await p.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
}
const status = p => p.evaluate(() => document.querySelector('.mphbac-staff-status').textContent);

(async () => {
  const browser = await chromium.launch(H.CHROMIUM);
  try { fs.unlinkSync(STATE); } catch (e) {}

  console.log('-- 1. as the board opens (390px, touch, inside a transformed ancestor) --');
  const { ctx, p } = await open(browser, 390);
  {
    const d = await signs(p);
    check('Not Ready (broom) where a guest checked out: #22 direct and #23 Airbnb today, #33 three days ago',
      d[T.b22] === 'notready' && d[T.b23] === 'notready' && d[T.b33] === 'notready', d);
    check('NO SIGN on a never-marked cottage with no recent checkout: #31 (a dock block), #32 (cancelled), #34 (pending), #35 (15 days), #36 (a guest in it)',
      ['b31', 'b32', 'b34', 'b35', 'b36'].every(k => d[T[k]] === 'none'), d);
    const names = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-rowlabel[data-type]')].map(l => [l.getAttribute('role'), l.tabIndex, l.getAttribute('aria-label')]));
    check('EVERY cottage name (8) can be held: each a button, reachable by keyboard', names.length === 8 && names.every(([r, t]) => r === 'button' && t === 0), names);
    check('...a screen reader hears the state ("Cottage 22: Not ready"), or just the cottage when it has none ("Cottage 32")',
      names[0][2] === 'Cottage 22: Not ready' && names[3][2] === 'Cottage 32', names.map(n => n[2]));
    const tr = await p.evaluate(() => getComputedStyle(document.querySelector('.elementor-section')).transform);
    check('(instrument) the calendar really is inside a transformed ancestor', tr !== 'none', tr);
  }

  console.log('\n-- 2. THE LOWEST ROW: hold #36 (a guest in it, no sign) --');
  {
    await centre(p, T.b36);
    const scrolled = await p.evaluate(() => ({ y: scrollY, anc: Math.round(document.querySelector('.elementor-section').getBoundingClientRect().top) }));
    check('(instrument) the page is scrolled and the ancestor starts above the screen — where a fixed popup inside it went wrong',
      scrolled.y > 600 && scrolled.anc < 0, scrolled);
    const lp = await longPress(p, label(T.b36));
    check('A LONG PRESS (0.65s) on #36 opens the popup, while the finger is still down', lp.mid.open, lp.mid);
    const at = await placement(p, T.b36);
    check('IT OPENS BESIDE #36, AT #36\'S HEIGHT — not rows away (the popup\'s middle is within #36\'s row)', at.beside && at.level && at.gapPx <= 12, at);
    const pp = await popup(p);
    check('the popup is on <body>, so no ancestor\'s transform can move it', pp.onBody, pp);
    check('IT NAMES ITS COTTAGE, centred above the buttons: "#36 Sunshine"', pp.name === '#36 Sunshine', pp.name);
    const nameCss = await p.evaluate(() => getComputedStyle(document.querySelector('.mphbac-staff-readyname')).textAlign);
    check('...centred', nameCss === 'center', nameCss);
    check('NO STATE YET, SO BOTH: "Ready" and "Not Ready", each a large tap target, on screen',
      JSON.stringify(pp.buttons) === '["Ready","Not Ready"]' && pp.sizes.every(([w, h]) => h >= 44 && w >= 100) && pp.inView, pp);
    check('no text selected by the hold', lp.selection === '', lp.selection);
    // Chromium drops the iOS-only -webkit-touch-callout from computed style:
    // the stylesheet's own rule is read for it.
    const rule = (S.cssCode().match(/\.mphbac-staff-rowlabel\.has-ready\s*\{([^}]*)\}/) || [])[1] || '';
    const us = await p.evaluate(sel => getComputedStyle(document.querySelector(sel)).userSelect, label(T.b36));
    check('...and iOS is told so on every name: -webkit-touch-callout: none and -webkit-user-select: none in the rule, user-select: none computed',
      us === 'none' && /-webkit-touch-callout:\s*none/.test(rule) && /-webkit-user-select:\s*none/.test(rule), [us, rule.trim()]);
    p.__holdReady = 600;
    await tap(p, 'Not Ready');
    await p.waitForTimeout(80);
    const now = (await signs(p))[T.b36];
    check('NOT READY ON AN OCCUPIED COTTAGE: the broom appears at once, before the server answers', now === 'notready' && p.__ready.length === 0, now);
    await p.waitForTimeout(900);
    check('...and is saved (200)', p.__ready.length === 1 && p.__ready[0].status === 200 && /ready=0/.test(p.__ready[0].body) && /seen=\d+/.test(p.__ready[0].body), p.__ready);
    p.__holdReady = 0;
    if (OUT) {
      fs.mkdirSync(OUT, { recursive: true });
      await longPress(p, label(T.b36));
      const pop = await popup(p);
      check('(screenshot) held again, a Not Ready cottage offers only "Ready"', JSON.stringify(pop.buttons) === '["Ready"]', pop.buttons);
      await p.screenshot({ path: path.join(OUT, 'popup-36-390.png') });
      await p.keyboard.press('Escape');
    }
  }

  console.log('\n-- 3. the popup offers the opposite --');
  {
    await centre(p, T.b22);
    await longPress(p, label(T.b22));
    let pp = await popup(p);
    check('#22, Not Ready: the popup names it ("#22 Boathouse") and offers only "Ready"', pp.name === '#22 Boathouse' && JSON.stringify(pp.buttons) === '["Ready"]', pp);
    await tap(p, 'Ready');
    await p.waitForTimeout(900);
    check('Ready: the green check', (await signs(p))[T.b22] === 'ready');
    await longPress(p, label(T.b22));
    pp = await popup(p);
    check('#22, Ready: only "Not Ready"', JSON.stringify(pp.buttons) === '["Not Ready"]', pp.buttons);
    await tap(p, 'Not Ready');
    await p.waitForTimeout(900);
    check('Not Ready: the broom again, and saved', (await signs(p))[T.b22] === 'notready' && p.__ready.length === 3 && p.__ready.every(x => x.status === 200), p.__ready);
    // THE SIGNS (0.49.0, Rob's pick D): a white broom on red, a white check on
    // green — never colour alone — and the check centred, measured in pixels.
    const icon = id => p.evaluate(sel => { const d = document.querySelector(sel + ' .mphbac-staff-ready'); const c = getComputedStyle(d);
      return { img: decodeURIComponent(c.backgroundImage), bg: c.backgroundColor, w: d.getBoundingClientRect().width, label: d.getAttribute('aria-label') }; }, label(id));
    const red = await icon(T.b22);
    check('NOT READY is a white X on red (0.50.1, Rob), reads "Not ready"', red.bg === 'rgb(217, 48, 37)' && /M8 8L16 16M16 8L8 16/.test(red.img) && !/rect x='10\.25'/.test(red.img) && red.label === 'Not ready' && red.w === 17, red);

    await longPress(p, label(T.b22)); await tap(p, 'Ready'); await p.waitForTimeout(900);
    const green = await icon(T.b22);
    const sw = img => (img.match(/stroke-width='([\d.]+)'/) || [])[1];
    check('THE X IS THE CHECK\'S TWIN: the same stroke width (' + sw(green.img) + ') and round caps',
      sw(red.img) && sw(red.img) === sw(green.img) && /stroke-linecap='round'/.test(red.img) && /stroke-linecap='round'/.test(green.img), [sw(red.img), sw(green.img)]);
    check('READY is a white CHECK on green, reads "Ready"', green.bg === 'rgb(30, 142, 62)' && /M6\.5 12\.5l3\.75 3\.75L17\.5 9/.test(green.img) && green.label === 'Ready' && green.w === 17, green);
    const measure = async id => { const png = await p.locator(label(id) + ' .mphbac-staff-ready').screenshot(); return p.evaluate(async b64 => {
      const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode();
      const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
      for (let k = 0; k < d.length; k += 4) { if (d[k] > 220 && d[k + 1] > 220 && d[k + 2] > 220) {
        const px = (k / 4) % c.width, py = Math.floor(k / 4 / c.width);
        if (Math.hypot(px - c.width / 2, py - c.height / 2) > c.width / 2 - 2) continue;
        n++; x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); } }
      return { w: c.width, h: c.height, midX: (x0 + x1) / 2, midY: (y0 + y1) / 2, n };
    }, png.toString('base64')); };
    const centred = m => m.n > 10 && Math.abs(m.midX - (m.w - 1) / 2) <= 1 && Math.abs(m.midY - (m.h - 1) / 2) <= 1;
    const ctr = await measure(T.b22);
    check('...and the check is CENTRED in its circle (its box\'s middle within 1px of the circle\'s)', centred(ctr), ctr);
    const xc = await measure(T.b23);
    check('...and so is the X on a Not Ready cottage (#23)', (await signs(p))[T.b23] === 'notready' && centred(xc), xc);
    await longPress(p, label(T.b22)); await tap(p, 'Not Ready'); await p.waitForTimeout(900);
  }

  console.log('\n-- 4. a page that has not seen the latest (another phone) --');
  {
    const B = await open(browser, 390);
    await centre(B.p, T.b32);
    await longPress(B.p, label(T.b32));
    await tap(B.p, 'Ready');
    await B.p.waitForTimeout(900);
    check('(instrument) phone B marks #32 Ready', (await signs(B.p))[T.b32] === 'ready');
    await B.ctx.close();
    check('(instrument) phone A still shows #32 with no sign', (await signs(p))[T.b32] === 'none');
    await centre(p, T.b32);
    await longPress(p, label(T.b32));
    await tap(p, 'Not Ready');
    await p.waitForTimeout(900);
    const last = p.__ready[p.__ready.length - 1];
    check('PHONE A marks #32 Not Ready from its stale page: the server REFUSES it (409, "changed")', last.status === 409, last);
    check('...and phone A now shows what is stored — phone B\'s Ready — and says so',
      (await signs(p))[T.b32] === 'ready' && await status(p) === 'This cottage was just changed. Please check it and try again.', await status(p));
    await longPress(p, label(T.b32));
    await tap(p, 'Not Ready');
    await p.waitForTimeout(900);
    check('...after which its own mark goes through', (await signs(p))[T.b32] === 'notready' && p.__ready[p.__ready.length - 1].status === 200);
  }

  console.log('\n-- 5. a save that fails --');
  {
    await centre(p, T.b33);
    await longPress(p, label(T.b33));
    p.__failReady = true; p.__holdReady = 400;
    await tap(p, 'Ready');
    await p.waitForTimeout(60);
    const mid = (await signs(p))[T.b33];
    await p.waitForTimeout(600);
    check('the check shows at once, then the broom comes BACK when the network fails — and it says so',
      mid === 'ready' && (await signs(p))[T.b33] === 'notready' && await status(p) === 'Could not save. Please try again.', [mid, await status(p)]);
    p.__failReady = false; p.__failJson = true;
    await longPress(p, label(T.b33));
    await tap(p, 'Ready');
    await p.waitForTimeout(800);
    check('...and when the SERVER refuses it (its JSON answer): back, and says so', (await signs(p))[T.b33] === 'notready' && await status(p) === 'Could not save. Please try again.');
    p.__failJson = false; p.__holdReady = 0;
    check('no page errors (390px)', p.__errors.length === 0, p.__errors);
    if (OUT) {
      await p.evaluate(() => scrollTo(0, 0));
      await centre(p, T.b32);
      await p.evaluate(() => document.querySelector('.mphbac-staff-status').textContent = '');
      const box = await p.locator('.mphbac-staff-chart').boundingBox();
      await p.screenshot({ path: path.join(OUT, 'board-390.png'), clip: { x: 0, y: Math.max(0, box.y), width: 390, height: Math.min(700, box.height) } });
    }
  }
  await ctx.close();

  console.log('\n-- 6. desktop (1440px), the same ancestor: right-click, long click, keyboard --');
  {
    const { ctx: c2, p: q } = await open(browser, 1440, { height: 900 });
    await centre(q, T.b36);
    await q.click(label(T.b36), { button: 'right' });
    await q.waitForTimeout(150);
    let at = await placement(q, T.b36), pp = await popup(q);
    check('A RIGHT-CLICK on #36 (lowest row, page scrolled) opens the popup beside it, at its height, named "#36 Sunshine"',
      pp.open && at.beside && at.level && pp.name === '#36 Sunshine', [at, pp.name]);
    check('...#36 is Not Ready (marked on the phone): it offers "Ready"', JSON.stringify(pp.buttons) === '["Ready"]', pp.buttons);
    if (OUT) await q.screenshot({ path: path.join(OUT, 'popup-36-1440.png') });
    await q.keyboard.press('Escape');
    await q.waitForTimeout(100);
    check('Escape closes it', !(await popup(q)).open);
    const b = await q.locator(label(T.b34)).boundingBox();
    await q.mouse.move(b.x + 20, b.y + b.height / 2); await q.mouse.down(); await q.waitForTimeout(650);
    pp = await popup(q); await q.mouse.up();
    check('A LONG CLICK on #34 (no sign) opens it: "#34 Coconut", both buttons', pp.open && pp.name === '#34 Coconut' && JSON.stringify(pp.buttons) === '["Ready","Not Ready"]', pp);
    await q.keyboard.press('Escape');
    const b2 = await q.locator(label(T.b34)).boundingBox();
    await q.mouse.move(b2.x + 20, b2.y + b2.height / 2); await q.mouse.down(); await q.waitForTimeout(300); await q.mouse.up(); await q.waitForTimeout(500);
    check('an ordinary click (0.3s) opens nothing', !(await popup(q)).open);
    await q.focus(label(T.b35));
    await q.keyboard.press('Enter');
    await q.waitForTimeout(150);
    const f = await q.evaluate(() => document.activeElement && document.activeElement.textContent);
    check('KEYBOARD: Enter on #35 opens it with "Ready" focused', (await popup(q)).open && f === 'Ready', f);
    await q.keyboard.press('Enter');
    await q.waitForTimeout(900);
    check('...Enter marks it: Ready', (await signs(q))[T.b35] === 'ready');
    check('no page errors (1440px)', q.__errors.length === 0, q.__errors);
    if (OUT) {
      const box = await q.locator('.mphbac-staff-chart').boundingBox();
      await q.evaluate(() => scrollTo(0, 0)); await centre(q, T.b31);
      const box2 = await q.locator('.mphbac-staff-chart').boundingBox();
      await q.screenshot({ path: path.join(OUT, 'board-1440.png'), clip: { x: 0, y: Math.max(0, box2.y), width: 1440, height: Math.min(700, box2.height) } });
      void box;
    }
    await c2.close();
  }

  console.log('\n-- 7. 768px: the same --');
  {
    const { ctx: c3, p: q } = await open(browser, 768);
    await centre(q, T.b36);
    await longPress(q, label(T.b36));
    const at = await placement(q, T.b36), pp = await popup(q);
    check('768px: holding #36 opens the popup beside it, at its height, named, buttons on screen and ≥44px',
      at.beside && at.level && pp.name === '#36 Sunshine' && pp.inView && pp.sizes.every(([, h]) => h >= 44), [at, pp]);
    const m = await q.evaluate(() => [...document.querySelectorAll('.mphbac-staff-rowlabel .mphbac-staff-ready')].map(d => {
      const r = d.getBoundingClientRect(), l = d.closest('.mphbac-staff-rowlabel').getBoundingClientRect();
      return r.left >= l.left && r.right <= l.right && r.width === 17; }));
    check('768px: every sign sits inside its name cell, 17px', m.length > 0 && m.every(Boolean), m);
    await c3.close();
  }

  console.log('\n-- 8. the gate, and zero writes to MotoPress --');
  {
    const before = fs.readFileSync(STATE, 'utf8');
    const out = ajax('action=mphbac_staff_ready&nonce=nonce&room_type_id=1071&ready=1&seen=9999999999', { MPHBAC_GATE: 'closed' });
    check('A REQUEST WITHOUT THE STAFF GATE is refused: 403, empty body — nothing changes', out.status === 403 && out.body === '' && !out.nonce && fs.readFileSync(STATE, 'utf8') === before, out);
    const bad = ajax('action=mphbac_staff_ready&nonce=wrong&room_type_id=1071&ready=1&seen=9999999999');
    check('a forged or stale nonce: 403 (the board reloads its token) — nothing changes', bad.status === 403 && bad.nonce && fs.readFileSync(STATE, 'utf8') === before, bad);
    const get = ajax('action=mphbac_staff_ready&nonce=nonce&room_type_id=1071&ready=1&seen=9999999999', { MPHBAC_METHOD: 'GET' });
    check('a GET: 405 — nothing changes', get.status === 405 && fs.readFileSync(STATE, 'utf8') === before, get);
    const odd = ajax('action=mphbac_staff_ready&nonce=nonce&room_type_id=1071&ready=1&seen=abc');
    check('a malformed `seen`: 400 — nothing changes', odd.status === 400 && fs.readFileSync(STATE, 'utf8') === before, odd);
    const sql = fs.readFileSync(SQL, 'utf8').split('\n;;\n').map(s => s.trim()).filter(Boolean);
    const writes = sql.filter(s => /^(INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP|TRUNCATE)\b/i.test(s));
    check(`every SQL statement the board and the saves ran (${sql.length}) was a read — none wrote anything, MotoPress's tables included`, sql.length >= 10 && writes.length === 0, writes.slice(0, 3));
    const stored = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    check('what was stored is the plugin\'s own options only (mphbac_ready_<cottage>): a mark, its time, the log — no guest data',
      Object.keys(stored).every(k => /^mphbac_ready_\d+$/.test(k)) && !/name|guest|booking|Ann|Air/i.test(JSON.stringify(stored)), Object.keys(stored));
  }

  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  done();
})().catch(e => { console.error(e); fs.rmSync(TMP, { recursive: true, force: true }); process.exit(2); });
