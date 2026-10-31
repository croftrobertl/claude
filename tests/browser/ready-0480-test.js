'use strict';
/**
 * 0.48.0 — THE CLEANING DOT ON /staff/ (Rob): red = not ready, green = ready.
 *
 * End to end on the staff page as live renders it: tests/render/render.php
 * renders page 18102's widget (afeefb0) from live's export, and every request
 * the board makes goes to the plugin's own handlers (tests/render/ajax.php:
 * Staff::handle_month / handle_ready) over fixture-0474.php's "staff" site —
 * a direct stay and an Airbnb stay out today, a dock block, a cancelled and a
 * pending booking out today, a stay out 3 days ago, one 15 days ago, one out
 * tomorrow. The dot state is the plugin's own option, kept in a file between
 * requests. Chromium with touch emulation stands in for an iPhone (WebKit
 * cannot be installed here); the long press is real touch events through the
 * DevTools protocol.
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

function ajax(body, env = {}) {
  const r = spawnSync('php', [path.resolve(__dirname, '../render/ajax.php'), site.HERE, body], {
    encoding: 'utf8', maxBuffer: 64 << 20,
    env: { ...process.env, MPHBAC_FIXTURE_0474: 'staff', MPHBAC_STATE: STATE, MPHBAC_SQL_LOG: SQL, ...env },
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
<div class="elementor elementor-${post}"><div class="elementor-element elementor-element-${wid} elementor-widget elementor-widget-${r.type}">
<div class="elementor-widget-container">${r.html}</div></div></div>
<script>${S.staffJsShipped().replace(/<\/script/gi, '<\\/script')}</script>
</body></html>`;
}

async function open(browser, width, opts = {}) {
  const r = site.render(site.HERE, CASE, 'staff');
  const touch = width < 1000;
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: touch, isMobile: touch, deviceScaleFactor: opts.scale || 1, reducedMotion: 'reduce' });
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
const dots = p => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.mphbac-staff-rowlabel[data-type]')].map(l => {
  const d = l.querySelector('.mphbac-staff-ready');
  return [l.dataset.type, d ? (d.classList.contains('is-ready') ? 'green' : 'red') : 'none'];
})));
const popup = p => p.evaluate(() => {
  const pop = document.querySelector('.mphbac-staff-readypop');
  const b = pop && pop.querySelector('button');
  const r = b ? b.getBoundingClientRect() : null;
  return { open: !!pop && !pop.hidden, text: b ? b.textContent : '', w: r ? r.width : 0, h: r ? r.height : 0,
    inView: r ? r.left >= 0 && r.right <= document.documentElement.clientWidth && r.top >= 0 && r.bottom <= innerHeight : false };
});

/** A real long press: touch events through CDP, held `ms`. */
async function longPress(p, sel, ms = 650) {
  const b = await p.locator(sel).boundingBox();
  const x = b.x + Math.min(24, b.width / 2), y = b.y + b.height / 2;
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await p.waitForTimeout(ms);
  const mid = await popup(p);
  const sel1 = await p.evaluate(() => String(window.getSelection()));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(150);
  return { mid, selection: sel1 };
}
async function tapButton(p) {
  const b = await p.locator('.mphbac-staff-readypop button').boundingBox();
  await p.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
}

(async () => {
  const browser = await chromium.launch(H.CHROMIUM);
  const want0 = { 1071: 'red', 1069: 'red', 1067: 'none', 1065: 'none', 1604: 'red', 1607: 'none', 1740: 'none', 1742: 'none' };
  const same = (a, b) => Object.keys(b).every(k => a[k] === b[k]);

  console.log('-- 1. the dots as the board opens (390px, touch) --');
  {
    try { fs.unlinkSync(STATE); } catch (e) {}
    const { ctx, p } = await open(browser, 390);
    const d = await dots(p);
    check('RED on the day a guest checks out: a DIRECT stay (Boathouse) and an AIRBNB (iCal) stay (Lighthouse)', d[1071] === 'red' && d[1069] === 'red', d);
    check('...and still red 3 days after a checkout nobody marked (Pineapple)', d[1604] === 'red', d);
    check('NO DOT for a DOCK BLOCK out today (Hibiscus — its last real stay, 20 days back, is past the 14 days)', d[1067] === 'none', d);
    check('no dot for a CANCELLED or a PENDING booking out today, a checkout 15 days back, or one out TOMORROW', d[1065] === 'none' && d[1607] === 'none' && d[1740] === 'none' && d[1742] === 'none', d);
    const a11y = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-rowlabel.has-ready')].map(l => [l.getAttribute('role'), l.getAttribute('aria-label'), l.tabIndex]));
    check('A SCREEN READER HEARS IT: each dotted name is a button named "Cottage 22: Not ready" (and so on)', a11y.length === 3 && a11y.every(([r, n, t]) => r === 'button' && /^Cottage \d+: Not ready$/.test(n) && t === 0), a11y);
    const body = await p.evaluate(() => document.querySelector('.mphbac-staff').textContent);
    check('no message, no popup at load', !(await popup(p)).open && !/Could not save/.test(body));
    const bare = await p.evaluate(sel => { const l = document.querySelector(sel); return { role: l.getAttribute('role'), tab: l.getAttribute('tabindex') }; }, label(1067));
    check('a name with no dot is not a button and takes no focus (nothing to mark)', bare.role === null && bare.tab === null, bare);

    console.log('\n-- 2. hold the name, tap Ready --');
    const lp = await longPress(p, label(1071));
    check('A LONG PRESS (0.65s) opens the popup while the finger is still down: one button, "Ready"', lp.mid.open && lp.mid.text === 'Ready', lp.mid);
    check('...a large tap target (at least 44px tall), fully on screen', lp.mid.h >= 44 && lp.mid.w >= 100 && lp.mid.inView, lp.mid);
    check('NO TEXT SELECTED by the long press', lp.selection === '', lp.selection);
    // Chromium does not keep -webkit-touch-callout in its computed style (an
    // iOS-only property), so the stylesheet's own rule is read for it.
    const ios = await p.evaluate(sel => getComputedStyle(document.querySelector(sel)).userSelect, label(1071));
    const rule = (S.cssCode().match(/\.mphbac-staff-rowlabel\.has-ready\s*\{([^}]*)\}/) || [])[1] || '';
    check('...and iOS is told so: -webkit-touch-callout: none and -webkit-user-select: none in the name\'s rule, user-select: none computed',
      ios === 'none' && /-webkit-touch-callout:\s*none/.test(rule) && /-webkit-user-select:\s*none/.test(rule), [ios, rule.trim()]);
    check('the finger lifting from the long press did not tap the button (nothing sent)', (await popup(p)).open && p.__ready.length === 0, p.__ready);
    const clear = await p.evaluate(sel => {
      const a = document.querySelector(sel).getBoundingClientRect(), b = document.querySelector('.mphbac-staff-readypop').getBoundingClientRect();
      return b.left >= a.right || b.right <= a.left || b.top >= a.bottom || b.bottom <= a.top;
    }, label(1071));
    check('...because the popup opens BESIDE the name, never over it (the finger is on the name)', clear);
    p.__holdReady = 700;
    await tapButton(p);
    await p.waitForTimeout(80);
    let d1 = await dots(p);
    check('TAP Ready: the dot is GREEN AT ONCE, before the server answers', d1[1071] === 'green' && p.__ready.length === 0, d1);
    await p.waitForTimeout(1000);
    d1 = await dots(p);
    check('...and confirmed: the save answered 200 and the dot stays green', p.__ready.length === 1 && p.__ready[0].status === 200 && d1[1071] === 'green', p.__ready);
    check('...the request carried the cottage, the checkout date and nothing about the guest', /room_type_id=1071/.test(p.__ready[0].body) && /checkout=\d{4}-\d{2}-\d{2}/.test(p.__ready[0].body) && /ready=1/.test(p.__ready[0].body) && !/name|guest/i.test(p.__ready[0].body), p.__ready[0].body);
    const g = await p.evaluate(sel => { const d = document.querySelector(sel + ' .mphbac-staff-ready'); return [getComputedStyle(d, '::after').content, d.getAttribute('aria-label')]; }, label(1071));
    check('green carries a tick too (not colour alone), and reads "Ready"', g[0] !== 'none' && g[1] === 'Ready', g);
    p.__holdReady = 0;

    console.log('\n-- 3. undo: hold again, Not Ready --');
    const lp2 = await longPress(p, label(1071));
    check('the same long press on a GREEN dot offers "Not Ready" instead — still one button', lp2.mid.open && lp2.mid.text === 'Not Ready', lp2.mid);
    await tapButton(p);
    await p.waitForTimeout(800);
    check('TAP Not Ready: red again, and saved', (await dots(p))[1071] === 'red' && p.__ready.length === 2 && p.__ready[1].status === 200 && /ready=0/.test(p.__ready[1].body));

    console.log('\n-- 4. a save that fails --');
    await longPress(p, label(1069));
    p.__failReady = true;
    p.__holdReady = 400;                     // the failure answers after 0.4s, as a slow network's would
    await tapButton(p);
    await p.waitForTimeout(50);
    const mid = (await dots(p))[1069];
    await p.waitForTimeout(500);
    const after = await p.evaluate(() => ({ status: document.querySelector('.mphbac-staff-status').textContent, err: document.querySelector('.mphbac-staff-status').classList.contains('is-error') }));
    check('the dot turns green at once, then GOES BACK to red when the save fails', mid === 'green' && (await dots(p))[1069] === 'red', mid);
    check('...and says so: "Could not save. Please try again." in the board\'s status line', after.status === 'Could not save. Please try again.' && after.err, after);
    p.__failReady = false;
    p.__holdReady = 0;
    await p.evaluate(() => { document.querySelector('.mphbac-staff-status').textContent = ''; });
    // The server refusing (its JSON answer, as when a save does not stick):
    // the other way a save fails.
    await longPress(p, label(1069));
    p.__failJson = true;
    await tapButton(p);
    await p.waitForTimeout(600);
    const said = await p.evaluate(() => document.querySelector('.mphbac-staff-status').textContent);
    check('a save the SERVER refuses (500, "Could not save…" in its answer): the dot goes back and says so too',
      (await dots(p))[1069] === 'red' && said === 'Could not save. Please try again.', said);
    p.__failJson = false;
    const stored = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    check('...nothing was stored for it (only the Boathouse\'s two changes are)', !stored.mphbac_ready_1069 && stored.mphbac_ready_1071, Object.keys(stored));
    check('THE QUIET RECORD: each change is logged with its time (ready, then not ready)',
      JSON.stringify((Object.values(stored.mphbac_ready_1071)[0].log || []).map(x => x[1])) === '[1,0]' && Object.values(stored.mphbac_ready_1071)[0].log.every(x => Math.abs(x[0] * 1000 - Date.now()) < 120000), stored.mphbac_ready_1071);
    check('no page errors', p.__errors.length === 0, p.__errors);
    await ctx.close();
  }

  console.log('\n-- 5. desktop (1440px): a right-click, a long click, the keyboard --');
  {
    const { ctx, p } = await open(browser, 1440);
    await p.click(label(1604), { button: 'right' });
    await p.waitForTimeout(150);
    let pp = await popup(p);
    check('A RIGHT-CLICK on the name opens the same popup (not the browser\'s menu): "Ready"', pp.open && pp.text === 'Ready', pp);
    await p.click('.mphbac-staff-readypop button');
    await p.waitForTimeout(800);
    check('...a click on Ready: green, saved', (await dots(p))[1604] === 'green' && p.__ready.length === 1 && p.__ready[0].status === 200);
    const b = await p.locator(label(1069)).boundingBox();
    await p.mouse.move(b.x + 20, b.y + b.height / 2);
    await p.mouse.down();
    await p.waitForTimeout(650);
    pp = await popup(p);
    await p.mouse.up();
    check('A LONG CLICK (held 0.65s) opens it too', pp.open && pp.text === 'Ready', pp);
    const sel = await p.evaluate(() => String(window.getSelection()));
    check('...selecting no text', sel === '', sel);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(100);
    check('Escape closes it, and nothing was sent', !(await popup(p)).open && p.__ready.length === 1);
    await p.focus(label(1069));
    await p.keyboard.press('Enter');
    await p.waitForTimeout(150);
    const f = await p.evaluate(() => document.activeElement && document.activeElement.textContent);
    check('KEYBOARD: Enter on a dotted name opens the popup with the button focused', (await popup(p)).open && f === 'Ready', f);
    await p.keyboard.press('Enter');
    await p.waitForTimeout(800);
    check('...and Enter on Ready marks it: green, saved', (await dots(p))[1069] === 'green' && p.__ready.length === 2);
    const quick = await p.evaluate(() => 1);
    void quick;
    // A click held 0.3s — a deliberate click, not a hold — does nothing.
    const b2 = await p.locator(label(1071)).boundingBox();
    await p.mouse.move(b2.x + 20, b2.y + b2.height / 2);
    await p.mouse.down();
    await p.waitForTimeout(300);
    await p.mouse.up();
    await p.waitForTimeout(500);
    check('an ordinary click on a name (held 0.3s) opens nothing — it takes about half a second', !(await popup(p)).open);
    check('no page errors', p.__errors.length === 0, p.__errors);
    await ctx.close();
  }

  console.log('\n-- 6. another phone sees it; refused without the gate --');
  {
    const { ctx, p } = await open(browser, 768);
    const d = await dots(p);
    check('a fresh page (another phone, 768px) reads the saved state: Pineapple and Lighthouse green, Boathouse red',
      d[1604] === 'green' && d[1069] === 'green' && d[1071] === 'red', d);
    await ctx.close();
    const before = fs.readFileSync(STATE, 'utf8');
    const out = ajax('action=mphbac_staff_ready&nonce=nonce&room_type_id=1071&checkout=' + JSON.parse(ajax('action=mphbac_staff_month&nonce=nonce&from=2026-01-01&to=2026-12-31').body).data.turnover[1071].checkout + '&ready=1', { MPHBAC_GATE: 'closed' });
    check('A REQUEST WITHOUT THE STAFF GATE is refused: 403, empty body', out.status === 403 && out.body === '' && !out.nonce, out);
    check('...and changes nothing', fs.readFileSync(STATE, 'utf8') === before);
    const bad = ajax('action=mphbac_staff_ready&nonce=wrong&room_type_id=1071&checkout=2026-10-01&ready=1');
    check('a stale or forged nonce: 403 (the board reloads its token), nothing changed', bad.status === 403 && bad.nonce && fs.readFileSync(STATE, 'utf8') === before, bad);
    const get = ajax('action=mphbac_staff_ready&nonce=nonce&room_type_id=1071&checkout=2026-10-01&ready=1', { MPHBAC_METHOD: 'GET' });
    check('a GET: 405, nothing changed', get.status === 405 && fs.readFileSync(STATE, 'utf8') === before, get);
  }

  console.log('\n-- 7. zero writes to MotoPress --');
  {
    const sql = fs.readFileSync(SQL, 'utf8').split('\n;;\n').map(s => s.trim()).filter(Boolean);
    const writes = sql.filter(s => /^(INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP|TRUNCATE)\b/i.test(s));
    check(`every SQL statement the board and the saves ran (${sql.length}) was a read — no INSERT, UPDATE or DELETE anywhere, MotoPress's tables included`,
      sql.length >= 10 && writes.length === 0, writes.slice(0, 3));
    const stored = Object.keys(JSON.parse(fs.readFileSync(STATE, 'utf8')));
    check('what was stored is the plugin\'s own options only: mphbac_ready_<cottage>', stored.length > 0 && stored.every(k => /^mphbac_ready_\d+$/.test(k)), stored);
  }

  console.log('\n-- 8. widths: 390, 768, 1440 --');
  for (const w of [390, 768, 1440]) {
    const { ctx, p } = await open(browser, w, { scale: 2 });
    const m = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-rowlabel.has-ready')].map(l => {
      const d = l.querySelector('.mphbac-staff-ready').getBoundingClientRect(), r = l.getBoundingClientRect();
      return { inside: d.left >= r.left && d.right <= r.right && d.top >= r.top && d.bottom <= r.bottom, w: d.width, lh: r.height };
    }));
    check(`${w}px: every dot sits inside its name cell, 13px, the cell at least 44px tall to hold`, m.length > 0 && m.every(x => x.inside && x.w === 13 && x.lh >= 44), m);
    if (w < 1000) await longPress(p, label(1071)); else await p.click(label(1071), { button: 'right' });
    await p.waitForTimeout(150);
    const pp = await popup(p);
    check(`${w}px: the popup opens on screen, its button ${pp.w.toFixed(0)}×${pp.h.toFixed(0)}`, pp.open && pp.inView && pp.h >= 44, pp);
    if (OUT) {
      fs.mkdirSync(OUT, { recursive: true });
      const box = await p.locator('.mphbac-staff-chart').boundingBox();
      await p.screenshot({ path: path.join(OUT, `ready-${w}.png`), clip: { x: 0, y: Math.max(0, box.y - 10), width: w, height: Math.min(560, box.height + 20) } });
    }
    check(`${w}px: no page errors`, p.__errors.length === 0, p.__errors);
    await ctx.close();
  }

  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  done();
})().catch(e => { console.error(e); fs.rmSync(TMP, { recursive: true, force: true }); process.exit(2); });
