/**
 * v0.34.0 / v0.34.1 — the guest count while it is still "— Select —", on the
 * guest checkout AND on WP-Admin's Add New Booking (0.34.1).
 *
 *   cd tests/recalc && npm install && node run.js
 *
 * B1 "Price for 2 meanwhile" and B2 "errors only after the mistake", in real
 * Chromium at 390px and 1280px, on Cottage 34 (the pet cottage, capacity 2)
 * and a 4-guest cottage (1065, the extra-guest fee); and (0.34.1) the
 * browser's own "required" message on the chooser in the site's words, only
 * at a submit attempt. First it runs enqueue.php: WHERE the shipped PHP loads
 * guest-count.js (Add New in the head, the checkout before checkout.js, never
 * Edit Accommodations or the edit screen).
 *
 * WHAT IS REAL: the shipped guest-count.js, checkout.js, checkout.css,
 * admin-booking.js and admin-booking.css, with configs from the shipped PHP
 * (tests/recalc/config.php, tests/admin-layout/config.php) after WordPress's
 * localize step.
 *
 * Add New is a STAND-IN built from the Director's staging observation
 * (2026-10-12, step=3, Cottage 34): MotoPress's own form, the chooser
 * mphb_room_details[0][adults] on "— Select —" (— Select — | 1 | 2),
 * .mphb-errors-wrapper, the pet service 19692 and this plugin's Pet Fee
 * dropdown. That Add New prices over the SAME mphb_update_checkout_info
 * request is inferred (the same chooser, box and message), not captured —
 * the Director's network-tab read on staging is the check.
 *
 * WHAT IS A STAND-IN, built from the Director's reads of live MotoPress 6.3.0:
 *  - MotoPress's checkout script (mphb.js): at load and on a change to the
 *    guest chooser, a service or a service's adults it asks
 *    admin-ajax.php?action=mphb_update_checkout_info with GET, formValues =
 *    the form serialised to a nested object (serializeJSON) and encoded as
 *    jQuery.param encodes it; on failure showError() puts the message in the
 *    <p class="mphb-errors-wrapper mphb-hide"> printed empty at load and
 *    removes mphb-hide; on success it replaces table.mphb-price-breakdown.
 *    updateRatePrices() (action mphb_update_rate_prices) also sends adults —
 *    modelled as a urlencoded POST so the body path is exercised too. The
 *    booking is a REST POST to /mphb/v1/checkout with a FormData body.
 *  - The server: update-checkout-info.php refuses a room whose adults is below
 *    1 ("The number of guests is not valid.", on this site through Loco:
 *    "Please select the number of guests."). Prices are the stand-in's own:
 *    $150 a night, the flat pet fee 19692 at $50 a night, the extra-guest fee
 *    18063 at $50 a night per guest.
 * What is proven is what MotoPress is ASKED and what the guest SEES — never
 * MotoPress's own arithmetic.
 */
const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const { execFileSync } = require('child_process');
const ASSETS = path.join(__dirname, '../../dcc-custom-checkout/assets');
const SCRIPT = fs.readFileSync(path.join(ASSETS, 'checkout.js'), 'utf8');
const CSS    = fs.readFileSync(path.join(ASSETS, 'checkout.css'), 'utf8');
// v0.34.1 — the request rewrite and the chooser's message, shared by the guest
// checkout and Add New Booking, and loaded before checkout.js.
const GC     = fs.readFileSync(path.join(ASSETS, 'guest-count.js'), 'utf8');
const ADMIN_JS  = fs.readFileSync(path.join(ASSETS, 'admin-booking.js'), 'utf8');
const ADMIN_CSS = fs.readFileSync(path.join(ASSETS, 'admin-booking.css'), 'utf8');
// Configs from the SHIPPED PHP, after WordPress's localize step — never a copy.
function php(args, env) {
    return execFileSync('php', args, { encoding: 'utf8', env: Object.assign({}, process.env, env || {}) });
}
const GC_CFG = { guest: php([path.join(__dirname, 'config.php'), 'guest']), admin: php([path.join(__dirname, 'config.php'), 'admin']) };
const ADMIN_CFG = php([path.join(__dirname, '../admin-layout/config.php')],
    { DCC_TEST_PAGE: 'mphb_add_new_booking', DCC_TEST_PET_MODE: 'flat' });
const BROWSER_MSG = 'Please select an item in the list.';
const GUESTS_MSG = 'Please select the number of guests.';

function chromiumPath() {
    if (process.env.DCC_CHROMIUM) { return process.env.DCC_CHROMIUM; }
    if (fs.existsSync('/opt/pw-browsers/chromium')) { return '/opt/pw-browsers/chromium'; }
    const root = '/opt/pw-browsers';
    if (fs.existsSync(root)) {
        for (const dir of fs.readdirSync(root)) {
            for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
                const bin = path.join(root, dir, rel);
                if (fs.existsSync(bin)) { return bin; }
            }
        }
    }
    return undefined;
}

let failures = 0, passes = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { passes++; } else { failures++; }
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) { console.log(`      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`); }
}

/* ---- The page ------------------------------------------------------------ */

function cfg(type) {
    return {
        petFeeEnabled: true, petAccommodations: [1607],
        serviceIds: { daily: 19692, weekly: 19692, monthly: 19692 },
        serviceIdList: [19692, 17712, 17711, 14926],
        thresholds: { min_daily: 2, min_weekly: 7, min_monthly: 30 },
        dogFieldNames: ['mphb_dog_type', 'mphb_dog_size', 'mphb_dog_hair'],
        guestGroups: [],
        guestFeeEnabled: type === 1065, guestServiceIds: { daily: 18063, weekly: 18063, monthly: 18063 },
        guestServiceIdList: [18063], guestAccommodations: [1065], includedGuests: 2,
        guestFeeSteps: { 1: '$50', 2: '$100' }, guestsSelector: 'select[name^="mphb_room_details"][name*="[adults]"]',
        sectionTitles: { pet: 'Pet Information' }, isAdmin: false, version: 'test',
        i18n: { petQuestion: 'Traveling with a dog?', petNo: 'No', petYes: 'Yes', requiredMsg: 'Please complete all of the required fields.',
                errDogSize: "Please choose your dog's size from the list." },
    };
}

function html(o) {
    const type = o.type || 1607;
    const cap = o.capacity || (type === 1607 ? 2 : 4);
    const options = ['<option value="">— Select —</option>']
        .concat(Array.from({ length: cap }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`)).join('');
    const services = type === 1607
        ? `<li><label><input type="checkbox" class="mphb_sc_checkout-service mphb_checkout-service" name="mphb_room_details[0][services][0][id]" value="19692"> Pet Fee (per night)</label></li>`
        : `<li><label><input type="checkbox" class="mphb_sc_checkout-service mphb_checkout-service" name="mphb_room_details[0][services][0][id]" value="18063"> Extra Guest Fee (per guest beyond 2) for
             <select name="mphb_room_details[0][services][0][adults]" class="mphb_sc_checkout-service-adults mphb_checkout-service-adults"><option>1</option><option>2</option></select></label></li>`;
    // MotoPress prints the empty, hidden wrapper on every checkout; a page
    // returned after a failed submit can also carry a server-rendered error.
    const err = `<p class="mphb-errors-wrapper mphb-hide">${o.hiddenText || ''}</p>` +
        (o.preErr === undefined ? '' : `<div class="mphb-errors mphb-checkout-error" role="alert">${o.preErr}</div>`) +
        // An error box drawn VISIBLE but EMPTY at load (a theme or add-on can).
        (o.emptyVisible ? '<div class="dcc-test-error-slot"></div>' : '');
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>.mphb-hide{display:none}</style><style>${CSS}</style></head><body>
<form class="mphb_sc_checkout-form" method="post" action="/submit-booking/">
  <input type="hidden" name="mphb_room_details[0][room_type_id]" value="${type}">
  <input type="hidden" name="mphb_check_in_date" value="2026-11-02">
  <input type="hidden" name="mphb_check_out_date" value="2026-11-04">
  <section class="mphb-room-details">
    <p class="mphb-adults-chooser"><label for="mphb_adults-0">Guests</label>
      <select id="mphb_adults-0" name="mphb_room_details[0][adults]" class="mphb_sc_checkout-guests-chooser mphb_checkout-guests-chooser"${o.required === false ? '' : ' required'}>${options}</select></p>
    <section class="mphb-services-details"><h4 class="services-heading">Choose Additional Services</h4>
      <ul class="mphb_sc_checkout-services-list">${services}</ul></section>
  </section>
  <section class="mphb-customer-details"><h3>Your Information</h3>
    <p class="mphb-customer-name"><label for="mphb_first_name">First Name</label><input id="mphb_first_name" name="mphb_first_name" value="Test"></p>
    <p class="mphb-text-control"><label for="mphb_dog_type">Dog Type</label><input id="mphb_dog_type" name="mphb_dog_type"></p>
    <p class="mphb-text-control"><label for="mphb_dog_size">Dog Size</label><select id="mphb_dog_size" name="mphb_dog_size"><option value="">— Select —</option><option value="Up to 20 lbs">Up to 20 lbs</option></select></p>
    <p class="mphb-text-control"><label for="mphb_dog_hair">Dog Hair</label><select id="mphb_dog_hair" name="mphb_dog_hair"><option value="">— Select —</option><option>Short</option></select></p>
  </section>
  <section id="mphb-price-details"><h3>Price Breakdown</h3>
    <table class="mphb-price-breakdown" data-adults="load"><tbody>
      <tr class="mphb-price-breakdown-booking"><td colspan="2">#1 Cottage</td><td>$300</td></tr>
      <tr class="mphb-price-breakdown-guests"><td>Guests</td><td>—</td></tr>
      <tr class="mphb-price-breakdown-total"><th colspan="2">Total</th><td>$300</td></tr>
    </tbody></table>
  </section>
  <p class="mphb-total-price">Total Price: <output class="mphb-total-price-field">$300</output></p>
  ${err}
  <p class="mphb_sc_checkout-submit-wrapper"><input type="submit" class="button" value="Book Now"></p>
</form>
<script>window.DCC_GUEST_COUNT = ${GC_CFG.guest};</script>
<script>${GC}</script>
<script>window.DCC_CHECKOUT = ${JSON.stringify(cfg(type))};</script>
<script>${SCRIPT}</script>
${standIn('.mphb_sc_checkout-form', '/wp-json/mphb/v1/checkout', o.nights || 2)}
</body></html>`;
}

/* MotoPress's checkout script — the stand-in described at the top of run.js.
   The same on both screens: Add New's checkout step is MotoPress's own form. */
function standIn(formSel, submitPath, nights) {
    return `<script>
(function () {
  var form = document.querySelector('${formSel}');
  window.__nights = ${nights};
  var errs = form.querySelector('.mphb-errors-wrapper');
  window.__recalc = 0; window.__rates = 0; window.__submitted = 0;
  function nest(obj, name, value) {
    var segs = name.replace(/\\]/g, '').split('['), o = obj;
    for (var i = 0; i < segs.length - 1; i++) { o = o[segs[i]] = o[segs[i]] || {}; }
    o[segs[segs.length - 1]] = value;
  }
  function serializeJSON() {
    var obj = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled || el.type === 'submit') { return; }
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) { return; }
      nest(obj, el.name, el.value);
    });
    return obj;
  }
  function param(obj, prefix) {
    var out = [];
    Object.keys(obj).forEach(function (k) {
      var key = prefix ? prefix + '[' + k + ']' : k, v = obj[k];
      if (v && typeof v === 'object') { out = out.concat(param(v, key)); }
      else { out.push(encodeURIComponent(key) + '=' + encodeURIComponent(v == null ? '' : v)); }
    });
    return out;
  }
  function showError(m) { errs.innerHTML = m; errs.classList.remove('mphb-hide'); }
  function hideErrors() { errs.innerHTML = ''; errs.classList.add('mphb-hide'); }
  function updateCheckoutInfo() {
    var q = ['action=mphb_update_checkout_info', 'mphb_nonce=abc'].concat(param({ formValues: serializeJSON() })).join('&');
    var x = new XMLHttpRequest();
    x.open('GET', '/wp-admin/admin-ajax.php?' + q);
    x.onload = function () {
      var r = JSON.parse(x.responseText);
      if (r.success) {
        hideErrors();
        var t = form.querySelector('table.mphb-price-breakdown'), d = document.createElement('div');
        d.innerHTML = r.data.priceBreakdown;
        t.parentNode.replaceChild(d.firstElementChild, t);
        form.querySelector('.mphb-total-price-field').textContent = r.data.total;
      } else {
        showError(r.data.message);
      }
      window.__recalc++;
    };
    x.send();
  }
  function updateRatePrices() {
    var x = new XMLHttpRequest();
    x.open('POST', '/wp-admin/admin-ajax.php');
    x.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    x.onload = function () { window.__rates++; };
    x.send(['action=mphb_update_rate_prices'].concat(param({ formValues: serializeJSON() })).join('&'));
  }
  form.addEventListener('change', function (e) {
    var t = e.target;
    if (t.matches('.mphb_checkout-guests-chooser')) { updateRatePrices(); updateCheckoutInfo(); }
    else if (t.matches('.mphb_checkout-service, .mphb_checkout-service-adults')) { updateCheckoutInfo(); }
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var fd = new FormData(form);
    window.__lastSubmit = Array.from(fd.entries()).map(function (p) { return [p[0], String(p[1])]; });
    var x = new XMLHttpRequest();
    x.open('POST', '${submitPath}');
    x.onload = function () { var r = JSON.parse(x.responseText); if (!r.success) { showError(r.data.message); } window.__submitted++; };
    x.send(fd);
  });
  document.addEventListener('DOMContentLoaded', function () { updateRatePrices(); updateCheckoutInfo(); });
})();
</script>`;
}

/* Add New's SEARCH step: an adults select of its own that is NOT MotoPress's
   room chooser (the widest fallbacks would match it). Nothing may be held or
   marked there. */
function adminSearchHtml() {
    return `<!doctype html><html><head><style>${ADMIN_CSS}</style>
<script>window.DCC_GUEST_COUNT = ${GC_CFG.admin};</script><script>${GC}</script></head>
<body class="wp-admin"><div class="wrap"><h1>Add New Booking</h1>
<form method="get" id="dcc-test-search"><select name="mphb_room_type_id"><option value="1607" selected>Cottage 34</option></select>
<select name="mphb_adults"><option value="">— Select —</option><option>1</option><option>2</option></select>
<p class="mphb-errors-wrapper mphb-hide"></p><input type="submit" value="Search"></form></div>
<script>window.DCC_CHECKOUT_ADMIN = ${ADMIN_CFG};</script><script>${ADMIN_JS}</script></body></html>`;
}

/* WP-Admin's Add New Booking, the checkout step (step=3) as the Director
   observed it on staging: Cottage 34, Number of Guests on "— Select —"
   (— Select — | 1 | 2), MotoPress's message box, the pet service 19692 and
   this plugin's Pet Fee dropdown. The form carries NO class this plugin keys
   on: the admin half finds it from the chooser. A WordPress error notice sits
   OUTSIDE the form and must never be touched. */
function adminHtml(o) {
    const options = ['<option value="">— Select —</option>']
        .concat([1, 2].map(n => `<option value="${n}">${n}</option>`)).join('');
    const err = `<p class="mphb-errors-wrapper mphb-hide">${o.hiddenText || ''}</p>` +
        (o.preErr === undefined ? '' : `<p class="mphb-errors-wrapper">${o.preErr}</p>`);
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>.mphb-hide{display:none}</style><style>${ADMIN_CSS}</style>
<script>window.DCC_GUEST_COUNT = ${GC_CFG.admin};</script>
<script>${GC}</script>
</head><body class="wp-admin"><div class="wrap"><h1>Add New Booking</h1>
<div class="notice notice-error"><p>An unrelated admin notice.</p></div>
<form method="post" id="dcc-test-admin-checkout">
  <section class="mphb-checkout-section mphb-booking-details">
    <h3>Accommodation Details</h3>
    <p class="mphb-adults-chooser"><label for="mphb_adults-0">Number of Guests</label>
      <select id="mphb_adults-0" name="mphb_room_details[0][adults]" class="mphb_sc_checkout-guests-chooser mphb_checkout-guests-chooser"${o.required === false ? '' : ' required'}>${options}</select></p>
    <section class="mphb-services-details"><ul class="mphb_sc_checkout-services-list">
      <li><label><input type="checkbox" class="mphb_sc_checkout-service mphb_checkout-service" name="mphb_room_details[0][services][0][id]" value="19692"> Pet Fee (per night)</label></li>
    </ul></section>
    <div class="dcc_admin-room-context" data-dcc-room-types="1607" data-dcc-pet-service="19692" hidden></div>
  </section>
  <section id="mphb-price-details"><h3>Price Breakdown</h3>
    <table class="mphb-price-breakdown" data-adults="load"><tbody>
      <tr class="mphb-price-breakdown-booking"><td colspan="2">#1 Cottage 34</td><td>$450</td></tr>
      <tr class="mphb-price-breakdown-guests"><td>Guests</td><td>—</td></tr>
      <tr class="mphb-price-breakdown-total"><th colspan="2">Total</th><td>$450</td></tr>
    </tbody></table>
  </section>
  <p class="mphb-total-price">Total Price: <output class="mphb-total-price-field">$450</output></p>
  ${err}
  <p><input type="submit" class="button button-primary" value="Submit Booking"></p>
</form></div>
<script>window.DCC_CHECKOUT_ADMIN = ${ADMIN_CFG};</script>
<script>${ADMIN_JS}</script>
${standIn('#dcc-test-admin-checkout', '/wp-json/mphb/v1/checkout/admin', o.nights || 3)}
</body></html>`;
}

/* ---- The server ------------------------------------------------------------ */

function parseQuery(str) {
    const out = {};
    String(str || '').split('&').forEach(p => {
        if (!p) { return; }
        const i = p.indexOf('=');
        const k = decodeURIComponent((i < 0 ? p : p.slice(0, i)).replace(/\+/g, ' '));
        out[k] = decodeURIComponent((i < 0 ? '' : p.slice(i + 1)).replace(/\+/g, ' '));
    });
    return out;
}

function money(n) { return '$' + n.toFixed(2).replace(/\.00$/, ''); }

async function openPage(browser, width, o) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 },
        hasTouch: width < 600, isMobile: width < 600 });
    const pg = await ctx.newPage();
    pg.setDefaultTimeout(5000);
    // A script error on either page is a failure, never a quiet pass.
    pg.on('pageerror', e => { failures++; console.log(`FAIL  page error (${o.admin ? 'Add New' : 'checkout'}): ${e.message}`); });
    const log = { recalc: [], rates: [], submits: 0, failed: 0 };
    let first = true;
    await pg.route('**/wp-admin/admin-ajax.php**', async route => {
        const req = route.request();
        const q = req.method() === 'GET' ? parseQuery(new URL(req.url()).search.slice(1)) : parseQuery(req.postData());
        const adultsKey = 'formValues[mphb_room_details][0][adults]';
        if (q.action === 'mphb_update_rate_prices') {
            log.rates.push(q[adultsKey]);
            return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true,"data":{}}' });
        }
        log.recalc.push(q[adultsKey]);
        const adults = parseInt(q[adultsKey], 10);
        let body;
        if (o.failFirst && first) {
            first = false;
            log.failed++;
            body = { success: false, data: { message: 'Something else went wrong.' } };
        } else if (!(adults >= 1)) {
            log.failed++;
            body = { success: false, data: { message: GUESTS_MSG } };
        } else {
            const nights = o.nights || (o.admin ? 3 : 2);
            let total = 150 * nights;
            const lines = [];
            for (let j = 0; j < 4; j++) {
                const id = q[`formValues[mphb_room_details][0][services][${j}][id]`];
                if (id === '19692') { lines.push(['Pet Fee (per night)', 50 * nights]); }
                if (id === '18063') {
                    const n = parseInt(q[`formValues[mphb_room_details][0][services][${j}][adults]`], 10) || 0;
                    lines.push(['Extra Guest Fee (per guest beyond 2)', 50 * nights * n]);
                }
            }
            lines.forEach(l => { total += l[1]; });
            const table = `<table class="mphb-price-breakdown" data-adults="${adults}"><tbody>
              <tr class="mphb-price-breakdown-booking"><td colspan="2">#1 Cottage</td><td>${money(150 * nights)}</td></tr>
              <tr class="mphb-price-breakdown-guests"><td>Guests</td><td>${adults}</td></tr>
              ${lines.map(l => `<tr class="mphb-price-breakdown-service"><td>${l[0]}</td><td>$50</td><td>${money(l[1])}</td></tr>`).join('')}
              <tr class="mphb-price-breakdown-total"><th colspan="2">Total</th><td>${money(total)}</td></tr></tbody></table>`;
            body = { success: true, data: { priceBreakdown: table, total: money(total) } };
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await pg.route(u => /\/wp-json\/mphb\/v1\/checkout(\/admin)?$/.test(u.pathname), async route => {
        log.submits++;
        log.submitPath = new URL(route.request().url()).pathname;
        const raw = route.request().postData() || '';
        const m = /name="mphb_room_details\[0\]\[adults\]"\r\n\r\n([^\r]*)\r\n/.exec(raw);
        log.submittedAdults = m ? m[1] : null;
        const body = m && m[1] !== '' ? { success: true } : { success: false, data: { message: GUESTS_MSG } };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const page = o.admin ? 'http://dcc.test/wp-admin/admin.php?page=mphb_add_new_booking&step=3' : 'http://dcc.test/submit-booking/';
    await pg.route(u => u.href.startsWith(page.split('?')[0]), route => route.fulfill({ status: 200, contentType: 'text/html', body: o.search ? adminSearchHtml() : o.admin ? adminHtml(o) : html(o) }));
    // The browser's own "required" message, as it would show it: what the
    // chooser says when the browser reports it (an `invalid` listener on the
    // element runs after the capture-phase ones, just before the report).
    await pg.addInitScript(() => {
        window.__invalid = [];
        // Registered before any page script: what the chooser said when the
        // browser BEGAN reporting it, before this plugin's `invalid` belt ran.
        window.__invalidEarly = [];
        document.addEventListener('invalid', e => window.__invalidEarly.push(e.target.validationMessage), true);
        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('select').forEach(s => s.addEventListener('invalid', () => window.__invalid.push(s.validationMessage)));
        });
    });
    await pg.goto(page + (o.query || ''));
    if (o.search) { return { ctx, pg, log }; }
    await pg.waitForFunction(() => window.__recalc >= 1 && window.__rates >= 1);
    return { ctx, pg, log };
}

async function settle(pg, n) {
    await pg.waitForFunction(k => window.__recalc >= k, n);
    await pg.waitForTimeout(50);
}

/* What the guest can see. */
async function seen(pg) {
    return pg.evaluate(() => {
        const vis = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
        // Inside the checkout form only: WP-Admin's own notices are not ours.
        const errors = Array.from(document.querySelector('form').querySelectorAll('[class*="error" i], [role="alert"]'))
            .filter(el => vis(el) && el.textContent.trim()).map(el => el.textContent.trim());
        const t = document.querySelector('table.mphb-price-breakdown');
        const guests = t && t.querySelector('tr.mphb-price-breakdown-guests');
        return {
            errors,
            pricedFor: t ? t.getAttribute('data-adults') : null,
            guestsRow: guests && vis(guests) ? guests.cells[guests.cells.length - 1].textContent.trim() : null,
            petLine: Array.from(document.querySelectorAll('tr')).filter(r => vis(r) && /Pet Fee/.test(r.textContent)).map(r => r.cells[r.cells.length - 1].textContent.trim()),
            extraLine: Array.from(document.querySelectorAll('tr')).filter(r => vis(r) && /Extra Guest/.test(r.textContent)).map(r => r.cells[r.cells.length - 1].textContent.trim()),
            total: document.querySelector('.mphb-total-price-field').textContent.trim(),
        };
    });
}

async function chooseGuests(pg, value, expectRecalcs) {
    await pg.selectOption('select[name="mphb_room_details[0][adults]"]', value);
    await settle(pg, expectRecalcs);
}

async function dog(pg, yes, expectRecalcs) {
    await pg.check(`input[name="dcc_checkout_dog"][value="${yes ? 'yes' : 'no'}"]`);
    await settle(pg, expectRecalcs);
}

(async () => {
    // Where the plugin loads guest-count.js — the shipped PHP (enqueue.php).
    {
        let out;
        try {
            out = execFileSync('php', [path.join(__dirname, 'enqueue.php')], { encoding: 'utf8' });
        } catch (e) {
            out = String(e.stdout || '') + '\nFAIL  enqueue.php exited ' + e.status + '\n';
        }
        out.split('\n').forEach(line => {
            if (/^PASS/.test(line)) { passes++; console.log(line); }
            else if (/^FAIL/.test(line)) { failures++; console.log(line); }
            else if (/^      /.test(line)) { console.log(line); }
        });
        if (!/all passing|failing/.test(out)) { failures++; console.log('FAIL  enqueue.php printed no result'); }
    }

    const browser = await chromium.launch({ executablePath: chromiumPath() });

    for (const width of [390, 1280]) {
        /* --- Cottage 34: load, the pet line before a count, then a count. --- */
        {
            const { ctx, pg, log } = await openPage(browser, width, { type: 1607 });
            await pg.waitForTimeout(100);
            let s = await seen(pg);
            check(`${width}px Cottage 34, at load: no error text anywhere`, s.errors, []);
            check(`${width}px ... the breakdown is priced for 2 (the recalculation succeeded), the Guests row hidden`,
                [s.pricedFor, s.guestsRow, s.total], ['2', null, '$300']);
            check(`${width}px ... MotoPress was ASKED for 2, and no recalculation failed`, [log.recalc, log.rates, log.failed], [['2'], ['2'], 0]);
            check(`${width}px ... the guest's chooser still says "— Select —"`,
                await pg.$eval('select[name="mphb_room_details[0][adults]"]', e => e.value), '');

            await dog(pg, true, 2);
            s = await seen(pg);
            check(`${width}px Bringing a dog: Yes, with no count chosen — the pet line ($50 × 2 nights) appears and the total rises`,
                [s.petLine, s.total, s.errors, s.guestsRow], [['$100'], '$400', [], null]);
            await dog(pg, false, 3);
            s = await seen(pg);
            check(`${width}px ... No — it goes away`, [s.petLine, s.total], [[], '$300']);

            await chooseGuests(pg, '1', 4);
            s = await seen(pg);
            check(`${width}px pick 1 guest: the Guests row appears with 1, the total unchanged, the real count sent`,
                [s.guestsRow, s.total, log.recalc[log.recalc.length - 1], log.rates[log.rates.length - 1]], ['1', '$300', '1', '1']);
            await chooseGuests(pg, '2', 5);
            s = await seen(pg);
            check(`${width}px pick 2: the Guests row says 2, the total unchanged`, [s.guestsRow, s.total], ['2', '$300']);
            check(`${width}px ... and nothing failed at any point`, log.failed, 0);
            await ctx.close();
        }

        /* --- A 4-guest cottage: the extra-guest fee once a count is picked. --- */
        {
            const { ctx, pg, log } = await openPage(browser, width, { type: 1065 });
            await pg.waitForTimeout(100);
            let s = await seen(pg);
            check(`${width}px 4-guest cottage, at load: priced for 2, no error, Guests row hidden, no extra-guest fee`,
                [s.pricedFor, s.errors, s.guestsRow, s.extraLine, s.total, log.recalc], ['2', [], null, [], '$300', ['2']]);
            await pg.selectOption('select[name="mphb_room_details[0][adults]"]', '3');
            await pg.waitForFunction(() => /data-adults="3"/.test(document.querySelector('#mphb-price-details').innerHTML) &&
                Array.from(document.querySelectorAll('tr')).some(r => /Extra Guest/.test(r.textContent)));
            await pg.waitForTimeout(100);
            s = await seen(pg);
            check(`${width}px pick 3: the extra-guest fee is added (1 guest × $50 × 2 nights), the Guests row says 3`,
                [s.extraLine, s.total, s.guestsRow], [['$100'], '$400', '3']);
            check(`${width}px ... nothing failed`, log.failed, 0);
            await ctx.close();
        }

        /* --- Pressing the booking button with no count (0.34.1, item 2). --
           Live, the chooser is `required`, so the BROWSER stops the form
           before MotoPress sees it. Its check stays; its words become the
           site's, and only at the submit attempt. */
        {
            const { ctx, pg, log } = await openPage(browser, width, { type: 1607 });
            await pg.waitForTimeout(150);
            const chooser = 'select[name="mphb_room_details[0][adults]"]';
            check(`${width}px before any submit: no "${GUESTS_MSG}", and none set on the chooser yet`,
                [(await seen(pg)).errors, await pg.$eval(chooser, e => e.validity.customError)], [[], false]);
            // The guard on the guard: this chooser really is one the browser stops.
            check(`${width}px ... the chooser is required and empty, so the browser will stop the form — in its own words, "${BROWSER_MSG}"`,
                await pg.$eval(chooser, e => [e.required, e.validity.valueMissing, e.validationMessage]), [true, true, BROWSER_MSG]);
            await pg.$eval(chooser, e => {
                window.__chooserMutations = 0;
                new MutationObserver(r => { window.__chooserMutations += r.length; }).observe(e, { attributes: true, childList: true, subtree: true });
            });
            await pg.click('input[type="submit"]');
            await pg.waitForTimeout(150);
            check(`${width}px press Book Now with no count: the browser reports "${GUESTS_MSG}" — not "${BROWSER_MSG}"`,
                await pg.evaluate(() => window.__invalid), [GUESTS_MSG]);
            check(`${width}px ... set by the press itself, BEFORE the browser started checking (not left to the belt)`,
                await pg.evaluate(() => window.__invalidEarly), [GUESTS_MSG]);
            check(`${width}px ... and the form was stopped: nothing was sent to MotoPress`,
                [log.submits, await pg.evaluate(() => window.__submitted)], [0, 0]);
            await chooseGuests(pg, '1', 2);
            check(`${width}px pick 1: the message is cleared at once`,
                await pg.$eval(chooser, e => [e.validity.customError, e.validationMessage, e.validity.valid]), [false, '', true]);
            check(`${width}px ... setting and clearing it wrote nothing to the page (no mutation on the chooser)`,
                await pg.evaluate(() => window.__chooserMutations), 0);
            await pg.click('input[type="submit"]');
            await pg.waitForFunction(() => window.__submitted >= 1);
            check(`${width}px ... Book Now then sends the guest's own count`, [log.submits, log.submittedAdults], [1, '1']);
            await ctx.close();
        }

        /* --- Back to "— Select —": nothing until the next attempt. ------- */
        {
            const { ctx, pg } = await openPage(browser, width, { type: 1607 });
            const chooser = 'select[name="mphb_room_details[0][adults]"]';
            await chooseGuests(pg, '2', 2);
            await chooseGuests(pg, '', 3);
            check(`${width}px pick 2 then "— Select —" again: no message is set until a submit attempt`,
                await pg.$eval(chooser, e => e.validity.customError), false);
            await pg.click('input[type="submit"]');
            await pg.waitForTimeout(100);
            check(`${width}px ... the next attempt gets the site's words`, await pg.evaluate(() => window.__invalid), [GUESTS_MSG]);
            await ctx.close();
        }

        /* --- A select that is NOT required never gets a message: that would
               ADD a check the page does not make. (The submit then reaches
               MotoPress, which refuses it, and its message shows then.) ---- */
        {
            const { ctx, pg, log } = await openPage(browser, width, { type: 1607, required: false });
            await pg.waitForTimeout(150);
            check(`${width}px not required: before any submit, no "${GUESTS_MSG}"`, (await seen(pg)).errors, []);
            await pg.click('input[type="submit"]');
            await pg.waitForFunction(() => window.__submitted >= 1);
            await pg.waitForTimeout(50);
            check(`${width}px ... the browser did not stop it (no message was added to the chooser)`,
                [await pg.evaluate(() => window.__invalid), await pg.$eval('select[name="mphb_room_details[0][adults]"]', e => e.validity.valid)],
                [[], true]);
            check(`${width}px ... MotoPress's "${GUESTS_MSG}" appears THEN`, (await seen(pg)).errors, [GUESTS_MSG]);
            check(`${width}px ... and the booking request carried the guest's real choice — empty, never a provisional 2`,
                [log.submits, log.submittedAdults, await pg.evaluate(() => (window.__lastSubmit.find(p => p[0] === 'mphb_room_details[0][adults]') || [])[1])],
                [1, '', '']);
            await ctx.close();
        }

        /* --- Any OTHER early message is held back too, until a submit. ---- */
        {
            const { ctx, pg } = await openPage(browser, width, { type: 1607, failFirst: true, required: false });
            await pg.waitForTimeout(150);
            check(`${width}px a different error at load (the wrapper MotoPress printed empty): held back`,
                [(await seen(pg)).errors, await pg.$eval('.mphb-errors-wrapper', e => e.textContent)],
                [[], 'Something else went wrong.']);
            await pg.click('input[type="submit"]');
            await pg.waitForFunction(() => window.__submitted >= 1);
            await pg.waitForTimeout(50);
            check(`${width}px ... after the submit attempt, errors show as MotoPress gives them`, (await seen(pg)).errors, [GUESTS_MSG]);
            await ctx.close();
        }

        /* --- A server-rendered error present at load still shows. -------- */
        {
            const { ctx, pg } = await openPage(browser, width, { type: 1607, preErr: 'Sorry, this cottage is no longer available.' });
            await pg.waitForTimeout(150);
            check(`${width}px a server-rendered error with text at load: still shown (the safety catch)`,
                (await seen(pg)).errors, ['Sorry, this cottage is no longer available.']);
            check(`${width}px ... it is tagged pre-existing; MotoPress's EMPTY wrapper is not (0.15.0 tagged both)`,
                await pg.evaluate(() => [document.querySelector('.mphb-checkout-error').hasAttribute('data-dcc-preexisting'),
                    document.querySelector('.mphb-errors-wrapper').hasAttribute('data-dcc-preexisting')]), [true, false]);
            await ctx.close();
        }
    }

    /* --- A submit with no click (requestSubmit): the `invalid` belt. ------ */
    {
        const { ctx, pg, log } = await openPage(browser, 1280, { type: 1607 });
        await pg.evaluate(() => document.querySelector('form').requestSubmit());
        await pg.waitForTimeout(100);
        check('requestSubmit() with no count: the browser still reports the site\'s words, and nothing is sent',
            [await pg.evaluate(() => window.__invalid), log.submits], [[GUESTS_MSG], 0]);
        check('... there was no click, so it was the `invalid` belt that set them (the browser\'s own words until then)',
            await pg.evaluate(() => window.__invalidEarly), [BROWSER_MSG]);
        await ctx.close();
    }

    /* === WP-Admin, Add New Booking (0.34.1, item 1) ======================== */
    for (const width of [390, 1280]) {
        {
            const { ctx, pg, log } = await openPage(browser, width, { admin: true });
            await pg.waitForTimeout(150);
            check(`${width}px Add New: the shipped config says this is Add New (flow "add-new")`,
                await pg.evaluate(() => window.DCC_CHECKOUT_ADMIN.flow), 'add-new');
            let s = await seen(pg);
            check(`${width}px Add New at load: no message, priced for 2 (MotoPress was ASKED for 2), the Guests row hidden`,
                [s.errors, s.pricedFor, s.guestsRow, s.total, log.recalc, log.rates, log.failed], [[], '2', null, '$450', ['2'], ['2'], 0]);
            check(`${width}px ... Number of Guests still says "— Select —"`,
                await pg.$eval('select[name="mphb_room_details[0][adults]"]', e => e.value), '');
            check(`${width}px ... WordPress's own notice outside the form is untouched`,
                await pg.$eval('.notice-error', e => [e.getClientRects().length > 0, e.hasAttribute('data-dcc-preexisting')]), [true, false]);

            await pg.selectOption('#dcc_admin_pet_fee', 'yes');
            await settle(pg, 2);
            s = await seen(pg);
            check(`${width}px Pet Fee: Yes with no count — 19692 ticked, the pet line ($50 × 3 nights) appears, the total rises`,
                [await pg.$eval('input[value="19692"]', e => e.checked), s.petLine, s.total, s.errors, s.guestsRow],
                [true, ['$150'], '$600', [], null]);
            await pg.selectOption('#dcc_admin_pet_fee', 'no');
            await settle(pg, 3);
            s = await seen(pg);
            check(`${width}px ... Pet Fee: No — unticked, back to the stay alone`,
                [await pg.$eval('input[value="19692"]', e => e.checked), s.petLine, s.total], [false, [], '$450']);

            await chooseGuests(pg, '2', 4);
            s = await seen(pg);
            check(`${width}px pick 2: the Guests row says 2, the total unchanged, the real count sent`,
                [s.guestsRow, s.total, log.recalc[log.recalc.length - 1]], ['2', '$450', '2']);
            check(`${width}px ... nothing failed at any point`, log.failed, 0);
            await ctx.close();
        }

        /* Submit Booking with no count: the browser stops it, in the site's words. */
        {
            const { ctx, pg, log } = await openPage(browser, width, { admin: true });
            await pg.waitForTimeout(150);
            await pg.click('input[type="submit"]');
            await pg.waitForTimeout(150);
            check(`${width}px Add New, Submit Booking with no count: "${GUESTS_MSG}", and nothing is sent`,
                [await pg.evaluate(() => window.__invalid), log.submits], [[GUESTS_MSG], 0]);
            await chooseGuests(pg, '1', 2);
            await pg.click('input[type="submit"]');
            await pg.waitForFunction(() => window.__submitted >= 1);
            check(`${width}px ... with 1 chosen it goes to MotoPress's ADMIN route with staff's own 1`,
                [log.submitPath, log.submittedAdults], ['/wp-json/mphb/v1/checkout/admin', '1']);
            await ctx.close();
        }

        /* Not required: MotoPress still refuses, and says so only after the press. */
        {
            const { ctx, pg, log } = await openPage(browser, width, { admin: true, required: false });
            await pg.waitForTimeout(150);
            check(`${width}px Add New, chooser not required: nothing before Submit Booking`, (await seen(pg)).errors, []);
            await pg.click('input[type="submit"]');
            await pg.waitForFunction(() => window.__submitted >= 1);
            await pg.waitForTimeout(50);
            check(`${width}px ... after the press MotoPress's "${GUESTS_MSG}" shows, and the booking carried staff's real (empty) choice`,
                [(await seen(pg)).errors, log.submittedAdults, await pg.evaluate(() => window.__invalid)], [[GUESTS_MSG], '', []]);
            await ctx.close();
        }

        /* Any other early message is held back until Submit Booking. */
        {
            const { ctx, pg } = await openPage(browser, width, { admin: true, failFirst: true, required: false });
            await pg.waitForTimeout(150);
            check(`${width}px Add New, a different error at load: held back`,
                [(await seen(pg)).errors, await pg.$eval('.mphb-errors-wrapper', e => e.textContent)], [[], 'Something else went wrong.']);
            await pg.click('input[type="submit"]');
            await pg.waitForFunction(() => window.__submitted >= 1);
            await pg.waitForTimeout(50);
            check(`${width}px ... after Submit Booking it shows`, (await seen(pg)).errors, [GUESTS_MSG]);
            await ctx.close();
        }

        /* A message SHOWING at load is never hidden (a failed submit's error). */
        {
            const { ctx, pg } = await openPage(browser, width, { admin: true, preErr: 'Accommodation is not available.' });
            await pg.waitForTimeout(150);
            check(`${width}px Add New, a box showing a message at load: still shown, and only it is tagged`,
                [(await seen(pg)).errors, await pg.evaluate(() => Array.from(document.querySelectorAll('.mphb-errors-wrapper')).map(e => e.hasAttribute('data-dcc-preexisting')))],
                [['Accommodation is not available.'], [false, true]]);
            await ctx.close();
        }
    }

    /* Add New's search step: its own adults select is not the room chooser. */
    {
        const { ctx, pg } = await openPage(browser, 1280, { admin: true, search: true });
        await pg.waitForTimeout(150);
        check('Add New search step: its adults select is not the room chooser — nothing held, nothing marked, no message set',
            await pg.evaluate(() => {
                const f = document.getElementById('dcc-test-search');
                return [window.DCC_CHECKOUT_ADMIN.flow, f.className, document.querySelector('[name="mphb_adults"]').validity.customError];
            }), ['add-new', '', false]);
        await ctx.close();
    }

    /* Add New, a hidden box with text at load is not a showing message. */
    {
        const { ctx, pg } = await openPage(browser, 1280, { admin: true, hiddenText: 'Stale text', failFirst: true, required: false });
        await pg.waitForTimeout(150);
        check('Add New: a hidden box with text at load is not tagged, so a later message in it is held back',
            [await pg.$eval('.mphb-errors-wrapper', e => e.hasAttribute('data-dcc-preexisting')), (await seen(pg)).errors], [false, []]);
        await ctx.close();
    }

    /* --- A HIDDEN box with text at load is not a showing error either. ----- */
    {
        const { ctx, pg } = await openPage(browser, 1280, { type: 1607, hiddenText: 'Stale text', failFirst: true });
        await pg.waitForTimeout(150);
        check('a hidden error box with text at load is not tagged pre-existing, so a later message in it is held back',
            [await pg.$eval('.mphb-errors-wrapper', e => e.hasAttribute('data-dcc-preexisting')), (await seen(pg)).errors],
            [false, []]);
        await ctx.close();
    }

    /* --- An EMPTY box that is visible at load is not a showing error. ------- */
    {
        const { ctx, pg } = await openPage(browser, 1280, { type: 1607, emptyVisible: true });
        await pg.waitForTimeout(150);
        await pg.$eval('.dcc-test-error-slot', e => { e.textContent = 'A message after load'; });
        check('an EMPTY error box drawn visible at load is not pre-existing: a message put in it later is held back',
            [await pg.$eval('.dcc-test-error-slot', e => e.hasAttribute('data-dcc-preexisting')), (await seen(pg)).errors],
            [false, []]);
        await ctx.close();
    }

    /* --- The server's dog-size refusal reaches the guest in its own words. -- */
    {
        const { ctx, pg } = await openPage(browser, 390, { type: 1607, query: '?dcc_checkout_error=dogsize' });
        check('?dcc_checkout_error=dogsize: the banner asks for the dog\'s size',
            await pg.$eval('.dcc_checkout-error-banner', e => e.textContent), "Please choose your dog's size from the list.");
        await ctx.close();
    }

    /* --- Never above the room's own capacity. ------------------------------ */
    {
        const { ctx, pg, log } = await openPage(browser, 1280, { type: 1607, capacity: 1 });
        check('a room that sleeps 1: the provisional count is 1, never the included 2', [log.recalc, log.rates], [['1'], ['1']]);
        await ctx.close();
    }

    /* --- Nothing but the two price questions is touched. -------------------- */
    {
        const { ctx, pg } = await openPage(browser, 1280, { type: 1607 });
        const reqs = [];
        pg.on('request', r => reqs.push(r.url()));
        await pg.evaluate(() => { const x = new XMLHttpRequest(); x.open('GET', '/wp-admin/admin-ajax.php?action=other_action&formValues%5Bmphb_room_details%5D%5B0%5D%5Badults%5D='); x.send(); });
        await pg.evaluate(() => { const x = new XMLHttpRequest(); x.open('GET', '/wp-admin/admin-ajax.php?action=mphb_update_checkout_info&formValues%5Bmphb_room_details%5D%5B0%5D%5Bservices%5D%5B0%5D%5Badults%5D='); x.send(); });
        await pg.waitForTimeout(200);
        const decoded = reqs.map(u => decodeURIComponent(u));
        check('another action with an empty adults parameter is sent exactly as it was',
            decoded.some(u => /action=other_action&formValues\[mphb_room_details\]\[0\]\[adults\]=$/.test(u)), true);
        check('a service\'s "for N" ([services][j][adults]) is never taken for the guest count',
            decoded.some(u => /\[services\]\[0\]\[adults\]=$/.test(u)), true);
        await ctx.close();
    }

    await browser.close();
    console.log(failures ? `\n${failures} failing` : `\nall passing (${passes})`);
    process.exit(failures ? 1 : 0);
})().catch(e => { console.log('FAIL  the suite crashed: ' + (e && e.stack || e)); process.exit(1); });
