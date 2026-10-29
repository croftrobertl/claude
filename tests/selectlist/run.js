/**
 * v0.34.1 — the site's own dropdown list on the guest checkout.
 *
 *   cd tests/selectlist && npm install && node run.js
 *   DCC_SHOTS=/some/dir node run.js     # also saves the opened-list screenshots
 *
 * Real Chromium at 375px (touch) and 1280px. WHAT IS REAL: the shipped
 * select-list.js, checkout.js, guest-count.js and checkout.css, with the
 * guest-count config from the shipped PHP (tests/recalc/config.php).
 *
 * WHAT IS A STAND-IN: the page (MotoPress's checkout form as the other suites
 * draw it — guest chooser, Country, the dog Checkout Fields, a file field) and
 * MotoPress's script (a change on the guest chooser asks admin-ajax for a
 * price; the booking is a REST POST). The THEME's traps are reproduced, because
 * they are what would make the closed field change: html{font-weight:700},
 * Bravada's Pavanam + uppercase on <button>, and an Elementor-kit rule giving
 * buttons 900 weight, 1.5px letter-spacing and capitalisation.
 *
 * Every "the closed field does not change" check compares a page WITH the
 * script against the same page WITHOUT it, at the same width.
 */
const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ASSETS = path.join(__dirname, '../../dcc-custom-checkout/assets');
// v0.34.2 — DCC_MIN=1 runs the whole suite against the BUILT assets, the ones
// a guest downloads. The minifier removes comments and indentation only, but
// "only" is a claim about a program that rewrites every shipped line, so the
// claim is tested rather than reasoned about: same page, same assertions.
const MIN = process.env.DCC_MIN === '1';
const read = f => fs.readFileSync(path.join(ASSETS, MIN ? f.replace(/\.(js|css)$/, '.min.$1') : f), 'utf8');
const CSS = read('checkout.css'), CHECKOUT = read('checkout.js'), GC = read('guest-count.js'), LIST = read('select-list.js');
const GC_CFG = execFileSync('php', [path.join(__dirname, '../recalc/config.php'), 'guest'], { encoding: 'utf8' });
const GUESTS_MSG = 'Please select the number of guests.';
const SHOTS = process.env.DCC_SHOTS || '';

function chromiumPath() {
    if (process.env.DCC_CHROMIUM) { return process.env.DCC_CHROMIUM; }
    if (fs.existsSync('/opt/pw-browsers/chromium')) { return '/opt/pw-browsers/chromium'; }
    return undefined;
}

let failures = 0, passes = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { passes++; } else { failures++; }
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) { console.log(`      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`); }
}

const COUNTRIES = ['Argentina', 'Australia', 'Austria', 'Bahamas', 'Belgium', 'Brazil', 'Canada', 'Chile', 'China',
    'Colombia', 'Denmark', 'Finland', 'France', 'Germany', 'Greece', 'Iceland', 'India', 'Ireland', 'Israel', 'Italy',
    'Jamaica', 'Japan', 'Mexico', 'Netherlands', 'New Zealand', 'Norway', 'Peru', 'Poland', 'Portugal', 'Spain',
    'Sweden', 'Switzerland', 'United Kingdom', 'United States', 'Uruguay', 'Venezuela'];

const DCC_CFG = {
    petFeeEnabled: true, petAccommodations: [1607],
    serviceIds: { daily: 19692, weekly: 19692, monthly: 19692 }, serviceIdList: [19692, 17712, 17711, 14926],
    thresholds: { min_daily: 2, min_weekly: 7, min_monthly: 30 },
    dogFieldNames: ['mphb_dog_type', 'mphb_dog_size', 'mphb_dog_hair'], guestGroups: [],
    guestFeeEnabled: false, guestServiceIds: { daily: 0, weekly: 0, monthly: 0 }, guestServiceIdList: [],
    guestAccommodations: [], includedGuests: 2, guestFeeSteps: {},
    guestsSelector: 'select[name^="mphb_room_details"][name*="[adults]"]',
    sectionTitles: { pet: 'Pet Information' }, isAdmin: false, version: 'test',
    i18n: { petQuestion: 'Traveling with a dog?', petNo: 'No', petYes: 'Yes', requiredMsg: 'Please complete all of the required fields.' },
};

function html(o) {
    const opt = (v, t, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${t}</option>`;
    const guests = opt('', '— Select —') + [1, 2].map(n => opt(n, n)).join('');
    const countries = opt('', '— Select —') + COUNTRIES.map(c => opt(c, c, c === 'United States')).join('');
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
html { font-weight: 700; }
body { margin: 0; font-family: Arial, sans-serif; }
button { font-family: "Pavanam", serif; text-transform: uppercase; }
.elementor-kit-17 button { font-size: 18px; font-weight: 900; letter-spacing: 1.5px; text-transform: capitalize; }
ul { margin: 0 0 1em 2em; padding-left: 20px; } li { margin-bottom: 6px; }
.mphb-hide { display: none; }
.wrap { max-width: 700px; margin: 0 auto; padding: 0 16px; }
</style><style>${CSS}</style></head><body class="elementor-kit-17"><div class="wrap">
${o.tall ? '<div style="height:900px"></div>' : ''}
<form class="mphb_sc_checkout-form" method="post" action="/submit-booking/">
  <input type="hidden" name="mphb_room_details[0][room_type_id]" value="1607">
  <input type="hidden" name="mphb_check_in_date" value="2026-11-02">
  <input type="hidden" name="mphb_check_out_date" value="2026-11-04">
  <section class="mphb-room-details">
    <p class="mphb-adults-chooser"><label for="mphb_adults-0">Guests</label>
      <select id="mphb_adults-0" name="mphb_room_details[0][adults]" class="mphb_sc_checkout-guests-chooser mphb_checkout-guests-chooser" required>${guests}</select></p>
    <section class="mphb-services-details"><h4 class="services-heading">Choose Additional Services</h4>
      <ul class="mphb_sc_checkout-services-list"><li><label><input type="checkbox" class="mphb_sc_checkout-service mphb_checkout-service" name="mphb_room_details[0][services][0][id]" value="19692"> Pet Fee (per night)</label></li>
        <li><label><input type="checkbox" class="mphb_sc_checkout-service mphb_checkout-service" name="mphb_room_details[0][services][1][id]" value="18063"> Extra Guest Fee for
          <select name="mphb_room_details[0][services][1][adults]" class="mphb_sc_checkout-service-adults"><option>1</option><option>2</option></select></label></li></ul></section>
  </section>
  <section class="mphb-customer-details"><h3>Your Information</h3>
    <p class="mphb-customer-name mphb-text-control"><label for="mphb_first_name">First Name</label><input type="text" id="mphb_first_name" name="mphb_first_name" value="Test"></p>
    <p class="mphb-customer-country mphb-text-control"><label for="mphb_country">Country of residence</label><select id="mphb_country" name="mphb_country">${countries}</select></p>
    <p class="mphb-text-control"><label for="mphb_dog_type">Dog Type</label><input type="text" id="mphb_dog_type" name="mphb_dog_type"></p>
    <p class="mphb-text-control"><label for="mphb_dog_size">Dog Size</label><select id="mphb_dog_size" name="mphb_dog_size"><option value="">— Select —</option><option value="Up to 20 lbs">Up to 20 lbs</option></select></p>
    <p class="mphb-text-control"><label for="mphb_dog_hair">Dog Hair</label><select id="mphb_dog_hair" name="mphb_dog_hair"><option value="">— Select —</option><option>Short</option><option>Long</option></select></p>
    <p class="mphb-text-control"><label for="mphb_upload">Upload Photo ID</label><input type="file" id="mphb_upload" name="mphb_upload_id"></p>
  </section>
  <section id="mphb-price-details"><h3>Price Breakdown</h3>
    <table class="mphb-price-breakdown"><tbody><tr class="mphb-price-breakdown-total"><th>Total</th><td class="tot">$300</td></tr></tbody></table></section>
  <p class="mphb-errors-wrapper mphb-hide"></p>
  <p class="mphb_sc_checkout-submit-wrapper"><input type="submit" class="button" value="Book Now"></p>
</form>
<p id="after">After the form.</p>
<div style="height:40px"></div>
</div>
<script>window.DCC_GUEST_COUNT = ${GC_CFG};</script><script>${GC}</script>
<script>window.DCC_CHECKOUT = ${JSON.stringify(DCC_CFG)};</script><script>${CHECKOUT}</script>
${o.list === false ? '' : `<script>${LIST}</script>`}
<script>
/* MotoPress's checkout script — a stand-in. A change on the guest chooser or a
   service asks for a price with the guest count it sends; the booking is a
   REST POST of the form. */
(function () {
  var form = document.querySelector('.mphb_sc_checkout-form');
  window.__asked = []; window.__submitted = 0;
  function price() {
    var sel = form.querySelector('[name="mphb_room_details[0][adults]"]');
    var x = new XMLHttpRequest();
    x.open('GET', '/wp-admin/admin-ajax.php?action=mphb_update_checkout_info&formValues%5Bmphb_room_details%5D%5B0%5D%5Badults%5D=' + encodeURIComponent(sel.value));
    x.onload = function () { var r = JSON.parse(x.responseText); window.__asked.push(r.adults); form.querySelector('.tot').textContent = r.total; };
    x.send();
  }
  form.addEventListener('change', function (e) {
    if (e.target.matches('.mphb_checkout-guests-chooser, .mphb_checkout-service')) { price(); }
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    window.__lastSubmit = Array.from(new FormData(form).entries()).filter(function (p) { return typeof p[1] === 'string'; });
    window.__submitted++;
  });
  document.addEventListener('DOMContentLoaded', price);
})();
</script></body></html>`;
}

async function openPage(browser, width, o) {
    o = o || {};
    const touch = width < 600;
    const ctx = await browser.newContext({ viewport: { width, height: o.height || 800 }, hasTouch: touch, isMobile: touch });
    const pg = await ctx.newPage();
    pg.setDefaultTimeout(5000);
    const consoleErrors = [];
    pg.on('console', m => { if (m.type() === 'error') { consoleErrors.push(m.text()); } });
    pg.on('pageerror', e => { failures++; console.log(`FAIL  page error: ${e.message}`); });
    await pg.route('**/wp-admin/admin-ajax.php**', route => {
        const u = new URL(route.request().url());
        const adults = u.searchParams.get('formValues[mphb_room_details][0][adults]');
        return route.fulfill({ status: 200, contentType: 'application/json',
            body: JSON.stringify({ adults, total: adults >= 1 ? '$' + (300 + (adults > 2 ? 100 : 0)) : 'refused' }) });
    });
    await pg.route(u => u.href.startsWith('http://dcc.test/submit-booking/'), r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html(o) }));
    await pg.goto('http://dcc.test/submit-booking/');
    await pg.waitForFunction(() => window.__asked.length >= 1);
    await pg.waitForTimeout(500); // checkout.js's 400ms re-measure of the file field
    return { ctx, pg, consoleErrors };
}

const FIELD = {
    guests: 'select[name="mphb_room_details[0][adults]"]',
    country: 'select[name="mphb_country"]',
    size: 'select[name="mphb_dog_size"]',
};
const btnOf = sel => `${sel} + .dcc_checkout-select > button`;

// What the closed field looks like: the select itself, or the button that
// replaced it.
async function closedLook(pg, sel, list) {
    return pg.evaluate(([sel, list]) => {
        const s = document.querySelector(sel);
        const el = list ? s.nextElementSibling.querySelector('button') : s;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const props = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'textTransform', 'color',
            'backgroundColor', 'backgroundImage', 'backgroundPosition', 'borderTopWidth', 'borderTopStyle', 'borderTopColor',
            'borderBottomColor', 'borderTopLeftRadius', 'borderBottomRightRadius', 'paddingTop', 'paddingRight',
            'paddingBottom', 'paddingLeft', 'textAlign', 'lineHeight', 'boxSizing'];
        const out = { x: Math.round(r.left * 2) / 2, y: Math.round(r.top * 2) / 2, w: Math.round(r.width * 2) / 2, h: Math.round(r.height * 2) / 2 };
        props.forEach(p => { out[p] = cs[p]; });
        out.text = list ? el.textContent : s.options[s.selectedIndex].textContent;
        out.after = Math.round(document.getElementById('after').getBoundingClientRect().top);
        return out;
    }, [sel, list]);
}

async function listInfo(pg) {
    return pg.evaluate(() => {
        const list = document.querySelector('ul.dcc_checkout-select-list');
        if (!list) { return null; }
        const r = list.getBoundingClientRect();
        const cs = getComputedStyle(list);
        const items = Array.from(list.querySelectorAll('li'));
        const sel = list.querySelector('[aria-selected="true"]');
        const centred = items.every(li => {
            const range = document.createRange();
            range.selectNodeContents(li);
            const t = range.getBoundingClientRect(), b = li.getBoundingClientRect();
            return Math.abs((t.left + t.width / 2) - (b.left + b.width / 2)) <= 1;
        });
        return {
            rect: { top: r.top, bottom: r.bottom, left: r.left, width: r.width },
            role: list.getAttribute('role'),
            border: [cs.borderTopWidth, cs.borderTopColor, cs.borderTopStyle],
            bg: cs.backgroundColor, radius: cs.borderTopLeftRadius, fontSize: cs.fontSize,
            items: items.map(li => li.textContent),
            roles: items.every(li => li.getAttribute('role') === 'option' && li.hasAttribute('aria-selected')),
            minRow: Math.min.apply(null, items.map(li => li.getBoundingClientRect().height)),
            itemFont: Math.min.apply(null, items.map(li => parseFloat(getComputedStyle(li).fontSize))),
            centred,
            selected: sel ? { text: sel.textContent, weight: getComputedStyle(sel).fontWeight, color: getComputedStyle(sel).color, bg: getComputedStyle(sel).backgroundColor } : null,
            active: (list.getAttribute('aria-activedescendant') && document.getElementById(list.getAttribute('aria-activedescendant')) || {}).textContent || null,
            focused: document.activeElement === list,
            clientH: list.clientHeight, scrollH: list.scrollHeight,
            selVisible: sel ? (sel.offsetTop >= list.scrollTop && sel.offsetTop + sel.offsetHeight <= list.scrollTop + list.clientHeight) : null,
        };
    });
}

async function tapOrClick(pg, selector, touch) {
    if (touch) { await pg.tap(selector); } else { await pg.click(selector); }
}

(async () => {
    const browser = await chromium.launch({ executablePath: chromiumPath() });
    const shots = [];

    for (const width of [375, 1280]) {
        const touch = width < 600;
        const W = `${width}px`;

        /* --- 5. The closed fields do not change. ----------------------------- */
        {
            const a = await openPage(browser, width, { list: false });
            const b = await openPage(browser, width, {});
            for (const [name, sel] of [['guest count', FIELD.guests], ['Country', FIELD.country]]) {
                check(`${W} closed ${name}: the field looks and sits exactly as the native select did`,
                    await closedLook(b.pg, sel, true), await closedLook(a.pg, sel, false));
            }
            // Dog Size: shown once the dog question is answered Yes.
            await a.pg.check('input[name="dcc_checkout_dog"][value="yes"]');
            await b.pg.check('input[name="dcc_checkout_dog"][value="yes"]');
            await a.pg.waitForTimeout(100); await b.pg.waitForTimeout(100);
            check(`${W} closed Dog Size: the same`, await closedLook(b.pg, FIELD.size, true), await closedLook(a.pg, FIELD.size, false));
            check(`${W} checkout.js still hides the native services section with the script on (its chooser check reads the field the guest sees)`,
                await b.pg.$eval('.services-heading', h => getComputedStyle(h).display === 'none' || !!h.closest('.dcc_checkout-service-hidden, [hidden]') || h.getBoundingClientRect().height === 0), true);
            check(`${W} the upload field still takes the Country field's width (checkout.js measures the field shown, not the hidden select)`,
                await b.pg.evaluate(() => Math.round(document.querySelector('input[type=file]').getBoundingClientRect().width)),
                await a.pg.evaluate(() => Math.round(document.querySelector('input[type=file]').getBoundingClientRect().width)));
            check(`${W} the real select stays in the form, hidden only visually (never display/visibility — checkout.js's chooser check reads those), out of the tab order`,
                await b.pg.$eval(FIELD.guests, s => { const cs = getComputedStyle(s); return [!!s.form, cs.display !== 'none', cs.visibility, s.tabIndex, s.getAttribute('aria-hidden'), s.getBoundingClientRect().width <= 1]; }),
                [true, true, 'visible', -1, 'true', true]);
            await a.ctx.close(); await b.ctx.close();
        }

        /* --- 1. Look, and 2. a choice is the select's own. ------------------- */
        {
            const { ctx, pg } = await openPage(browser, width, {});
            await pg.$eval(FIELD.guests, s => { window.__ev = []; ['input', 'change'].forEach(t => s.addEventListener(t, () => window.__ev.push(t))); });
            await tapOrClick(pg, btnOf(FIELD.guests), touch);
            const L = await listInfo(pg);
            const b = await pg.$eval(btnOf(FIELD.guests), e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, width: r.width, exp: e.getAttribute('aria-expanded') }; });
            check(`${W} guest count opens a listbox right under its field, the field's width`,
                [L && L.role, Math.round(L.rect.top - b.bottom), Math.round(L.rect.left - b.left), Math.round(L.rect.width - b.width), b.exp],
                ['listbox', 4, 0, 0, 'true']);
            check(`${W} ... white, a 2px #F4DA62 border, the field's radius and font size`,
                [L.bg, L.border, L.radius, L.fontSize], ['rgb(255, 255, 255)', ['2px', 'rgb(244, 218, 98)', 'solid'], '30px', '18px']);
            check(`${W} ... items centred, every row at least 44px, text at least 16px`,
                [L.centred, L.minRow >= 44, L.itemFont >= 16], [true, true, true]);
            check(`${W} ... options as the select has them, role="option" with aria-selected`,
                [L.items, L.roles], [['— Select —', '1', '2'], true]);
            check(`${W} ... the current choice in bold #0A50B2 on #E7EEF7, and it is the active one; focus is in the list`,
                [L.selected, L.active, L.focused],
                [{ text: '— Select —', weight: '700', color: 'rgb(10, 80, 178)', bg: 'rgb(231, 238, 247)' }, '— Select —', true]);
            if (SHOTS) { const f = path.join(SHOTS, `Custom Checkout - Dropdown guests ${width}.png`); await pg.screenshot({ path: f }); shots.push(f); }
            const asked = (await pg.evaluate(() => window.__asked.length));
            await tapOrClick(pg, 'ul.dcc_checkout-select-list li:nth-child(2)', touch);
            await pg.waitForFunction(n => window.__asked.length > n, asked);
            check(`${W} choosing 1: the select's value, its REAL input and change events, the field says 1, the list closes, focus back on the field`,
                await pg.evaluate(([s, b]) => [document.querySelector(s).value, window.__ev, document.querySelector(b).textContent,
                    !!document.querySelector('ul.dcc_checkout-select-list'), document.querySelector(b).getAttribute('aria-expanded'),
                    document.activeElement === document.querySelector(b)], [FIELD.guests, btnOf(FIELD.guests)]),
                ['1', ['input', 'change'], '1', false, 'false', true]);
            check(`${W} ... MotoPress was asked to price the stay for the chosen 1`, await pg.evaluate(() => window.__asked[window.__asked.length - 1]), '1');
            await tapOrClick(pg, btnOf(FIELD.guests), touch);
            check(`${W} reopened: 1 is now the bold current choice`, (await listInfo(pg)).selected.text, '1');
            await pg.keyboard.press('Escape');
            await ctx.close();
        }

        /* --- Long list: Country scrolls inside a max height, opened at the choice. */
        {
            const { ctx, pg } = await openPage(browser, width, {});
            await pg.$eval(btnOf(FIELD.country), e => e.scrollIntoView({ block: 'start' }));
            await tapOrClick(pg, btnOf(FIELD.country), touch);
            const L = await listInfo(pg);
            check(`${W} Country: scrolls inside a max height of 320px, opened scrolled to the current choice (United States, visible)`,
                [L.clientH <= 320, L.scrollH > L.clientH, L.selected.text, L.selVisible], [true, true, 'United States', true]);
            if (SHOTS) { const f = path.join(SHOTS, `Custom Checkout - Dropdown country ${width}.png`); await pg.screenshot({ path: f }); shots.push(f); }
            await ctx.close();
        }

        /* --- No room below: it opens upward. ------------------------------- */
        {
            const { ctx, pg } = await openPage(browser, width, { tall: true });
            await pg.$eval(btnOf(FIELD.country), e => {
                const r = e.getBoundingClientRect();
                window.scrollBy(0, r.bottom - (window.innerHeight - 40));
            });
            await tapOrClick(pg, btnOf(FIELD.country), touch);
            const L = await listInfo(pg);
            const b = await pg.$eval(btnOf(FIELD.country), e => e.getBoundingClientRect().top);
            check(`${W} a field near the bottom of the screen: the list opens UPWARD, ending just above the field, on screen`,
                [Math.round(b - L.rect.bottom), L.rect.top >= 0], [4, true]);
            await ctx.close();
        }

        /* --- Closing: Escape, outside, without changing anything. ----------- */
        {
            const { ctx, pg } = await openPage(browser, width, {});
            await tapOrClick(pg, btnOf(FIELD.country), touch);
            await pg.keyboard.press('ArrowDown');
            await pg.keyboard.press('Escape');
            check(`${W} Escape closes it, nothing chosen, focus back on the field`,
                await pg.evaluate(([s, b]) => [!!document.querySelector('ul.dcc_checkout-select-list'), document.querySelector(s).value,
                    document.activeElement === document.querySelector(b)], [FIELD.country, btnOf(FIELD.country)]),
                [false, 'United States', true]);
            await tapOrClick(pg, btnOf(FIELD.country), touch);
            await tapOrClick(pg, '#after', touch);
            check(`${W} a ${touch ? 'tap' : 'click'} outside closes it, nothing chosen`,
                await pg.evaluate(s => [!!document.querySelector('ul.dcc_checkout-select-list'), document.querySelector(s).value], FIELD.country),
                [false, 'United States']);
            await tapOrClick(pg, btnOf(FIELD.guests), touch);
            await tapOrClick(pg, btnOf(FIELD.country), touch);
            check(`${W} opening another field closes the first: one list at a time, the new one under Country`,
                await pg.evaluate(() => [document.querySelectorAll('ul.dcc_checkout-select-list').length,
                    document.querySelector('ul.dcc_checkout-select-list li[aria-selected="true"]').textContent]), [1, 'United States']);
            await ctx.close();
        }

        /* --- 3. Validation: only after a submit attempt. --------------------- */
        {
            const { ctx, pg, consoleErrors } = await openPage(browser, width, {});
            await pg.$eval(FIELD.guests, s => { window.__prevented = []; s.addEventListener('invalid', e => window.__prevented.push(e.defaultPrevented)); });
            check(`${W} at load: no message anywhere`, await pg.$$eval('.dcc_checkout-field-error', e => e.length), 0);
            await pg.evaluate(() => document.querySelector('form').checkValidity());
            check(`${W} a script's checkValidity() at load (no submit attempt): still nothing shown`,
                await pg.$$eval('.dcc_checkout-field-error', e => e.length), 0);
            await tapOrClick(pg, 'input[type="submit"]', touch);
            await pg.waitForTimeout(100);
            const v = await pg.evaluate(([s, b]) => {
                const btn = document.querySelector(b), msg = document.querySelector(s + ' + .dcc_checkout-select .dcc_checkout-field-error');
                return msg && [msg.textContent, getComputedStyle(msg).display !== 'none' && msg.getBoundingClientRect().height > 0,
                    Math.round(msg.getBoundingClientRect().top) >= Math.round(btn.getBoundingClientRect().bottom),
                    btn.getAttribute('aria-invalid'), btn.getAttribute('aria-describedby') === msg.id,
                    btn.classList.contains('dcc_checkout-invalid'), document.activeElement === btn, getComputedStyle(msg).color];
            }, [FIELD.guests, btnOf(FIELD.guests)]);
            check(`${W} Book Now with no guest count: "${GUESTS_MSG}" UNDER the field, in the error ink; the field marked invalid, described by it, and focused`,
                v, [GUESTS_MSG, true, true, 'true', true, true, true, 'rgb(188, 0, 62)']);
            check(`${W} ... no booking was sent, and the browser was told not to bubble at the hidden select (it never tried)`,
                [await pg.evaluate(() => window.__submitted), await pg.evaluate(() => window.__prevented.slice(-1)), consoleErrors.filter(m => /not focusable/i.test(m))],
                [0, [true], []]);
            await tapOrClick(pg, btnOf(FIELD.guests), touch);
            await tapOrClick(pg, 'ul.dcc_checkout-select-list li:nth-child(3)', touch);
            check(`${W} choosing 2 clears it`,
                await pg.evaluate(([s, b]) => [document.querySelectorAll(s + ' + .dcc_checkout-select .dcc_checkout-field-error').length,
                    document.querySelector(b).getAttribute('aria-invalid'), document.querySelector(b).hasAttribute('aria-describedby')],
                [FIELD.guests, btnOf(FIELD.guests)]), [0, null, false]);
            await tapOrClick(pg, 'input[type="submit"]', touch);
            await pg.waitForFunction(() => window.__submitted >= 1);
            check(`${W} ... then Book Now sends the booking with the guest's 2`,
                await pg.evaluate(() => (window.__lastSubmit.find(p => p[0] === 'mphb_room_details[0][adults]') || [])[1]), '2');
            await ctx.close();
        }
    }

    /* --- Two invalid fields: the FIRST takes focus, each says its own. ------ */
    {
        const { ctx, pg } = await openPage(browser, 1280, {});
        await pg.$eval(FIELD.size, s => { s.required = true; });
        await pg.check('input[name="dcc_checkout_dog"][value="yes"]');
        await pg.click('input[type="submit"]');
        await pg.waitForTimeout(100);
        check('guest count AND a required Dog Size empty: each gets its message, focus goes to the first (guest count)',
            await pg.evaluate(([g, s, gb]) => [
                (document.querySelector(g + ' + .dcc_checkout-select .dcc_checkout-field-error') || {}).textContent,
                !!document.querySelector(s + ' + .dcc_checkout-select .dcc_checkout-field-error'),
                document.activeElement === document.querySelector(gb)], [FIELD.guests, FIELD.size, btnOf(FIELD.guests)]),
            [GUESTS_MSG, true, true]);
        check('... and the browser did not jump past it to bubble on a later native field (Dog Type, also required)',
            await pg.evaluate(() => document.activeElement.id !== 'mphb_dog_type'), true);
        await ctx.close();
    }

    /* --- 4. Keyboard only. -------------------------------------------------- */
    {
        const { ctx, pg } = await openPage(browser, 1280, {});
        await pg.focus(btnOf(FIELD.guests));
        await pg.keyboard.press('ArrowDown');
        check('keyboard: ArrowDown on the field opens it, at the current choice', (await listInfo(pg) || {}).active, '— Select —');
        await pg.keyboard.press('ArrowDown');
        check('... ArrowDown moves to 1', (await listInfo(pg)).active, '1');
        await pg.keyboard.press('End');
        check('... End: the last', (await listInfo(pg)).active, '2');
        await pg.keyboard.press('Home');
        check('... Home: the first', (await listInfo(pg)).active, '— Select —');
        await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('ArrowDown');
        await pg.keyboard.press('Enter');
        check('... Enter chooses 2, closes, focus back on the field',
            await pg.evaluate(([s, b]) => [document.querySelector(s).value, !!document.querySelector('ul.dcc_checkout-select-list'),
                document.activeElement === document.querySelector(b)], [FIELD.guests, btnOf(FIELD.guests)]), ['2', false, true]);
        await pg.keyboard.press(' ');
        check('... Space on the field opens it', !!(await listInfo(pg)), true);
        await pg.keyboard.press('Escape');
        await pg.keyboard.press('Enter');
        check('... Enter on the field opens it', !!(await listInfo(pg)), true);
        await pg.keyboard.press('Escape');

        // Type-ahead on Country.
        await pg.focus(btnOf(FIELD.country));
        await pg.keyboard.press('Enter');
        await pg.keyboard.type('sw');
        check('type-ahead: "sw" goes to Sweden', (await listInfo(pg)).active, 'Sweden');
        await pg.keyboard.press('Enter');
        check('... Enter chooses it', await pg.$eval(FIELD.country, s => s.value), 'Sweden');
        await pg.waitForTimeout(800);
        await pg.keyboard.press('u');
        check('typing on the CLOSED field opens it at the first match after the current choice ("u": United Kingdom)', (await listInfo(pg) || {}).active, 'United Kingdom');
        await pg.keyboard.press('u');
        check('... the same letter again cycles: United States', (await listInfo(pg)).active, 'United States');
        await pg.keyboard.press('u');
        check('... and again: Uruguay', (await listInfo(pg)).active, 'Uruguay');
        await pg.waitForTimeout(800);
        await pg.keyboard.type('ne');
        check('... after a pause, "ne" starts afresh: Netherlands', (await listInfo(pg)).active, 'Netherlands');
        await pg.keyboard.press('Tab');
        check('Tab closes it without choosing, focus on the field', await pg.evaluate(([s, b]) => [!!document.querySelector('ul.dcc_checkout-select-list'),
            document.querySelector(s).value, document.activeElement === document.querySelector(b)], [FIELD.country, btnOf(FIELD.country)]), [false, 'Sweden', true]);
        await ctx.close();
    }

    /* --- 4. Names and roles (what VoiceOver is given). ---------------------- */
    {
        const { ctx, pg } = await openPage(browser, 1280, {});
        check('the field is a button named by its label and its value, aria-haspopup="listbox", aria-expanded="false"',
            [await pg.getByRole('button', { name: 'Guests — Select —', exact: true }).count(),
             await pg.getByRole('button', { name: 'Country of residence United States', exact: true }).count(),
             await pg.$eval(btnOf(FIELD.guests), b => [b.getAttribute('aria-haspopup'), b.getAttribute('aria-expanded'), b.getAttribute('aria-required')])],
            [1, 1, ['listbox', 'false', 'true']]);
        await pg.click(btnOf(FIELD.country));
        check('the open list is a listbox named by the label, its options role="option", the active one its aria-activedescendant',
            [await pg.getByRole('listbox', { name: 'Country of residence' }).count(),
             await pg.getByRole('option', { name: 'United States', selected: true }).count(),
             (await listInfo(pg)).active], [1, 1, 'United States']);
        await pg.keyboard.press('Escape');
        await pg.$eval(FIELD.country, s => { window.__selFocus = 0; s.addEventListener('focus', () => window.__selFocus++); });
        await pg.click('label[for="mphb_country"]');
        check('a click on the label focuses the field and never the hidden select, even for a moment (on iOS that could raise the native picker)',
            await pg.evaluate(b => [document.activeElement === document.querySelector(b), window.__selFocus], btnOf(FIELD.country)), [true, 0]);
        await pg.$eval(FIELD.guests, s => s.focus());
        check('a script focusing the select itself (checkout.js on an invalid dog field) lands on the field',
            await pg.evaluate(b => document.activeElement === document.querySelector(b), btnOf(FIELD.guests)), true);
        check('the services\' own "for N" select (never shown; checkout.js sets it) is left as it is',
            await pg.$eval('select[name="mphb_room_details[0][services][1][adults]"]', s => [s.classList.contains('dcc_checkout-select-native'), !!s.dccList]), [false, false]);
        /* v0.35.0 item 3 — A SELECT THE NEW LAYOUT HAS TURNED INTO SEGMENTED
           BUTTONS IS LEFT ALONE. layout.js marks it `data-dcc-segmented` and
           runs first (Assets makes this script depend on it when the layout is
           active); without the skip there would be two controls for one field,
           a drawn list and a row of buttons.
           THE DECISION IS MADE FOR REAL: a marked select is INSERTED, so this
           script's own MutationObserver runs `enhance` on it. The first
           version of this case cleared the enhancement and called a
           re-enhance hook that does not exist, so nothing ran and the
           assertion could not fail. */
        const segDecision = await pg.evaluate(() => {
            const fresh = document.createElement('select');
            fresh.name = 'dcc_segmented_probe';
            fresh.setAttribute('data-dcc-segmented', '1');
            ['', 'a', 'b'].forEach((v) => {
                const o = document.createElement('option');
                o.value = v; o.textContent = v || '—';
                fresh.appendChild(o);
            });
            /* And an identical one WITHOUT the marker, as the control: if the
               observer never fires, neither is enhanced and the case proves
               nothing. */
            const plain = fresh.cloneNode(true);
            plain.name = 'dcc_plain_probe';
            plain.removeAttribute('data-dcc-segmented');
            const host = document.querySelector('form') || document.body;
            host.appendChild(fresh);
            host.appendChild(plain);
            return new Promise((resolve) => setTimeout(() => resolve({
                marked: fresh.classList.contains('dcc_checkout-select-native') || !!fresh.dccList,
                plain: plain.classList.contains('dcc_checkout-select-native') || !!plain.dccList,
            }), 400));
        });
        check('an unmarked select added to the page IS enhanced (the guard on the next check)',
            segDecision.plain, true);
        check('a select the new layout has segmented is left alone (v0.35.0)',
            segDecision.marked, false);
        await ctx.close();
    }

    /* --- 2. Kept in sync with the select. ------------------------------------ */
    {
        const { ctx, pg } = await openPage(browser, 1280, {});
        await pg.$eval(FIELD.guests, s => { const o = document.createElement('option'); o.value = '3'; o.textContent = '3'; s.appendChild(o); });
        await pg.click(btnOf(FIELD.guests));
        check('an option added later is in the list', (await listInfo(pg)).items, ['— Select —', '1', '2', '3']);
        // checkout.js's cap: hidden + disabled, the value moved, a change fired.
        await pg.$eval(FIELD.guests, s => {
            const o = s.querySelector('option[value="3"]'); o.disabled = true; o.hidden = true; o.classList.add('dcc_checkout-option-hidden');
            s.value = '2'; s.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await pg.waitForTimeout(50);
        check('... capped (hidden + disabled) it leaves the open list, and the field says the value it was moved to',
            [(await listInfo(pg)).items, await pg.$eval(btnOf(FIELD.guests), b => b.textContent)], [['— Select —', '1', '2'], '2']);
        await pg.keyboard.press('Escape');
        await pg.$eval(FIELD.guests, s => { s.querySelector('option[value="2"]').textContent = '2 (+$0/night)'; });
        await pg.waitForTimeout(50);
        check('an option relabelled in place (checkout.js\'s fee suffix): the field follows', await pg.$eval(btnOf(FIELD.guests), b => b.textContent), '2 (+$0/night)');
        await pg.$eval(FIELD.guests, s => { s.disabled = true; });
        await pg.waitForTimeout(50);
        check('the select disabled: the field disabled', await pg.$eval(btnOf(FIELD.guests), b => b.disabled), true);
        await pg.$eval(FIELD.guests, s => { s.disabled = false; });
        await pg.$eval(FIELD.size, s => { s.classList.add('dcc_checkout-invalid'); s.setAttribute('aria-invalid', 'true'); });
        await pg.waitForTimeout(50);
        check('checkout.js marking the select invalid marks the field', await pg.$eval(btnOf(FIELD.size), b => [b.classList.contains('dcc_checkout-invalid'), b.getAttribute('aria-invalid')]), [true, 'true']);
        await pg.$eval('select[name="mphb_dog_hair"]', s => s.remove());
        await pg.waitForTimeout(50);
        check('a select removed on its own takes its field with it', await pg.$$eval('#mphb_dog_type ~ .dcc_checkout-select, p:has(> label[for="mphb_dog_hair"]) .dcc_checkout-select', e => e.length), 0);
        // MotoPress rebuilding the guest select: a NEW node in the same place.
        await pg.$eval('p.mphb-adults-chooser', p => {
            p.innerHTML = '<label for="mphb_adults-0">Guests</label><select id="mphb_adults-0" name="mphb_room_details[0][adults]" class="mphb_sc_checkout-guests-chooser mphb_checkout-guests-chooser" required><option value="">— Select —</option><option value="1">1</option><option value="2" selected>2</option></select>';
        });
        await pg.waitForTimeout(50);
        check('MotoPress replacing the guest select: exactly one field for the new select, saying its value',
            await pg.evaluate(s => [document.querySelectorAll('p.mphb-adults-chooser .dcc_checkout-select').length,
                document.querySelector(s).classList.contains('dcc_checkout-select-native'),
                document.querySelector(s).nextElementSibling.textContent], FIELD.guests), [1, true, '2']);
        await ctx.close();
    }

    /* --- What is submitted is the select's, exactly as without the script. --- */
    {
        const a = await openPage(browser, 1280, { list: false });
        const b = await openPage(browser, 1280, {});
        await a.pg.selectOption(FIELD.guests, '2');
        await a.pg.selectOption(FIELD.country, 'Canada');
        await b.pg.click(btnOf(FIELD.guests)); await b.pg.click('ul.dcc_checkout-select-list li:nth-child(3)');
        await b.pg.click(btnOf(FIELD.country)); await b.pg.click('ul.dcc_checkout-select-list li >> text=Canada');
        const fd = pg => pg.evaluate(() => Array.from(new FormData(document.querySelector('form')).entries()).filter(p => typeof p[1] === 'string'));
        check('the form submits exactly what it would without the script (no extra or missing field)', await fd(b.pg), await fd(a.pg));
        await a.ctx.close(); await b.ctx.close();
    }

    /* --- Tap rules: nothing written on a tap while no list is open. --------- */
    {
        const { ctx, pg } = await openPage(browser, 375, {});
        await pg.waitForTimeout(600);
        await pg.evaluate(() => { window.__muts = 0; new MutationObserver(r => { window.__muts += r.length; }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true }); });
        await pg.tap('#mphb_first_name');
        await pg.waitForTimeout(600);
        check('a tap on a text field while no list is open: zero writes to the page', await pg.evaluate(() => window.__muts), 0);
        await ctx.close();
    }

    await browser.close();
    if (shots.length) { console.log('screenshots:\n  ' + shots.join('\n  ')); }
    console.log(failures ? `\n${failures} failing` : `\nall passing (${passes})${MIN ? ' [built assets]' : ''}`);
    process.exit(failures ? 1 : 0);
})().catch(e => { console.log('FAIL  the suite crashed: ' + (e && e.stack || e)); process.exit(1); });
