/**
 * THE SHARED SWAP (1.48.0) — what makes an "after" run on live honest.
 *
 * Installs one route handler on a Playwright page that:
 *
 *   - aborts every non-GET request before it leaves the browser (read-only
 *     on live, always — in BOTH modes);
 *   - in `after` mode, answers every `dcc-wildlife/assets/js/*.js` request
 *     from this checkout (or from a mutant named in `mutants`);
 *   - in `after` mode, APPENDS all five of this build's stylesheets at the
 *     end of <head>. SpeedyCache serves one combined, re-minified file, so
 *     CSS cannot be swapped by URL; appended last, ours win on source order.
 *     Rules 1.48.0 DELETED are still in the combined file, so a removal is
 *     not proven here — the offline harness covers removals;
 *   - in `after` mode, applies HTML_PATCHES (html-patches.mjs) to the served
 *     page: the textual equivalent of each PHP change, because the page HTML
 *     is rendered by live's PHP. Every patch must match, or the run says so.
 *
 * `before` mode changes nothing except blocking non-GETs: it is live.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { HTML_PATCHES, patchConditions } from './html-patches.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PLUGIN = join(HERE, '..', '..');
export const SITE = 'https://doracanalcourt.com';
const CSS = ['app.css', 'widget.css', 'water.css', 'canal.css', 'guide.css'];

export async function chromium() {
  return (await import(join(PLUGIN, 'tools/tests/node_modules/playwright-core/index.mjs'))).chromium;
}

export async function installSwap(page, { mode = 'before', mutants = {} } = {}) {
  const log = { js: 0, css: 0, patches: [], missed: [] };
  page.__swap = log;
  await page.route('**/*', async (route) => {
    const req = route.request();
    if ('GET' !== req.method()) { await route.abort(); return; }
    if ('after' !== mode) { await route.continue(); return; }
    const url = new URL(req.url());
    const m = url.pathname.match(/\/wp-content\/plugins\/dcc-wildlife\/assets\/js\/([a-z0-9-]+\.js)$/);
    if (m) {
      const file = mutants[m[1]] || join(PLUGIN, 'assets/js', m[1]);
      log.js++;
      await route.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(file, 'utf8') });
      return;
    }
    if (/\/wp-json\/dcc-wildlife\/v1\/conditions/.test(url.pathname + url.search) || /rest_route=%2Fdcc-wildlife%2Fv1%2Fconditions|rest_route=\/dcc-wildlife\/v1\/conditions/.test(url.search)) {
      const res = await route.fetch();
      log.conditions = (log.conditions || 0) + 1;
      await route.fulfill({ response: res, body: patchConditions(await res.text()) });
      return;
    }
    if ('document' === req.resourceType() && url.host === 'doracanalcourt.com') {
      const res = await route.fetch();
      let body = await res.text();
      /* WHAT-IF ONLY (DCC_NO_SC_LAZY=1): SpeedyCache's inline lazy-loader is
       * the site's, not this plugin's. Switching it off here shows the
       * Director what a tap costs without it; it is never part of a
       * before/after comparison of this plugin's own change. */
      if (process.env.DCC_NO_SC_LAZY && body.includes('speedycachell.i();')) {
        body = body.replace('speedycachell.i();', '/* lazy-load off for the what-if run */');
        log.patches.push('speedycache-lazy-off');
      }
      for (const p of HTML_PATCHES) {
        if (p.pages && !p.pages.some((x) => url.pathname.includes(x))) { continue; }
        const before = body;
        body = p.apply(body);
        (before === body ? log.missed : log.patches).push(p.name);
      }
      const css = CSS.map((f) => readFileSync(mutants[f] || join(PLUGIN, 'assets/css', f), 'utf8')).join('\n');
      if (body.includes('</head>')) {
        body = body.replace('</head>', () => `<style id="dccwl-live-swap">${css}</style></head>`);
        log.css++;
      }
      await route.fulfill({ response: res, body, headers: { ...res.headers(), 'content-type': 'text/html; charset=utf-8' } });
      return;
    }
    await route.continue();
  });
}
