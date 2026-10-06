/**
 * Admin booking screen — the Customer Information box's order and headings
 * (v0.26.0), in real Chromium at 1280px and 390px.
 *
 *     npm install && npm test
 *
 * THE FIXTURE IS A PATTERN, NOT A CAPTURE, and that is the first thing to know
 * about this suite. The booking edit screen needs a WordPress login and the
 * session's network policy blocks wordpress.org, so no real markup could be
 * read. The fixture follows MotoPress's admin metabox shape (a core
 * `table.form-table` of `th`/`td` rows) and carries the 21 rows in EXACTLY the
 * order and with exactly the labels the Website Director read on booking
 * 19615's edit screen (labels only). The input names are the `mphb_` + field
 * name pattern the gating already uses. What the suite proves is the
 * behaviour against that shape; whether live matches the shape is the
 * Director's check, and if it does not, the code stands down (section 6).
 *
 * The config is NOT a copy: config.php calls the shipped
 * Admin_Fields::script_config(), so the group list, the names and the
 * `governed` flags under test are the ones that ship.
 */
const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT   = path.resolve(__dirname, '../..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'dcc-custom-checkout/assets/admin-booking.js'), 'utf8');
const CSS    = fs.readFileSync(path.join(ROOT, 'dcc-custom-checkout/assets/admin-booking.css'), 'utf8');

function phpConfig(included, booking) {
    const args = [path.join(__dirname, 'config.php'),
        included === undefined ? '' : String(included),
        booking ? JSON.stringify(booking) : ''];
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

/* MotoPress's order, as the Director read it on booking 19615 (labels only). */
const MOTOPRESS_ORDER = [
    ['first_name', 'First Name'], ['last_name', 'Last Name'], ['email', 'Email'],
    ['phone', 'Phone'], ['country', 'Country', 'select'], ['address1', 'Address'],
    ['city', 'City'], ['state', 'State / County'], ['zip', 'Postcode'],
    ['note', 'Customer Note', 'textarea'],
    ['guest2_first_name', 'Guest 2: First Name'], ['guest2_last_name', 'Guest 2: Last Name'],
    ['guest2_phone', 'Guest 2: Phone Number'], ['apartment-units', 'Apartment/Unit #'],
    // Live has this row (Director, 2026-10-06) and 0.26.0's fixture did not.
    // No named input; two shapes, see rowsHtml(). Its original position was
    // not reported; it is placed here, and the result does not depend on it.
    ['upload_id', 'Upload Photo ID', 'link'],
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
    '## Dog', 'Dog Type', 'Dog Size', 'Dog Hair',
    '## Note', 'Customer Note',
];

/* Synthetic values only — never anything resembling a real guest. */
function control(name, label, kind, value) {
    const id = 'mphb_' + name, v = value || '';
    if (kind === 'link') { return '<a href="#">View</a>'; }
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

/* The Photo ID row's two LIVE shapes, attribute for attribute as the Director
 * reported them (2026-10-06), plus one that must not match:
 *   'file' (default) — a photo is stored (19615):
 *       tr.mphb-link-button-row > th > label[for="mphb-mphb_upload_id"]
 *       td > div.mphb-ctrl-wrapper.mphb-ctrl.mphb-ctrl-link-button > a.button "View file"
 *   'nofile' — no photo (19600, 18462; most bookings):
 *       tr.mphb-placeholder-row > th > label[for="mphb-mphb_upload_id"]
 *       td > div.mphb-ctrl-wrapper.mphb-ctrl.mphb-ctrl-placeholder > label "File is not uploaded"
 *   'classonly' — the link-button class with NO `for`: the class alone must
 *       not be enough (0.27.0 matched on it and missed every 'nofile' row).
 * Kind 'placeholder' is some OTHER MotoPress placeholder row, no `for`. */
function linkRow(name, label, marker) {
    const forAttr = marker === 'classonly' ? '' : ` for="mphb-mphb_${name}"`;
    if (marker === 'nofile') {
        return `<tr class="mphb-placeholder-row"><th scope="row"><label${forAttr}>${label}</label></th>` +
            `<td><div class="mphb-ctrl-wrapper mphb-ctrl mphb-ctrl-placeholder"><label>File is not uploaded</label></div></td></tr>`;
    }
    return `<tr class="mphb-link-button-row"><th scope="row"><label${forAttr}>${label}</label></th>` +
        `<td><div class="mphb-ctrl-wrapper mphb-ctrl mphb-ctrl-link-button"><a class="button" href="#">View file</a></div></td></tr>`;
}

function rowsHtml(order, values, wrap, linkMarker) {
    linkMarker = linkMarker || 'file';
    return order.map(([name, label, kind]) => {
        const c = control(name, label, kind, values && values[name]);
        if (kind === 'link') {
            if (wrap === 'p') { return `<p class="mphb-field"><label for="mphb-mphb_${name}">${label}</label>${c}</p>`; }
            return linkRow(name, label, linkMarker);
        }
        if (kind === 'placeholder') {
            return `<tr class="mphb-placeholder-row"><th scope="row"><label>${label}</label></th>` +
                `<td><div class="mphb-ctrl-wrapper mphb-ctrl mphb-ctrl-placeholder"><label>File is not uploaded</label></div></td></tr>`;
        }
        if (wrap === 'p') { return `<p class="mphb-field"><label for="mphb_${name}">${label}</label>${c}</p>`; }
        return `<tr><th scope="row"><label for="mphb_${name}">${label}</label></th><td>${c}</td></tr>`;
    }).join('\n');
}

function page(order, values, opts) {
    opts = opts || {};
    const box = opts.wrap === 'p'
        ? `<div class="mphb-customer-fields">${rowsHtml(order, values, 'p', opts.linkMarker)}</div>`
        : `<table class="form-table"><tbody>${rowsHtml(order, values, null, opts.linkMarker)}</tbody></table>`;
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width">
<style>
/* REPRODUCTION of the core wp-admin rules that shape this table (forms.css),
   including its 782px breakpoint — not the real stylesheet. */
body { margin: 0; font: 13px/1.4 -apple-system, sans-serif; color: #3c434a; background: #f0f0f1; }
#poststuff { padding: 10px; }
.postbox { background: #fff; border: 1px solid #c3c4c7; margin: 0 0 20px; }
.postbox h2 { font-size: 14px; margin: 0; padding: 8px 12px; border-bottom: 1px solid #c3c4c7; }
.postbox .inside { padding: 0 12px 12px; }
.form-table { border-collapse: collapse; margin-top: .5em; width: 100%; clear: both; }
.form-table th { vertical-align: top; text-align: left; padding: 20px 10px 20px 0; width: 200px; line-height: 1.3; font-weight: 600; }
.form-table td { margin-bottom: 9px; padding: 15px 10px; line-height: 1.3; vertical-align: middle; }
.regular-text { width: 25em; }
@media screen and (max-width: 782px) {
  .form-table th, .form-table td { display: block; width: auto; vertical-align: middle; }
  .form-table td { padding-left: 0; }
  .form-table th { padding: 10px 0 0; border-bottom: 0; }
  .regular-text, .form-table td select, .form-table td textarea { width: 100%; max-width: none; box-sizing: border-box; }
}
${CSS}
</style></head><body>
<form id="post" method="post"><div id="poststuff">
  <div class="postbox" id="mphb_customer"><h2>Customer Information</h2><div class="inside">${box}</div></div>
  <div class="postbox"><h2>Reserved Accommodations</h2><div class="inside">
    ${opts.existing
        // The edit screen of an EXISTING booking: no accommodation control at
        // all (Director, live 2026-10-06) — the only room-ish input is this.
        ? '<input type="hidden" name="mphb_rooms-hide" value="1">'
        : `<select name="mphb_room_type_id" id="rt">
      <option value="1065"${opts.room === 1604 ? '' : ' selected'}>Cottage 22</option>
      <option value="1604"${opts.room === 1604 ? ' selected' : ''}>Cottage 33</option>
    </select>`}</div></div>
</div></form>
<!--DCC-CFG-->
${opts.noScript ? '' : '<script>' + SCRIPT + '</script>'}
</body></html>`;
}

async function open(browser, width, html, cfgOver, included, booking) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const pg  = await ctx.newPage();
    pg.setDefaultTimeout(5000);
    const logs = [];
    pg.on('console', m => logs.push(m.text()));
    const cfg = Object.assign(phpConfig(included, booking), {
        roomTypes: { '1065': { pet: 'yes', couch: 'yes' }, '1604': { pet: 'no', couch: 'no' } },
    }, cfgOver || {});
    // Printed inline ahead of the script, as wp_localize_script does. (An
    // addInitScript does NOT reach a setContent page — measured: the first
    // draft of this suite ran with no config at all and timed out.)
    const cfgTag = '<script>window.DCC_CHECKOUT_ADMIN = ' +
        JSON.stringify(cfg).replace(/</g, '\\u003c') + ';</script>';
    await pg.setContent(html.replace('<!--DCC-CFG-->', cfgTag));
    await pg.waitForTimeout(350);
    return { ctx, pg, logs };
}

/* What a person sees in the box, top to bottom: headings as "## …", rows by
   label, the checkbox as "[show all]". Only rendered things count. */
async function seen(pg) {
    return pg.evaluate(() => {
        const box = document.querySelector('#mphb_customer .inside');
        const out = [];
        box.querySelectorAll('tr, .dcc_admin-showall, p.mphb-field').forEach(n => {
            if (!n.getClientRects().length) { return; }
            if (n.classList.contains('dcc_admin-group-heading')) { out.push('## ' + n.textContent.trim()); }
            else if (n.classList.contains('dcc_admin-showall-row')) { out.push('[show all]'); }
            else if (n.classList.contains('dcc_admin-showall')) {
                if (!n.closest('tr')) { out.push('[show all]'); }
            }
            else { const l = n.querySelector('label'); if (l) { out.push(l.textContent.trim()); } }
        });
        return out;
    });
}
const headingsIn = list => list.filter(x => x.startsWith('## '));

/* Tick or untick "Show all booking fields" the way a person would — but a
   missing checkbox is a FAILED assertion, printed, not a crash: the mutation
   runner reads a crash part-way as a harness fault, which would turn a real
   kill into noise (tests/mutate/README.md). */
async function setShowAll(pg, on) {
    const ok = await pg.evaluate(want => {
        const box = document.getElementById('dcc_admin_show_all');
        if (!box) { return false; }
        if (box.checked !== want) { box.click(); }
        return true;
    }, on);
    if (!ok) { check('the "Show all booking fields" checkbox is on the screen', false, true); }
    await pg.waitForTimeout(100);
}

async function formData(pg) {
    return pg.evaluate(() => Array.from(new FormData(document.getElementById('post')).entries())
        .map(([k, v]) => k + '=' + v).sort());
}

(async () => {
    const browser = await chromium.launch(
        fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}
    );

    /* --- 1. The order, at both widths, everything revealed. --------------- */
    for (const width of [1280, 390]) {
        const { ctx, pg } = await open(browser, width, page(MOTOPRESS_ORDER));
        await setShowAll(pg, true);
        const s = await seen(pg);
        check(`${width}px: the box reads in Rob's order, headings between groups`,
            s.filter(x => x !== '[show all]'), TIDY);
        check(`${width}px: "Show all booking fields" sits directly above the Guest 3 heading`,
            s[s.indexOf('## Guest 3') - 1], '[show all]');
        check(`${width}px: the help text names the groups hidden at the default setting`,
            await pg.evaluate(() => document.querySelector('.dcc_admin-showall__hint').textContent
                .startsWith('Guest 3–4 details are hidden unless this booking already has them saved')), true);
        check(`${width}px: the checkbox is a full-width table row, not a bare div in the tbody`,
            await pg.evaluate(() => {
                const w = document.querySelector('.dcc_admin-showall');
                const tr = w.parentNode && w.parentNode.parentNode;
                const box = document.querySelector('#mphb_customer tbody');
                return !!tr && tr.tagName === 'TR' && tr.parentNode === box &&
                    tr.classList.contains('dcc_admin-showall-row') && w.parentNode.colSpan === 2 &&
                    Array.from(box.children).every(c => c.tagName === 'TR');
            }), true);
        const geo = await pg.evaluate(() => {
            const box = document.querySelector('#mphb_customer');
            const heads = Array.from(document.querySelectorAll('.dcc_admin-group-heading')).map(h => h.getBoundingClientRect());
            return {
                overflow: box.scrollWidth - box.clientWidth,
                pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
                headsInside: heads.every(r => r.left >= 0 && r.right <= window.innerWidth + 0.5),
            };
        });
        check(`${width}px: the box gains no horizontal overflow`, geo.overflow, 0);
        check(`${width}px: the page gains no horizontal scroll`, geo.pageOverflow <= 0, true);
        check(`${width}px: every heading lies inside the viewport`, geo.headsInside, true);
        await ctx.close();
    }

    /* --- 2. Headings hide and show per cottage type (new booking). -------- */
    {
        const { ctx, pg } = await open(browser, 1280, page(MOTOPRESS_ORDER));
        check('pet cottage: Guest 3/4 hidden by default, Dog shown',
            headingsIn(await seen(pg)), ['## Guest 1', '## Address', '## Guest 2', '## Dog', '## Note']);
        await pg.selectOption('#rt', '1604');
        await pg.waitForTimeout(350);
        check('switched live to a no-dogs cottage: the Dog heading hides with its rows',
            headingsIn(await seen(pg)), ['## Guest 1', '## Address', '## Guest 2', '## Note']);
        check('... and the Dog rows are hidden too (heading follows rows, not the reverse)',
            (await seen(pg)).filter(x => /^Dog /.test(x)), []);
        await setShowAll(pg, true);
        check('the toggle brings every heading back',
            headingsIn(await seen(pg)), TIDY.filter(x => x.startsWith('## ')));
        await setShowAll(pg, false);
        check('... and unticking it hides them again',
            headingsIn(await seen(pg)), ['## Guest 1', '## Address', '## Guest 2', '## Note']);
        await pg.selectOption('#rt', '1065');
        await pg.waitForTimeout(350);
        check('switched back to a pet cottage: Dog returns',
            headingsIn(await seen(pg)).includes('## Dog'), true);
        await ctx.close();
    }

    /* --- 3. Sticky values: an existing booking keeps its data in view. ---- */
    {
        const { ctx, pg } = await open(browser, 1280,
            page(MOTOPRESS_ORDER, { guest3_first_name: 'x-g3' }, { room: 1604 }), { isExisting: '1' });
        const h = headingsIn(await seen(pg));
        check('existing booking, Guest 3 holds a value: the Guest 3 heading shows', h.includes('## Guest 3'), true);
        check('... Guest 4, empty, stays hidden', h.includes('## Guest 4'), false);
        check('... and Dog, empty on a no-dogs cottage, stays hidden', h.includes('## Dog'), false);
        await ctx.close();
    }

    /* --- 4. A save changes no stored field. ------------------------------
     * Every field filled with a synthetic value; the form's successful
     * controls are read with the script absent and with it present, then
     * after the toggle and a cottage change. PHP reads $_POST by NAME, and
     * none of these names repeat or end in [], so equal multisets mean an
     * identical save. */
    {
        const vals = {};
        MOTOPRESS_ORDER.forEach(([n, , k]) => { vals[n] = k === 'select' ? 'B' : 'x-' + n; });
        const base = await open(browser, 1280, page(MOTOPRESS_ORDER, vals, { noScript: true }), { isExisting: '1' });
        const before = await formData(base.pg);
        await base.ctx.close();
        const { ctx, pg } = await open(browser, 1280, page(MOTOPRESS_ORDER, vals), { isExisting: '1' });
        check('the guard: the baseline really carries every named field (21 + the cottage)', before.length, 22);
        check('with the layout applied, the form submits exactly the same fields and values',
            await formData(pg), before);
        // Every field holds a value on this existing booking, so all are
        // sticky, nothing is hidden, and the checkbox hides itself (v0.22.0).
        check('every field sticky: the checkbox has nothing to reveal and is hidden',
            await pg.evaluate(() => {
                const r = document.querySelector('.dcc_admin-showall-row');
                return !!r && r.hidden && !r.getClientRects().length;
            }), true);
        await pg.evaluate(() => document.getElementById('dcc_admin_show_all').click());
        await pg.selectOption('#rt', '1065');
        await pg.waitForTimeout(350);
        const after = (await formData(pg)).filter(x => !x.startsWith('mphb_room_type_id='));
        check('... and still after the toggle and a cottage change',
            after, before.filter(x => !x.startsWith('mphb_room_type_id=')));
        check('the layout never re-creates a row: the original inputs are the ones in the box',
            await pg.evaluate(() => document.querySelectorAll('#mphb_customer [name]').length), 21);
        await ctx.close();
    }

    /* --- 5. It does not feed its own observer. --------------------------- */
    {
        const { ctx, pg } = await open(browser, 1280, page(MOTOPRESS_ORDER));
        const n = await pg.evaluate(() => new Promise(res => {
            const tb = document.querySelector('#mphb_customer tbody');
            let count = 0;
            new MutationObserver(l => { count += l.length; }).observe(tb, { childList: true });
            document.body.appendChild(document.createElement('span')); // provoke a re-run
            setTimeout(() => res(count), 900);
        }));
        check('an already-ordered box is not touched again (no childList mutations)', n, 0);
        await ctx.close();
    }

    /* --- 6. Fail open. ---------------------------------------------------- */
    {
        // (a) Not the same box: paragraph layout. Nothing moves, no heading.
        const { ctx, pg, logs } = await open(browser, 1280, page(MOTOPRESS_ORDER, null, { wrap: 'p' }));
        const got = (await seen(pg)).filter(x => x !== '[show all]');
        check('a box that is not one table gets no headings', headingsIn(got), []);
        check('... and the reason is reported to the console',
            logs.some(l => /left as MotoPress drew it/.test(l)), true);
        await ctx.close();
    }
    {
        // (a, strictly) the order of the visible rows is MotoPress's own.
        const { ctx, pg } = await open(browser, 1280, page(MOTOPRESS_ORDER, null, { wrap: 'p' }));
        await setShowAll(pg, true);
        check('a non-table box keeps MotoPress order, row for row',
            (await seen(pg)).filter(x => x !== '[show all]'), MOTOPRESS_ORDER.map(r => r[1]));
        await ctx.close();
    }
    {
        // (b) A missing field: the rest still order; its slot is just skipped.
        const order = MOTOPRESS_ORDER.filter(r => r[0] !== 'apartment-units');
        const { ctx, pg } = await open(browser, 1280, page(order));
        await setShowAll(pg, true);
        check('a missing field is skipped and everything else keeps the order',
            (await seen(pg)).filter(x => x !== '[show all]'), TIDY.filter(x => x !== 'Apartment/Unit #'));
        await ctx.close();
    }
    {
        // (c) An unknown future field stays visible, after the known groups.
        const order = MOTOPRESS_ORDER.slice();
        order.splice(4, 0, ['loyalty_code', 'Loyalty Code']);
        const { ctx, pg } = await open(browser, 1280, page(order));
        const s = await seen(pg);
        check('an unknown field is never hidden', s.includes('Loyalty Code'), true);
        check('... it sits after the known groups, under an "Other" heading',
            s.slice(-2), ['## Other', 'Loyalty Code']);
        await ctx.close();
        const plain = await open(browser, 1280, page(MOTOPRESS_ORDER));
        check('and with no unknown field there is no "Other" heading at all',
            (await seen(plain.pg)).includes('## Other'), false);
        await plain.ctx.close();
    }
    {
        // (d) A whole group missing: no heading for it.
        const order = MOTOPRESS_ORDER.filter(r => !/^dog_/.test(r[0]));
        const { ctx, pg } = await open(browser, 1280, page(order));
        await setShowAll(pg, true);
        check('a group with no rows on the screen gets no heading',
            headingsIn(await seen(pg)).includes('## Dog'), false);
        await ctx.close();
    }
    {
        // (e) One known field only: not enough to call it the box.
        const { ctx, pg, logs } = await open(browser, 1280, page([['first_name', 'First Name']]));
        check('a single known field is not treated as the box', headingsIn(await seen(pg)), []);
        check('... and says why', logs.some(l => /left as MotoPress drew it/.test(l)), true);
        await ctx.close();
    }

    /* --- 7. The checkbox follows the SETTING, not a literal. -------------- */
    {
        const { ctx, pg } = await open(browser, 1280, page(MOTOPRESS_ORDER), {}, 3);
        await setShowAll(pg, true);
        const s = await seen(pg);
        check('"Guests included" = 3: the checkbox sits above Guest 4, the first group it governs',
            s[s.indexOf('## Guest 4') - 1], '[show all]');
        await setShowAll(pg, false);
        check('... and Guest 3, no longer governed, stays shown',
            headingsIn(await seen(pg)).includes('## Guest 3'), true);
        check('... and the help text names only what is hidden: "Guest 4 details"',
            await pg.evaluate(() => document.querySelector('.dcc_admin-showall__hint').textContent
                .startsWith('Guest 4 details are hidden')), true);
        await ctx.close();
    }


    /* --- 8. Upload Photo ID: matched by its label's for="mphb-mphb_upload_id",
     *        in BOTH live states; never by row class alone, never by label
     *        text. Each way it must not match is constructed too. ---------- */
    for (const [marker, title] of [['file', 'a photo stored (link-button row)'],
                                   ['nofile', 'NO photo stored (placeholder row) — most bookings']]) {
        for (const width of [1280, 390]) {
            const { ctx, pg } = await open(browser, width, page(MOTOPRESS_ORDER, null, { linkMarker: marker }));
            await setShowAll(pg, true);
            const s = (await seen(pg)).filter(x => x !== '[show all]');
            check(`${width}px Photo ID with ${title}: it ends Guest 1, after Email`,
                s.slice(s.indexOf('Email'), s.indexOf('## Address')), ['Email', 'Upload Photo ID']);
            check(`${width}px ... and no "Other" heading appears (${marker})`, s.includes('## Other'), false);
            await ctx.close();
        }
    }
    {
        // The link-button class with no `for`: the class alone is NOT enough.
        const { ctx, pg } = await open(browser, 1280, page(MOTOPRESS_ORDER, null, { linkMarker: 'classonly' }));
        const s = await seen(pg);
        check('Photo ID row carrying only the class (no for) is not matched: it stays under "Other"',
            s.slice(-2), ['## Other', 'Upload Photo ID']);
        await ctx.close();
    }
    {
        // Another MotoPress placeholder row beside the real one: the generic
        // class takes nothing with it. Photo ID moves; the other stays visible
        // under "Other".
        const order = MOTOPRESS_ORDER.concat([['proof_address', 'Proof of Address', 'placeholder']]);
        const { ctx, pg } = await open(browser, 1280, page(order, null, { linkMarker: 'nofile' }));
        const s = await seen(pg);
        check('a second, unrelated placeholder row is not taken for the Photo ID',
            s.slice(s.indexOf('Email'), s.indexOf('## Address')), ['Email', 'Upload Photo ID']);
        check('... it stays visible, under "Other"', s.slice(-2), ['## Other', 'Proof of Address']);
        await ctx.close();
    }

    /* --- 9. EXISTING bookings: hidden by the booking's own facts (v0.27.0).
     *        No accommodation control on the screen, as on live; the room
     *        types come from the shipped Admin_Fields reading a simulated
     *        booking's reserved rooms (config.php). Both widths. ----------- */
    for (const width of [1280, 390]) {
        const ex = (rooms, values) => open(browser, width,
            page(MOTOPRESS_ORDER, values || null, { existing: true }),
            {}, undefined, { rooms: rooms.map(t => ({ type: t })) });

        let r = await ex([1604]);
        check(`${width}px existing, 2-guest no-dogs cottage, nothing stored: Guest 3, 4 and Dog hidden`,
            headingsIn(await seen(r.pg)), ['## Guest 1', '## Address', '## Guest 2', '## Note']);
        check(`${width}px ... and "Show all" is offered, counting what it hides`,
            await r.pg.evaluate(() => {
                const row = document.querySelector('.dcc_admin-showall-row');
                return !!row && !row.hidden && /\(7\)$/.test(row.querySelector('label').textContent);
            }), true);
        await setShowAll(r.pg, true);
        check(`${width}px ... "Show all" reveals every heading`,
            headingsIn(await seen(r.pg)), TIDY.filter(x => x.startsWith('## ')));
        await r.ctx.close();

        r = await ex([1065]);
        check(`${width}px existing, 4-guest pet cottage: Dog shown, Guest 3/4 hidden (same rule as new bookings)`,
            headingsIn(await seen(r.pg)), ['## Guest 1', '## Address', '## Guest 2', '## Dog', '## Note']);
        await r.ctx.close();

        r = await ex([1604], { guest3_first_name: 'x-g3', dog_type: 'x-dog' });
        const h = headingsIn(await seen(r.pg));
        check(`${width}px existing, stored Guest 3 and dog values on a no-dogs cottage: both stay visible`,
            [h.includes('## Guest 3'), h.includes('## Dog')], [true, true]);
        check(`${width}px ... Guest 4, empty, stays hidden`, h.includes('## Guest 4'), false);
        await r.ctx.close();

        r = await ex([1604, 1065]);
        check(`${width}px existing, two rooms (no-dogs + pet): Dog shows because ANY room needs it`,
            headingsIn(await seen(r.pg)).includes('## Dog'), true);
        await r.ctx.close();

        r = await ex([1604, 0]);
        check(`${width}px existing, one room's type unreadable: everything shown (today's behaviour)`,
            headingsIn(await seen(r.pg)), TIDY.filter(x => x.startsWith('## ')));
        check(`${width}px ... and "Show all" has nothing to reveal, so it is not shown`,
            await r.pg.evaluate(() => {
                const row = document.querySelector('.dcc_admin-showall-row');
                return !row || !row.getClientRects().length;
            }), true);
        await r.ctx.close();

        r = await ex([]);
        check(`${width}px existing, no reserved room readable at all: everything shown`,
            headingsIn(await seen(r.pg)), TIDY.filter(x => x.startsWith('## ')));
        await r.ctx.close();
    }
    {
        // The guard on the existing-booking guards: the same screen with NO
        // booking facts stated is today's 0.26.0 behaviour — everything shown.
        // Without this, "hidden" above could be hiding for some other reason.
        const { ctx, pg } = await open(browser, 1280, page(MOTOPRESS_ORDER, null, { existing: true }),
            { isExisting: '1' });
        check('the guard: an existing booking with no stated cottage shows everything, as 0.26.0 did',
            headingsIn(await seen(pg)), TIDY.filter(x => x.startsWith('## ')));
        await ctx.close();
    }

    await browser.close();
    console.log(failures ? `\n${failures} failing, ${passes} passing` : `\nall passing (${passes})`);
    process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
