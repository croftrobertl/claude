'use strict';
/**
 * DCC Seasons — render every sprite LARGE on a warm ground.
 *
 * Scene scale hides bad shapes. A sprite that is 20px on a page and moving
 * reads as "a bird"; the same sprite at 200px and still is either drawn or
 * it is not, and that is the only honest way to judge one. This extracts
 * the SVGS registry straight out of engine.js — including the procedural
 * entries, which are functions and are evaluated — substitutes the real
 * palette, and lays them out big enough to judge.
 *
 * Usage:
 *   node tools/sprite-sheet.js                 every sprite, paged
 *   node tools/sprite-sheet.js heron0 pelican  just these
 *   node tools/sprite-sheet.js --group=canal   a named group
 *
 * Output: build/Seasons - sprites <page>.png
 */
const fs = require('fs');
const path = require('path');
const { playwright } = require('./harness');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = path.join(ROOT, 'dcc-seasons', 'assets', 'js', 'engine.js');
const OUT = path.join(ROOT, 'build');

const GROUPS = {
  canal: ['manatee', 'heron0', 'heron1', 'heron2', 'heronstand', 'swan', 'pelican', 'pelican1', 'dragonfly', 'lilypad', 'kayak', 'skiff', 'bass', 'bobber'],
  patriotic: ['flagcloth', 'sparkler', 'dove', 'poppy', 'medal', 'sparkle', 'ribbon', 'eagle'],
  disputed: ['bottle', 'peel', 'lure', 'hands', 'stilts', 'letter1', 'letter0', 'bunnycarry', 'cornucopia', 'web', 'sleigh', 'ribbon'],
};

/* The palette and the registry are READ FROM THE ENGINE, never copied. A
 * copied palette is a copy that goes stale, and a contact sheet drawn in
 * stale colours is worse than none: it invites redrawing something that is
 * already right. */
function readEngine() {
  const src = fs.readFileSync(ENGINE, 'utf8');
  const palM = src.match(/var PAL = (\{[\s\S]*?\});/);
  if (!palM) throw new Error('could not find PAL in engine.js');
  const PAL = JSON.parse(palM[1]);

  const block = (src.match(/var SVGS = \{[\s\S]*?\n\t\};/) || [])[0];
  if (!block) throw new Error('could not find SVGS in engine.js');

  /* Evaluate the registry in a sandbox so the procedural entries (the
   * jack-o'-lanterns and the novelty plates) come out as markup like
   * everything else, instead of being silently skipped. plateSvg and
   * drawStar-style helpers are pulled in the same way. */
  const helpers = [];
  for (const m of src.matchAll(/\n\tfunction (plateSvg|jackSvg|[a-zA-Z]+Svg)\(([\s\S]*?)\n\t\}/g)) {
    helpers.push(m[0]);
  }
  const sandbox = `${helpers.join('\n')}\n${block}\nreturn SVGS;`;
  // eslint-disable-next-line no-new-func
  const SVGS = new Function(sandbox)();
  return { PAL, SVGS };
}

/* Which themes name each sprite, so a theme's set can be judged AS A SET.
 * Read from class-themes.php the same way the validator reads it: a sprite
 * reaches the screen through a theme particle list, an engine vignette, a
 * hero kind or the hardcoded accents map, and a sheet that only knew about
 * the first of those would label 19 sprites "unused" that are not. */
function themeIndex() {
  const php = fs.readFileSync(path.join(ROOT, 'dcc-seasons', 'includes', 'class-themes.php'), 'utf8');
  const js = fs.readFileSync(ENGINE, 'utf8');
  const fn = php.slice(php.indexOf('function themes()'), php.indexOf('function labels()'));
  const starts = [...fn.matchAll(/\n            '([a-z0-9_]+)' => \[/g)];
  const vars = new Map();
  for (const m of php.matchAll(/\$([a-z_]+)\s*=\s*\[([^\]]*)\];/g)) {
    vars.set(m[1], [...m[2].matchAll(/'([A-Za-z0-9_]+)'/g)].map(x => x[1]));
  }
  const idx = new Map();
  const add = (k, w) => { if (!idx.has(k)) idx.set(k, new Set()); idx.get(k).add(w); };
  for (let i = 0; i < starts.length; i++) {
    const name = starts[i][1];
    const body = fn.slice(starts[i].index, i + 1 < starts.length ? starts[i + 1].index : fn.length);
    for (const m of body.matchAll(/'s'\s*=>\s*'([A-Za-z0-9_]+)'/g)) add(m[1], name);
    for (const m of body.matchAll(/'s'\s*=>\s*\[([^\]]*)\]/g))
      [...m[1].matchAll(/'([A-Za-z0-9_]+)'/g)].forEach(x => add(x[1], name));
    for (const m of body.matchAll(/'s'\s*=>\s*\$([a-z_]+)/g))
      (vars.get(m[1]) || []).forEach(k => add(k, name));
    for (const m of body.matchAll(/'hero'\s*=>\s*'([a-z0-9_]+)'/g)) add(m[1], name + ' (hero)');
  }
  // Engine-side routes: accents map, vignette scenes, hero frames.
  const acc = (js.match(/var ACCENTS = \{[\s\S]*?\};/) || [''])[0];
  for (const m of acc.matchAll(/([a-z0-9_]+): \['([A-Za-z0-9_]+)'/g)) add(m[2], m[1] + ' (accent)');
  for (const m of js.matchAll(/\bdspr\('([A-Za-z0-9_]+)'/g)) add(m[1], 'vignette');
  for (const m of js.matchAll(/\bsprite\('([A-Za-z0-9_]+)'/g)) add(m[1], 'engine');
  for (const m of js.matchAll(/'([A-Za-z0-9_]+)' \+ /g)) {
    for (const k of Object.keys(JSON)) { /* noop, keeps lint quiet */ break; }
  }
  return idx;
}

function svgDoc(raw, PAL) {
  if (typeof raw === 'function') raw = raw();
  const cut = raw.indexOf('|');
  const box = raw.slice(0, cut);
  const body = raw.slice(cut + 1).replace(/%([a-x])/g, (m, k) => PAL[k] || '#f0f');
  return { box, body };
}

(async () => {
  const { PAL, SVGS } = readEngine();
  const args = process.argv.slice(2);
  const groupArg = args.find(a => a.startsWith('--group='));
  let names;
  if (groupArg) {
    names = GROUPS[groupArg.split('=')[1]] || [];
  } else if (args.length) {
    names = args;
  } else {
    names = Object.keys(SVGS);
  }
  names = names.filter(n => {
    if (!SVGS[n]) { console.log(`  (no such sprite: ${n})`); return false; }
    return true;
  });
  console.log(`rendering ${names.length} sprite(s)`);

  const ART = 170;  /* the long edge every sprite is scaled to */
  const CELL = 210; /* declared HERE: the cell map below reads it */
  const cells = names.map(n => {
    const { box, body } = svgDoc(SVGS[n], PAL);
    const [w, h] = box.split(/\s+/).map(Number);
    /* EXPLICIT width and height on the svg element. An inline <svg> is a
     * REPLACED element: with width:auto it takes its intrinsic size, and
     * under max-width/max-height it collapses to nothing. The first cut of
     * this sheet rendered 14 empty cells for exactly that reason — the same
     * trap that stopped the footer canvas rendering in 3.18.0. */
    const k = ART / Math.max(w, h);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box}" ` +
      `width="${Math.round(w * k)}" height="${Math.round(h * k)}">${body}</svg>`;
    const ks = ((CELL - 22) / 2 - 16) / Math.max(w, h);
    const svgSmall = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box}" ` +
      `width="${Math.round(w * ks)}" height="${Math.round(h * ks)}">${body}</svg>`;
    return { name: n, w, h, svg, svgSmall, kind: typeof SVGS[n] === 'function' ? 'procedural' : 'markup' };
  });

  const IDX = themeIndex();
  cells.forEach(c => {
    const w = IDX.get(c.name);
    c.where = w ? [...w].join(', ') : '';
  });
  const PER_PAGE = 18, COLS = 6;
  fs.mkdirSync(OUT, { recursive: true });
  const { chromium } = playwright();
  let browser;
  try {
    browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  } catch (e) {
    browser = await chromium.launch({
      executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
  }

  const pages = Math.ceil(cells.length / PER_PAGE);
  for (let p = 0; p < pages; p++) {
    const slice = cells.slice(p * PER_PAGE, (p + 1) * PER_PAGE);
    const rows = Math.ceil(slice.length / COLS);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      /* A warm ground, not white: white flatters a pale sprite and hides a
         muddy one, and most of these sit over a cream or photographic
         background in real use. */
      /* TWO grounds, not one. The effects run over a hero photograph,
         white body copy AND the navy footer, and a light sprite judged only
         on a warm cream ground looks fine right up until it disappears into
         the footer. swan, dove, ghost, snowflake and bobber are the ones
         this catches. */
      body { margin:0; background:#EFE6D8; font:13px/1.3 system-ui,sans-serif; color:#3B332A; }
      .grid { display:grid; grid-template-columns:repeat(${COLS},${CELL}px); }
      .cell { width:${CELL}px; display:flex; flex-direction:column;
              align-items:center; padding:10px 6px 8px;
              box-sizing:border-box; border:1px solid rgba(0,0,0,.07); }
      .pair { display:flex; gap:4px; }
      .art { width:${(CELL - 22) / 2}px; height:${(CELL - 22) / 2}px;
             display:flex; align-items:center; justify-content:center; border-radius:4px; }
      .art.light { background:#FFFFFF; }
      .art.dark  { background:#112233; }
      .art svg { display:block; }
      .nm { margin-top:6px; font-weight:600; }
      .sz { opacity:.55; font-size:11px; }
      .th { margin-top:3px; font-size:10px; line-height:1.25; opacity:.7; text-align:center;
            max-height:26px; overflow:hidden; }
      .pr { color:#8A5A00; font-size:10px; letter-spacing:.04em; }
    </style></head><body>
      <div class="grid">${slice.map(c => `
        <div class="cell">
          <div class="pair">
            <div class="art light">${c.svgSmall}</div>
            <div class="art dark">${c.svgSmall}</div>
          </div>
          <div class="nm">${c.name}</div>
          <div class="sz">${c.w}x${c.h}${c.kind === 'procedural' ? ' <span class="pr">PROC</span>' : ''}</div>
          <div class="th">${c.where || '<em>not referenced</em>'}</div>
        </div>`).join('')}</div>
    </body></html>`;

    const page = await browser.newPage({
      viewport: { width: COLS * CELL, height: rows * (CELL + 34) },
      deviceScaleFactor: 2,
    });
    await page.setContent(html, { waitUntil: 'load' });
    const file = path.join(OUT, `Seasons - sprites ${p + 1} of ${pages}.png`);
    await page.screenshot({ path: file, fullPage: true });
    await page.close();
    console.log('  ' + file);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
