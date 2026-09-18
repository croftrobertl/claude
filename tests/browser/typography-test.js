'use strict';
/**
 * Guards 0.25.0 and 0.26.0: an Elementor typography control must own the
 * properties it emits.
 *
 * THE LOAD ORDER IS THE TEST. Elementor's generated CSS ships inside the page;
 * the plugin stylesheet is enqueued AFTER it. Both selectors are often the
 * same specificity, so source order decides — and a `font:` shorthand in the
 * later sheet resets every longhand the panel set. A fixture loading the
 * plugin sheet FIRST cannot see this at all, which is why the Elementor editor
 * preview looked right for weeks.
 */
const { chromium } = require('playwright-core');
const H = require('./harness.js');
const { check, done } = H.reporter();
const php = H.php(), code = H.cssCode();

const SEL = H.constOf('SEL').replace('{{WRAPPER}}', H.WRAPPER);
const FSEL = H.constOf('FSEL'), BSEL = H.constOf('BSEL'),
      VSEL = H.constOf('VSEL'), TSEL = H.constOf('TSEL');

// The ten typography controls and the selectors they emit. Written out rather
// than parsed — a PHP expression like `self::SEL . '.mphbac-cell-day, ' . …`
// is not worth a regex — and the drift check below fails if the source stops
// agreeing with this list.
const TARGETS = [
  { name: 'field_typography',       php: 'self::FSEL',           sel: FSEL },
  { name: 'button_typography',      php: 'self::BSEL',           sel: BSEL },
  { name: 'view_typography',        php: 'self::VSEL',           sel: VSEL },
  { name: 'popup_title_typography', php: 'self::TSEL',           sel: TSEL },
  { name: 'legend_typography',      php: "'.mphbac-legend'",     sel: SEL + '.mphbac-legend' },
  { name: 'heading_typography',     php: "'.mphbac-heading'",    sel: SEL + '.mphbac-heading' },
  { name: 'namecol_typography',     php: "'.mphbac-row-toggle'", sel: SEL + '.mphbac-row-toggle' },
  { name: 'dow_typography',         php: "'.mphbac-d-dow'",      sel: SEL + '.mphbac-d-dow' },
  { name: 'date_typography',        php: "'.mphbac-d-num'",      sel: SEL + '.mphbac-d-num' },
  { name: 'calheader_typography',   php: "'.mphbac-cell-day, '",
    sel: SEL + '.mphbac-cell-day, ' + SEL + '.mphbac-row-header .mphbac-cell-label' },
];

const BODY = `
  <div class="mphbac-heading">H</div>
  <div class="mphbac-legend"><span class="mphbac-legend-item">L</span></div>
  <input class="mphbac-input mphbac-input-checkin" type="date">
  <button class="mphbac-btn mphbac-btn-apply">B</button>
  <a class="mphbac-info-view-link" href="#">V</a>
  <button class="mphbac-nav-btn mphbac-nav-next">&gt;</button>
  <button class="mphbac-sheet-close">x</button>
  <button class="mphbac-info-close--floating">x</button>
  <div class="mphbac-grid">
    <div class="mphbac-row mphbac-row-header">
      <div class="mphbac-cell mphbac-cell-label">C</div>
      <div class="mphbac-cell mphbac-cell-day"><span class="mphbac-d-dow">Mo</span><span class="mphbac-d-num">7</span></div>
    </div>
    <div class="mphbac-row"><button class="mphbac-cell mphbac-cell-label mphbac-row-toggle"><span class="mphbac-label-num">#22</span></button></div>
  </div>
  <div class="mphbac-sheet-title">T</div>`;

(async () => {
  const browser = await chromium.launch(H.CHROMIUM);
  const open = async panel => {
    const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    await p.setContent(H.page({ panel, body: BODY, sheet: H.sheetHtml() }));
    return p;
  };

  console.log('-- the harness still agrees with the source --');
  check('selectors are read from the source, not retyped',
    FSEL === '.mphbac-input.mphbac-input' && VSEL === '.mphbac-info-view-link.mphbac-info-view-link',
    { FSEL, VSEL });
  const drift = TARGETS.filter(t => {
    const i = php.indexOf("'" + t.name + "'");
    return i < 0 || php.slice(i, i + 400).indexOf(t.php) < 0;
  });
  check('the harness agrees with the source about every control selector', drift.length === 0, drift.map(d => d.name));
  check('all ten typography controls are covered',
    TARGETS.length === (php.match(/'\w+_typography'/g) || []).length,
    (php.match(/'\w+_typography'/g) || []).length);

  console.log('\n-- every typography control owns what it emits --');
  {
    const panel = TARGETS.map(t => t.sel.split(',')
      .map(x => x.trim() + '{font-weight:300;font-family:"PanelFace",serif;}').join('')).join('\n');
    const p = await open(panel);
    const got = await p.evaluate(() => {
      const q = s => { const el = document.querySelector(s); return el ? [getComputedStyle(el).fontWeight, getComputedStyle(el).fontFamily] : null; };
      return {
        field: q('.mphbac-input'), button: q('.mphbac-btn'), view: q('.mphbac-info-view-link'),
        popupTitle: q('.mphbac-sheet-title'), legend: q('.mphbac-legend'), heading: q('.mphbac-heading'),
        namecol: q('.mphbac-row-toggle'), dow: q('.mphbac-d-dow'), date: q('.mphbac-d-num'),
        calheader: q('.mphbac-cell-day'),
      };
    });
    for (const [k, v] of Object.entries(got)) {
      check(`the panel owns ${k}`, v && v[0] === '300' && /PanelFace/.test(v[1]), { [k]: v });
    }
    await p.close();
  }

  console.log('\n-- the pin: fonts yield to the panel, structure does not --');
  {
    const bare = await open('');
    const n = await bare.evaluate(() => {
      const i = getComputedStyle(document.querySelector('.mphbac-input'));
      const v = getComputedStyle(document.querySelector('.mphbac-info-view-link'));
      const port = getComputedStyle(document.querySelector('.mphbac-sheet-checkin'));
      return { family: i.fontFamily, size: i.fontSize, lh: i.lineHeight, pad: i.padding,
        border: i.border, minW: i.minWidth, box: i.boxSizing,
        viewRadius: v.borderRadius, viewBg: v.backgroundColor, viewSize: v.fontSize,
        portFamily: port.fontFamily, portPad: port.padding, portBorder: port.border };
    });
    check('with no control set, family and size come from the widget, not the theme',
      !/Pavanam/.test(n.family) && n.size === '18px', [n.family, n.size]);
    check('...and the line-height:1px defence still holds', n.lh !== '1px' && parseFloat(n.lh) > 10, n.lh);
    check('the 8.5em floor is gone and must not come back', n.minW === '0px' && !/min-width:\s*8\.5em/.test(code), n.minW);
    check('the View button keeps its pill and a real fill',
      n.viewRadius === '999px' && n.viewBg !== 'rgba(0, 0, 0, 0)', [n.viewRadius, n.viewBg]);
    // The portal is what silently breaks this: whatever the in-root field
    // gets, the portaled one must get too.
    check('the PORTALED popup field gets the same treatment as the in-root field',
      n.portPad === n.pad && n.portBorder === n.border && n.portFamily === n.family,
      { root: [n.pad, n.border], portaled: [n.portPad, n.portBorder] });
    await bare.close();

    /* HOW ELEMENTOR ACTUALLY EMITS THIS, and it is not what this fixture
     * assumed on 2026-09-17.
     *
     * Elementor substitutes {{WRAPPER}} where a selector contains it and
     * leaves the selector alone otherwise — it does NOT prefix one on. FSEL
     * is a bare doubled class declared beside BSEL, whose comment records
     * that exact shape as "global doubled class survives the portal", and
     * which was measured global on the live page (three blocks emitting
     * `.mphbac-btn.mphbac-btn`). A group control's `selector` becomes the
     * rule key verbatim through {{SELECTOR}}, so field_typography is emitted
     * globally too.
     *
     * Emitting it {{WRAPPER}}-prefixed here — which this file did — produced
     * a rule the portaled popup cannot match, and the resulting "the control
     * cannot reach the popup fields" finding was an artefact of the fixture,
     * not a fault in the plugin. Measured both ways: bare gives 300/300,
     * wrapper-prefixed gives 300/400. The same failure this project keeps
     * meeting — the fixture describing something the page does not do.
     */
    const p300 = await open(`${H.POST}${FSEL}{font-weight:300;}${H.POST}${VSEL}{font-weight:300;}`);
    const w = await p300.evaluate(() => [
      getComputedStyle(document.querySelector('.mphbac-input-checkin')).fontWeight,
      getComputedStyle(document.querySelector('.mphbac-info-view-link')).fontWeight,
      getComputedStyle(document.querySelector('.mphbac-sheet-checkin')).fontWeight,
    ]);
    check('a panel weight of 300 reaches the in-root field and the View button',
      w[0] === '300' && w[1] === '300', w);
    // THE GUARD, where a note describing a limitation used to sit. The popup
    // is portaled to <body>, so any ancestor in these selectors silently
    // drops it out of reach — which is why FSEL, BSEL and VSEL are all bare
    // doubled classes rather than SEL-prefixed.
    check('...and the PORTALED popup field too — the control is ancestor-free by design',
      w[2] === '300', { portaled: w[2], want: '300' });
    for (const [name, sel] of [['field', 'FSEL'], ['button', 'BSEL'], ['View button', 'VSEL']]) {
      const decl = php.match(new RegExp('private const ' + sel + " = '([^']+)'"))[1];
      check(`${name} control selector carries no ancestor, so the portal cannot orphan it`,
        !/\{\{WRAPPER\}\}|mphbac-root/.test(decl), { [sel]: decl });
    }
    await p300.close();
  }

  console.log('\n-- the shorthand that caused all this --');
  // A `font:` shorthand resets every longhand it does not name, so one sitting
  // at or above a typography control's own tier swallows the panel's settings.
  // Below that tier it loses harmlessly — which is why this checks the exact
  // selectors the controls emit, not merely "is the word `font:` present".
  const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [name, sel] of [['field', FSEL], ['View button', VSEL], ['button', BSEL], ['popup title', TSEL]]) {
    check(`no \`font:\` shorthand sits on the ${name} control's own selector`,
      !new RegExp('(^|[,}])\\s*' + esc(sel) + '\\s*\\{[^}]*font:\\s', 'm').test(code));
  }
  check('the font longhands on the field sit at (0,1,1) — `input.x`, not `.x.x`',
    /input\.mphbac-input\s*\{[^}]*font-family:\s*inherit/.test(code));
  check('font-weight is NOT declared there, so the panel owns it outright',
    !/input\.mphbac-input\s*\{[^}]*font-weight/.test(code));

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(2); });
