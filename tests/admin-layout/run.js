/**
 * Admin booking screens — Customer Information order and headings (v0.26.0+),
 * the v0.28.0 rules (Guest 3/4 by guest count, Dog by the pet fee, Number of
 * Guests and "Pet Fee" as the only fee controls) and v0.29.0's (Guest 2 by the
 * count, the pet fee on a pet-fee cottage only, the pet fee as a WORD after
 * WordPress's localize step, Full Guest Name from Guest 1). Real Chromium,
 * 1280 and 390.
 *
 *     npm install && npm test
 *
 * TWO FIXTURES, AND NEITHER IS A CAPTURE — the first thing to know.
 *
 *  EDIT SCREEN (table): core's `table.form-table` shape, the 21 rows in the
 *    order and labels the Director read on booking 19615, plus both live shapes
 *    of the Upload Photo ID row (attributes as reported, 2026-10-06). The
 *    layout's shape is VERIFIED on live (0.26.0/0.27.x checks); the fixture is
 *    still a reconstruction.
 *
 *  ADD NEW (flow): a STAND-IN built from the owner's two phone recordings of
 *    the customer step (Cottage 36, Nov 20–21 2026, nothing submitted). The
 *    labels and their order are read off the video; the markup is MotoPress's
 *    FRONT-END checkout shape (each field in a <p> inside
 *    section#mphb-customer-details — the public checkout's real markup, see
 *    tests/fields), because that is the form the recordings show. Whether the
 *    live step matches is the FIRST item on the check list. The price
 *    breakdown is driven by a small stand-in for MotoPress's own recompute,
 *    so what is proven is that this plugin feeds MotoPress the right inputs.
 *
 * The config is NOT a copy: config.php calls the shipped
 * Admin_Fields::script_config() (and wizard_pet_service()), with the live fee
 * configuration seeded.
 */
const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT   = path.resolve(__dirname, '../..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'dcc-custom-checkout/assets/admin-booking.js'), 'utf8');
const CSS    = fs.readFileSync(path.join(ROOT, 'dcc-custom-checkout/assets/admin-booking.css'), 'utf8');

function phpConfig(included, booking, wizard) {
    const args = [path.join(__dirname, 'config.php'),
        included === undefined ? '' : String(included),
        booking ? JSON.stringify(booking) : '',
        wizard ? JSON.stringify(wizard) : ''];
    return JSON.parse(execFileSync('php', args, { encoding: 'utf8' }));
}

let failures = 0, passes = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { passes++; } else { failures++; }
    console.log((ok ? 'PASS  ' : 'FAIL  ') + name);
    if (!ok) {
        console.log('      expected: ' + JSON.stringify(expected));
        console.log('      actual:   ' + JSON.stringify(actual));
    }
}

/* The cottage map comes from the SHIPPED room_type_map() via config.php (since
   v0.29.0), over the live services: 1742/1065 carry the Extra Guest Fee, 1607
   (Cottage 34) the pet services, 1604 (Cottage 33) an EMPTY list, and 1999
   cannot be read. */

/* =========================================================================
 * EDIT SCREEN fixture (table)
 * ======================================================================= */

/* MotoPress's order, as the Director read it on booking 19615 (labels only). */
const MOTOPRESS_ORDER = [
    ['first_name', 'First Name'], ['last_name', 'Last Name'], ['email', 'Email'],
    ['phone', 'Phone'], ['country', 'Country', 'select'], ['address1', 'Address'],
    ['city', 'City'], ['state', 'State / County'], ['zip', 'Postcode'],
    ['note', 'Customer Note', 'textarea'],
    ['guest2_first_name', 'Guest 2: First Name'], ['guest2_last_name', 'Guest 2: Last Name'],
    ['guest2_phone', 'Guest 2: Phone Number'], ['apartment-units', 'Apartment/Unit #'],
    // Live has this row (Director, 2026-10-06). No named input; two shapes.
    ['upload_id', 'Upload Photo ID', 'link'],
    // v0.31.0 — the boat field sits at menu_order 15, between Photo ID and the
    // dog questions, so MotoPress draws it there; the layout moves it.
    ['boat', 'Bringing a boat or trailer?', 'boat'],
    ['dog_type', 'Dog Type'], ['dog_size', 'Dog Size', 'select'], ['dog_hair', 'Dog Hair', 'select'],
    ['guest3_first_name', 'Guest 3: First Name'], ['guest3_last_name', 'Guest 3: Last Name'],
    ['guest4_first_name', 'Guest 4: First Name'], ['guest4_last_name', 'Guest 4: Last Name'],
];

/* Rob's "full tidy order" (2026-10-06), headings included. */
const TIDY = [
    '## Guest 1', 'First Name', 'Last Name', 'Phone', 'Email', 'Upload Photo ID',
    '## Address', 'Address', 'Apartment/Unit #', 'City', 'State / County', 'Postcode', 'Country',
    '## Guest 2', 'Guest 2: First Name', 'Guest 2: Last Name', 'Guest 2: Phone Number',
    '## Guest 3', 'Guest 3: First Name', 'Guest 3: Last Name',
    '## Guest 4', 'Guest 4: First Name', 'Guest 4: Last Name',
    // v0.32.0: Dog and the boat question moved to "Extra Details/Options".
    '## Note', 'Customer Note',
];
const ALL_HEADINGS = TIDY.filter(x => x.startsWith('## '));

/* The boat field's own options, as Boat_Field stores them (v0.31.0). */
function boatSelect(id, v) {
    return `<select id="${id}" name="${id}"><option value="">— Select —</option>` +
        ['No', 'Yes'].map(o => `<option value="${o}"${v === o ? ' selected' : ''}>${o}</option>`).join('') + '</select>';
}

/* Synthetic values only — never anything resembling a real guest. */
function control(name, label, kind, value) {
    const id = 'mphb_' + name, v = value || '';
    if (kind === 'link') { return '<a href="#">View</a>'; }
    if (kind === 'boat') { return boatSelect(id, v); }
    if (kind === 'select') {
        return `<select id="${id}" name="${id}"><option value="">—</option>` +
            `<option value="A"${v === 'A' ? ' selected' : ''}>A</option>` +
            `<option value="B"${v === 'B' ? ' selected' : ''}>B</option></select>`;
    }
    if (kind === 'textarea') {
        return `<textarea id="${id}" name="${id}" rows="3">${v}</textarea>`;
    }
    return `<input type="text" id="${id}" name="${id}" value="${v}" class="regular-text">`;
}

/* The Photo ID row's two LIVE shapes (Director, 2026-10-06), plus one that must
 * not match: 'file' (default) — tr.mphb-link-button-row; 'nofile' —
 * tr.mphb-placeholder-row; both carry label[for="mphb-mphb_upload_id"];
 * 'classonly' — the link-button class and NO `for`. */
function linkRow(name, label, marker) {
    const forAttr = marker === 'classonly' ? '' : ` for="mphb-mphb_${name}"`;
    if (marker === 'nofile') {
        return `<tr class="mphb-placeholder-row"><th scope="row"><label${forAttr}>${label}</label></th>` +
            `<td><div class="mphb-ctrl-wrapper mphb-ctrl mphb-ctrl-placeholder"><label>File is not uploaded</label></div></td></tr>`;
    }
    return `<tr class="mphb-link-button-row"><th scope="row"><label${forAttr}>${label}</label></th>` +
        `<td><div class="mphb-ctrl-wrapper mphb-ctrl mphb-ctrl-link-button"><a class="button" href="#">View file</a></div></td></tr>`;
}

function rowsHtml(order, values, linkMarker) {
    return order.map(([name, label, kind]) => {
        if (kind === 'link') { return linkRow(name, label, linkMarker || 'file'); }
        if (kind === 'placeholder') {
            return `<tr class="mphb-placeholder-row"><th scope="row"><label>${label}</label></th>` +
                `<td><div class="mphb-ctrl-wrapper mphb-ctrl mphb-ctrl-placeholder"><label>File is not uploaded</label></div></td></tr>`;
        }
        const c = control(name, label, kind, values && values[name]);
        return `<tr><th scope="row"><label for="mphb_${name}">${label}</label></th><td>${c}</td></tr>`;
    }).join('\n');
}

/* REPRODUCTION of the core wp-admin rules that shape these screens
   (forms.css), including the 782px breakpoint — not the real stylesheet. */
const CORE_CSS = `
body { margin: 0; font: 13px/1.4 -apple-system, sans-serif; color: #3c434a; background: #f0f0f1; }
#poststuff, .wrap { padding: 10px; }
.postbox { background: #fff; border: 1px solid #c3c4c7; margin: 0 0 20px; }
.postbox h2 { font-size: 14px; margin: 0; padding: 8px 12px; border-bottom: 1px solid #c3c4c7; }
.postbox .inside { padding: 0 12px 12px; }
.form-table { border-collapse: collapse; margin-top: .5em; width: 100%; clear: both; }
.form-table th { vertical-align: top; text-align: left; padding: 20px 10px 20px 0; width: 200px; line-height: 1.3; font-weight: 600; }
.form-table td { margin-bottom: 9px; padding: 15px 10px; line-height: 1.3; vertical-align: middle; }
.regular-text { width: 25em; }
select, input[type=text], textarea { max-width: 100%; box-sizing: border-box; }
@media screen and (max-width: 782px) {
  .form-table th, .form-table td { display: block; width: auto; vertical-align: middle; }
  .form-table td { padding-left: 0; }
  .form-table th { padding: 10px 0 0; border-bottom: 0; }
  .regular-text, .form-table td select, .form-table td textarea { width: 100%; max-width: none; }
}`;

function editPage(order, values, opts) {
    opts = opts || {};
    const guestsBox = opts.guestsBox === undefined ? '' :
        `<div class="postbox" id="dcc_guests"><h2>Guests</h2><div class="inside"><p>
           <select name="dcc_adults[900]"><option value="">Not provided</option>` +
        [1, 2, 3, 4].map(n => `<option value="${n}"${opts.guestsBox === n ? ' selected' : ''}>${n}</option>`).join('') +
        `</select></p></div></div>`;
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width">
<style>${CORE_CSS}
${CSS}</style></head><body>
<form id="post" method="post"><div id="poststuff">
  <div class="postbox" id="mphb_customer"><h2>Customer Information</h2><div class="inside">
    <table class="form-table"><tbody>${rowsHtml(order, values, opts.linkMarker)}</tbody></table>
  </div></div>
  <div class="postbox"><h2>Reserved Accommodations</h2><div class="inside">
    <input type="hidden" name="mphb_rooms-hide" value="1">
    ${opts.editLink === false ? '' : '<!-- MotoPress\'s button: only its page slug is proven (Director, 6.3.0) --><a class="button" href="admin.php?page=mphb_edit_booking&booking_id=19615">Edit Accommodations</a>'}</div></div>
  ${guestsBox}
  <!--DCC-EXTRAS-->
</div></form>
<!--DCC-CFG-->
${opts.noScript ? '' : '<script>' + SCRIPT + '</script>'}
</body></html>`;
}

/* =========================================================================
 * ADD NEW fixture (flow) — STAND-IN from the recordings
 * ======================================================================= */

/* The customer step's fields in the order the recordings show them, with the
   labels as drawn there ("Street Address", "State / Province", "Postal Code"). */
const RECORDED_ORDER = [
    ['first_name', 'First Name'], ['last_name', 'Last Name'], ['phone', 'Phone Number'],
    ['email', 'Email'],
    ['guest2_first_name', 'Guest 2: First Name'], ['guest2_last_name', 'Guest 2: Last Name'],
    ['guest2_phone', 'Guest 2: Phone Number'],
    ['address1', 'Street Address'], ['apartment-units', 'Apartment/Unit #'], ['city', 'City'],
    ['state', 'State / Province'], ['country', 'Country', 'select'], ['zip', 'Postal Code'],
    ['upload_id', 'Upload Photo ID', 'file'],
    ['boat', 'Bringing a boat or trailer?', 'boat'],
    ['dog_type', 'Dog Type'], ['dog_size', 'Dog Size', 'select'], ['dog_hair', 'Dog Hair', 'select'],
    ['guest3_first_name', 'Guest 3: First Name'], ['guest3_last_name', 'Guest 3: Last Name'],
    ['guest4_first_name', 'Guest 4: First Name'], ['guest4_last_name', 'Guest 4: Last Name'],
];

const ADDNEW_TIDY = [
    '## Guest 1', 'First Name', 'Last Name', 'Phone Number', 'Email', 'Upload Photo ID',
    '## Address', 'Street Address', 'Apartment/Unit #', 'City', 'State / Province', 'Postal Code', 'Country',
    '## Guest 2', 'Guest 2: First Name', 'Guest 2: Last Name', 'Guest 2: Phone Number',
    '## Guest 3', 'Guest 3: First Name', 'Guest 3: Last Name',
    '## Guest 4', 'Guest 4: First Name', 'Guest 4: Last Name',
];

function flowField(name, label, kind, value, hintsOutside) {
    const id = 'mphb_' + name, v = value || '';
    if (kind === 'file' && hintsOutside) {
        // Variant: the hints as SIBLINGS after the field's <p> — no control in
        // them, so they must travel with Upload Photo ID, not fall to "Other".
        return `<p class="mphb-customer-${name} mphb-file-control"><label for="${id}">${label}</label>` +
            `<input type="file" id="${id}" name="${id}"></p>` +
            `<p class="dcc-test-hint">Maximum upload file size: 14 MB.</p>`;
    }
    if (kind === 'file') {
        // The upload hints sit inside the field's own <p>, after <br>s, as on
        // the public checkout (v0.20.0).
        return `<p class="mphb-customer-${name} mphb-file-control"><label for="${id}">${label}</label><br>` +
            `<input type="file" id="${id}" name="${id}"><br>` +
            `<span class="mphb-max-upload-file">Maximum upload file size: 14 MB.</span><br>` +
            `<span class="mphp-accepted-upload-types">Accepted file types: jpeg, jpg, png, pdf, webp, heic.</span></p>`;
    }
    let c;
    if (kind === 'boat') {
        c = boatSelect(id, v);
    } else if (kind === 'select') {
        c = `<select id="${id}" name="${id}"><option value="">— Select —</option>` +
            `<option value="A"${v === 'A' ? ' selected' : ''}>A</option><option value="B">B</option></select>`;
    } else {
        c = `<input type="text" id="${id}" name="${id}" value="${v}">`;
    }
    return `<p class="mphb-customer-${name} mphb-text-control"><label for="${id}">${label}</label>${c}</p>`;
}

/* opts: preset (Number of Guests), feeMult (the fee's own preset, MotoPress
   uses capacity), fee (couch cottage: the Extra Guest Fee row), pet (number of
   pet services: 0, 1 or 3), other (a generic service row), marker {types, pet},
   values, guestsInCustomer (fail-open case), noScript, guestName ('both' —
   MotoPress's name AND wrapper, the default; 'name' — name only; 'wrapper' —
   wrapper only; 'none'), guestNameValue, secondRoom. */
/* Full Guest Name, per room, in the shapes MotoPress's own markup could take.
   The live markup is NOT confirmed (Director, 2026-10-07). */
function guestNameBox(opts, i) {
    const shape = opts.guestName || 'both';
    if (shape === 'none') { return ''; }
    const v = opts.guestNameValue ? ` value="${opts.guestNameValue}"` : '';
    const name = shape === 'wrapper' ? `dcc_test_full_name_${i}` : `mphb_room_details[${i}][guest_name]`;
    const cls = shape === 'name' ? 'mphb-test-plain' : 'mphb-guest-name-wrapper';
    return `<p class="${cls}"><label>Full Guest Name</label><input type="text" name="${name}"${v}></p>`;
}

function addNewPage(opts) {
    opts = opts || {};
    const preset = opts.preset === undefined ? 1 : opts.preset;
    const chooser = `<p class="mphb-adults-chooser"><label for="mphb_adults-0">Number of Guests <abbr>*</abbr></label>
        <select id="mphb_adults-0" name="mphb_room_details[0][adults]" class="mphb_sc_checkout-guests-chooser">
          <option value="">— Select —</option>` +
        [1, 2, 3, 4].map(n => `<option${preset === n ? ' selected' : ''}>${n}</option>`).join('') +
        `</select></p>`;
    let j = 0;
    const svcs = [];
    if (opts.fee !== false) {
        svcs.push(`<li><label><input type="checkbox" name="mphb_room_details[0][services][${j}][id]" value="18063" class="mphb_sc_checkout-service">
          Extra Guest Fee (per guest beyond 2) <em>($50 / Per Day)</em> for
          <select name="mphb_room_details[0][services][${j}][adults]" class="mphb_sc_checkout-service-adults">` +
          [1, 2, 3, 4].map(n => `<option${(opts.feeMult || 4) === n ? ' selected' : ''}>${n}</option>`).join('') +
          `</select> guest(s)</label></li>`);
        j++;
    }
    [[17712, '1-6 nights'], [17711, '7-29 nights'], [14926, '30+ nights']].slice(0, opts.pet || 0).forEach(([id, span]) => {
        svcs.push(`<li><label><input type="checkbox" name="mphb_room_details[0][services][${j}][id]" value="${id}" class="mphb_sc_checkout-service">
          Pet Fee (${span}) <em>($35 / Per Day)</em></label></li>`);
        j++;
    });
    if (opts.other) {
        svcs.push(`<li><label><input type="checkbox" name="mphb_room_details[0][services][${j}][id]" value="999" class="mphb_sc_checkout-service">
          Late Checkout and Early Arrival Together Package <em>($20 / Per Accommodation)</em> for
          <select name="mphb_room_details[0][services][${j}][adults]"><option>1</option><option>2</option></select> guest(s)</label></li>`);
    }
    const services = svcs.length ? `<h4>Choose Additional Services</h4>
        <ul class="mphb_sc_checkout-services-list">${svcs.join('\n')}</ul>` : '';
    const fields = RECORDED_ORDER.map(([n, l, k]) => flowField(n, l, k, opts.values && opts.values[n], opts.hintsOutside)).join('\n');
    const marker = opts.marker ? `<div class="dcc_admin-room-context" data-dcc-room-types="${opts.marker.types || ''}" data-dcc-pet-service="${opts.marker.pet || ''}" hidden></div>` : '';
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width">
<style>${CORE_CSS}
#mphb-customer-details p, .mphb-booking-details p { margin: 0 0 12px; }
#mphb-customer-details label, .mphb-adults-chooser label { display: block; }
#mphb-customer-details input[type=text], #mphb-customer-details select, .mphb-adults-chooser select { width: 100%; }
.mphb_sc_checkout-services-list { list-style: none; margin: 0; padding: 0; }
${CSS}</style></head><body><div class="wrap"><h1>Add New Booking</h1>
<form class="mphb_sc_checkout-form" id="mphb-checkout" method="post">
  <section class="mphb-checkout-section mphb-booking-details">
    <h3>Reservation Details</h3>
    <p>Check-in: <strong>November 20, 2026</strong></p><p>Check-out: <strong>November 21, 2026</strong></p>
    <h3>Accommodation Details</h3>
    <p>Selected Accommodation: <a href="#">Cottage 36: Sunshine Suite</a></p>
    ${chooser}
    ${guestNameBox(opts, 0)}${opts.secondRoom ? guestNameBox(opts, 1) : ''}
    ${services}
    <h4>Price Breakdown</h4>
    <table class="mphb-price-breakdown"><tbody>
      <tr><td>Subtotal (excluding taxes)</td><td class="sub">$175</td></tr>
      <tr><td>Taxes</td><td>$19.25</td></tr>
      <tr><td>Total</td><td class="tot">$194.25</td></tr>
    </tbody></table>
    ${marker}
  </section>
  <section id="mphb-customer-details" class="mphb-checkout-section mphb-customer-details">
    <h3>Your Information</h3>
    <p class="mphb-required-fields-tip"><small>Required fields are followed by <abbr>*</abbr></small></p>
    ${opts.guestsInCustomer ? chooser.replace(/mphb_room_details\[0\]\[adults\]/, 'mphb_room_details[1][adults]') : ''}
    ${fields}
  </section>
  <section class="mphb-checkout-section mphb-total-price">
    <p>Total Price: <strong class="total-price">$194.25</strong></p>
    <p><label>Status</label><select name="mphb_post_status"><option>Confirmed</option></select></p>
    <p><input type="submit" value="Submit Booking"></p>
  </section>
</form></div>
<script>
/* STAND-IN for MotoPress's own price recompute — NOT this plugin. On any
   service change it prices the form the way MotoPress would from these
   inputs: $175 stay, + $50 x the fee's "for N" when the fee is ticked, + $35
   when a pet fee is ticked; taxes fixed at $19.25 as in the recordings. */
document.addEventListener('change', function () {
  var sub = 175, f = document.querySelector('input[value="18063"]');
  if (f && f.checked) {
    var m = document.querySelector('[name="' + f.name.replace(/\\[id\\]$/, '[adults]') + '"]');
    sub += 50 * (parseInt(m.value, 10) || 0);
  }
  if (Array.prototype.some.call(document.querySelectorAll('input[value="17712"],input[value="17711"],input[value="14926"]'), function (b) { return b.checked; })) { sub += 35; }
  document.querySelector('.sub').textContent = '$' + sub;
  document.querySelector('.tot').textContent = '$' + (sub + 19.25).toFixed(2);
}, false);
</script>
<!--DCC-CFG-->
${opts.noScript ? '' : '<script>' + SCRIPT + '</script>'}
</body></html>`;
}

async function open(browser, width, html, cfgOver, included, booking, wizard) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const pg  = await ctx.newPage();
    pg.setDefaultTimeout(5000);
    const logs = [];
    pg.on('console', m => logs.push(m.text()));
    const cfg = Object.assign(phpConfig(included, booking, wizard), cfgOver || {});
    // Printed inline ahead of the script, as wp_localize_script does. (An
    // addInitScript does NOT reach a setContent page — measured.)
    const cfgTag = '<script>window.DCC_CHECKOUT_ADMIN = ' +
        JSON.stringify(cfg).replace(/</g, '\\u003c') + ';</script>';
    // v0.32.0: the Extra Details/Options box exactly as the shipped PHP draws it.
    const extrasBox = cfg._extrasBox === undefined ? '' :
        `<div class="postbox" id="dcc-checkout-extras"><h2>Extra Details/Options</h2><div class="inside">${cfg._extrasBox}</div></div>`;
    await pg.setContent(html.replace('<!--DCC-CFG-->', cfgTag).replace('<!--DCC-EXTRAS-->', extrasBox));
    await pg.waitForTimeout(350);
    return { ctx, pg, logs, cfg };
}

/* What a person sees in a box, top to bottom: headings as "## …", rows by
   label. Only rendered things count. */
async function seen(pg, boxSel) {
    return pg.evaluate(sel => {
        const box = document.querySelector(sel);
        const out = [];
        box.querySelectorAll('tr, p, .dcc_admin-group-heading').forEach(n => {
            if (!n.getClientRects().length) { return; }
            if (n.closest('.dcc_admin-group-heading') && !n.classList.contains('dcc_admin-group-heading')) { return; }
            if (n.classList.contains('dcc_admin-group-heading')) { out.push('## ' + n.textContent.trim()); return; }
            if (n.classList.contains('dcc_admin-group-note')) { out.push('NOTE ' + n.textContent.trim()); return; }
            if (n.tagName === 'P' && n.closest('tr')) { return; }
            const l = n.querySelector('label');
            if (l) { out.push(l.textContent.trim()); }
        });
        return out;
    }, boxSel);
}
const EDIT_BOX = '#mphb_customer .inside';
const EXTRAS_BOX = '#dcc-checkout-extras .inside';
/* Is the Dog section on screen? (v0.32.0: it lives in Extra Details/Options
   now, so "is its first row rendered" replaces "is there a Dog heading".) */
async function dogShown(pg) {
    return pg.evaluate(() => {
        const el = document.querySelector('[name="mphb_dog_type"]');
        const row = el && el.closest('tr, p');
        return !!(row && row.getClientRects().length);
    });
}
const ADD_BOX  = '#mphb-customer-details';
const headingsIn = list => list.filter(x => x.startsWith('## '));

async function formData(pg) {
    return pg.evaluate(() => Array.from(new FormData(document.querySelector('form')).entries())
        .map(([k, v]) => k + '=' + (typeof v === 'string' ? v : '[file]')).sort());
}

async function choose(pg, sel, value) {
    await pg.selectOption(sel, value);
    await pg.waitForTimeout(150);
}

async function feeState(pg) {
    return pg.evaluate(() => {
        const box = document.querySelector('input[value="18063"]');
        const mult = box && document.querySelector('[name="' + box.name.replace(/\[id\]$/, '[adults]') + '"]');
        const line = document.querySelector('.dcc_admin-feeline');
        return {
            ticked: !!(box && box.checked),
            mult: mult ? mult.value : null,
            line: line && line.getClientRects().length ? line.textContent : '',
            total: document.querySelector('.tot').textContent,
        };
    });
}

async function petBoxes(pg) {
    return pg.evaluate(() => Array.from(
        document.querySelectorAll('input[value="17712"],input[value="17711"],input[value="14926"]')
    ).filter(b => b.checked).map(b => Number(b.value)));
}

async function visibleServiceRows(pg) {
    return pg.evaluate(() => Array.from(document.querySelectorAll('input[name*="[services]"][name$="[id]"]'))
        .filter(b => b.closest('li').getClientRects().length).map(b => Number(b.value)));
}

(async () => {
    const browser = await chromium.launch(
        fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}
    );
    const bk = (rooms) => ({ rooms });
    const EX = { isExisting: '1' };

    /* ======================================================================
     * EDIT SCREEN
     * ==================================================================== */

    /* --- E1. Order, at both widths, every group shown by the booking's facts. */
    for (const width of [1280, 390]) {
        const { ctx, pg } = await open(browser, width, editPage(MOTOPRESS_ORDER), EX, undefined,
            bk([{ type: 1607, adults: 4, services: [17712] }]));
        check(`${width}px edit, 4 guests + pet fee saved: Rob's order, every heading`,
            await seen(pg, EDIT_BOX), TIDY);
        check(`${width}px edit: no "Show all booking fields" anywhere (removed, owner's pick)`,
            await pg.evaluate(() => !!document.querySelector('#dcc_admin_show_all, .dcc_admin-showall, .dcc_admin-showall-row')), false);
        const geo = await pg.evaluate(() => ({
            overflow: document.querySelector('#mphb_customer').scrollWidth - document.querySelector('#mphb_customer').clientWidth,
            page: document.documentElement.scrollWidth - window.innerWidth,
        }));
        check(`${width}px edit: no horizontal overflow`, [geo.overflow, geo.page <= 0], [0, true]);
        await ctx.close();
    }

    /* --- E2. Guest 3/4 by the saved count; Dog by the saved pet fee. -------- */
    for (const width of [1280, 390]) {
        const ex = (rooms, values, more) => open(browser, width, editPage(MOTOPRESS_ORDER, values, more || {}), EX, undefined, bk(rooms));
        let r = await ex([{ type: 1604, adults: 2 }]);
        check(`${width}px edit, 2 guests, no pet fee: Guest 3, 4 and Dog hidden`,
            headingsIn(await seen(r.pg, EDIT_BOX)), ['## Guest 1', '## Address', '## Guest 2', '## Note']);
        await r.ctx.close();

        r = await ex([{ type: 1065, adults: 3 }]);
        let h = headingsIn(await seen(r.pg, EDIT_BOX));
        check(`${width}px edit, 3 guests: Guest 3 shows, Guest 4 does not`,
            [h.includes('## Guest 3'), h.includes('## Guest 4')], [true, false]);
        await r.ctx.close();

        r = await ex([{ type: 1607, adults: 2, services: [17711] }]);
        check(`${width}px edit, pet fee saved (list of ids): Dog shows`,
            await dogShown(r.pg), true);
        await r.ctx.close();
    }
    {
        const ex = (rooms, values) => open(browser, 1280, editPage(MOTOPRESS_ORDER, values), EX, undefined, bk(rooms));
        let r = await ex([{ type: 1607, adults: 2, services: { '14926': 1 } }]);
        check('edit, pet fee saved as a MAP id => quantity: Dog shows',
            await dogShown(r.pg), true);
        await r.ctx.close();
        r = await ex([{ type: 1607, adults: 2, services: [{ id: 17712, adults: 1 }] }]);
        check('edit, pet fee saved as a list of arrays: Dog shows',
            await dogShown(r.pg), true);
        await r.ctx.close();
        r = await ex([{ type: 1607, adults: 2, services: [18063] }]);
        check('edit, only the guest fee saved: Dog stays hidden (not every service is a pet fee)',
            await dogShown(r.pg), false);
        await r.ctx.close();

        r = await ex([{ type: 1604, adults: 2 }], { guest3_first_name: 'x-g3' });
        let s = await seen(r.pg, EDIT_BOX);
        check('edit, Guest 3 name saved on a 2-guest booking: Guest 3 stays visible',
            headingsIn(s).includes('## Guest 3'), true);
        check('... with the note right under its heading',
            s[s.indexOf('## Guest 3') + 1], 'NOTE More guest names than guests.');
        check('... and the value is untouched', await r.pg.$eval('[name="mphb_guest3_first_name"]', e => e.value), 'x-g3');
        await r.ctx.close();

        r = await ex([{ type: 1604, adults: 2 }], { dog_type: 'x-dog' });
        check('edit, dog details saved, no pet fee: Dog stays visible',
            await dogShown(r.pg), true);
        await r.ctx.close();

        r = await ex([{ type: 1065 }]);
        h = headingsIn(await seen(r.pg, EDIT_BOX));
        check('edit, guest count unreadable: Guest 3 and 4 show (fail open)',
            [h.includes('## Guest 3'), h.includes('## Guest 4')], [true, true]);
        await r.ctx.close();

        r = await ex([{ type: 1607, adults: 2, services: 'not-serialised garbage' }]);
        check('edit, Cottage 34, saved services unreadable: Dog shows (fail open)',
            await dogShown(r.pg), true);
        await r.ctx.close();

        r = await ex([{ type: 1604, adults: 2 }, { type: 1065, adults: 4 }]);
        h = headingsIn(await seen(r.pg, EDIT_BOX));
        check('edit, two rooms (2 and 4 guests): Guest 3 and 4 show — any room needs them',
            [h.includes('## Guest 3'), h.includes('## Guest 4')], [true, true]);
        await r.ctx.close();

        r = await ex([{ type: 1604, adults: 2 }, { type: 1607, adults: 2, services: [17712] }]);
        check('edit, two rooms, one with the pet fee: Dog shows',
            await dogShown(r.pg), true);
        await r.ctx.close();
    }
    {
        // The Guests box opens at the saved count and the screen follows it
        // before save.
        const { ctx, pg } = await open(browser, 1280, editPage(MOTOPRESS_ORDER, null, { guestsBox: 2 }), EX,
            undefined, bk([{ type: 1742, adults: 2 }]));
        check('edit with the Guests box at 2: Guest 3 hidden', headingsIn(await seen(pg, EDIT_BOX)).includes('## Guest 3'), false);
        await choose(pg, '[name="dcc_adults[900]"]', '3');
        check('... set to 3 there (before save): Guest 3 appears', headingsIn(await seen(pg, EDIT_BOX)).includes('## Guest 3'), true);
        check('the Guests box options carry NO fee label (0.27.x labelled them on couch cottages)',
            await pg.$$eval('[name="dcc_adults[900]"] option', os => os.some(o => o.textContent.indexOf('(+') !== -1)), false);
        await ctx.close();
    }

    /* --- E2b. v0.29.0: the pet fee as the BROWSER receives it, Guest 2. ---- */
    {
        const ex = (rooms, values, more) => open(browser, 1280, editPage(MOTOPRESS_ORDER, values, more || {}), EX, undefined, bk(rooms));
        const dog = dogShown;
        const word = pg => pg.evaluate(() => [typeof window.DCC_CHECKOUT_ADMIN.statedPetFee, window.DCC_CHECKOUT_ADMIN.statedPetFee]);

        // THE 0.28.0 DEFECT, constructed: Cottage 34, no pet fee saved. Live,
        // wp_localize_script turned false into "" and Dog showed anyway.
        let r = await ex([{ type: 1607, adults: 2 }]);
        check('edit, Cottage 34 without the pet fee: the browser receives the WORD "no" (after WP\'s localize step)',
            await word(r.pg), ['string', 'no']);
        check('... and Dog is hidden (0.28.0 showed it: "" read as unknown)', await dog(r.pg), false);
        await r.ctx.close();

        r = await ex([{ type: 1607, adults: 2, services: [17711] }]);
        check('edit, Cottage 34 with the pet fee: the browser receives "yes", and Dog shows',
            [await word(r.pg), await dog(r.pg)], [['string', 'yes'], true]);
        await r.ctx.close();

        r = await ex([{ type: 1065, adults: 2 }]);
        check('edit, Cottage 22 (no pet fee): "none", Dog hidden',
            [await word(r.pg), await dog(r.pg)], [['string', 'none'], false]);
        await r.ctx.close();

        r = await ex([{ type: 1604, adults: 2 }]);
        check('edit, Cottage 33 (an EMPTY services list = no pet services): "none", Dog hidden',
            [await word(r.pg), await dog(r.pg)], [['string', 'none'], false]);
        await r.ctx.close();

        r = await ex([{ type: 1999, adults: 2 }]);
        check('edit, a cottage that cannot be read: "unknown", Dog shows (fail open)',
            [await word(r.pg), await dog(r.pg)], [['string', 'unknown'], true]);
        await r.ctx.close();

        r = await ex([{ type: 1065, adults: 2 }, { type: 1999, adults: 2 }]);
        check('edit, two rooms, one cottage unreadable: Dog shows (one unknown room = unknown)', await dog(r.pg), true);
        await r.ctx.close();

        r = await ex([{ type: 1065, adults: 2 }], { dog_type: 'x-dog' });
        check('edit, Cottage 22 with dog details saved: Dog stays visible, value kept',
            [await dog(r.pg), await r.pg.$eval('[name="mphb_dog_type"]', e => e.value)], [true, 'x-dog']);
        await r.ctx.close();

        // Guest 2 follows the count too (owner, 2026-10-07).
        r = await ex([{ type: 1065, adults: 1 }]);
        check('edit, 1 guest: Guest 2 hidden (as Guest 3 and 4)',
            headingsIn(await seen(r.pg, EDIT_BOX)).filter(x => /Guest [234]/.test(x)), []);
        await r.ctx.close();

        r = await ex([{ type: 1065, adults: 1 }], { guest2_first_name: 'x-g2' });
        let s = await seen(r.pg, EDIT_BOX);
        check('edit, 1 guest with Guest 2 saved: Guest 2 stays, with the note, value untouched',
            [headingsIn(s).includes('## Guest 2'), s[s.indexOf('## Guest 2') + 1],
             await r.pg.$eval('[name="mphb_guest2_first_name"]', e => e.value)],
            [true, 'NOTE More guest names than guests.', 'x-g2']);
        await r.ctx.close();

        r = await ex([{ type: 1065, adults: 2 }], null, { guestsBox: 1 });
        check('edit, Guests box at 1: Guest 2 hidden', headingsIn(await seen(r.pg, EDIT_BOX)).includes('## Guest 2'), false);
        await choose(r.pg, '[name="dcc_adults[900]"]', '2');
        check('... set to 2 (before save): Guest 2 appears', headingsIn(await seen(r.pg, EDIT_BOX)).includes('## Guest 2'), true);
        await choose(r.pg, '[name="dcc_adults[900]"]', '');
        check('... set to "Not provided": Guest 2, 3 and 4 show (count unknown, fail open)',
            headingsIn(await seen(r.pg, EDIT_BOX)).filter(x => /Guest [234]/.test(x)), ['## Guest 2', '## Guest 3', '## Guest 4']);
        await r.ctx.close();
    }

    /* --- E3. Upload Photo ID, both live states, never by class alone. ------- */
    for (const [marker, title] of [['file', 'a photo stored'], ['nofile', 'NO photo stored']]) {
        const { ctx, pg } = await open(browser, 1280, editPage(MOTOPRESS_ORDER, null, { linkMarker: marker }), EX,
            undefined, bk([{ type: 1065, adults: 4, services: [17712] }]));
        const s = await seen(pg, EDIT_BOX);
        check(`edit, Photo ID with ${title}: it ends Guest 1, after Email`,
            s.slice(s.indexOf('Email'), s.indexOf('## Address')), ['Email', 'Upload Photo ID']);
        check(`... and no "Other" heading (${marker})`, s.includes('## Other'), false);
        await ctx.close();
    }
    {
        const { ctx, pg } = await open(browser, 1280, editPage(MOTOPRESS_ORDER, null, { linkMarker: 'classonly' }), EX,
            undefined, bk([{ type: 1065, adults: 4 }]));
        const s = await seen(pg, EDIT_BOX);
        check('edit, Photo ID row with only the class (no for): not matched, stays under "Other"',
            s.slice(-2), ['## Other', 'Upload Photo ID']);
        await ctx.close();
    }
    {
        const order = MOTOPRESS_ORDER.concat([['proof', 'Proof of Address', 'placeholder']]);
        const { ctx, pg } = await open(browser, 1280, editPage(order, null, { linkMarker: 'nofile' }), EX,
            undefined, bk([{ type: 1065, adults: 4 }]));
        const s = await seen(pg, EDIT_BOX);
        check('edit, an unrelated placeholder row is not taken for the Photo ID',
            s.slice(s.indexOf('Email'), s.indexOf('## Address')), ['Email', 'Upload Photo ID']);
        check('... it stays visible, under "Other"', s.slice(-2), ['## Other', 'Proof of Address']);
        await ctx.close();
    }

    /* --- E4. A save changes no stored field; nothing feeds the observer. ---- */
    {
        const vals = {};
        MOTOPRESS_ORDER.forEach(([n, , k]) => { if (k !== 'link') { vals[n] = k === 'select' ? 'B' : k === 'boat' ? 'Yes' : 'x-' + n; } });
        const booking = bk([{ type: 1604, adults: 2 }]);
        const base = await open(browser, 1280, editPage(MOTOPRESS_ORDER, vals, { noScript: true }), EX, undefined, booking);
        const before = await formData(base.pg);
        await base.ctx.close();
        const { ctx, pg } = await open(browser, 1280, editPage(MOTOPRESS_ORDER, vals), EX, undefined, booking);
        check('edit, the guard: the baseline carries every named field (22 incl. boat + rooms-hide)', before.length, 23);
        check('edit, with everything applied the form submits exactly the same fields and values',
            await formData(pg), before);
        const n = await pg.evaluate(() => new Promise(res => {
            const tb = document.querySelector('#mphb_customer tbody');
            let count = 0;
            new MutationObserver(l => { count += l.length; }).observe(tb, { childList: true, subtree: true, characterData: true });
            document.body.appendChild(document.createElement('span'));
            setTimeout(() => res(count), 900);
        }));
        check('edit, an already-settled box is not touched again (no childList/text mutations)', n, 0);
        await ctx.close();
    }

    /* --- E5. Fail open on the layout. --------------------------------------- */
    {
        const { ctx, pg, logs } = await open(browser, 1280, editPage([['first_name', 'First Name']]), EX,
            undefined, bk([{ type: 1065, adults: 2 }]));
        check('edit, a single known field is not treated as the box', headingsIn(await seen(pg, EDIT_BOX)), []);
        check('... and says why in the console', logs.some(l => /left as MotoPress drew it/.test(l)), true);
        await ctx.close();
    }
    {
        const order = MOTOPRESS_ORDER.slice();
        order.splice(4, 0, ['loyalty_code', 'Loyalty Code']);
        const { ctx, pg } = await open(browser, 1280, editPage(order), EX, undefined, bk([{ type: 1065, adults: 4 }]));
        const s = await seen(pg, EDIT_BOX);
        check('edit, an unknown field stays visible, after the groups, under "Other"', s.slice(-2), ['## Other', 'Loyalty Code']);
        await ctx.close();
    }

    /* ======================================================================
     * ADD NEW — customer step (STAND-IN from the recordings)
     * ==================================================================== */
    const W1  = phpConfig(undefined, null, { nights: 1 })._wizardPetService;
    const W7  = phpConfig(undefined, null, { nights: 7 })._wizardPetService;
    const W30 = phpConfig(undefined, null, { nights: 30 })._wizardPetService;
    check('the shipped wizard_pet_service() picks the bucket by stay: 1, 7, 30 nights', [W1, W7, W30], [17712, 17711, 14926]);

    const COUCH = { types: '1742' };
    const PETCOT = (pet) => ({ types: '1607', pet: pet });

    /* --- A1. Order and headings at both widths. ----------------------------- */
    for (const width of [1280, 390]) {
        const { ctx, pg } = await open(browser, width, addNewPage({ preset: 4, fee: false, pet: 3, marker: PETCOT(W1) }));
        await choose(pg, '#dcc_admin_pet_fee', 'yes');
        check(`${width}px Add New, 4 guests + Pet Fee Yes: the owner's order, light headings, labels as drawn`,
            (await seen(pg, ADD_BOX)).filter(x => x !== 'Your Information'), ADDNEW_TIDY);
        check(`${width}px Add New: "Your Information" and the required-fields tip stay first`,
            await pg.evaluate(() => {
                const kids = Array.from(document.querySelector('#mphb-customer-details').children);
                return [kids[0].tagName, kids[1].className];
            }), ['H3', 'mphb-required-fields-tip']);
        check(`${width}px Add New: the upload hints travel with Upload Photo ID`,
            await pg.evaluate(() => !!document.querySelector('[name="mphb_upload_id"]').closest('p').querySelector('.mphb-max-upload-file')), true);
        const geo = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        check(`${width}px Add New: no horizontal page scroll`, geo <= 0, true);
        await ctx.close();
    }

    /* --- A2. Guest count drives Guest 3/4; the fee follows; one control. ---- */
    {
        const { ctx, pg } = await open(browser, 1280, addNewPage({ preset: 1, feeMult: 4, marker: COUCH }));
        let f = await feeState(pg);
        check('Add New at 1 guest: the fee\'s multiplier is NOT left at MotoPress\'s preset 4', [f.ticked, f.mult], [false, '1']);
        check('... Guest 2, 3 and 4 hidden (Guest 2 follows the count since v0.29.0)',
            headingsIn(await seen(pg, ADD_BOX)).filter(x => /Guest [234]/.test(x)), []);
        check('... the Extra Guest Fee row is never on screen', await visibleServiceRows(pg), []);
        check('... nor the "Choose Additional Services" heading that only held it',
            await pg.evaluate(() => !!document.querySelector('.mphb-booking-details h4').getClientRects().length), false);

        const expect = { 1: [false, '1', '', '$194.25'], 2: [false, '1', '', '$194.25'],
            3: [true, '1', 'Extra guest fee: 1 guest × $50/night', '$244.25'],
            4: [true, '2', 'Extra guest fee: 2 guests × $50/night', '$294.25'] };
        for (const n of [1, 2, 3, 4, 2, 1]) {
            await choose(pg, '[name="mphb_room_details[0][adults]"]', { label: n > 2 ? `${n} (+$${(n - 2) * 50}/night)` : String(n) });
            f = await feeState(pg);
            check(`Add New ${n} guest(s): fee ticked / multiplier / line / Price Breakdown total`,
                [f.ticked, f.mult, f.line, f.total], expect[n]);
        }
        await choose(pg, '[name="mphb_room_details[0][adults]"]', '2');
        let h = headingsIn(await seen(pg, ADD_BOX));
        check('Add New 2 guests: Guest 2 shows, Guest 3 and 4 do not',
            [h.includes('## Guest 2'), h.includes('## Guest 3'), h.includes('## Guest 4')], [true, false, false]);
        await choose(pg, '[name="mphb_room_details[0][adults]"]', { label: '3 (+$50/night)' });
        h = headingsIn(await seen(pg, ADD_BOX));
        check('Add New 3 guests: Guest 3 shows, Guest 4 does not', [h.includes('## Guest 3'), h.includes('## Guest 4')], [true, false]);
        await choose(pg, '[name="mphb_room_details[0][adults]"]', { label: '4 (+$100/night)' });
        h = headingsIn(await seen(pg, ADD_BOX));
        check('Add New 4 guests: Guest 3 and Guest 4 show', [h.includes('## Guest 3'), h.includes('## Guest 4')], [true, true]);
        await pg.fill('[name="mphb_guest3_first_name"]', 'x-typed');
        await pg.dispatchEvent('[name="mphb_guest3_first_name"]', 'change');
        await choose(pg, '[name="mphb_room_details[0][adults]"]', '2');
        const s = await seen(pg, ADD_BOX);
        check('Add New, Guest 3 typed then lowered to 2: Guest 3 stays, with the note; Guest 4 hides',
            [headingsIn(s).includes('## Guest 3'), s[s.indexOf('## Guest 3') + 1], headingsIn(s).includes('## Guest 4')],
            [true, 'NOTE More guest names than guests.', false]);
        check('... the typed name is never cleared', await pg.$eval('[name="mphb_guest3_first_name"]', e => e.value), 'x-typed');
        await choose(pg, '[name="mphb_room_details[0][adults]"]', { label: '3 (+$50/night)' });
        check('... back to 3: the note goes', (await seen(pg, ADD_BOX)).some(x => x.startsWith('NOTE')), false);
        await ctx.close();
    }

    /* --- A3. Pet Fee on a pet cottage: the only pet-fee control. ------------ */
    for (const [w, label] of [[W1, '1 night'], [W7, '7 nights'], [W30, '30 nights']]) {
        const { ctx, pg } = await open(browser, 1280, addNewPage({ preset: 2, fee: false, pet: 3, marker: PETCOT(w) }));
        check(`pet cottage (${label}): Pet Fee opens at No, Dog hidden, no pet fee ticked`,
            [await pg.$eval('#dcc_admin_pet_fee', e => e.value), await dogShown(pg), await petBoxes(pg)],
            ['no', false, []]);
        check(`... the pet services' own rows are never on screen (${label})`, await visibleServiceRows(pg), []);
        await choose(pg, '#dcc_admin_pet_fee', 'yes');
        check(`Pet Fee Yes (${label}): exactly the stay's bucket is ticked, and Dog shows`,
            [await petBoxes(pg), await dogShown(pg)], [[w], true]);
        check(`... the Price Breakdown carries the pet fee (${label})`, (await feeState(pg)).total, '$229.25');
        await choose(pg, '#dcc_admin_pet_fee', 'no');
        check(`Pet Fee No (${label}): unticked, Dog hidden, total back`,
            [await petBoxes(pg), await dogShown(pg), (await feeState(pg)).total],
            [[], false, '$194.25']);
        await ctx.close();
    }
    {
        // As a person would: Yes, type the dog's details, then change to No.
        const { ctx, pg } = await open(browser, 1280, addNewPage({ preset: 2, fee: false, pet: 3, marker: PETCOT(W1) }));
        await choose(pg, '#dcc_admin_pet_fee', 'yes');
        await pg.fill('[name="mphb_dog_type"]', 'x-dog');
        await pg.dispatchEvent('[name="mphb_dog_type"]', 'change');
        await choose(pg, '#dcc_admin_pet_fee', 'no');
        check('Pet Fee Yes, dog type typed, then No: Dog stays visible, value kept',
            [await dogShown(pg), await pg.$eval('[name="mphb_dog_type"]', e => e.value)],
            [true, 'x-dog']);
        check('the Pet Fee dropdown is never submitted (no name)', (await formData(pg)).some(x => /pet_fee|dcc_admin/.test(x)), false);
        await ctx.close();
    }
    {
        // Bucket not stated, three pet services: cannot tell — rows stay, says so.
        const { ctx, pg } = await open(browser, 1280, addNewPage({ preset: 2, fee: false, pet: 3, marker: { types: '1607' } }));
        await choose(pg, '#dcc_admin_pet_fee', 'yes');
        check('pet bucket not stated, three pet services: nothing guessed, the rows stay, and it says so',
            [await petBoxes(pg), (await visibleServiceRows(pg)).length,
             await pg.$eval('.dcc_admin-petfee__note', e => e.hidden ? '' : e.textContent)],
            [[], 3, 'Choose the pet fee under Additional Services.']);
        await ctx.close();
    }
    {
        // Bucket not stated, ONE pet service: that one.
        const { ctx, pg } = await open(browser, 1280, addNewPage({ preset: 2, fee: false, pet: 1, marker: { types: '1607' } }));
        await choose(pg, '#dcc_admin_pet_fee', 'yes');
        check('pet bucket not stated, the room has one pet service: that one is ticked', await petBoxes(pg), [17712]);
        await ctx.close();
    }

    /* --- A4. No Pet Fee anywhere but a pet-fee cottage (v0.29.0). ---------- */
    {
        // Rob: "Keep 34 as the only pet fee cottage" / "No Pet Fee on others".
        const probe = async pg => [
            await pg.$('#dcc_admin_pet_fee') !== null,
            await dogShown(pg),
            await pg.$('.dcc_admin-petfee__note') !== null,
        ];
        let r = await open(browser, 1280, addNewPage({ preset: 2, marker: COUCH }));
        check('Add New, Cottage 36 (no pet fee): no dropdown, no Dog, no message', await probe(r.pg), [false, false, false]);
        await r.ctx.close();
        r = await open(browser, 1280, addNewPage({ preset: 2, fee: false, marker: { types: '1604' } }));
        check('Add New, Cottage 33 (empty services list): no dropdown, no Dog, no message', await probe(r.pg), [false, false, false]);
        await r.ctx.close();
        r = await open(browser, 1280, addNewPage({ preset: 2, fee: false, pet: 3, marker: { types: '1999', pet: W1 } }));
        check('Add New, cottage unreadable (pet rows even on screen): no dropdown, Dog shows (fail open)',
            await probe(r.pg), [false, true, false]);
        check('... and nothing is ticked for it', await petBoxes(r.pg), []);
        await r.ctx.close();
        r = await open(browser, 1280, addNewPage({ preset: 2, fee: false, pet: 0, marker: PETCOT(W1) }));
        check('Add New, Cottage 34 but no pet service on screen: no dropdown (nothing to charge), Dog shows',
            await probe(r.pg), [false, true, false]);
        await r.ctx.close();
        r = await open(browser, 1280, addNewPage({ preset: 2, marker: COUCH }));
        await r.pg.evaluate(() => document.querySelector('[name="mphb_dog_type"]').closest('p').classList.contains('dcc_admin-field-hidden'));
        await r.pg.$eval('[name="mphb_dog_type"]', e => { e.value = 'x-dog'; e.dispatchEvent(new Event('change', { bubbles: true })); });
        await r.pg.waitForTimeout(150);
        check('Add New, Cottage 36, a dog value present: Dog shows (a filled field always stays)',
            await dogShown(r.pg), true);
        await r.ctx.close();
    }

    /* --- A5. Phone width: service rows stack; nothing past the edge. -------- */
    for (const width of [390, 1280]) {
        const { ctx, pg } = await open(browser, width, addNewPage({ preset: 2, marker: COUCH, other: true }));
        const g = await pg.evaluate(() => {
            const box = document.querySelector('input[value="999"]');
            const label = box.closest('label');
            const em = label.querySelector('em');
            const sel = label.querySelector('select');
            const r = e => e.getBoundingClientRect();
            return {
                priceBelowName: r(em).top >= r(box).bottom - 1,
                pickerBelowPrice: r(sel).top >= r(em).bottom - 1,
                rightEdge: Math.max(r(label).right, r(em).right, r(sel).right) <= window.innerWidth + 0.5,
                page: document.documentElement.scrollWidth - window.innerWidth,
            };
        });
        if (width === 390) {
            check('390px: a service row stacks — name, then price, then the "for N" picker',
                [g.priceBelowName, g.pickerBelowPrice], [true, true]);
            check('390px: nothing beyond the screen edge', [g.rightEdge, g.page <= 0], [true, true]);
        } else {
            check('1280px: a service row is NOT stacked (computer width unchanged)', g.priceBelowName, false);
        }
        await ctx.close();
    }

    /* --- A6. Save, observer, search step, fail open. ------------------------- */
    {
        const vals = { first_name: 'x-f', guest2_first_name: 'x-g2', dog_size: 'A' };
        const base = await open(browser, 1280, addNewPage({ preset: 2, marker: COUCH, values: vals, noScript: true }));
        const keep = x => !/\[services\]|\[guest_name\]/.test(x);
        const all0 = await formData(base.pg);
        const before = all0.filter(keep);
        await base.ctx.close();
        const { ctx, pg } = await open(browser, 1280, addNewPage({ preset: 2, marker: COUCH, values: vals }));
        check('Add New, the guard: the baseline carries the customer fields', before.length > 20, true);
        check('Add New, with everything applied the customer fields submit unchanged',
            (await formData(pg)).filter(keep), before);
        check('... the ONE value that differs is Full Guest Name, filled from Guest 1 (v0.29.0)',
            [all0.filter(x => /\[guest_name\]/.test(x)), (await formData(pg)).filter(x => /\[guest_name\]/.test(x))],
            [['mphb_room_details[0][guest_name]='], ['mphb_room_details[0][guest_name]=x-f']]);
        const n = await pg.evaluate(() => new Promise(res => {
            const box = document.querySelector('#mphb-customer-details');
            let count = 0;
            new MutationObserver(l => { count += l.length; }).observe(box, { childList: true, subtree: true, characterData: true });
            document.body.appendChild(document.createElement('span'));
            setTimeout(() => res(count), 900);
        }));
        check('Add New, an already-settled form is not touched again', n, 0);
        await ctx.close();
    }
    {
        // The Add New SEARCH step has an adults select too: no Pet Fee there —
        // even with Cottage 34 chosen in its Accommodation Type (as in the
        // recordings), the worst case for it.
        const { ctx, pg } = await open(browser, 1280, `<!doctype html><html><body>
            <form><select name="mphb_room_type_id"><option value="1065">Cottage 22</option><option value="1607" selected>Cottage 34</option></select>
            <select name="mphb_adults"><option>1</option><option>2</option></select></form>
            <!--DCC-CFG--><script>${SCRIPT}</script></body></html>`);
        check('the search step gets no Pet Fee dropdown, even on Cottage 34', await pg.$('#dcc_admin_pet_fee'), null);
        await ctx.close();
    }
    {
        const { ctx, pg, logs } = await open(browser, 1280, addNewPage({ preset: 2, marker: COUCH, guestsInCustomer: true }));
        check('Add New: a customer block that also holds Number of Guests is not ordered',
            headingsIn(await seen(pg, ADD_BOX)), []);
        check('... and the console says why', logs.some(l => /share a container with the guest count/.test(l)), true);
        await ctx.close();
    }
    {
        // Count unreadable ("— Select —"): Guest 3/4 show.
        const { ctx, pg } = await open(browser, 1280, addNewPage({ preset: 0, marker: COUCH }));
        const h = headingsIn(await seen(pg, ADD_BOX));
        check('Add New, Number of Guests not chosen: Guest 2, 3 and 4 show (fail open)',
            [h.includes('## Guest 2'), h.includes('## Guest 3'), h.includes('## Guest 4')], [true, true, true]);
        await ctx.close();
    }


    /* --- A7. Conditions not yet constructed above. ----------------------- */
    {
        const { ctx, pg } = await open(browser, 1280, addNewPage({ preset: 4, fee: false, pet: 3, marker: PETCOT(W1), hintsOutside: true }));
        const after = await pg.evaluate(() => {
            const row = document.querySelector('[name="mphb_upload_id"]').closest('p');
            return row.nextElementSibling && row.nextElementSibling.className;
        });
        check('Add New, an upload hint OUTSIDE the field travels with Upload Photo ID (not to "Other")', after, 'dcc-test-hint');
        check('... and no "Other" heading appears for it', (await seen(pg, ADD_BOX)).includes('## Other'), false);
        await ctx.close();
    }
    {
        // v0.29.0: the COUNT decides every guest group, whatever "Guests
        // included" says (that setting moves the fee, not the fields).
        const { ctx, pg, cfg } = await open(browser, 1280, addNewPage({ preset: 2, marker: COUCH }), {}, 3);
        check('"Guests included" = 3: every guest group is still sent, each with its own min',
            cfg.guestGroups.map(g => g.min), [2, 3, 4]);
        const h = headingsIn(await seen(pg, ADD_BOX));
        check('"Guests included" = 3, 2 guests: Guest 2 shows, Guest 3 and 4 do not',
            [h.includes('## Guest 2'), h.includes('## Guest 3'), h.includes('## Guest 4')], [true, false, false]);
        await choose(pg, '[name="mphb_room_details[0][adults]"]', '3');
        check('... at 3 guests: no fee line (3 are included)', (await feeState(pg)).line, '');
        await ctx.close();
    }
    {
        const { ctx, pg } = await open(browser, 1280, editPage(MOTOPRESS_ORDER), EX, undefined,
            bk([{ type: 1604, adults: 2 }, { type: 1065 }]));
        const h = headingsIn(await seen(pg, EDIT_BOX));
        check('edit, two rooms, one count missing: Guest 3 and 4 show (one unreadable room = unreadable)',
            [h.includes('## Guest 3'), h.includes('## Guest 4')], [true, true]);
        await ctx.close();
    }

    /* --- A8. Full Guest Name follows Guest 1 (v0.29.0). ----------------------- */
    {
        const typeName = async (pg, first, last) => {
            await pg.fill('[name="mphb_first_name"]', first);
            await pg.fill('[name="mphb_last_name"]', last);
        };
        // MotoPress's guest-name inputs only (v0.32.0: the moved Dog Type box
        // now sits in this section too, and is not a guest name).
        const boxes = pg => pg.$$eval('.mphb-booking-details input[name$="[guest_name]"], .mphb-booking-details .mphb-guest-name-wrapper input',
            bs => bs.map(b => b.value));

        let r = await open(browser, 1280, addNewPage({ preset: 2, marker: COUCH }));
        await typeName(r.pg, 'Ann', 'Example');
        check('Add New: Full Guest Name fills from First + Last as they are typed', await boxes(r.pg), ['Ann Example']);
        await r.pg.fill('[name="mphb_room_details[0][guest_name]"]', 'x-by-hand');
        await r.pg.fill('[name="mphb_last_name"]', 'Other');
        check('... once edited by hand it is never overwritten', await boxes(r.pg), ['x-by-hand']);
        await r.ctx.close();

        r = await open(browser, 1280, addNewPage({ preset: 2, marker: COUCH, secondRoom: true }));
        await typeName(r.pg, 'Ann', 'Example');
        check('Add New, two rooms: each room\'s box is filled', await boxes(r.pg), ['Ann Example', 'Ann Example']);
        await r.ctx.close();

        r = await open(browser, 1280, addNewPage({ preset: 2, marker: COUCH, guestNameValue: 'x-already' }));
        await typeName(r.pg, 'Ann', 'Example');
        check('Add New, a box that already holds a name is left alone', await boxes(r.pg), ['x-already']);
        await r.ctx.close();

        for (const shape of ['name', 'wrapper']) {
            r = await open(browser, 1280, addNewPage({ preset: 2, marker: COUCH, guestName: shape }));
            await typeName(r.pg, 'Ann', 'Example');
            check(`Add New, found by MotoPress's ${shape === 'name' ? '[guest_name] input name' : '.mphb-guest-name-wrapper'} alone`,
                await boxes(r.pg), ['Ann Example']);
            await r.ctx.close();
        }

        r = await open(browser, 1280, addNewPage({ preset: 2, marker: COUCH, guestName: 'none' }));
        const errs = [];
        r.pg.on('pageerror', e => errs.push(String(e)));
        await typeName(r.pg, 'Ann', 'Example');
        check('Add New, no Full Guest Name on the page: nothing happens, no error', errs, []);
        await r.ctx.close();
    }

    /* --- X. v0.32.0: "Extra Details/Options" (A), imports (C), E's keep. ---- */
    {
        const boatVal = pg => pg.$eval('[name="mphb_boat"]', e => e.value);
        // Labels, top to bottom, of what is rendered inside a container.
        const inBox = (pg, sel) => pg.evaluate(sel => {
            const box = document.querySelector(sel);
            if (!box) { return null; }
            return Array.from(box.querySelectorAll('tr, p, .dcc_admin-group-heading')).filter(n => n.getClientRects().length)
                .map(n => n.classList.contains('dcc_admin-group-heading') ? '## ' + n.textContent.trim()
                    : ((n.querySelector('label') || {}).textContent || '').trim()).filter(Boolean);
        }, sel);
        const parentOf = (pg, name) => pg.$eval(`[name="${name}"]`, e => {
            const box = e.closest('#dcc-checkout-extras, #mphb_customer, .dcc_admin-extras, #mphb-customer-details');
            return box ? (box.id || box.className) : null;
        });

        for (const width of [1280, 390]) {
            // Direct booking on Cottage 34 with the pet fee: everything visible.
            let r = await open(browser, width, editPage(MOTOPRESS_ORDER), EX, undefined, bk([{ type: 1607, adults: 2, services: [17712] }]));
            const labels = await inBox(r.pg, EXTRAS_BOX);
            check(`${width}px edit: the moved rows sit in the box, in order (Dog Type, Size, Hair, then boat)`,
                labels.filter(l => /^(Dog|Bringing)/.test(l)), ['Dog Type', 'Dog Size', 'Dog Hair', 'Bringing a boat or trailer?']);
            check(`${width}px edit: none of them is left in Customer Information, and no "Other" heading appears for them`,
                [(await seen(r.pg, EDIT_BOX)).filter(l => /^(Dog|Bringing)/.test(l)), headingsIn(await seen(r.pg, EDIT_BOX)).includes('## Other')], [[], false]);
            check(`${width}px edit: the pet fee reads Yes, with a copy of MotoPress's own Edit Accommodations link`,
                await r.pg.evaluate(() => {
                    const a = document.querySelector('#dcc-checkout-extras .dcc_extras-edit-link');
                    return [document.querySelector('#dcc-checkout-extras .dcc_admin-petfee-line').textContent.trim(), a && a.getAttribute('href')];
                }), ['Pet fee: Yes', 'admin.php?page=mphb_edit_booking&booking_id=19615']);
            const geo = await r.pg.evaluate(() => {
                const b = document.querySelector('#dcc-checkout-extras');
                return b.scrollWidth - b.clientWidth;
            });
            check(`${width}px edit: nothing in the box runs past its edge`, geo <= 0, true);
            await r.ctx.close();
        }

        // The move changes nothing that is submitted.
        {
            const vals = { dog_type: 'x-dog', dog_size: 'B', boat: 'Yes', first_name: 'x-f' };
            const booking = bk([{ type: 1607, adults: 2, services: [17712] }]);
            const base = await open(browser, 1280, editPage(MOTOPRESS_ORDER, vals, { noScript: true }), EX, undefined, booking);
            const before = (await formData(base.pg)).filter(x => !x.startsWith('dcc_'));
            await base.ctx.close();
            const r = await open(browser, 1280, editPage(MOTOPRESS_ORDER, vals), EX, undefined, booking);
            check('edit: with the rows moved into the box, the form submits exactly the same MotoPress fields and values',
                (await formData(r.pg)).filter(x => !x.startsWith('dcc_')), before);
            check('... and the moved controls really are inside the box (guard)',
                [await parentOf(r.pg, 'mphb_dog_type'), await parentOf(r.pg, 'mphb_boat')], ['dcc-checkout-extras', 'dcc-checkout-extras']);
            await r.ctx.close();
        }

        // Not a pet-fee cottage: no pet part; the boat question still there.
        let r = await open(browser, 1280, editPage(MOTOPRESS_ORDER), EX, undefined, bk([{ type: 1065, adults: 1 }]));
        let b = await inBox(r.pg, EXTRAS_BOX);
        check('edit, Cottage 22, 1 guest: no pet part, Dog hidden, the boat question shown and blank',
            [await r.pg.evaluate(() => !!document.querySelector('#dcc-checkout-extras .dcc_admin-petfee-line, #dcc_dog, [data-dcc-edit-accommodations]')),
             await dogShown(r.pg), b.includes('Bringing a boat or trailer?'), await boatVal(r.pg)],
            [false, false, true, '']);
        await r.ctx.close();

        // Direct, no pet fee: Dog hidden, boat shown; a saved Yes is kept and submitted.
        r = await open(browser, 1280, editPage(MOTOPRESS_ORDER, { boat: 'Yes' }), EX, undefined, bk([{ type: 1607, adults: 2, services: [] }]));
        check('edit, Cottage 34 without the pet fee: Pet fee: No, Dog hidden, boat shown with its saved Yes',
            [await r.pg.$eval('#dcc-checkout-extras .dcc_admin-petfee-line', e => e.textContent.trim()), await dogShown(r.pg), await boatVal(r.pg)],
            ['Pet fee: No', false, 'Yes']);
        await r.ctx.close();

        // No MotoPress link on the page (as on an import): no button is invented.
        r = await open(browser, 1280, editPage(MOTOPRESS_ORDER, null, { editLink: false }), EX, undefined, bk([{ type: 1607, adults: 2, services: [] }]));
        check('edit, MotoPress shows no Edit Accommodations link: none is built (the prompt text stays)',
            await r.pg.evaluate(() => !!document.querySelector('.dcc_extras-edit-link')), false);
        await r.ctx.close();

        /* ---- C. Imports: record only. ---------------------------------------- */
        r = await open(browser, 1280, editPage(MOTOPRESS_ORDER), EX, undefined, { rooms: [{ type: 1607, adults: 2 }], imported: true });
        check('import on Cottage 34: "Bringing a dog?" opens unanswered; no Pet fee line, no Edit Accommodations button; Dog hidden',
            [await r.pg.$eval('#dcc_dog', e => e.value), await r.pg.evaluate(() => !!document.querySelector('.dcc_admin-petfee-line, .dcc_extras-edit-link')), await dogShown(r.pg)],
            ['', false, false]);
        await choose(r.pg, '#dcc_dog', 'yes');
        check('... "Yes": Dog Type / Size / Hair appear (before save)', await dogShown(r.pg), true);
        await choose(r.pg, '#dcc_dog', 'no');
        check('... "No": hidden again', await dogShown(r.pg), false);
        await r.ctx.close();
        r = await open(browser, 1280, editPage(MOTOPRESS_ORDER), EX, undefined, { rooms: [{ type: 1607, adults: 2 }], imported: true, dog: 'yes' });
        check('import with _dcc_dog = yes saved: opens on Yes, Dog shown', [await r.pg.$eval('#dcc_dog', e => e.value), await dogShown(r.pg)], ['yes', true]);
        await r.ctx.close();

        // An import NEVER gets the extra-guest fee from here — constructed: a
        // couch cottage stated, a 4-guest chooser and the fee's own row on the
        // page, which on a direct booking WOULD be ticked.
        const feeRow = '<ul><li><label><input type="checkbox" name="mphb_room_details[0][services][0][id]" value="18063"> Extra Guest Fee</label>' +
            ' <select name="mphb_room_details[0][services][0][adults]"><option>1</option><option>2</option><option selected>4</option></select></li></ul>' +
            '<p><select name="mphb_room_details[0][adults]"><option>2</option><option selected>4</option></select></p>' +
            '<div data-dcc-room-types="1065" hidden></div>';
        const withFee = html => html.replace('<!--DCC-EXTRAS-->', feeRow + '<!--DCC-EXTRAS-->');
        const ticked = pg => pg.$eval('input[value="18063"]', e => e.checked);
        r = await open(browser, 1280, withFee(editPage(MOTOPRESS_ORDER)), EX, undefined, { rooms: [{ type: 1065, adults: 4 }] });
        check('guard: on a DIRECT booking this page DOES tick the fee (so the import case can fail)', await ticked(r.pg), true);
        await r.ctx.close();
        r = await open(browser, 1280, withFee(editPage(MOTOPRESS_ORDER)), EX, undefined, { rooms: [{ type: 1065, adults: 4 }], imported: true });
        check('IMPORT: the same page ticks NO fee and leaves its multiplier alone',
            [await ticked(r.pg), await r.pg.$eval('[name="mphb_room_details[0][services][0][adults]"]', e => e.value)], [false, '4']);
        await r.ctx.close();

        /* ---- E. The Guest count's "not confirmed" option drives the gating. --- */
        const keepBox = '<div class="postbox" id="dcc_guests"><h2>Guests</h2><div class="inside"><p>' +
            '<select name="dcc_adults[900]" data-dcc-stored="2"><option value="keep" selected>2 (not confirmed)</option>' +
            '<option value="">Not provided</option><option>1</option><option>2</option><option>3</option><option>4</option></select></p></div></div>';
        // A stored 2: "unreadable" would SHOW Guest 3 (fail open), so only a
        // correct reading of the keep option hides it.
        r = await open(browser, 1280, editPage(MOTOPRESS_ORDER).replace('<!--DCC-EXTRAS-->', keepBox + '<!--DCC-EXTRAS-->'), EX, undefined, bk([{ type: 1065, adults: 2 }]));
        check('edit, Guest count on "2 (not confirmed)": the screen reads it as 2 (Guest 3 and 4 hidden, not failed open)',
            [headingsIn(await seen(r.pg, EDIT_BOX)).includes('## Guest 3'), headingsIn(await seen(r.pg, EDIT_BOX)).includes('## Guest 4')], [false, false]);
        await r.ctx.close();

        /* ---- Add New: the block right after Number of Guests (Rob's pick 6). -- */
        for (const width of [1280, 390]) {
            r = await open(browser, width, addNewPage({ preset: 2, fee: false, pet: 3, marker: PETCOT(W1) }));
            const block = await inBox(r.pg, '.dcc_admin-extras');
            check(`${width}px Add New, Cottage 34: "Extra Details/Options" holds Pet Fee, then (when Yes) Dog, then the boat question`,
                block, ['## Extra Details/Options', 'Pet Fee:', 'Bringing a boat or trailer?']);
            await choose(r.pg, '#dcc_admin_pet_fee', 'yes');
            check(`${width}px Add New: Pet Fee Yes shows Dog inside the block, above the boat question`,
                await inBox(r.pg, '.dcc_admin-extras'), ['## Extra Details/Options', 'Pet Fee:', 'Dog Type', 'Dog Size', 'Dog Hair', 'Bringing a boat or trailer?']);
            check(`${width}px Add New: the block sits right after Number of Guests`,
                await r.pg.evaluate(() => {
                    const b = document.querySelector('.dcc_admin-extras');
                    return !!(b.previousElementSibling && b.previousElementSibling.querySelector('[name$="[adults]"]'));
                }), true);
            check(`${width}px Add New: nothing runs past the edge`, await r.pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth <= 0), true);
            await r.ctx.close();
        }
        r = await open(browser, 1280, addNewPage({ preset: 1, marker: COUCH }));
        check('Add New, a couch cottage: the block holds only the boat question (no Pet Fee, Dog hidden), blank',
            [await inBox(r.pg, '.dcc_admin-extras'), await boatVal(r.pg)], [['## Extra Details/Options', 'Bringing a boat or trailer?'], '']);
        check('... and Customer Information no longer lists Dog or the boat question',
            (await seen(r.pg, ADD_BOX)).filter(l => /^(Dog|Bringing)/.test(l) || l === '## Dog' || l === '## Other'), []);
        await r.ctx.close();
        r = await open(browser, 1280, addNewPage({ preset: 2, fee: false, pet: 3, marker: PETCOT(W1) }));
        await choose(r.pg, '[name="mphb_boat"]', 'Yes');
        await choose(r.pg, '#dcc_admin_pet_fee', 'yes');
        await choose(r.pg, '#dcc_admin_pet_fee', 'no');
        await choose(r.pg, '[name="mphb_room_details[0][adults]"]', '1');
        await r.pg.waitForTimeout(300);
        check('Add New: answering the boat question Yes, then flipping Pet Fee and the guest count, never hides it or changes the answer',
            [(await inBox(r.pg, '.dcc_admin-extras')).includes('Bringing a boat or trailer?'), await boatVal(r.pg)], [true, 'Yes']);
        await r.ctx.close();
    }

    await browser.close();
    console.log(failures ? `\n${failures} failing, ${passes} passing` : `\nall passing (${passes})`);
    process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
