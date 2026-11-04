'use strict';
/**
 * 0.54.0 — PROOF THAT ONLY THE NOTES CHANGED, and the before / after stills.
 *
 * The same board and the same sample pop-ups, rendered with 0.53.1 exactly
 * as committed (d3d8076: its staff.js minified by its own build, its CSS,
 * its widget PHP) and with the working tree, at 390 and 1440:
 *   - the whole board around the pop-up, as markup, byte for byte (the
 *     config attribute set aside: it carries the four new strings);
 *   - a pop-up with no notes (booking 3): markup and computed style of
 *     every element, identical;
 *   - the pop-ups with notes (bookings 1 and 7): every other section's
 *     markup and computed style identical; the Notes section differs only
 *     by its class, the Copy buttons and the values' weight.
 * The public calendar's files are not touched at all (git diff, below).
 *
 *   node keep-0540-proof.js          STILLS_OUT=<dir> also writes the stills
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright-core');
const H = require('./harness.js');
const N = require('./note-copy-054-fixture.js');
const { check, done } = H.reporter();

const BASE = process.env.KEEP_BASE || 'd3d8076';
const REPO = path.resolve(__dirname, '../..');
const OUT = process.env.STILLS_OUT || '';
const OLD = fs.mkdtempSync(path.join(os.tmpdir(), 'keep-0540-'));
execSync(`git -C ${REPO} archive ${BASE} | tar -x -C ${OLD}`);
fs.symlinkSync(path.join(REPO, 'tests/browser/node_modules'), path.join(OLD, 'tests/browser/node_modules'));
fs.symlinkSync(path.join(REPO, 'tools/node_modules'), path.join(OLD, 'tools/node_modules'));
const S_NEW = require('./staff-harness.js');
const S_OLD = require(path.join(OLD, 'tests/browser/staff-harness.js'));
const ORIGIN = 'https://staff.test/';

(async () => {
  const browser = await chromium.launch(S_NEW.CHROMIUM);
  const grab = async (S, w, id, shot) => {
    const html = S.boardShell({ today: N.F.TODAY, cottages: N.F.COTTAGES, bookings: N.F.BOOKINGS, details: N.DETAILS, search: N.F.SEARCH });
    const ctx = await browser.newContext(w < 700 ? { viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: w, height: 900 } });
    await ctx.route(ORIGIN + '**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    const p = await ctx.newPage();
    await p.goto(ORIGIN);
    await p.waitForFunction(() => document.querySelector('.mphbac-staff-bar'));
    await p.evaluate(() => document.fonts.ready);
    const board = await p.evaluate(() => { const c = document.querySelector('.mphbac-staff').cloneNode(true); c.removeAttribute('data-staff-config');
      return c.outerHTML.replace(/(mphbac-staff-(?:ly|preview))-[a-z0-9]{6,8}\b/g, '$1-RANDOM'); });
    await p.click(`.mphbac-staff-bar[data-booking-id="${id}"]`);
    await p.waitForSelector('.mphbac-staff-sheet .mphbac-staff-section');
    await p.waitForTimeout(900);   // past the opening transition: a style read mid-fade differs run to run
    const r = await p.evaluate(() => {
      const styleOf = root => [root, ...root.querySelectorAll('*')].map(e => { const c = getComputedStyle(e); return [...c].map(k => k + ':' + c.getPropertyValue(k)).join(';'); });
      const secs = [...document.querySelectorAll('.mphbac-staff-sheet .mphbac-staff-section')];
      const isNotes = s => s.querySelector('h3').textContent === 'Notes';
      const sheet = document.querySelector('.mphbac-staff-sheet');
      return { others: secs.filter(s => !isNotes(s)).map(s => ({ html: s.outerHTML, style: styleOf(s) })),
        notes: secs.filter(isNotes).map(s => s.outerHTML), whole: sheet.outerHTML.replace(/(mphbac-staff-sheet(?:-title)?)-[a-z0-9]{6,8}\b/g, '$1-RANDOM'), wholeStyle: styleOf(sheet),
        head: sheet.querySelector('.mphbac-staff-sheet-head').outerHTML };
    });
    if (shot && OUT) await p.screenshot({ path: path.join(OUT, shot) });
    await ctx.close();
    return Object.assign(r, { board });
  };

  const diff = execSync(`git -C ${REPO} diff --stat ${BASE} -- mphb-availability-calendar/assets/js/widget.js mphb-availability-calendar/assets/js/widget.min.js mphb-availability-calendar/assets/css/widget.css mphb-availability-calendar/assets/css/widget.min.css mphb-availability-calendar/includes/class-widget.php mphb-availability-calendar/includes/class-widget-single.php mphb-availability-calendar/includes/class-ajax.php mphb-availability-calendar/includes/class-data-provider.php mphb-availability-calendar/includes/class-booking-rules.php`).toString();
  check('the public calendar\'s files (widget JS and CSS, both widgets\' PHP, the endpoint, the data and rules) are byte-identical to 0.53.1', diff.trim() === '', diff);

  for (const w of [390, 1440]) {
    console.log(`\n-- ${w}px --`);
    const a3 = await grab(S_OLD, w, 3), b3 = await grab(S_NEW, w, 3);
    check(`${w}px: the board around the pop-up, byte-identical (${a3.board.length} bytes)`, a3.board === b3.board);
    const at = (x, y) => { let i = 0; while (i < x.length && x[i] === y[i]) i++; return x.slice(Math.max(0, i - 80), i + 80) + ' ≠ ' + y.slice(Math.max(0, i - 80), i + 80); };
    check(`${w}px: a pop-up with no notes (booking 3): markup and computed style identical, element for element`, a3.whole === b3.whole && JSON.stringify(a3.wholeStyle) === JSON.stringify(b3.wholeStyle),
      a3.whole !== b3.whole ? at(a3.whole, b3.whole) : at(JSON.stringify(a3.wholeStyle), JSON.stringify(b3.wholeStyle)));
    for (const [id, what] of [[1, 'one note'], [7, 'two notes']]) {
      const a = await grab(S_OLD, w, id, `Availability Calendar - 0.54.0 BEFORE pop-up ${what} ${w}px.png`);
      const b = await grab(S_NEW, w, id, `Availability Calendar - 0.54.0 AFTER pop-up ${what} ${w}px.png`);
      check(`${w}px, ${what}: the title row and the Booking and Customer Information sections, markup and computed style identical`,
        a.head === b.head && a.others.length === 2 && JSON.stringify(a.others) === JSON.stringify(b.others), a.head !== b.head ? at(a.head, b.head) : at(JSON.stringify(a.others), JSON.stringify(b.others)));
      // The Notes section, with what 0.54.0 adds taken out again, is 0.53.1's.
      const strip = h => h.replace(' is-notes', '').replace(/<span class="mphbac-staff-copywrap">.*?<\/span>/g, '');
      check(`${w}px, ${what}: the Notes section, its class and Copy buttons taken out, is 0.53.1's markup`, a.notes.length === 1 && strip(b.notes[0]) === a.notes[0], [a.notes[0].slice(0, 120), strip(b.notes[0]).slice(0, 120)]);
    }
  }
  await browser.close();
  fs.rmSync(OLD, { recursive: true, force: true });
  done();
})().catch(e => { console.error(e); fs.rmSync(OLD, { recursive: true, force: true }); process.exit(1); });
