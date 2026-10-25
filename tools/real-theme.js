'use strict';
/**
 * DCC Seasons — serve the real-theme fixture (tests/real-theme/, captured
 * from the live home page by tools/build-real-theme.js) to the suites.
 *
 *   const rt = require('./real-theme');
 *   const ses = await open(rt.page({ config }), { extra: rt.route, viewport: … });
 *
 * page(opts) returns the real home page with the build under test added
 * the way the plugin adds it (the config, then the loader, before
 * </body>); route answers /rt/* from the fixture's own files. KEEP lists
 * the elements the Director measured as things a scene must never cover:
 * keepClear(page) reads their boxes, in the viewport, at whatever width
 * the page is.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '..', 'tests', 'real-theme');
const TYPES = { '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject', '.svg': 'image/svg+xml' };

function page(opts = {}) {
  let html = fs.readFileSync(path.join(DIR, 'real-home.html'), 'utf8');
  if (opts.config) {
    const loader = /\.min\.js$/.test(opts.config.engineSrc || '') ? 'ambient.min.js' : 'ambient.js';
    html = html.replace('</body>', `<script>window.DCC_SEASONS = ${JSON.stringify(opts.config)};</script>\n<script src="/${loader}"></script>\n</body>`);
  }
  if (opts.extraHead) { html = html.replace('</head>', opts.extraHead + '</head>'); }
  return html;
}
function route(r, url) {
  if (url.hostname !== 'dcc.test' || !url.pathname.startsWith('/rt/')) { return false; }
  const name = url.pathname.slice(4);
  const file = name === 'real-theme.css' ? path.join(DIR, 'real-theme.css') : path.join(DIR, 'assets', path.basename(name));
  if (!fs.existsSync(file)) { r.fulfill({ status: 404, body: '' }); return true; }
  r.fulfill({ contentType: TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', body: fs.readFileSync(file) });
  return true;
}
/* The keep-clear set, as the Director measured it on staging (2026-10-25):
 * the title's letters, the tagline, the menu bar (and its pinned copy from
 * 1024px), the Sun-on-the-Canal dial and the menu button. */
const KEEP = {
  title: '#header-page-title .entry-title',
  tagline: '#header-page-title p.byline',
  menu: '#site-header-main',
  menuFixed: '.site-header-bottom-fixed',
  dial: '.dcc-sun-dial',
  menuButton: '.menu-burger',
};
/* boxes in the viewport: a text element by its LETTERS (a range per text
 * node, so a wrapped title is its lines, not its block), anything else by
 * its box; hidden or empty elements are left out */
async function keepClear(pg) {
  return pg.evaluate(KEEP => {
    const out = {};
    for (const [k, sel] of Object.entries(KEEP)) {
      const boxes = [];
      for (const el of document.querySelectorAll(sel)) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) { continue; }
        const text = k === 'title' || k === 'tagline';
        if (text) {
          const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let n;
          while ((n = tw.nextNode())) {
            if (!/\S/.test(n.nodeValue)) { continue; }
            const rg = document.createRange(); rg.selectNodeContents(n);
            for (const r of rg.getClientRects()) { if (r.width && r.height) { boxes.push([r.left, r.top, r.right, r.bottom].map(v => Math.round(v))); } }
          }
        } else {
          const r = el.getBoundingClientRect();
          if (r.width && r.height) { boxes.push([r.left, r.top, r.right, r.bottom].map(v => Math.round(v))); }
        }
      }
      out[k] = boxes;
    }
    return out;
  }, KEEP);
}
module.exports = { DIR, page, route, keepClear, KEEP };
