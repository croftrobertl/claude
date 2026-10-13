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

  .hfx #masthead { position: relative; overflow: hidden; }
  .hfx #header-page-title { position: relative; z-index: 5; background: none; }
  #header-image-main-inside { position: absolute; inset: 0; overflow: hidden; }
  .dcc-gh { position: absolute; inset: 0; z-index: 2; background: linear-gradient(#f6b26b, #f9d9a8 60%, #3d6f8a 61%, #2b5670); }
  .dcc-hl-wrap { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
  .dcc-hl-fly { position: absolute; left: 0; top: 0; width: 150px; height: 56px; }
  .dcc-hl-face, .dcc-hl-body { width: 100%; height: 100%; }
  .dcc-hl-face { transform-origin: 50% 50%; }
  .dcc-hl-body svg { width: 100%; height: 100%; display: block; overflow: visible; }
  .dcc-hl-body .prop { transform-box: fill-box; transform-origin: 50% 50%;
    animation: hfxspin .2s linear infinite; animation-play-state: paused; animation-delay: -.05s; }
  @keyframes hfxspin { to { transform: rotate(360deg); } }
  .dcc-catch { position: absolute; left: 0; top: 0; width: 60px; height: 30px; }
  /* 4.10.5: the towed banner is CSS-painted on live (dcc-hero-life): a
   * 1.5px rope div with a .6px shadow and a cloth div with a border,
   * radius and live text, skewing ±.8deg; both opt in to the box cut */
  .dcc-hl-banner { position: absolute; left: -150px; top: 14px; width: 150px; height: 26px; }
  .dcc-hl-banner .rope { position: absolute; left: 92px; right: 0; top: 12px; height: 1.5px;
    background: rgba(248,250,251,.92); box-shadow: 0 .6px 0 rgba(0,0,0,.35); }
  .dcc-hl-banner .cloth { position: absolute; left: 0; top: 0; width: 92px; height: 26px; box-sizing: border-box;
    display: flex; align-items: center; justify-content: center; background: var(--hl-banner-bg, #f6f8f9);
    border: 1px solid #c9d1d6; border-radius: 2px; font: 700 10px Georgia, serif; color: #0B3D91;
    animation: hfxskew 1.6s ease-in-out infinite alternate; animation-play-state: paused; animation-delay: -.4s; }
  @keyframes hfxskew { from { transform: skewY(-.8deg); } to { transform: skewY(.8deg); } }
  .dcc-hl-wake { position: absolute; left: 0; top: 0; width: 120px; height: 12px; }
  .dcc-hl-wake span { position: absolute; left: 0; height: 2px; width: 120px; background: rgba(255,255,255,.85); border-radius: 1px; }
  .dcc-hl-wake span + span { top: 8px; left: 20px; width: 80px; }
  /* the water glints: soft, screen-blended, never cut */
  .dcc-hl-glint { position: absolute; left: 0; top: 0; width: 70px; height: 26px; border-radius: 50%;
    background: radial-gradient(ellipse, rgba(255,255,240,.95), rgba(255,255,240,0) 70%); mix-blend-mode: screen; }
  .dcc-gh-fore { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
  .dcc-gh-fore .reeds { position: absolute; left: 0; top: 0; width: 30px; height: 120px; overflow: visible; }
  .dcc-gh-fore canvas { position: absolute; left: 0; top: 0; width: 80px; height: 30px; }
  /* The banner (banner: true / 'page'): a header PICTURE with the page title
   * over it, white, uppercase and letter-spaced with a soft shadow, the way
   * Bravada shows it — what the 4.10.1 moon and witch pass behind. */
  #header-page-title { background: radial-gradient(circle at 78% 30%, #ffe9a8 0 6%, rgba(255,233,168,0) 16%),
    linear-gradient(#7fb3d9 0%, #b9d6ea 52%, #2f6f8f 53%, #24566e 100%); }
  #header-page-title .entry-title { font: 700 40px/1.2 Georgia, serif; text-transform: uppercase; letter-spacing: 3px;
    text-align: center; text-shadow: 0 2px 6px rgba(0,0,0,.55); }
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
const LIVE_FX = `<style>
  .hfx-live .dcc-hl-fly { will-change: transform; animation: hfxfly var(--hfx-t, 7s) linear 1 both; }
  .hfx-live.west .dcc-hl-fly { animation-name: hfxflyw; }
  @keyframes hfxfly { from { transform: translate3d(-260px, var(--hfx-y, 100px), 0); } to { transform: translate3d(calc(100vw + 120px), var(--hfx-y, 100px), 0); } }
  @keyframes hfxflyw { from { transform: translate3d(calc(100vw + 120px), var(--hfx-y, 100px), 0); } to { transform: translate3d(-260px, var(--hfx-y, 100px), 0); } }
  .hfx-live .dcc-hl-body { filter: drop-shadow(0 4px 3px rgba(0,0,0,.35)); }
  .hfx-live .dcc-hl-body .prop { animation: hfxspin .11s linear infinite !important; animation-play-state: running !important; animation-delay: 0s !important; }
</style>
<script>
window.dccFly = function (y, t, dir) {
  var w = document.querySelector('.dcc-hl-wrap'), f = document.querySelector('.dcc-hl-fly');
  var host = document.getElementById('header-image-main-inside').getBoundingClientRect();
  w.style.setProperty('--hfx-y', (y - host.top - 28) + 'px'); w.style.setProperty('--hfx-t', t + 's');
  w.classList.toggle('west', dir < 0);
  document.querySelector('.dcc-hl-face').classList.toggle('is-west', dir < 0);
  document.querySelector('.dcc-hl-face').style.transform = dir < 0 ? 'scaleX(-1)' : '';
  document.querySelector('.dcc-hl-banner').style.display = '';
  f.style.transform = ''; w.classList.remove('hfx-live'); void w.offsetWidth; w.classList.add('hfx-live');
};
</script>`;

/* The header picture's layers for heroFx (see page()). The plane faces
 * right; dccPose() moves, banks, flips it and shows or hides its banner. */
const HERO_FX = `<div id="header-image-main-inside">
  <div class="dcc-gh"></div>
  <div class="dcc-hl-wrap">
    <div class="dcc-hl-fly"><div class="dcc-hl-face">
      <div class="dcc-hl-banner" style="display:none"><div class="rope" data-dcc-fore-box></div><div class="cloth" data-dcc-fore-box>DORA CANAL COURT</div></div>
      <div class="dcc-hl-body">
      <svg viewBox="0 0 150 56" xmlns="http://www.w3.org/2000/svg">
        <g class="banner"><line x1="2" y1="22" x2="-30" y2="24" stroke="#333" stroke-width="1"/>
          <rect x="-110" y="12" width="80" height="22" fill="#FFD400"/>
          <text x="-70" y="28" text-anchor="middle" font-size="11" font-family="Georgia, serif" fill="#0B3D91">DCC</text></g>
        <path class="fuse" d="M10 24 L100 18 Q128 18 136 26 Q128 34 100 34 L10 30 Z" fill="#E0102A"/>
        <rect class="wing" x="58" y="6" width="22" height="40" rx="4" fill="#B5121B"/>
        <path d="M14 26 L4 8 L22 24 Z" fill="#E0102A"/>
        <ellipse cx="80" cy="48" rx="44" ry="4" fill="#222"/>
        <line x1="70" y1="34" x2="66" y2="45" stroke="#222" stroke-width="2"/>
        <g class="prop"><rect x="137" y="10" width="4" height="32" fill="#111"/></g>
      </svg>
    </div></div></div>
    <div class="dcc-hl-wake"><span data-dcc-fore-box></span><span data-dcc-fore-box></span></div>
    <div class="dcc-hl-glint"></div>
    <div class="dcc-catch" data-dcc-fore><svg viewBox="0 0 60 30" width="60" height="30"><path d="M4 15 Q20 2 42 15 Q20 28 4 15 Z M42 15 L56 5 L56 25 Z" fill="#2A9D8F"/></svg></div>
  </div>
  <div class="dcc-gh-fore">
    <svg class="reeds" viewBox="0 0 30 120"><path d="M8 120 Q10 60 6 0 M18 120 Q20 70 24 10" stroke="#0B5D1E" stroke-width="5" fill="none" stroke-linecap="round"/>
      <ellipse cx="6" cy="14" rx="4" ry="12" fill="#5A3A1A"/></svg>
    <canvas class="gator" width="160" height="60"></canvas>
  </div>
</div>
<script>
(function () {
  var c = document.querySelector('.dcc-gh-fore canvas'), g = c.getContext('2d');
  g.fillStyle = '#2E5E1F'; g.beginPath(); g.ellipse(80, 34, 70, 14, 0, 0, 7); g.fill(); g.fillRect(10, 30, 30, 8);
  /* dccPose(which, {x, y, angle, flip, banner}): x/y are the item's CENTRE in
   * viewport px; angle in degrees */
  window.dccPose = function (which, o) {
    var host = document.getElementById('header-image-main-inside').getBoundingClientRect();
    var el = { plane: '.dcc-hl-fly', catch: '.dcc-catch', reeds: '.dcc-gh-fore .reeds', gator: '.dcc-gh-fore canvas', wake: '.dcc-hl-wake', glint: '.dcc-hl-glint' }[which];
    el = document.querySelector(el);
    var w = el.offsetWidth || el.getBoundingClientRect().width, h = el.offsetHeight || el.getBoundingClientRect().height;
    el.style.transform = 'translate(' + (o.x - host.left - w / 2) + 'px,' + (o.y - host.top - h / 2) + 'px)' + (which !== 'plane' && o.angle ? ' rotate(' + o.angle + 'deg)' : '');
    if (which === 'plane') {
      var face = document.querySelector('.dcc-hl-face');
      face.style.transform = 'rotate(' + (o.angle || 0) + 'deg) scaleX(' + (o.flip ? -1 : 1) + ')';
      face.classList.toggle('is-west', !!o.flip);
      /* banner: the live CSS banner (rope + cloth); svgBanner: a drawing
       * the plane's svg makes OUTSIDE its own box (an overflow test) */
      document.querySelector('.dcc-hl-banner').style.display = o.banner ? '' : 'none';
      document.querySelector('.dcc-hl-body .banner').style.display = o.svgBanner ? '' : 'none';
    }
  };
})();
</script>`;

function page(opts) {
  const kind = opts.kind || 'bravada';
  /* banner: the live homepage's shape for the egg (4.7.0) — body.home, the
   * banner title the default tap target names, and cottage card titles
   * that also carry .entry-title and must NOT count. Off by default so no
   * other suite's layout moves. */
  const banner = !!opts.banner;
  /* banner: 'page' is ANOTHER page's shape (4.7.1): the same banner title
   * markup ("Contact Us") but no body.home, so the default target does not
   * match and that page must have no egg. The banner title sits INSIDE
   * #masthead, as on live: that is why 4.7.0's #masthead fallback opened
   * the egg from /contact/'s title (a fixture with it outside the header
   * passed on 4.7.0 and proved nothing). */
  const home = banner && opts.banner !== 'page';
  /* A --min config gets the minified LOADER too. Until 4.6.2 the fixture
   * always loaded ambient.js, so no suite ever ran the ambient.min.js that
   * ships (found in the 4.6.1 audit). */
  const loader = /\.min\.js$/.test((opts.config && opts.config.engineSrc) || '') ? 'ambient.min.js' : 'ambient.js';
  const noFooter = !!opts.noFooter;
  /* heroFx (4.10.4): the live header picture's own layers, as the site's
   * mu-plugins build them, inside the header: the golden-hour sky
   * (.dcc-gh, z 2), the seaplane and the fishing catch (dcc-hero-life:
   * .dcc-hl-wrap z 3 > .dcc-hl-fly > .dcc-hl-face > .dcc-hl-body > an
   * inline SVG) and the reeds/gator layer (.dcc-gh-fore, z 4: SVG reeds
   * and a CANVAS gator). Stand-ins drawn here, not the mu-plugins' own
   * art: what matters is the markup, the stacking and the kinds of
   * element (SVG shapes with CSS transforms, a CSS-animated propeller, a
   * canvas). The suite poses them with window.dccPose(). */
  const heroFx = !!opts.heroFx;
  /* heroFx: 'live' (4.10.6) moves the plane the way dcc-hero-life does on
   * the site: a compositor translateX animation (will-change: transform)
   * on .dcc-hl-fly, a drop-shadow filter on .dcc-hl-body and the
   * propeller spinning every 0.11 s. window.dccFly(y, seconds, dir)
   * starts a flyover at that height. For frame-pacing measurements. */
  const liveFx = opts.heroFx === 'live';

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
${liveFx ? LIVE_FX : ''}</head><body class="${home ? 'home' : ''}${heroFx ? ' hfx' : ''}">
  <div class="dcc-wx-banner" role="alert">Tornado Warning for Lake County until 6:15 PM EDT</div>
  <header id="masthead">${heroFx ? HERO_FX : ''}<h1 id="site-title" style="position:relative;z-index:5">Dora Canal Court</h1>${banner ? '<div id="header-page-title"><h1 class="entry-title" style="margin:0;padding:60px 24px;color:#fff">' + (home ? 'Dora Canal Court' : 'Contact Us') + '</h1></div>' : ''}</header>
  <div class="elementor-lightbox"></div>
  <div class="mobile-nav"></div>
  <div class="hero"></div>
  <div id="content" class="cryout">
    <main id="main" class="main">
      <article id="post-620">
        <div class="entry-content">
${home ? '<h2 class="entry-title card-title">Cottage one</h2><h2 class="entry-title card-title">Cottage two</h2>' : ''}
${body}
        </div>
      </article>
    </main>
  </div>${footer}
<script>window.DCC_SEASONS = ${JSON.stringify(opts.config)};</script>
<script src="/${loader}"></script>
</body></html>`;
}

module.exports = { page };
