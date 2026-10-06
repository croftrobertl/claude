/*
 * jsdom: assets/js/settings-page.js against the REAL settings page markup
 * (rendered by tests/dump-settings-page.php).
 *
 *   node tests/settings-page.test.js [path/to/settings-page.js]
 *
 * jsdom has no layout, so the form's position and the window's scroll offset are
 * stubbed per scenario; the browser behaviour itself (the real prompt, the real
 * scroll) is checked in Chromium by the release harness and on the site.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { JSDOM } = require('jsdom');

const SCRIPT = process.argv[2] || path.join(__dirname, '..', 'dcc-cottage-selector', 'assets', 'js', 'settings-page.js');
const src = fs.existsSync(SCRIPT) ? fs.readFileSync(SCRIPT, 'utf8') : '';
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; console.log('  NOT OK - ' + name + (detail !== undefined ? '  [' + detail + ']' : '')); }
}

function pageHtml(args) {
  return execFileSync('php', [path.join(__dirname, 'dump-settings-page.php')].concat(args || [])).toString();
}

/** Mount the page; formTop = form's document Y, scrollY = window offset. Returns helpers. */
function mount(args, opts) {
  opts = opts || {};
  const dom = new JSDOM('<!doctype html><body>' + pageHtml(args) + '</body>', { runScripts: 'outside-only' });
  const w = dom.window;
  const scrolls = [];
  let y = opts.scrollY || 0;
  Object.defineProperty(w, 'pageYOffset', { get: () => y, configurable: true });
  w.scrollTo = (x, ny) => { scrolls.push(ny); y = ny; };
  const form = w.document.getElementById('dccs-settings-form');
  if (form) {
    form.getBoundingClientRect = () => ({ top: (opts.formTop || 0) - y });
  }
  if (src) { w.eval(src); }
  return {
    w, form, scrolls,
    setScroll(v) { y = v; },
    fire(type) { w.dispatchEvent(new w.Event(type)); },
    leaveBlocked() {
      const e = new w.Event('beforeunload', { cancelable: true });
      w.dispatchEvent(e);
      return e.defaultPrevented;
    },
    change(el) { el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); },
    submit() { form.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })); },
  };
}

console.log('Script present');
ok('assets/js/settings-page.js exists', src.length > 0, SCRIPT);

console.log('Unsaved-changes prompt');
{
  const m = mount();
  const $ = (s) => m.form.querySelector(s);
  ok('untouched page never warns', m.leaveBlocked() === false);
  ok('the page has every field type this checks (positive control for the snapshot)',
    !!$('input[type=checkbox]') && !!$('input[type=number]') && !!$('input[type=url]') && !!$('input[type=text]') && !!$('select'));

  const box = $('#dccs-show-review');
  box.checked = !box.checked; m.change(box);
  ok('ticking a checkbox warns', m.leaveBlocked() === true);
  box.checked = !box.checked; m.change(box);
  ok('ticking it back does not', m.leaveBlocked() === false);

  const num = $('#dccs-results-count');
  const was = num.value;
  num.value = String(Number(was) === 3 ? 4 : 3); m.change(num);
  ok('changing a number warns', m.leaveBlocked() === true);
  num.value = was; m.change(num);

  const sel = $('#dccs-start-mode');
  const opt = [...sel.options].find((o) => o.value !== sel.value);
  const before = sel.value;
  sel.value = opt.value; m.change(sel);
  ok('changing the opening mode warns', m.leaveBlocked() === true);
  sel.value = before; m.change(sel);

  const url = $('#dccs-pet-fee-url');
  url.value = 'https://example.test/fees/'; m.change(url);
  ok('typing a URL warns', m.leaveBlocked() === true);

  // a field inside the collapsed Advanced section counts too
  url.value = ''; m.change(url);
  const act = $('#dccs-avail-action');
  act.value = act.value + 'x'; m.change(act);
  ok('a field inside Advanced warns', m.leaveBlocked() === true);
  act.value = act.value.slice(0, -1); m.change(act);
  ok('all reverted: no warning', m.leaveBlocked() === false);

  m.form.querySelector('details.dccs-advanced').open = true;
  ok('opening Advanced alone is not a change', m.leaveBlocked() === false);
}
{
  const m = mount();
  const box = m.form.querySelector('#dccs-show-review');
  box.checked = !box.checked; m.change(box);
  ok('dirty before Save (control)', m.leaveBlocked() === true);
  m.submit();
  ok('Save does not trigger the prompt', m.leaveBlocked() === false);
}
{
  // a value set by the server that differs from the field default is not a change
  const m = mount(['dccs-saved=1']);
  ok('freshly saved page never warns', m.leaveBlocked() === false);
}

console.log('Where Save remembers the user was');
{
  const m = mount([], { formTop: 180, scrollY: 0 });
  m.setScroll(650);
  m.form.querySelector('details.dccs-advanced').open = true;
  m.submit();
  ok('offset from the form top is sent', m.form.elements.dccs_scroll.value === '470', m.form.elements.dccs_scroll.value);
  ok('Advanced-open is sent', m.form.elements.dccs_adv.value === '1');
}
{
  const m = mount([], { formTop: 180, scrollY: 40 });
  m.submit();
  ok('above the form: negative offset', m.form.elements.dccs_scroll.value === '-140', m.form.elements.dccs_scroll.value);
  ok('Advanced closed: empty', m.form.elements.dccs_adv.value === '');
}

console.log('Back where they were after the save');
{
  // The notice pushed the form down 52px since the save (180 -> 232): same view.
  const m = mount(['dccs-saved=1', 'dccs-scroll=470', 'dccs-adv=1'], { formTop: 232 });
  ok('Advanced reopened before measuring', m.form.querySelector('details.dccs-advanced').open === true);
  if (m.w.document.readyState !== 'complete') { m.fire('load'); }
  ok('scrolled to form top + saved offset (notice height absorbed)', m.scrolls.length === 1 && m.scrolls[0] === 702, JSON.stringify(m.scrolls));
}
{
  const m = mount(['dccs-saved=1', 'dccs-scroll=-500'], { formTop: 232 });
  m.fire('load');
  ok('never scrolls above the top of the page', m.scrolls[m.scrolls.length - 1] === 0, JSON.stringify(m.scrolls));
  ok('Advanced stays closed when it was closed', m.form.querySelector('details.dccs-advanced').open === false);
}
{
  const m = mount(['page=dcc-cottage-selector'], { formTop: 232 });
  m.fire('load');
  ok('plain visit: no scroll', m.scrolls.length === 0, JSON.stringify(m.scrolls));
  ok('plain visit: Advanced closed', m.form.querySelector('details.dccs-advanced').open === false);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
