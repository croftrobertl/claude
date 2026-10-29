'use strict';
/**
 * DCC Seasons — 4.13.3: the tom turning before the cornucopia, on the real
 * home page from the real engine (mocked clock): eight frames around his
 * turn, the bottom-left corner close up, at 1440 and 390.
 *
 *   node tools/tg-turn-strip.js [--out=file.png]
 */
const path = require('path');
const { config, open } = require('./harness');
const rt = require('./real-theme');
const OUT = (process.argv.find(a => a.startsWith('--out=')) || '').slice(6) || path.join(__dirname, '..', 'build', 'Seasons - 4.13.3 the tom turns before the cornucopia.png');
const SEED = n => `(() => { let a = ${n}; Math.random = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();`;

async function strip(w) {
  const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--diag']); cfg.forceHour = 12; cfg.vigFirst = 1e9;
  const h = w < 768 ? 844 : 900;
  const ses = await open(rt.page({ config: cfg }), { viewport: { width: w, height: h }, dsf: 2, init: SEED(3), ...rt.opts(w) });
  try {
    await ses.page.addStyleTag({ content: '.dcc-wx-banner{display:none!important}' });
    await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state && window.DCCSeasonsEngine._state.tom.done, null, { timeout: 30000 });
    /* run to just before the turn, then shoot every ~0.9 s across it */
    const at = await ses.page.evaluate(() => { const s = window.DCCSeasonsEngine._state; s.manual(true); let pd = 0;
      for (let i = 0; i < 30 * 400; i++) { s.tick(1000 / 30, 1); const t = s.parts.find(q => !q.dormant && q.b === 'forage'); if (t && pd && t.dir !== pd && t.x > 0 && t.x < s.vw) { return i; } if (t) { pd = t.dir; } }
      return -1; });
    if (at < 0) { throw new Error('no turn at ' + w); }
    await ses.page.close().catch(() => {});
  } finally { await ses.close(); }
  /* replay the same seed to 4 s before the turn and shoot from there */
  const ses2 = await open(rt.page({ config: cfg }), { viewport: { width: w, height: h }, dsf: 2, init: SEED(3), ...rt.opts(w) });
  const shots = [];
  try {
    await ses2.page.addStyleTag({ content: '.dcc-wx-banner,div[style*="2147482000"]{display:none!important}' });
    await ses2.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state && window.DCCSeasonsEngine._state.tom.done, null, { timeout: 30000 });
    let t0 = -1;
    t0 = await ses2.page.evaluate(() => { const s = window.DCCSeasonsEngine._state; s.manual(true); let pd = 0;
      for (let i = 0; i < 30 * 400; i++) { s.tick(1000 / 30, 1); const t = s.parts.find(q => !q.dormant && q.b === 'forage'); if (t) { const a = document.querySelector('.dcc-seasons-accent').getBoundingClientRect(); if (t.dir < 0 && t.x - a.right < 110) { return i; } } }
      return -1; });
    for (let k = 0; k < 8; k++) {
      shots.push(await ses2.page.screenshot({ type: 'png', clip: { x: 0, y: h - 130, width: Math.min(w, 420), height: 130 } }));
      await ses2.page.evaluate(() => { const s = window.DCCSeasonsEngine._state; for (let i = 0; i < 60; i++) { s.tick(1000 / 30, 1); } });
    }
  } finally { await ses2.close(); }
  return shots;
}

(async () => {
  const A = await strip(1440), B = await strip(390);
  const b64 = x => 'data:image/png;base64,' + x.toString('base64');
  const row = (t, s) => `<h2 style="text-align:center;font-size:18px;margin:18px 0 8px">${t}</h2><div style="display:grid;grid-template-columns:repeat(4,420px);gap:8px;justify-content:center">${s.map((x, i) => `<div><img src="${b64(x)}" style="width:420px;display:block;border:1px solid #bbb"><div style="text-align:center;font-size:12px;color:#666">${(i * 2).toFixed(0)} s</div></div>`).join('')}</div>`;
  const html = `<!doctype html><meta charset=utf-8><body style="margin:0;background:#f6f3ee;font:14px -apple-system,Segoe UI,sans-serif;color:#222;padding-bottom:20px">
  <h1 style="text-align:center;font-size:24px;margin:20px 0 2px">The Tom Turns Before the Cornucopia</h1>
  <p style="text-align:center;margin:0;color:#555">4.13.3 · the real home page · the bottom-left corner, every 2 s · he turns a stride plus 8 px out; his poults wait, pecking, while he passes, then follow</p>
  ${row('1440', A)}${row('390', B)}</body>`;
  const ses = await open(html, { viewport: { width: 1740, height: 900 }, dsf: 1 });
  await ses.page.screenshot({ path: OUT, fullPage: true });
  await ses.close();
  console.log(OUT);
})().catch(e => { console.error(e); process.exit(1); });
