'use strict';
/**
 * 0.54.0 — THE POP-UP'S NOTES (Rob, 2026-11-03): plain weight, and a Copy
 * button on every note. Driven in a real page with the shipped (minified)
 * staff.js, the site's html { font-weight: 700 } in force (H.THEME), on an
 * https origin (the Clipboard API needs one), Chromium with touch emulation
 * standing in for Safari on an iPhone.
 *
 *   1  where the bold came from, and that it is gone from the note text only
 *   2  one Copy button per note, under its date and author, in the label
 *      column, the Phone line's "Text" pill in size, shape and colour
 *   3  a tap copies that note's text alone, as text/plain — no HTML on the
 *      clipboard, no date, no author, line breaks kept, trailing spaces gone
 *      — called within the tap itself; "Copied" for about 2 seconds
 *   4  the clipboard refused: "Couldn't Copy", nothing else changes
 *   5  no Clipboard API at all: the textarea fallback, plain text too
 *   6  nothing new is asked of the server
 */
const path = require('path');
const { chromium } = require('playwright-core');
const S = require('./staff-harness.js');
const H = require('./harness.js');
const N = require('./note-copy-054-fixture.js');
const { check, done } = H.reporter();

const ORIGIN = 'https://staff.test/';
const show = s => JSON.stringify(s);

(async () => {
  const browser = await chromium.launch(S.CHROMIUM);
  const html = S.boardShell({ today: N.F.TODAY, cottages: N.F.COTTAGES, bookings: N.F.BOOKINGS, details: N.DETAILS, search: N.F.SEARCH });
  const open = async (w, id) => {
    const phone = w < 700;
    const ctx = await browser.newContext(phone ? { viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: w, height: 900 } });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN.slice(0, -1) });
    await ctx.route(ORIGIN + '**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    const p = await ctx.newPage();
    p.__errors = [];
    p.on('pageerror', e => p.__errors.push(e.message));
    await p.goto(ORIGIN);
    await p.waitForFunction(() => document.querySelector('.mphbac-staff-bar'));
    await p.evaluate(() => document.fonts.ready);
    await p.click(`.mphbac-staff-bar[data-booking-id="${id}"]`);
    await p.waitForSelector('.mphbac-staff-sheet .mphbac-staff-section');
    await p.waitForTimeout(400);
    return { ctx, p };
  };
  const readClip = p => p.evaluate(async () => {
    const items = await (window.__clip || navigator.clipboard).read();
    const out = [];
    for (const it of items) for (const t of it.types) out.push({ type: t, text: await (await it.getType(t)).text() });
    return out;
  });

  console.log('-- 1. the note text in plain weight; nothing else moves --');
  for (const w of [390, 1440]) {
    const { ctx, p } = await open(w, 7);
    const m = await p.evaluate(() => {
      const fw = e => getComputedStyle(e).fontWeight;
      const notes = document.querySelector('.mphbac-staff-section.is-notes');
      const other = [...document.querySelectorAll('.mphbac-staff-sheet .mphbac-staff-section:not(.is-notes)')];
      // Where the bold comes from: the dialog is on <body>, and html is 700.
      return { html: fw(document.documentElement), sheetParent: document.querySelector('.mphbac-staff-sheet').parentNode.tagName, sheet: fw(document.querySelector('.mphbac-staff-sheet')),
        noteDd: [...notes.querySelectorAll('dd')].map(fw), noteDt: [...notes.querySelectorAll('dt')].map(fw), head: fw(notes.querySelector('h3')),
        otherDd: other.flatMap(s => [...s.querySelectorAll('dd')].map(d => d.querySelector('a') ? 'link' : fw(d))), otherDt: other.flatMap(s => [...s.querySelectorAll('dt')].map(fw)) };
    });
    if (w === 390) check('the source of the bold: the theme\'s html { font-weight: 700 }, and the pop-up on <body> inherits it (' + m.html + ' → ' + m.sheet + ')', m.html === '700' && m.sheetParent === 'BODY' && m.sheet === '700');
    check(`${w}px: every note's text at 400`, m.noteDd.length === 3 && m.noteDd.every(x => x === '400'), m.noteDd);
    check(`${w}px: the date and author labels unchanged (600), the heading unchanged (700)`, m.noteDt.every(x => x === '600') && m.head === '700', [m.noteDt, m.head]);
    check(`${w}px: the other sections unchanged: values 700, labels 600`, m.otherDd.filter(x => x !== 'link').every(x => x === '700') && m.otherDt.every(x => x === '600'), [m.otherDd, m.otherDt]);
    await ctx.close();
  }

  console.log('\n-- 2. a Copy button on every note, the Text pill\'s twin --');
  for (const w of [390, 1440]) {
    for (const id of [1, 7]) {
      const { ctx, p } = await open(w, id);
      const m = await p.evaluate(() => {
        const box = e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
        const look = e => { const c = getComputedStyle(e); return ['height', 'padding-left', 'padding-right', 'border-radius', 'background-color', 'color', 'font-family', 'font-size', 'font-weight', 'line-height', 'border-top-width', 'box-shadow', 'text-transform', 'letter-spacing']
          .map(k => k + ':' + c.getPropertyValue(k)).join(';'); };
        const sms = document.querySelector('.mphbac-staff-sms');
        // A pill's width is its word plus the same padding: the word measured
        // by a Range over its text, the rest is what the pill adds.
        const extra = e => { const rg = document.createRange(); rg.selectNodeContents(e); return e.getBoundingClientRect().width - rg.getBoundingClientRect().width; };
        const rows = [...document.querySelectorAll('.mphbac-staff-section.is-notes dt')].map(dt => {
          const b = dt.querySelector('button.mphbac-staff-copy'), dd = dt.nextElementSibling;
          const label = [...dt.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('');
          return b && { label, text: b.textContent, aria: b.getAttribute('aria-label'), type: b.type, inDt: dt.contains(b),
            below: box(b).t >= box(dt).t + 10, leftCol: box(b).r <= box(dd).l, look: look(b), box: box(b), extra: extra(b) };
        });
        return { sms: { look: look(sms), box: box(sms), text: sms.textContent, extra: extra(sms) }, rows, buttons: document.querySelectorAll('.mphbac-staff-copy').length,
          elsewhere: document.querySelectorAll('.mphbac-staff-section:not(.is-notes) .mphbac-staff-copy').length };
      });
      const n = id === 1 ? 1 : 3;
      const tag = `${w}px, booking ${id} (${id === 1 ? 'one note' : 'two notes + the guest\'s note'})`;
      check(`${tag}: one Copy button per note (${n}), none in any other section`, m.rows.length === n && m.rows.every(Boolean) && m.buttons === n && m.elsewhere === 0, m.rows.length);
      check(`${tag}: each under its date and author, in the label column (inside the dt, below the label, left of the text)`, m.rows.every(r => r.inDt && r.below && r.leftCol), m.rows.map(r => [r.below, r.leftCol]));
      check(`${tag}: labelled "Copy", a real button, named for its note ("Copy note from Aug 4, 2026, 3:15 pm · Rob Croft")`,
        m.rows.every(r => r.text === 'Copy' && r.type === 'button' && r.aria === 'Copy note from ' + r.label), m.rows.map(r => r.aria));
      check(`${tag}: the Text pill's size, shape and colours, property for property (height, padding, radius, colours, type); its height ${Math.round(m.sms.box.h)}px`,
        m.rows.every(r => r.look === m.sms.look && Math.abs(r.box.h - m.sms.box.h) < 0.5), m.rows.map(r => r.look === m.sms.look ? 'same' : r.look + ' ≠ ' + m.sms.look));
      check(`${tag}: …and as wide as its word plus the same padding as "Text" (${m.sms.extra.toFixed(1)}px) — "Copy" is the wider word (${Math.round(m.rows[0].box.w)} vs ${Math.round(m.sms.box.w)}px)`,
        m.rows.every(r => Math.abs(r.extra - m.sms.extra) < 0.5), m.rows.map(r => r.extra));
      await ctx.close();
    }
  }

  console.log('\n-- 3. a tap copies that note, plain, and says "Copied" --');
  {
    const { ctx, p } = await open(390, 7);
    // Prove the call happens INSIDE the tap: writeText is wrapped to record
    // whether the tap's own event was still being dispatched.
    await p.evaluate(() => {
      const real = navigator.clipboard.writeText.bind(navigator.clipboard);
      window.__calls = [];
      navigator.clipboard.writeText = t => { window.__calls.push({ t, inTap: !!window.event && window.event.type === 'click' }); return real(t); };
    });
    const want = [N.CUSTOMER, N.NOTE_2A, N.NOTE_2B.replace(/[ \t]+$/gm, '')];
    for (let i = 0; i < 3; i++) {
      const b = (await p.$$('.mphbac-staff-copy'))[i];
      await b.tap();
      await p.waitForTimeout(120);
      const clip = await readClip(p);
      const label = await b.textContent();
      check(`note ${i + 1}: a tap → the clipboard holds that note's text only: ${show(clip.map(c => c.text).join(''))}`,
        clip.length === 1 && clip[0].text === want[i], show(clip));
      check(`note ${i + 1}: …as text/plain alone — no text/html on the clipboard`, clip.every(c => c.type === 'text/plain'), clip.map(c => c.type));
      check(`note ${i + 1}: the button says "Copied"`, label === 'Copied', label);
    }
    const calls = await p.evaluate(() => window.__calls);
    check('writeText was called within the tap itself, every time (no await or timer before it), once per tap', calls.length === 3 && calls.every(c => c.inTap), calls);
    const still = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-copy')].map(b => b.textContent));
    await p.waitForTimeout(2100);
    const back = await p.evaluate(() => [...document.querySelectorAll('.mphbac-staff-copy')].map(b => b.textContent));
    check('"Copied" holds, then after about 2 seconds every button reads "Copy" again', still[2] === 'Copied' && back.every(t => t === 'Copy'), [still, back]);
    await ctx.close();
  }
  {
    // The three-line note: its line breaks, and the trailing spaces of
    // "Gate code 4417   " dropped. The raw clipboard, escaped.
    const { ctx, p } = await open(1440, 1);
    await p.click('.mphbac-staff-copy');
    await p.waitForTimeout(150);
    const clip = await readClip(p);
    const raw = clip[0] && clip[0].text;
    console.log('   THE CLIPBOARD, RAW (\\n = a line break): ' + show(raw));
    check('one-note pop-up: the clipboard is the note\'s three lines exactly, "\\n" between them, no trailing spaces, no date, no author',
      raw === 'Early check-in OK from 1pm.\nGate code 4417\nBoat key on the hook by the door.' && !/Aug|Rob Croft|3:15/.test(raw) && !/[ \t]\n|[ \t]$/.test(raw), show(raw));
    check('…text/plain only (no text/html, no rich text)', clip.length === 1 && clip[0].type === 'text/plain', clip.map(c => c.type));
    check('no page errors', p.__errors.length === 0, p.__errors);
    await ctx.close();
  }

  console.log('\n-- 4. the clipboard refused --');
  {
    const { ctx, p } = await open(390, 7);
    await p.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); });
    const before = await p.evaluate(() => document.querySelector('.mphbac-staff-sheet-body').innerHTML);
    await (await p.$$('.mphbac-staff-copy'))[1].tap();
    await p.waitForTimeout(120);
    const after = await p.evaluate(() => ({ html: document.querySelector('.mphbac-staff-sheet-body').innerHTML, labels: [...document.querySelectorAll('.mphbac-staff-copy')].map(b => b.textContent),
      open: !document.querySelector('.mphbac-staff-sheet').hidden }));
    check('the button says "Couldn\'t Copy" (Title Case)', after.labels[1] === "Couldn't Copy", after.labels);
    // The pop-up before, with the second button's label alone swapped,
    // must be the pop-up after, byte for byte.
    let k = 0;
    const expected = before.replace(/>Copy<\/button>/g, m => (++k === 2 ? ">Couldn't Copy</button>" : m));
    check('…and nothing else changed: the other buttons, the pop-up, every other byte of it', after.open && after.html === expected, after.labels);
    await p.waitForTimeout(2100);
    check('…then back to "Copy"', (await p.evaluate(() => document.querySelectorAll('.mphbac-staff-copy')[1].textContent)) === 'Copy');
    await ctx.close();
  }

  console.log('\n-- 5. no Clipboard API (an older browser, plain http): the fallback --');
  {
    const { ctx, p } = await open(390, 1);
    await p.evaluate(() => { window.__clip = navigator.clipboard; Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); });
    await p.tap('.mphbac-staff-copy');
    await p.waitForTimeout(150);
    const clip = await readClip(p);
    const m = await p.evaluate(() => ({ label: document.querySelector('.mphbac-staff-copy').textContent, left: document.querySelectorAll('textarea').length }));
    check('the hidden-textarea copy: the same plain text, text/plain only, "Copied", and the textarea gone',
      clip.length === 1 && clip[0].type === 'text/plain' && clip[0].text === 'Early check-in OK from 1pm.\nGate code 4417\nBoat key on the hook by the door.' && m.label === 'Copied' && m.left === 0, [show(clip), m]);
    await ctx.close();
  }

  console.log('\n-- 6. nothing new asked of the server --');
  {
    const { ctx, p } = await open(390, 7);
    const n0 = await p.evaluate(() => window.__reqs.length);
    for (const b of await p.$$('.mphbac-staff-copy')) { await b.tap(); await p.waitForTimeout(60); }
    const reqs = await p.evaluate(() => window.__reqs.map(r => r.action));
    check('three taps: no request at all; the pop-up came from the one booking request it always made', reqs.length === n0 && reqs.filter(a => a === 'mphbac_staff_booking').length === 1, reqs);
    await ctx.close();
  }

  await browser.close();
  done();
})().catch(e => { console.error(e); process.exit(1); });
