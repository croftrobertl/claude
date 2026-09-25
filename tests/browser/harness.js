'use strict';
/**
 * Shared fixture builders for the browser harnesses.
 *
 * THE FIXTURE IS THE TEST. Four things about the real page have each, at some
 * point, been the reason a green suite shipped a broken build:
 *
 *   1. LOAD ORDER. Elementor's generated CSS ships inside the page; the plugin
 *      stylesheet is enqueued AFTER it. Both are often the same specificity,
 *      so source order decides. A fixture loading the plugin first cannot see
 *      a whole class of bug (0.25.0).
 *   2. BRAVADA'S KIT resets inputs and buttons at (0,3,1) — recorded in
 *      PROJECT-NOTES long before it mattered. Model it weaker and rules that
 *      lose on the real page appear to win (0.30.0).
 *   3. html { font-weight: 700 }. This site bolds everything. A span that
 *      declares no weight computes 400 in a naive fixture and 700 live
 *      (0.31.1).
 *   4. THE ELEMENTOR CSS IS DERIVED FROM THE PHP, never hand-written: a
 *      hand-written copy goes stale the moment a control changes, and then
 *      reports a fix as broken (0.31.1).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../mphb-availability-calendar');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const css = () => read('assets/css/widget.css');
/**
 * THE FILE THE BROWSER IS ACTUALLY SENT (0.42.0). widget.css is the source
 * and keeps every comment; widget.min.css is what register_assets() enqueues,
 * built by tools/build-css.php. A fixture that only ever loads the source is
 * testing a file no visitor receives — so the portal proof runs against this
 * one, and a suite asserts the two behave identically.
 */
const minCss = () => read('assets/css/widget.min.css');
/**
 * The stylesheet with comments removed. USE THIS for any assertion about what
 * the stylesheet declares: this file's comments quote the very declarations
 * they describe ("the global min-width: 8.5em guard"), so a source-text check
 * against the raw file matches prose and reports a removed rule as present.
 */
const cssCode = () => css().replace(/\/\*[\s\S]*?\*\//g, '');
const js = () => read('assets/js/widget.js');
const php = () => read('includes/class-widget.php');

/** A control's Elementor-emitted CSS, built from the source. */
const WRAPPER = '.elementor-element.elementor-element-5f8802c';
const POST = '.elementor-1005 ';

function constOf(name, src = php()) {
  const m = src.match(new RegExp("private const " + name + " = '([^']+)'"));
  return m ? m[1] : '';
}

function emit(control, value, src = php()) {
  const i = src.indexOf("add_control('" + control + "'");
  if (i < 0) throw new Error('no such control: ' + control);
  const block = src.slice(i, src.indexOf(']);', i));
  const sm = block.match(/'selectors'\s*=>\s*\[([\s\S]*?)\]/);
  if (!sm) return '';
  const rules = [];
  const re = /([^[\]=>]+?)\s*=>\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(sm[1]))) {
    const expr = m[1].trim().replace(/^,\s*/, '');
    if (!expr) continue;
    // Split on top-level '.' (PHP concatenation). Regexing the dots away
    // leaves `.mphbac-root . .mphbac-nav-btn`, an INVALID selector that the
    // browser drops silently — the element then reads the stylesheet's own
    // fallback token, which realistic colours cannot distinguish from success.
    const parts = [];
    let buf = '', q = false;
    for (const ch of expr) {
      if (ch === "'") { q = !q; buf += ch; }
      else if (ch === '.' && !q) { parts.push(buf); buf = ''; }
      else buf += ch;
    }
    parts.push(buf);
    let sel = parts.map(x => {
      x = x.trim();
      const c = x.match(/^self::(\w+)$/);
      return c ? constOf(c[1], src) : x.replace(/^'|'$/g, '');
    }).join('');
    sel = sel.replace('{{WRAPPER}}', WRAPPER).replace(/\s+/g, ' ').trim();
    if (sel) rules.push(POST + sel + ' { ' + m[2].replace('{{VALUE}}', value) + ' }');
  }
  return rules.join('\n');
}

/** Extract one markup block by BALANCING its div tags. */
function extractBlock(src, openTag) {
  const start = src.indexOf(openTag);
  if (start < 0) throw new Error('block not found: ' + openTag);
  const re = /<(\/?)div\b[^>]*>/g;
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(src))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return src.slice(start, m.index + m[0].length);
  }
  throw new Error('unbalanced block: ' + openTag);
}

/**
 * Real labels for every string the extracted markup echoes. A missing key
 * falls through to the literal 'x', which silently turns a button into a
 * one-character control — a 36.8px-wide "Book Now" that looks like a layout
 * bug and is only the fixture.
 */
const STRINGS = {
  str_checkin: 'Check-in', str_checkout: 'Check-out', str_apply: 'Show', str_reset: 'Reset',
  str_book_close: 'Close', str_book_cancel: 'Cancel', str_book_confirm: 'Book Now',
  str_info_close: 'Close',
  str_cancel: 'Cancel', str_confirm: 'Book Now', str_price_note: 'note',
  str_prev_month: 'Previous', str_next_month: 'Next',
  str_today: 'today', str_today_hint: 'Back to today',
};

function dephp(html, extra = {}) {
  const S = { ...STRINGS, ...extra };
  const MISSING = k => {
    throw new Error('harness: no fixture string for ' + k
      + ' — add it to STRINGS, or the markup renders a one-character control');
  };
  return html
    .replace(/<\?php\s*echo esc_html\(self::tc\(\$settings\['(\w+)'\]\)\); \?>/g, (_, k) => S[k] || MISSING(k))
    .replace(/<\?php\s*echo esc_html\(\$settings\['(\w+)'\]\); \?>/g, (_, k) => S[k] || MISSING(k))
    .replace(/<\?php\s*echo esc_attr\(\$settings\['(\w+)'\]\); \?>/g, (_, k) => S[k] || MISSING(k))
    .replace(/<\?php\s*echo esc_html__\('([^']+)'[\s\S]*?\); \?>/g, (_, t) => t)
    .replace(/<\?php\s*echo esc_attr\(\$today[\s\S]*?\); \?>/g, '2026-10-01')
    .replace(/<\?php[\s\S]*?\?>/g, '');
}

const filtersHtml = () => dephp(extractBlock(php(), '<div class="mphbac-filters" role="search">'));
const sheetHtml = () => dephp(
  extractBlock(php(), '<div class="mphbac-sheet" role="dialog"')
).replace(/\shidden(?=>|\s)/g, '');

/** The theme, as measured on the live page. */
const THEME = `
 /* this site bolds everything — see note 3 above */
 html { font-weight: 700; }
 /* Bravada fades every button background over 0.75s, at (0,0,1) */
 button, input[type=button], input[type=submit], input[type=reset] { transition: background .75s ease-out; }
 /* Bravada's Elementor kit input/button reset, at its RECORDED (0,3,1) */
 .elementor-kit-9 input { line-height: 1px; font-family: Pavanam, sans-serif; font-size: 11px; }
 .elementor-kit-9 .elementor-element .elementor-widget-container input {
   line-height: 1px; border: 1px dotted #999; border-radius: 0; padding: 1px 2px;
   background-color: #eeeeee; color: #999999; min-height: 0; text-align: left;
 }`;

/**
 * A page shaped like the real one: theme first, Elementor's CSS second, the
 * plugin stylesheet LAST, and the widget inside the post/element/container
 * classes the derived selectors need. `inset` is the Elementor container's
 * horizontal padding — 18px on the live page, and load-bearing: without it
 * the filter grid gets the whole viewport and a 320px overflow disappears.
 */
function page({ panel = '', body = '', sheet = '', inset = 18, sheetCss = null } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:Raleway,Georgia,serif}${THEME}</style>
<style id="elementor">${panel}</style>
<style id="plugin">${sheetCss === null ? css() : sheetCss}</style></head>
<body class="elementor-1005 elementor-kit-9">
<div class="${WRAPPER.replace(/\./g, ' ').trim()}"><div class="elementor-widget-container">
  <div style="padding:0 ${inset}px"><div class="mphbac-root">${body}</div></div>
</div></div>
${sheet}
</body></html>`;
}

/** Sentinels: colours that cannot be mistaken for a stylesheet fallback. */
const SENTINEL = {
  navRest: 'rgb(1, 2, 3)', navHover: 'rgb(4, 5, 6)',
  btnRest: 'rgb(7, 8, 9)', btnHover: 'rgb(10, 11, 12)',
  btnText: 'rgb(19, 20, 21)', btnTextHover: 'rgb(22, 23, 24)',
  viewRest: 'rgb(13, 14, 15)', viewHover: 'rgb(16, 17, 18)',
};

function reporter() {
  const state = { fail: 0 };
  const check = (label, cond, extra) => {
    console.log((cond ? 'PASS  ' : 'FAIL  ') + label
      + (extra !== undefined ? '   [' + JSON.stringify(extra) + ']' : ''));
    if (!cond) state.fail++;
  };
  const done = () => {
    console.log(state.fail ? '\n' + state.fail + ' FAILED' : '\nALL OK');
    process.exit(state.fail ? 1 : 0);
  };
  return { check, done, state };
}

const CHROMIUM = { executablePath: '/opt/pw-browsers/chromium' };

module.exports = { ROOT, css, minCss, cssCode, js, php, constOf, emit, extractBlock, dephp,
  filtersHtml, sheetHtml, THEME, page, SENTINEL, reporter, CHROMIUM, WRAPPER, POST };
