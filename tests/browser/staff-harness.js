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
 button, input[type=button], input[type=submit], input[type=reset] { transition: background .75s ease-out; }
 /* Bravada's Elementor kit form-field reset, at its RECORDED (0,3,1) — the
    public harness's rule, here since 0.43.1 with select added. Without it
    this fixture could not show what Rob saw on /staff/: the theme winning on
    the date field while the menu kept the plugin's own box. */
 .elementor-kit-9 input, .elementor-kit-9 select { line-height: 1px; font-family: Pavanam, sans-serif; font-size: 11px; }
 .elementor-kit-9 .elementor-element .elementor-widget-container input,
 .elementor-kit-9 .elementor-element .elementor-widget-container select {
   line-height: 1px; border: 1px dotted #999; border-radius: 0; padding: 1px 2px;
   background-color: #eeeeee; color: #999999; min-height: 0; text-align: left;
 }
 /* The kit's button states, as the Website Director found them on live
    (0.44.1): (0,2,1), above a bar's own colour. It turned bars coral and
    pill-shaped on hover, and on a phone after a tap (focus stays). */
 .elementor-kit-9 button:hover, .elementor-kit-9 button:focus {
   background-color: #F08080; color: #FFFFFF; border-radius: 30px;
 }
 /* The LIVE kit's label rule, verbatim from uploads/elementor/css/post-331.css
    as the Website Director found it (0.45.2): it underlined the Search label,
    and on Rob's iPhone the typed text and the placeholder with it. */
 .elementor-kit-331 label { color:#02000094; font-family:"Raleway",Sans-serif; font-size:19px; text-decoration:underline; }`;

function page({ panel = emitDefaults(), body = '', sheet = '' } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:Raleway,Georgia,serif}${THEME}</style>
<style id="elementor">${panel}</style>
<style id="plugin">${css()}</style></head>
<body class="elementor-18102 elementor-kit-9 elementor-kit-331">
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
  // Until 0.43.0 this patched one List / Chart tab to aria-pressed="true",
  // a runtime state the markup could not carry. The period menu that
  // replaced them is a <select> whose default is in the markup itself.
  + dephp(extractBlock(widgetPhp(), '<div class="mphbac-staff-tools">'))
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


/**
 * THE BOARD, LIVE (0.44.0): the shell EXTRACTED FROM THE PHP, the real
 * staff.js, the board's strings read from the PHP, and fetch() answered by a
 * stand-in server that applies the month endpoint's overlap rule, answers the
 * booking endpoint from `details`, and — when window.__nonceExpired is set —
 * answers EVERY request with the expired-token 403 ("X-MPHBAC-Staff: nonce").
 * Every request is logged in window.__reqs. Serve it with ctx.route().
 */
function boardStrings() {
  const src = widgetPhp();
  const block = src.slice(src.indexOf("'strings' => ["), src.indexOf('        ];', src.indexOf("'strings' => [")));
  const out = {};
  const re = /'(\w+)'\s*=>\s*__\('((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(block))) out[m[1]] = m[2].replace(/\\'/g, "'");
  return out;
}
function boardShell({ today, cottages, bookings, details = {}, search = {}, sow = 0, head = '', bodyStyle = '' }) {
  const config = {
    ajaxUrl: '/ajax', nonce: 'n', month: today.slice(0, 7), today,
    calendar: {
      weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      weekdaysFull: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      startOfWeek: sow,
    },
    strings: boardStrings(),
  };
  const markup = dephp(extractBlock(widgetPhp(), '<div class="mphbac-staff" data-staff-config='))
    .replace('data-staff-config=""', "data-staff-config='" + JSON.stringify(config).replace(/'/g, '&#39;') + "'");
  const js = fs.readFileSync(path.join(ROOT, 'assets/js/staff.js'), 'utf8');
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:Raleway,Georgia,serif;${bodyStyle}}${THEME}</style>
<style>${css()}</style>${head}</head><body class="elementor-kit-9 elementor-kit-331">
${markup}
<script>
  window.__reqs = [];
  var TODAY = ${JSON.stringify(today)}, BOOKINGS = ${JSON.stringify(bookings)}, COTTAGES = ${JSON.stringify(cottages)}, DETAILS = ${JSON.stringify(details)}, SEARCH = ${JSON.stringify(search)};
  var json = function (o, st, h) { return Promise.resolve(new Response(JSON.stringify(o), { status: st || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, h || {}) })); };
  window.fetch = function (url, opts) {
    var p = new URLSearchParams(opts.body.toString());
    var req = { action: p.get('action'), from: p.get('from'), to: p.get('to'), booking_id: p.get('booking_id'), nonce: p.get('nonce'), q: p.get('q') };
    window.__reqs.push(req);
    if (window.__nonceExpired || (function () { try { return sessionStorage.getItem('__nonceExpired') === '1'; } catch (e) { return false; } })()) {
      return Promise.resolve(new Response('', { status: 403, headers: { 'X-MPHBAC-Staff': 'nonce' } }));
    }
    if (req.action === 'mphbac_staff_search') {
      // The server's matching is staff-search-test.php's; here, a query maps
      // to the rows the server would send.
      var rows = SEARCH[(req.q || '').toLowerCase()] || [];
      return json({ success: true, data: { results: rows, count: rows.length } });
    }
    if (req.action === 'mphbac_staff_booking') {
      var d = DETAILS[req.booking_id];
      return d ? json({ success: true, data: d }) : json({ success: false, data: { message: 'Booking not found.' } }, 404);
    }
    var bookings = BOOKINGS.filter(function (b) { return b.checkout >= req.from && b.checkin <= req.to; });
    return json({ success: true, data: { from: req.from, to: req.to, today: TODAY, cottages: COTTAGES, bookings: bookings, clamped: false } });
  };
</script>
<script>${js}</script>
</body></html>`;
}

module.exports = { ROOT, css, cssCode, php, widgetPhp, extractBlock, dephp, constOf, emit, emitDefaults, boardShell, boardStrings,
  page, TOOLS, SHEET, THEME, CHROMIUM, POST, WRAPPER };
