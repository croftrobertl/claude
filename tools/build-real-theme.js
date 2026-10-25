'use strict';
/**
 * DCC Seasons — capture the REAL home page as a standing test fixture
 * (the Director, 2026-10-25: "your fixture's title sat at y≈286; the real
 * title is at y≈115–235, with a tagline and a menu bar your fixture
 * didn't have").
 *
 * Loads the live home page in Chromium at 1440 wide, waits for its own
 * scripts (the header's tagline, menu, Sun-on-the-Canal dial and Hero
 * Effects layers are partly written by script), and saves the RENDERED
 * DOM with:
 *   - every <script> removed, and everything Seasons itself put on the
 *     page removed (its canvases, accent, diagnostics, config and loader)
 *     — the suites add the build under test;
 *   - every stylesheet the page loaded, fetched and saved locally IN ITS
 *     PLACE in the cascade (assets/sheet-NN.css), its fonts saved locally;
 *   - the header picture's own images saved locally; every other image
 *     (cottage cards and the like) served as a neutral placeholder, which
 *     keeps its box because the theme sizes it.
 *
 *   node tools/build-real-theme.js [--url=https://doracanalcourt.com/] [--date=2026-10-25]
 *
 * Writes tests/real-theme/: real-home.html, assets/,
 * and capture.json (the URL, the date, and what was dropped).
 * tools/real-theme.js serves it to the suites.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { playwright } = require('./harness');

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const URL0 = arg('url', 'https://doracanalcourt.com/');
const DATE = arg('date', new Date().toISOString().slice(0, 10));
const OUT = path.resolve(__dirname, '..', 'tests', 'real-theme');
const ASSETS = path.join(OUT, 'assets');

(async () => {
  fs.mkdirSync(ASSETS, { recursive: true });
  const { chromium } = playwright();
  const o = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  if (process.env.HTTPS_PROXY) { o.proxy = { server: process.env.HTTPS_PROXY }; }
  let browser;
  try { browser = await chromium.launch(o); }
  catch (e) { browser = await chromium.launch({ ...o, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); }
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL0, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(5000);

  /* fetch every stylesheet in the page's own context, in document order */
  const sheets = await page.evaluate(async () => {
    const out = [];
    for (const l of document.querySelectorAll('link[rel~="stylesheet"]')) {
      try { const r = await fetch(l.href); out.push({ href: l.href, media: l.media || '', css: await r.text() }); }
      catch (e) { out.push({ href: l.href, media: l.media || '', css: '', err: String(e) }); }
    }
    return out;
  });

  /* the rendered DOM, minus scripts and minus Seasons */
  const dom = await page.evaluate(() => {
    const root = document.documentElement.cloneNode(true);
    const drop = [];
    /* each stylesheet keeps its PLACE in the cascade: it becomes a marker,
     * replaced below by a link to its local copy (moving them all to the
     * end of <head> let the theme's base CSS override its own inline rules) */
    let n = 0;
    root.querySelectorAll('link[rel~="stylesheet"]').forEach(e => { e.replaceWith(document.createComment('RT-SHEET-' + (n++))); });
    root.querySelectorAll('script, noscript, link[rel="preload"], link[rel="prefetch"], link[rel="modulepreload"], iframe').forEach(e => { drop.push(e.tagName.toLowerCase()); e.remove(); });
    root.querySelectorAll('canvas.dcc-seasons-canvas, canvas.dcc-seasons-sky, .dcc-seasons-accent, [id^="dcc-seasons"], .dcc-seasons-diag, .dcc-seasons-chip').forEach(e => { drop.push('seasons:' + (e.className || e.id)); e.remove(); });
    /* where each image lives: the header picture's are kept, the rest become placeholders */
    const keep = [];
    root.querySelectorAll('#masthead [style*="url("], #masthead img').forEach(e => { e.setAttribute('data-rt-keep', '1'); });
    return { html: '<!doctype html>\n' + root.outerHTML, drop };
  });
  await browser.close();

  /* one stylesheet, urls made absolute against their own sheet */
  const urls = new Map();
  const fetchTo = async (abs, kind) => {
    if (urls.has(abs)) { return urls.get(abs); }
    const ext = (path.extname(new URL(abs).pathname) || '.bin').toLowerCase();
    const name = crypto.createHash('sha1').update(abs).digest('hex').slice(0, 12) + ext;
    let ok = false;
    for (let i = 0; i < 3 && !ok; i++) {
      try {
        const buf = require('child_process').execFileSync('curl', ['-sS', '-L', '--max-time', '60', '-A', 'Mozilla/5.0', abs], { maxBuffer: 64 << 20 });
        if (buf.length > 200) { fs.writeFileSync(path.join(ASSETS, name), buf); ok = true; }
      } catch (e) { /* retry */ }
    }
    const local = ok ? `/rt/${name}` : null;
    urls.set(abs, local);
    return local;
  };
  const sheetFiles = [];
  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i];
    let t = s.css;
    const reps = [];
    t.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => { reps.push(u); return m; });
    for (const u of reps) {
      if (/^data:/.test(u)) { continue; }
      const abs = new URL(u, s.href).href;
      const font = /\.(woff2?|ttf|otf|eot)(\?|#|$)/i.test(abs);
      const local = font ? await fetchTo(abs, 'font') : '/rt/placeholder.png';
      t = t.split(u).join(local || '/rt/placeholder.png');
    }
    const name = `sheet-${String(i).padStart(2, '0')}.css`;
    fs.writeFileSync(path.join(ASSETS, name), `/* ${s.href} — captured ${DATE} */\n` + t);
    sheetFiles.push({ name, media: s.media });
  }
  /* the DOM: header images local, every other image a placeholder */
  let html = dom.html;
  const imgs = new Set();
  html.replace(/url\((?:&quot;|['"])?(https?:[^)'"&]+)(?:&quot;|['"])?\)/g, (m, u) => { imgs.add(u); return m; });
  html.replace(/\s(?:src|data-src)="(https?:[^"]+)"/g, (m, u) => { imgs.add(u); return m; });
  const headerHtml = html.slice(html.indexOf('id="masthead"'), html.indexOf('</header>', html.indexOf('id="masthead"')));
  for (const u of imgs) {
    const inHeader = headerHtml.includes(u) || /DCC-Photos-Canal|explore-hero/.test(u);
    const local = inHeader ? await fetchTo(u, 'img') : null;
    html = html.split(u).join(local || '/rt/placeholder.png');
  }
  html = html.replace(/\ssrcset="[^"]*"/g, '').replace(/\ssizes="[^"]*"/g, '');
  html = html.replace(/<!--RT-SHEET-(\d+)-->/g, (m, i) => { const f = sheetFiles[+i]; return f ? `<link rel="stylesheet" href="/rt/${f.name}"${f.media && f.media !== 'all' ? ` media="${f.media}"` : ''}>` : ''; });
  /* a 1x1 neutral grey placeholder */
  fs.writeFileSync(path.join(ASSETS, 'placeholder.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN4+P/ffwAI+gP2Ywz6tgAAAABJRU5ErkJggg==', 'base64'));
  fs.writeFileSync(path.join(OUT, 'real-home.html'), html);
  const kept = [...urls.entries()].filter(e => e[1]).map(e => [e[0], e[1]]);
  fs.writeFileSync(path.join(OUT, 'capture.json'), JSON.stringify({ url: URL0, date: DATE, width: 1440,
    sheets: sheets.map(s => ({ href: s.href, bytes: s.css.length, err: s.err })), dropped: dom.drop, kept }, null, 1));
  console.log(`captured ${URL0} on ${DATE}: html ${html.length} bytes, ${sheetFiles.length} stylesheets in their places, ${kept.length} assets kept, ${dom.drop.length} elements dropped`);
})().catch(e => { console.error(e); process.exit(1); });
