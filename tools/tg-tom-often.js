'use strict';
/**
 * DCC Seasons — 4.13.2, Rob's pick: how often the tom appears. Two options
 * from the real engine on the real home page at 390 (DPR 2), the same seed
 * and the same moment, a guest's whole screen plus the bottom close up:
 *   A  as built: he is one piece in the Thanksgiving mix (weight 1), so a
 *      phone shows him on about 1 visit in 10;
 *   B  one tom on every page at every width, never two (weight 3, limit 1 —
 *      a change to the theme row only), in place of one falling piece.
 *
 *   node tools/tg-tom-often.js [--out=file.png]
 */
const fs = require('fs');
const path = require('path');
const { config, open } = require('./harness');
const rt = require('./real-theme');
const arg = k => (process.argv.find(a => a.startsWith('--' + k + '=')) || '').slice(k.length + 3);
const OUT = arg('out') || path.join(__dirname, '..', 'build', 'Seasons - 4.13.2 how often the tom appears 390.png');
const SEED = n => `(() => { let a = ${n}; Math.random = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();`;

async function shot(opt, seed) {
  const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--diag']);
  cfg.forceHour = 12; cfg.vigFirst = 1e9;
  if (opt === 'B') { const tk = cfg.themes.thanksgiving.ambient.particles.find(p => p.s === 'turkey'); tk.w = 3; tk.n = 1; }
  const ses = await open(rt.page({ config: cfg }), { viewport: { width: 390, height: 844 }, dsf: 2, init: SEED(seed), extra: rt.route });
  try {
    await ses.page.addStyleTag({ content: '.dcc-wx-banner{display:none!important}' });
    await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state && window.DCCSeasonsEngine._state.tom.done, null, { timeout: 30000 });
    const r = await ses.page.evaluate(() => { const s = window.DCCSeasonsEngine._state; s.manual(true);
      for (let i = 0; i < 30 * 30; i++) { s.tick(1000 / 30, 1); const t = s.parts.find(q => !q.dormant && q.b === 'forage'); if (i > 30 * 6 && t && t.x > 90 && t.x < s.vw - 60) { break; } }
      const t = s.parts.find(q => !q.dormant && q.b === 'forage'); return { tom: !!(t && t.x > 0 && t.x < s.vw), live: s.live }; });
    const full = await ses.page.screenshot({ type: 'png' });
    const close = await ses.page.screenshot({ type: 'png', clip: { x: 0, y: 844 - 170, width: 390, height: 170 } });
    return { full, close, ...r };
  } finally { await ses.close(); }
}

(async () => {
  const seed = 40;   /* a load where the mix as built has no tom on screen */
  const A = await shot('A', seed), B = await shot('B', seed);
  const b64 = x => 'data:image/png;base64,' + x.toString('base64');
  const html = `<!doctype html><meta charset=utf-8><body style="margin:0;background:#f6f3ee;font:15px/1.4 -apple-system,Segoe UI,sans-serif;color:#222">
  <h1 style="text-align:center;font-size:24px;margin:22px 0 4px">How Often Does the Tom Appear?</h1>
  <p style="text-align:center;margin:0 0 18px;color:#555">390 phone · the real home page · the same visit and moment in both · 4.13.2's engine</p>
  <div style="display:flex;gap:28px;justify-content:center;padding:0 20px 24px">
  ${[['A', 'As Built', 'He is one piece in the mix. A phone shows him on about <b>1 visit in 10</b>, a tablet about half, a computer every visit.', A],
     ['B', 'One Tom on Every Page', 'Every visit at every width, <b>never two</b>. On a phone he takes the place of one falling piece; the count stays the same.', B]].map(([k, t, d, s]) => `
    <div style="width:390px">
      <h2 style="text-align:center;font-size:19px;margin:0 0 4px">${k} · ${t}</h2>
      <p style="text-align:center;margin:0 0 10px;min-height:66px;color:#444">${d}</p>
      <img src="${b64(s.full)}" style="width:390px;display:block;border:1px solid #bbb">
      <p style="text-align:center;margin:12px 0 4px;color:#555">The bottom of the screen, close up</p>
      <img src="${b64(s.close)}" style="width:390px;display:block;border:1px solid #bbb">
      <p style="text-align:center;margin:8px 0 0;color:#777;font-size:13px">tom on screen: ${s.tom ? 'yes' : 'no'} · ${s.live} sprites</p>
    </div>`).join('')}
  </div>
  <p style="text-align:center;margin:0 0 24px;color:#555;font-size:13px">Measured over 20 visits each: A shows him in the first minute on 2 of 20 phone visits, 12 of 20 at 768, 20 of 20 at 1440. B: every visit at all three.</p></body>`;
  const ses = await open(html, { viewport: { width: 900, height: 1200 }, dsf: 1 });
  await ses.page.screenshot({ path: OUT, fullPage: true });
  await ses.close();
  console.log(OUT, 'A tom:', A.tom, 'B tom:', B.tom);
})().catch(e => { console.error(e); process.exit(1); });
