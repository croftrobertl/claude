'use strict';
/**
 * Staff-panel fixture. Separate from harness.js because the staff widget has
 * its own stylesheet, its own controls class and its own SEL.
 *
 * IT REPRODUCES ELEMENTOR'S PER-POST CASCADE, which is the whole point: the
 * staff nav's hover colour lives in _elementor_css at (0,7,0), not in
 * staff.css at (0,2,0). A stylesheet-only assertion cannot see that fault at
 * all — it is the same shape as the public side's (0,6,0) rest-colour trap.
 * This site's elementor_css_print_method is "internal", so the rule is inline
 * in the page; the fixture emits it the same way.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../mphb-availability-calendar');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const css = () => read('assets/css/staff.css');
const cssCode = () => css().replace(/\/\*[\s\S]*?\*\//g, '');
const php = () => read('includes/class-staff-elementor.php');
const widgetPhp = () => read('includes/class-staff-widget.php');

// The live values the intermediary read off page 18102.
const POST = '.elementor-18102 ';
const WRAPPER = '.elementor-element.elementor-element-afeefb0';

function constOf(name, src = php()) {
  const m = src.match(new RegExp("private const " + name + " = '([^']+)'"));
  return m ? m[1] : '';
}

/** One control's emitted CSS, built from the source. */
function emit(control, value, src = php()) {
  const i = src.indexOf("add_control('" + control + "'");
  if (i < 0) throw new Error('no such staff control: ' + control);
  const block = src.slice(i, src.indexOf(']);', i));
  const sm = block.match(/'selectors'\s*=>\s*\[([\s\S]*?)\]/);
  if (!sm) return '';
  const rules = [];
  const re = /([^[\]=>]+?)\s*=>\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(sm[1]))) {
    const expr = m[1].trim().replace(/^,\s*/, '');
    if (!expr) continue;
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

/** Every control that has a default, emitted as Elementor would with it. */
function emitDefaults() {
  const src = php();
  const out = [];
  const re = /add_control\('(\w+)'/g;
  let m;
  while ((m = re.exec(src))) {
    const block = src.slice(m.index, src.indexOf(']);', m.index));
    const d = block.match(/'default'\s*=>\s*'([^']*)'/);
    if (!d) continue;
    try { out.push(emit(m[1], d[1], src)); } catch (e) { /* no selectors */ }
  }
  return out.filter(Boolean).join('\n');
}

/** Bravada, as measured on the live page. */
const THEME = `
 html { font-weight: 700; }
 button, input[type=button], input[type=submit], input[type=reset] { transition: background .75s ease-out; }`;

function page({ panel = emitDefaults(), body = '', sheet = '' } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:Raleway,Georgia,serif}${THEME}</style>
<style id="elementor">${panel}</style>
<style id="plugin">${css()}</style></head>
<body class="elementor-18102">
<div class="${WRAPPER.replace(/\./g, ' ').trim()}"><div class="elementor-widget-container">
  <div class="mphbac-staff">${body}</div>
</div></div>
${sheet}
</body></html>`;
}

/**
 * The toolbar, EXTRACTED FROM THE PHP rather than hand-written.
 *
 * It used to be a constant in this file, and that is a fixture describing
 * something the page might not do: a mutation that put a word inside a nav
 * arrow — the exact condition under which the nav's font rules would start
 * to matter — could not reach it, and SURVIVED. The same drift lesson the
 * public harness already carries.
 */
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

function dephp(html) {
  return html
    .replace(/<\?php\s*echo esc_html__\('([^']+)'[\s\S]*?\); \?>/g, (_, t) => t)
    .replace(/<\?php\s*echo esc_attr__\('([^']+)'[\s\S]*?\); \?>/g, (_, t) => t)
    .replace(/<\?php[\s\S]*?\?>/g, '');
}

const TOOLS = dephp(extractBlock(widgetPhp(), '<div class="mphbac-staff-topbar">'))
  // The markup ships BOTH view tabs unpressed; widget.js sets one at runtime.
  // The selected state is a runtime state, so the fixture applies it the way
  // the page does rather than the markup pretending to.
  + dephp(extractBlock(widgetPhp(), '<div class="mphbac-staff-tools">'))
      .replace('data-view="chart" aria-pressed="false"', 'data-view="chart" aria-pressed="true"')
  + `
  <button type="button" class="mphbac-staff-item"><span class="mphbac-staff-item-cottage">Cottage 22</span></button>
  <div style="position:relative;width:400px;height:40px">
    <button type="button" class="mphbac-staff-bar" style="width:200px;height:28px"><span class="mphbac-staff-seg is-stay"></span></button>
  </div>`;

/**
 * THE DIALOG, EXTRACTED FROM THE PHP for the same reason TOOLS is. It was a
 * hand-written constant carrying `&times;`, and 0.38.0 replaced that glyph
 * with an SVG in the markup: a fixture holding its own copy would have gone
 * on measuring the old character and reported the new one as shipped. Only
 * the BODY is synthesised, because the real body is empty in the markup and
 * filled by staff.js at runtime.
 */
const SHEET = dephp(extractBlock(widgetPhp(), '<div class="mphbac-staff-sheet" role="dialog"'))
  .replace(/\shidden(?=>|\s)/g, '')
  .replace('<div class="mphbac-staff-sheet-body"></div>',
    '<div class="mphbac-staff-sheet-body"><div class="mphbac-staff-photo"><a href="#">View</a></div></div>');

const CHROMIUM = { executablePath: '/opt/pw-browsers/chromium' };

module.exports = { ROOT, css, cssCode, php, widgetPhp, extractBlock, dephp, constOf, emit, emitDefaults,
  page, TOOLS, SHEET, THEME, CHROMIUM, POST, WRAPPER };
