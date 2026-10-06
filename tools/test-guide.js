'use strict';
/**
 * DCC Seasons — the Theme guide tab and the preview links (4.4.0).
 *
 * Renders the REAL settings page (tools/render-settings.php) and checks:
 *   - one card per theme, in calendar order, unscheduled themes last and
 *     labelled; each with a full new-tab preview link;
 *   - every picture has a name (alt / aria-label), and no name is a raw
 *     engine key — i.e. Theme_Guide::names() covers everything shown;
 *   - "Switched off in Settings" tags follow the real gates: with Ambient
 *     off (live, 2026-10-06) every engine-drawn layer is tagged and the egg
 *     is not; with everything on, nothing is tagged; no "none" anywhere;
 *   - the guide's assets load on its tab only, and the front end never
 *     enqueues them;
 *   - the Theme preview table and description use full new-tab links.
 *
 * Usage: node tools/test-guide.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { playwright, ROOT } = require('./harness');

const TMP = path.join(process.env.SCRATCH || require('os').tmpdir(), 'dcc-guide-test');
fs.mkdirSync(TMP, { recursive: true });
let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}
function render(tab, opt) {
  const of = path.join(TMP, `opt-${tab}.json`);
  fs.writeFileSync(of, JSON.stringify(opt));
  const html = execFileSync('php', [path.join(__dirname, 'render-settings.php'), `--tab=${tab}`, `--opt=${of}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  const f = path.join(TMP, `${tab}-${Object.values(opt).join('')}.html`);
  fs.writeFileSync(f, html);
  return { f, html };
}
const LIVE = { enabled: 1, ambient: 0, egg: 1, subtle: 1, density: 16, opacity: 1, layering: 'front', placement: 'content', richness: 'full' };
const ALLON = { ...LIVE, ambient: 1 };

(async () => {
  const { chromium } = playwright();
  let b;
  try { b = await chromium.launch({ args: ['--no-sandbox'] }); }
  catch (e) { b = await chromium.launch({ args: ['--no-sandbox'], executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); }
  const engine = fs.readFileSync(path.join(ROOT, 'dcc-seasons/assets/js/engine.js'), 'utf8');
  const svgKeys = new Set([...engine.matchAll(/\n\t\t([A-Za-z0-9_]+): (?:'|function)/g)].map(m => m[1]));

  async function load(f, width) {
    const p = await b.newPage({ viewport: { width, height: 900 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('file://' + f); await p.waitForTimeout(700);
    return { p, errs };
  }

  console.log('\n  --- the guide, live settings (Ambient off) ---');
  const live = render('guide', LIVE);
  {
    const { p, errs } = await load(live.f, 1280);
    ok(!errs.length, 'no page errors', errs.join(' | '));
    /* the pictures are loading="lazy": load them all before judging them */
    await p.evaluate(() => Promise.all([...document.querySelectorAll('.dcc-guide-card img')].map(i => { i.loading = 'eager'; return i.decode().catch(() => null); })));
    const r = await p.evaluate(() => {
      const D = window.DCCSeasonsGuideData;
      const cards = [...document.querySelectorAll('.dcc-guide-card')];
      return {
        nThemes: Object.keys(D.labels).length,
        ids: cards.map(c => c.id.replace('dcc-guide-', '')),
        firsts: cards.map(c => { const r = D.runs[c.id.replace('dcc-guide-', '')]; return r && r.length ? r[0][0] : null; }),
        unsched: cards.filter(c => c.querySelector('.dcc-guide-unsched')).map(c => c.id.replace('dcc-guide-', '')),
        links: cards.map(c => { const a = c.querySelector('.dcc-guide-preview a'); return a && { href: a.href, t: a.target, rel: a.rel, text: a.textContent }; }),
        pics: [...document.querySelectorAll('.dcc-guide-card img, .dcc-guide-card canvas, .dcc-guide-card [role=img]')].map(n => n.getAttribute('alt') || n.getAttribute('aria-label') || ''),
        imgsBroken: [...document.querySelectorAll('.dcc-guide-card img')].filter(i => !i.complete || !i.naturalWidth).length,
        text: document.querySelector('#dcc-seasons-guide').innerText,
        secs: cards.map(c => [...c.querySelectorAll('.dcc-guide-sec')].map(s => ({ label: s.querySelector('.dcc-guide-label').firstChild.textContent, off: !!s.querySelector('.dcc-guide-off') }))),
        note: (document.querySelector('.dcc-guide-note') || {}).textContent || '',
        turns: (document.querySelector('#dcc-guide-earth_day') || { innerText: '' }).innerText,
        newyears: document.querySelectorAll('.dcc-guide-card')[0].innerText,
      };
    });
    ok(r.ids.length === r.nThemes && r.nThemes === 27, `one card per theme (${r.ids.length} of ${r.nThemes})`, r.ids.join(','));
    ok(r.ids[0] === 'new_years', 'New Year\'s first', r.ids[0]);
    const sched = r.firsts.filter(Boolean);
    ok(sched.every((d, i) => i === 0 || sched[i - 1] <= d), 'scheduled themes in calendar order', sched.join(' '));
    const firstNull = r.firsts.indexOf(null);
    ok(firstNull < 0 || r.firsts.slice(firstNull).every(x => x === null), 'unscheduled themes last', r.firsts.join(' '));
    ok(r.unsched.length === r.firsts.filter(x => x === null).length && r.unsched.length >= 1, `unscheduled labelled "Not scheduled" (${r.unsched.join(', ')})`, JSON.stringify(r.unsched));
    ok(r.links.every((l, i) => l && l.href === `https://doracanalcourt.com/?dcc_season=${r.ids[i]}` && l.text === l.href && l.t === '_blank' && /noopener/.test(l.rel)), 'every card: full preview URL, new tab, rel=noopener', JSON.stringify(r.links.slice(0, 2)));
    const unnamed = r.pics.filter(n => !n.trim());
    ok(r.pics.length > 300 && !unnamed.length, `every picture has a name (${r.pics.length} pictures)`, `${unnamed.length} without`);
    const raw = [...new Set(r.pics.filter(n => svgKeys.has(n) || /^[a-z0-9_]+$/.test(n)))];
    ok(!raw.length, 'no picture falls back to a raw engine key (names() covers all)', raw.join(', '));
    ok(!r.imgsBroken, 'every sprite image decodes', `${r.imgsBroken} broken`);
    ok(!/\bnone\b/i.test(r.text.replace(/None \(heron/g, '')), 'never prints "none"', (r.text.match(/.{20}\bnone\b.{20}/i) || [''])[0]);
    const engineLabels = ['Falling and drifting', 'Boats and birds', 'Background layer', 'Corner accent', 'Scenes', 'Hero', 'Special'];
    const bad = [];
    r.secs.forEach((ss, i) => ss.forEach(s => {
      const want = s.label === 'Logo egg' ? false : engineLabels.includes(s.label);
      if (s.off !== want) { bad.push(`${r.ids[i]}:${s.label}`); }
    }));
    ok(!bad.length, 'Ambient off: every engine layer tagged "Switched off in Settings", the egg not', bad.slice(0, 6).join(' '));
    ok(/Ambient particles/.test(r.note) && /background layer/.test(r.note), 'a notice says why every engine layer is off', r.note.slice(0, 80));
    ok(/45 s each/.test(r.turns) && /Hands holding the Earth|hands holding the earth/.test(r.turns), 'Earth Day shows its 45-second hands/globe turns', r.turns.slice(0, 120));
    ok(/countdown/.test(r.newyears), 'New Year\'s shows its midnight countdown', '');
    await p.close();
  }

  console.log('\n  --- the guide, everything on ---');
  {
    const on = render('guide', ALLON);
    const { p, errs } = await load(on.f, 1280);
    ok(!errs.length, 'no page errors', errs.join(' | '));
    const r = await p.evaluate(() => ({ off: document.querySelectorAll('.dcc-guide-off').length, note: !!document.querySelector('.dcc-guide-note'),
      keys: (document.querySelector('#dcc-guide-florida_keys') || { innerText: '' }).innerText }));
    ok(r.off === 0 && !r.note, 'no "Switched off" tags and no notice', `${r.off} tags`);
    ok(/Osprey carrying a fish/.test(r.keys) && /Jon boat/.test(r.keys) && /White ibis/.test(r.keys) && !/Sun in sunglasses/.test(r.keys), 'Florida Keys card: osprey, jon boat, ibis, no sun-in-sunglasses', r.keys.slice(0, 160));
    await p.close();
  }

  console.log('\n  --- phone width ---');
  {
    const { p } = await load(live.f, 390);
    const r = await p.evaluate(() => {
      const cards = [...document.querySelectorAll('.dcc-guide-card')].map(c => c.getBoundingClientRect());
      return { oneCol: cards.every(c => Math.abs(c.left - cards[0].left) < 1), sw: document.documentElement.scrollWidth };
    });
    ok(r.oneCol, 'cards stack in one column at 390px', '');
    ok(r.sw <= 390, 'no sideways scroll at 390px', `scrollWidth ${r.sw}`);
    await p.close();
  }

  console.log('\n  --- assets: the guide tab only ---');
  {
    const s = render('settings', LIVE).html, g = live.html;
    ok(/theme-guide\.js/.test(g) && /theme-guide\.css/.test(g) && /engine\.min\.js/.test(g), 'guide tab loads theme-guide.js, theme-guide.css and the engine', '');
    ok(!/theme-guide|DCCSeasonsGuideData|engine(\.min)?\.js/.test(s), 'settings tab loads none of them', '');
    const plugin = fs.readFileSync(path.join(ROOT, 'dcc-seasons/includes/class-plugin.php'), 'utf8');
    ok(!/theme-guide|Theme_Guide::enqueue/.test(plugin), 'the front end never enqueues the guide', '');
    const links = [...s.matchAll(/<a href="([^"]+)" target="_blank" rel="noopener">([^<]+)<span class="screen-reader-text">/g)];
    const keys = Object.keys(JSON.parse(execFileSync('php', [path.join(__dirname, 'gen-config.php')], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 << 20 })).themes);
    const want = new Set([...keys, 'off', 'halloween'].map(k => `https://doracanalcourt.com/?dcc_season=${k}`));
    const got = new Set(links.map(m => m[1]));
    ok(links.every(m => m[1] === m[2]) && [...want].every(u => got.has(u)), `preview table + description: full new-tab links for every theme and "off" (${links.length} links)`, [...want].filter(u => !got.has(u)).join(' '));
    ok(!/<code>\?dcc_season=/.test(s), 'no bare ?dcc_season= text cells left', '');
  }

  await b.close();
  console.log(`\n${pass} passed · ${fail} failed`);
  if (fail) { console.log(problems.map(x => '  - ' + x).join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
