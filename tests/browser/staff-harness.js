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

const TOOLS = `
  <div class="mphbac-staff-topbar">
    <button type="button" class="mphbac-staff-nav mphbac-staff-prev" aria-label="Previous"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.25"/></svg></button>
    <button type="button" class="mphbac-staff-nav mphbac-staff-today">today</button>
    <button type="button" class="mphbac-staff-nav mphbac-staff-next" aria-label="Next"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.25"/></svg></button>
  </div>
  <div class="mphbac-staff-tools">
    <div class="mphbac-staff-views" role="group" aria-label="View">
      <button type="button" class="mphbac-staff-view" data-view="agenda" aria-pressed="false">List</button>
      <button type="button" class="mphbac-staff-view" data-view="chart" aria-pressed="true">Chart</button>
    </div>
  </div>
  <button type="button" class="mphbac-staff-item"><span class="mphbac-staff-item-cottage">Cottage 22</span></button>
  <div style="position:relative;width:400px;height:40px">
    <button type="button" class="mphbac-staff-bar" style="width:200px;height:28px"><span class="mphbac-staff-seg is-stay"></span></button>
  </div>`;

const SHEET = `
  <div class="mphbac-staff-sheet" role="dialog">
    <div class="mphbac-staff-sheet-head">
      <h2 class="mphbac-staff-sheet-title">Booking</h2>
      <button type="button" class="mphbac-staff-close" aria-label="Close">&times;</button>
    </div>
    <div class="mphbac-staff-sheet-body">
      <div class="mphbac-staff-photo"><a href="#">View</a></div>
    </div>
  </div>`;

const CHROMIUM = { executablePath: '/opt/pw-browsers/chromium' };

module.exports = { ROOT, css, cssCode, php, widgetPhp, constOf, emit, emitDefaults,
  page, TOOLS, SHEET, THEME, CHROMIUM, POST, WRAPPER };
