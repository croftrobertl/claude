'use strict';
/**
 * THE DEFERRED COTTAGE PANELS, DRIVEN IN A REAL PAGE WITH THE REAL widget.js.
 *
 * Every other assertion about this feature is a source or a PHP-level check.
 * This one boots the actual script against the actual popup markup, with
 * fetch() replaced by a recorder, and answers the three questions the audit
 * raised as things a test — not a person on staging — should be able to
 * prove:
 *   F3b  a touch on a cottage row fires NO panel request; only the tap that
 *        opens the popup does, and only once;
 *   F5   after a lazy fill, the custom scrollbar is sized for the CONTENT,
 *        not for the empty body the popup opened with;
 *   F6   opening cottage B while cottage A is still loading shows B
 *        undimmed — the loading state does not leak between opens.
 * The fourth — that the fetched markup is kept, so a re-open is instant and
 * costs nothing — falls out of the request count.
 */
const { chromium } = require('playwright-core');
const H = require('./harness.js');
const { check, done } = H.reporter();

const TODAY = '2026-10-01';
const ROOMS = [{ id: 22, title: 'Blue Heron', abbrev: 'BH', number: '22' },
               { id: 23, title: 'Kingfisher', abbrev: 'KF', number: '4' }];
const day = n => { const d = new Date(TODAY + 'T00:00:00'); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10); };
const AVAIL = {};
for (const r of ROOMS) { AVAIL[r.id] = {}; for (let i = 0; i < 7; i++) AVAIL[r.id][day(i)] = 'available'; }

const CONFIG = {
  ajaxUrl: '/ajax', action: 'mphbac_query', priceAction: 'mphbac_price', infoAction: 'mphbac_info',
  roomTypeIds: [22, 23], roomTitles: { 22: 'Blue Heron', 23: 'Kingfisher' },
  daysDesktop: 7, daysTablet: 7, daysMobile: 7, showPast: false, today: TODAY, tz: 'America/New_York',
  popupEnabled: false, monthsDesktop: 1, monthsTablet: 1, monthsMobile: 1, minNights: 2,
  strings: { infoFailed: 'Could not load.' }, customLabels: {}, availabilityHint: false,
};

// The info popup markup, extracted from the PHP as the other harnesses do.
const INFO_SHEET = H.dephp(H.extractBlock(H.php(), '<div class="mphbac-info-sheet'))
  .replace(/\shidden(?=>|\s)/g, ' hidden');

function body(lazyIds, inlineIds) {
  return `
    <div class="mphbac-grid-wrap"><div class="mphbac-skeleton"></div></div>
    ${lazyIds.map(id => `<div class="mphbac-info-content" data-room-type-id="${id}" data-info-src="tpl:${id}:aaaaaaaaaaaaaaaaaaaa" hidden></div>`).join('')}
    ${inlineIds.map(id => `<div class="mphbac-info-content" data-room-type-id="${id}" hidden><p>Inline panel ${id}</p></div>`).join('')}
    <div class="mphbac-info-overlay" hidden></div>
    ${INFO_SHEET}`;
}

/** A page with the real widget.js booted and fetch() recorded. */
function page(lazyIds, inlineIds, { infoDelayMs = 0, tall = false } = {}) {
  const html = H.page({ body: body(lazyIds, inlineIds) })
    .replace('class="mphbac-root"', `class="mphbac-root" data-config='${JSON.stringify(CONFIG).replace(/'/g, '&#39;')}'`)
    .replace('</body>', `<script>
      window.__calls = [];
      window.__resolvers = [];
      window.fetch = function (url, opts) {
        var params = new URLSearchParams(opts && opts.body ? opts.body.toString() : '');
        var action = params.get('action');
        window.__calls.push({ action: action, src: params.get('src') });
        if (action === 'mphbac_query') {
          return Promise.resolve({ json: function () { return Promise.resolve({ success: true,
            data: { rooms: ${JSON.stringify(ROOMS)}, availability: ${JSON.stringify(AVAIL)},
                    from: '${day(0)}', to: '${day(6)}', bookedThrough: null } }); } });
        }
        if (action === 'mphbac_info') {
          return new Promise(function (resolve) {
            var answer = function () { resolve({ json: function () { return Promise.resolve({ success: true,
              data: { html: '<div class="elementor elementor-9"><div class="elementor-widget" style="height:${tall ? 3000 : 20}px">Fetched panel</div></div>' } }); } }); };
            if (${infoDelayMs} > 0) { window.__resolvers.push(answer); } else { answer(); }
          });
        }
        return Promise.reject(new Error('unexpected fetch ' + action));
      };
    </script><script>${H.js()}</script></body>`);
  return html;
}

(async () => {
  const browser = await chromium.launch(H.CHROMIUM);
  const open = async (lazyIds, inlineIds, opts, touch = true) => {
    const ctx = await browser.newContext(touch
      ? { viewport: { width: 393, height: 860 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    await p.setContent(page(lazyIds, inlineIds, opts));
    // Let the grid render from the mocked availability answer.
    await p.waitForSelector('.mphbac-row-toggle', { timeout: 5000 });
    return { ctx, p };
  };
  const infoCalls = p => p.evaluate(() => window.__calls.filter(c => c.action === 'mphbac_info').length);
  const toggle = id => `.mphbac-row[data-room-type-id="${id}"] .mphbac-row-toggle`;

  console.log('-- F3b: a touch on a row is NOT a request; the tap that opens is, once --');
  {
    const { ctx, p } = await open([22, 23], []);
    check('(instrument check) the grid rendered rows with toggles from the mocked answer',
      await p.$$eval('.mphbac-row-toggle', els => els.length) >= 2);
    check('(instrument check) no panel request has been made yet', await infoCalls(p) === 0);
    // A scrolling finger: touchstart on a row, then a move, no tap.
    // Built in-page: a TouchEvent needs real Touch objects with a target,
    // which cannot be described from outside the page.
    const touch = sel => p.evaluate(s => {
      const el = document.querySelector(s);
      const t = new Touch({ identifier: 1, target: el, clientX: 50, clientY: 50 });
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [t], targetTouches: [t], changedTouches: [t], bubbles: true, cancelable: true }));
    }, sel);
    await touch(toggle(22));
    await touch(toggle(23));
    await p.waitForTimeout(150);
    check('two touches on two lazy rows fired ZERO panel requests', await infoCalls(p) === 0, await infoCalls(p));
    await p.tap(toggle(22));
    await p.waitForTimeout(200);
    check('the tap that opens the popup fired exactly one', await infoCalls(p) === 1, await infoCalls(p));
    check('...for that cottage\'s reference', await p.evaluate(() => window.__calls.filter(c => c.action === 'mphbac_info')[0].src) === 'tpl:22:aaaaaaaaaaaaaaaaaaaa');
    check('the popup is open and shows the fetched markup',
      await p.evaluate(() => document.querySelector('.mphbac-info-sheet').classList.contains('is-open')
        && /Fetched panel/.test(document.querySelector('.mphbac-info-body').textContent)));
    check('the placeholder no longer carries data-info-src — it is a real panel now',
      await p.evaluate(() => !document.querySelector('.mphbac-info-content[data-room-type-id="22"]').hasAttribute('data-info-src')));
    // Close, re-open: kept, so no second request.
    await p.evaluate(() => document.querySelector('.mphbac-info-close').click());
    await p.waitForTimeout(400);
    await p.tap(toggle(22));
    await p.waitForTimeout(200);
    check('closing and re-opening did not fetch again — the panel is KEPT', await infoCalls(p) === 1, await infoCalls(p));
    check('...and it still shows the markup', await p.evaluate(() => /Fetched panel/.test(document.querySelector('.mphbac-info-body').textContent)));
    await ctx.close();
  }

  console.log('\n-- F5: after a lazy fill the scrollbar is sized for the content --');
  {
    /* updateScrollbar() measures the SHEET, and hides the bar when nothing
       overflows. The popup opens on an EMPTY body (nothing overflows, bar
       hidden), then the fill lands with 3000px of content. 0.42.0 ran the
       sizing only at open, so the bar stayed hidden and sized for nothing. */
    const { ctx, p } = await open([22], [], { tall: true, infoDelayMs: 1 }, false);
    await p.click(toggle(22));
    await p.waitForTimeout(600);   // past the 380ms open settle, request still pending
    const before = await p.evaluate(() => {
      const sb = document.querySelector('.mphbac-info-scrollbar'), sheet = document.querySelector('.mphbac-info-sheet');
      return { hidden: sb.hidden, overflow: sheet.scrollHeight - sheet.clientHeight };
    });
    check('(instrument check) with the body still empty nothing overflows and the bar is hidden',
      before.hidden === true && before.overflow <= 2, before);
    await p.evaluate(() => window.__resolvers.forEach(r => r()));
    await p.waitForTimeout(200);
    const after = await p.evaluate(() => {
      const sb = document.querySelector('.mphbac-info-scrollbar'), sheet = document.querySelector('.mphbac-info-sheet');
      const thumb = parseFloat(document.querySelector('.mphbac-info-scrollbar-thumb').style.height) || 0;
      return { hidden: sb.hidden, overflow: sheet.scrollHeight - sheet.clientHeight, thumb, ch: sheet.clientHeight };
    });
    check('(instrument check) the fetched content overflows the sheet', after.overflow > 100, after);
    check('the bar is SHOWN once the content lands — sized after the fill, not before',
      after.hidden === false, after);
    check('...with a thumb shorter than the sheet, i.e. computed from the real content height',
      after.thumb > 0 && after.thumb < after.ch * 0.8, after);
    await ctx.close();
  }

  console.log('\n-- F6: A still loading, close it, open B: B is undimmed --');
  {
    /* Through the UI this is close-then-open — A's overlay covers the rows
       while A is open, for a guest as for Playwright — and that is the
       path 0.42.0 got wrong: closeInfo() did not clear the loading state,
       so B inherited A's dimming until A's request eventually returned. */
    const { ctx, p } = await open([22], [23], { infoDelayMs: 1 });   // A lazy and SLOW, B inline
    await p.tap(toggle(22));
    await p.waitForTimeout(150);
    check('(instrument check) A is open and dimmed while its request is pending',
      await p.evaluate(() => document.querySelector('.mphbac-info-body').classList.contains('is-loading')));
    await p.evaluate(() => document.querySelector('.mphbac-info-close').click());
    await p.waitForTimeout(400);
    await p.tap(toggle(23));
    await p.waitForTimeout(150);
    const b = await p.evaluate(() => ({
      loading: document.querySelector('.mphbac-info-body').classList.contains('is-loading'),
      text: document.querySelector('.mphbac-info-body').textContent.trim().slice(0, 20),
    }));
    check('B shows its own inline panel', /Inline panel 23/.test(b.text), b);
    check('...and is NOT dimmed by A\'s still-pending request', b.loading === false, b);
    // Now let A's request land: it must not disturb B.
    await p.evaluate(() => window.__resolvers.forEach(r => r()));
    await p.waitForTimeout(150);
    const after = await p.evaluate(() => ({
      text: document.querySelector('.mphbac-info-body').textContent.trim().slice(0, 20),
      loading: document.querySelector('.mphbac-info-body').classList.contains('is-loading'),
    }));
    check('when A\'s fetch finally lands, B is still what is on screen, still undimmed',
      /Inline panel 23/.test(after.text) && after.loading === false, after);
    check('...and A\'s node was filled where it sits, ready for its next open',
      await p.evaluate(() => /Fetched panel/.test(document.querySelector('.mphbac-info-content[data-room-type-id="22"]').textContent)));
    check('(instrument check) A never made a second request', await infoCalls(p) === 1, await infoCalls(p));
    await ctx.close();
  }

  console.log('\n-- F4 (JS half): a widget\'s element_ready handler runs on the lazily inserted markup --');
  {
    /* The PHP half puts the widget's script on the page at render time. This
       models what that script does — register a handler for its type inside
       an elementor/frontend/init listener, exactly as the Angie snippets do —
       and asserts the plugin's re-bind reaches it: reinitElementorWidgets()
       -> runReadyTrigger() -> hooks 'frontend/element_ready/<type>'. */
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    let html = page([22], [], { infoDelayMs: 0 })
      .replace('<div class="elementor-widget" style="height:20px">Fetched panel</div>',
               '<div class="elementor-widget elementor-widget-pricing" data-widget_type="pricing_table.default" data-id="p1">Fetched panel<span class="active">Daily</span></div>')
      .replace('<script>\n      window.__calls', `<script>
      // A minimal elementorFrontend: hooks + a runReadyTrigger that dispatches by widget type.
      window.__bound = [];
      window.elementorFrontend = {
        hooks: { _h: {}, addAction: function (n, f) { (this._h[n] = this._h[n] || []).push(f); },
                 doAction: function (n, a) { (this._h[n] || []).forEach(function (f) { f(a); }); } },
        elementsHandler: { runReadyTrigger: function (scope) {
          var el = scope && scope.nodeType ? scope : (scope && scope[0]);
          if (!el) return;
          window.elementorFrontend.hooks.doAction('frontend/element_ready/' + (el.dataset.widget_type || 'unknown'), el);
        } },
      };
      // What the Angie pricing snippet does, at page load, BEFORE any panel exists:
      window.addEventListener('elementor/frontend/init', function () {
        window.elementorFrontend.hooks.addAction('frontend/element_ready/pricing_table.default', function (el) {
          window.__bound.push(el.dataset.id);
          el.querySelector('.active').textContent = 'Weekly';
        });
      });
      window.dispatchEvent(new Event('elementor/frontend/init'));
      window.__calls`);
    await p.setContent(html);
    await p.waitForSelector('.mphbac-row-toggle', { timeout: 5000 });
    check('(instrument check) the handler was registered before any panel was fetched',
      await p.evaluate(() => Object.keys(window.elementorFrontend.hooks._h).includes('frontend/element_ready/pricing_table.default')));
    await p.tap(toggle(22));
    await p.waitForTimeout(700);     // fetch resolves, then the open settle at 380ms
    const r = await p.evaluate(() => ({ bound: window.__bound,
      text: (document.querySelector('.mphbac-info-body .active') || {}).textContent }));
    check('the element_ready handler RAN on the lazily inserted widget', r.bound.includes('p1'), r);
    check('...and did what a pricing switcher does — the markup changed', r.text === 'Weekly', r);
    check('...exactly once, not once per settle', r.bound.length === 1, r.bound);
    await ctx.close();
  }

  console.log('\n-- A1: a lazily loaded panel\'s CONTAINERS are bound; an inline panel\'s are left to Elementor --');
  {
    /* A modelled elementorFrontend whose runReadyTrigger fires the global
       hook for every element, as Elementor's does. The global handler plays
       the part of an entrance animation: it removes elementor-invisible.
       Measured on live: 0 invisible containers in all 8 panels, so this is
       hardening — which is exactly why it has to be proved here. */
    const STRUCT = id => `<div class="elementor-element e-con elementor-invisible" data-element_type="container" data-id="c${id}">`
      + `<div class="elementor-element elementor-widget" data-widget_type="text-editor.default" data-id="w${id}">Panel ${id}</div></div>`;
    const MODEL = `<script>
      window.__trig = [];
      window.elementorFrontend = {
        hooks: { _h: {}, addAction: function (n, f) { (this._h[n] = this._h[n] || []).push(f); },
                 doAction: function (n, a) { (this._h[n] || []).forEach(function (f) { f(a); }); } },
        elementsHandler: { runReadyTrigger: function (scope) {
          var el = scope && scope.nodeType ? scope : (scope && scope[0]);
          if (!el) return;
          window.__trig.push(el.dataset.id);
          window.elementorFrontend.hooks.doAction('frontend/element_ready/global', el);
        } },
      };
      window.elementorFrontend.hooks.addAction('frontend/element_ready/global', function (el) {
        el.classList.remove('elementor-invisible');
      });
      window.__calls`;
    const build = (lazy, inline) => page(lazy, inline)
      .replace('<div class="elementor-widget" style="height:20px">Fetched panel</div>', STRUCT(22))
      .replace('<p>Inline panel 23</p>', STRUCT(23))
      .replace('<script>\n      window.__calls', MODEL);
    const trig = p => p.evaluate(() => window.__trig.slice());
    const invisible = (p, id) => p.evaluate(i => !!document.querySelector('[data-id="c' + i + '"].elementor-invisible'), id);

    // Phone, tap path.
    let ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    let p = await ctx.newPage();
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    await p.setContent(build([22], [23]));
    await p.waitForSelector('.mphbac-row-toggle', { timeout: 5000 });
    await p.tap(toggle(22));
    await p.waitForTimeout(700);
    let t = await trig(p);
    check('TAP: the lazily loaded panel\'s container is bound', t.includes('c22'), t);
    check('...before the widget inside it, as Elementor does at page load', t.indexOf('c22') < t.indexOf('w22'), t);
    check('...once each, not once per settle', t.filter(x => x === 'c22').length === 1 && t.filter(x => x === 'w22').length === 1, t);
    check('...and an entrance-animated container becomes visible', !(await invisible(p, 22)));
    await p.evaluate(() => document.querySelector('.mphbac-info-close').click());
    await p.waitForTimeout(400);
    await p.tap(toggle(23));
    await p.waitForTimeout(500);
    t = await trig(p);
    check('INLINE: the panel\'s widget is re-bound as before', t.includes('w23'), t);
    check('...but its container is NOT touched — Elementor bound it at page load; lazy path only',
      !t.includes('c23'), t);
    await ctx.close();

    // Desktop, hover-prefetch path: the fill happens with no popup open.
    ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    p = await ctx.newPage();
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    await p.setContent(build([22], []));
    await p.waitForSelector('.mphbac-row-toggle', { timeout: 5000 });
    await p.hover(toggle(22));
    await p.waitForTimeout(300);
    check('(instrument check) the hover prefetch filled the panel before any open',
      await p.evaluate(() => document.querySelector('.mphbac-info-content[data-room-type-id="22"]').hasAttribute('data-mphbac-lazy-filled')));
    await p.click(toggle(22));
    await p.waitForTimeout(700);
    t = await trig(p);
    check('HOVER-PREFETCHED: the container is bound on the ordinary open too', t.includes('c22') && !(await invisible(p, 22)), t);
    await ctx.close();
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
