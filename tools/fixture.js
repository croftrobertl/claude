'use strict';
/**
 * DCC Seasons — page fixtures for the browser suites.
 *
 * These reproduce the two page shapes that actually matter on
 * doracanalcourt.com, measured and recorded in CLAUDE.md:
 *
 *   'bravada'   the theme's own chain, which is where every layering bug so
 *               far has lived:
 *                 div#content.cryout   transparent, collapses to 0px
 *                   main#main.main     WHITE, position:relative z-index:9
 *                     article#post-620 WHITE, transform: translateZ(-0.001px)
 *                       div.entry-content  transparent, 0px
 *               The article's transform is the trap: it becomes the
 *               containing block for position:fixed descendants.
 *
 *   'elementor' the same outer chain with Elementor sections that make their
 *               OWN stacking contexts — one by z-index, one by transform,
 *               one by opacity, one by filter. A backdrop that is "behind"
 *               on the theme alone can still be covered here, and each of
 *               those four properties fails differently.
 *
 * Both carry a real footer, because footer placement is the 3.18.0 default.
 * Pass `noFooter: true` to build the page that must render nothing at all.
 */

const SHARED_CSS = `
  * { box-sizing: border-box; }
  /* Room for the fixed weather banner, the way a real site makes room for
   * it. Without this the banner sits over the header and swallows the taps
   * that open the egg — a fixture artefact that reads as a plugin bug. */
  body { margin: 0; padding-top: 44px; font: 16px/1.6 system-ui, sans-serif; background: #d8e6f2; }
  #masthead { background: #0f6dbf; color: #fff; padding: 18px; }
  #site-title { font-size: 22px; margin: 0; }
  .hero { height: 380px; background: #35617f; }
  #content.cryout { max-width: 1100px; margin: 0 auto; }
  /* The opaque content column: position + numeric z-index = a real stacking
   * context that paints over any body-level canvas below 9. */
  main#main.main { background: #ffffff; position: relative; z-index: 9; padding: 0; }
  /* The transform hack that makes the article a containing block for fixed. */
  article#post-620 { background: #ffffff; transform: translateZ(-0.001px); padding: 24px; }
  .entry-content { }
  p { margin: 0 0 18px; }
  footer#colophon { background: #123; color: #cfe; padding: 40px 24px; min-height: 320px; }
  footer#colophon a { color: #9cf; }
  /* The site's severe-weather banner, from dcc-weather.php. Decoration must
   * never outrank a live NWS tornado, hurricane or flood warning, so the
   * fixture carries it at its real z-index and the suite asserts on it. */
  .dcc-wx-banner { position: fixed; top: 0; left: 0; right: 0; height: 44px; z-index: 10000;
                   background: #B00020; color: #fff; padding: 10px 16px; font-weight: 700;
                   box-sizing: border-box; }
  /* Two more things a full-viewport canvas must not cover. */
  .elementor-lightbox { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.85);
                        display: none; }
  .mobile-nav { position: fixed; inset: 0 0 0 40%; z-index: 99999; background: #fff;
                display: none; }
`;

const ELEMENTOR_CSS = `
  .elementor-section { padding: 30px 24px; margin: 0; }
  /* Four different ways to make a stacking context. Each one is a separate
   * failure mode for a z-index:-1 backdrop, so each is present. */
  .es-z       { position: relative; z-index: 2; background: #eef4fa; }
  .es-xform   { transform: translateZ(0);       background: #f6eef8; }
  .es-opacity { opacity: 0.99;                  background: #eef8f0; }
  .es-filter  { filter: saturate(1.02);         background: #fdf6ea; }
  /* Full-bleed cards: the phone case where the open remainder is gutters. */
  .cards { display: grid; grid-template-columns: 1fr; gap: 12px; }
  .card  { background: #fff; border: 1px solid #dde; padding: 20px; min-height: 160px; }
`;

function paras(n, tag) {
  let out = '';
  for (let i = 0; i < n; i++) {
    out += `<p class="${tag}">Guests come for the springs, the tours, and even wild manatees. ` +
           `Paragraph ${i + 1} of the ${tag} block, long enough to make real line boxes ` +
           `so text rects can be measured the way the engine measures them.</p>\n`;
  }
  return out;
}

/**
 * @param {object} opts
 * @param {'bravada'|'elementor'} opts.kind
 * @param {object} opts.config      the window.DCC_SEASONS object
 * @param {boolean} [opts.noFooter] omit the footer entirely
 * @returns {string} a complete HTML document
 */
function page(opts) {
  const kind = opts.kind || 'bravada';
  const noFooter = !!opts.noFooter;

  const body = kind === 'elementor'
    ? `
      <section class="elementor-section es-z">${paras(3, 'z-index section')}</section>
      <section class="elementor-section es-xform">${paras(3, 'transform section')}</section>
      <section class="elementor-section es-opacity">${paras(3, 'opacity section')}</section>
      <section class="elementor-section es-filter">${paras(3, 'filter section')}</section>
      <section class="elementor-section cards">
        <div class="card">Cottage one</div>
        <div class="card">Cottage two</div>
        <div class="card">Cottage three</div>
      </section>`
    : paras(14, 'about');

  const footer = noFooter ? '' : `
  <footer id="colophon">
    <h3 id="footer-head">Dora Canal Court</h3>
    ${paras(3, 'footer')}
    <p><a href="/contact/">Contact us</a> &middot; <a href="/tours/">Canal tours</a></p>
  </footer>`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DCC Seasons fixture — ${kind}</title>
<style>${SHARED_CSS}${kind === 'elementor' ? ELEMENTOR_CSS : ''}</style>
</head><body>
  <div class="dcc-wx-banner" role="alert">Tornado Warning for Lake County until 6:15 PM EDT</div>
  <header id="masthead"><h1 id="site-title">Dora Canal Court</h1></header>
  <div class="elementor-lightbox"></div>
  <div class="mobile-nav"></div>
  <div class="hero"></div>
  <div id="content" class="cryout">
    <main id="main" class="main">
      <article id="post-620">
        <div class="entry-content">
${body}
        </div>
      </article>
    </main>
  </div>${footer}
<script>window.DCC_SEASONS = ${JSON.stringify(opts.config)};</script>
<script src="/ambient.js"></script>
</body></html>`;
}

module.exports = { page };
