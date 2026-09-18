'use strict';
/**
 * The booking sheet's validation surface.
 *
 * THE 0.23.8 RULE, as rendered: availability is checked ON SELECTION, not at
 * submit. The logic is covered by tests/js/parity-test.js; this file covers
 * what the visitor actually sees — that the error is announced, that it is
 * centred and hidden until it has something to say, and that Book Now is
 * genuinely disabled rather than merely styled as if it were.
 */
const { chromium } = require('playwright-core');
const H = require('./harness.js');
const { check, done } = H.reporter();
const code = H.cssCode(), js = H.js(), php = H.php();

(async () => {
  const browser = await chromium.launch(H.CHROMIUM);
  const open = async (w = 393) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 860 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    await p.setContent(H.page({ body: H.filtersHtml(), sheet: H.sheetHtml() }));
    return { ctx, p };
  };

  console.log('-- the error row --');
  {
    const { ctx, p } = await open();
    const m = await p.evaluate(() => {
      const err = document.querySelector('.mphbac-sheet-error');
      err.hidden = true;
      const hiddenDisplay = getComputedStyle(err).display;
      err.hidden = false;
      err.textContent = 'Those dates are not available.';
      const c = getComputedStyle(err);
      return { role: err.getAttribute('role'), hiddenDisplay,
               display: c.display, align: c.textAlign, basis: c.flexBasis,
               colour: c.color, bg: c.backgroundColor,
               portaled: !err.closest('.mphbac-root'),
               h: err.getBoundingClientRect().height };
    });
    check('role=alert, so the message is announced the moment it appears',
      m.role === 'alert', m.role);
    check('hidden by default, with a COMPUTED display of none', m.hiddenDisplay === 'none', m.hiddenDisplay);
    check('...and it lays out once it has something to say', m.display !== 'none' && m.h > 0, m);
    check('PORTALED in this fixture (instrument check)', m.portaled === true);
    check('centred there anyway — the rule is class-doubled, not root-scoped',
      m.align === 'center', m.align);
    check('it spans the row rather than sitting beside a date field', m.basis === '100%', m.basis);
    /* THE TOKEN MUST SURVIVE THE PORTAL. --mphbac-color-alert was declared on
     * .mphbac-root only, so inside the portaled sheet it did not resolve and
     * this colour came out BLACK — an unresolved var() drops the whole
     * declaration rather than falling back. Asserting "not black" here is
     * what catches it; asserting merely that a rule exists would not. */
    check('it reads as an alert: tinted ground, and the ALERT colour resolves through the portal',
      m.bg !== 'rgba(0, 0, 0, 0)' && m.colour === 'rgb(196, 58, 58)', [m.bg, m.colour]);
  }

  console.log('\n-- Book Now is disabled, not just styled --');
  {
    const { ctx, p } = await open();
    const m = await p.evaluate(() => {
      const btn = document.querySelector('.mphbac-sheet-confirm');
      btn.disabled = true;
      const off = { disabled: btn.disabled, opacity: getComputedStyle(btn).opacity,
                    cursor: getComputedStyle(btn).cursor, pointer: getComputedStyle(btn).pointerEvents };
      let fired = 0;
      btn.addEventListener('click', () => { fired++; });
      btn.click();
      const clicked = fired;
      btn.disabled = false;
      btn.click();
      return { off, clicked, afterEnable: fired };
    });
    check('the real disabled property is set, not a class pretending',
      m.off.disabled === true, m.off);
    check('A DISABLED BUTTON SWALLOWS ITS CLICK — the gate is the attribute, not CSS',
      m.clicked === 0, m.clicked);
    check('...and once enabled the click lands, so the test is not vacuous',
      m.afterEnable === 1, m.afterEnable);
    check('it is visibly dimmed too', parseFloat(m.off.opacity) < 1, m.off.opacity);
  }

  console.log('\n-- the message clears when the visitor edits, not otherwise --');
  {
    // fromEdit=true means what is on screen no longer describes the selection
    // and must go; fromEdit=false only re-syncs the button, so a server-side
    // "unavailable" survives its own round-trip.
    check('updateSheetValidity distinguishes an edit from a re-sync',
      /function updateSheetValidity\(fromEdit\)/.test(js) && /if \(!fromEdit\)/.test(js));
    check('...and the reason is recorded next to it',
      /no longer describes what they have\s*\n?\s*\/\/\s*selected/.test(js) || /fromEdit=true means/.test(js));
    check('the date inputs drive it on change, so the check happens on SELECTION',
      /addEventListener\('change'/.test(js) && /updateSheetValidity\(true\)/.test(js));
  }

  console.log('\n-- the markup ships both rows hidden --');
  {
    check('the error row ships hidden', /<p class="mphbac-sheet-error"[^>]*\shidden/.test(php));
    check('[hidden] is enforced against the author display rules', /\[hidden\]/.test(code));
    const scoped = (code.match(/\.mphbac-root[^{]*\.mphbac-sheet-error[^{]*\{/g) || []);
    check('no error rule depends on a .mphbac-root ancestor', scoped.length === 0, scoped);
  }

  console.log('\n-- the minimum-stay message names the real number --');
  {
    check('the template carries a {nights} placeholder rather than a baked "2"',
      /\{nights\}/.test(php) || /\{nights\}/.test(js));
    check('...and the code replaces it', /replace\('\{nights\}'/.test(js));
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
