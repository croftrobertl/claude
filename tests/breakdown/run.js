/**
 * Price-breakdown tests for dcc-custom-checkout/assets/checkout.js.
 *
 *   cd tests/breakdown && npm install jsdom && node run.js
 *
 * These drive the real checkout.js against real markup in jsdom — no stubs of
 * the code under test. The point is the money: which figures the guest sees,
 * and that an unrecognised breakdown is left strictly alone.
 */
const fs   = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const F = require('./fixtures');

const SCRIPT = fs.readFileSync(
    path.join(__dirname, '../../dcc-custom-checkout/assets/checkout.js'), 'utf8'
);

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) { failures++; }
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) {
        console.log(`      expected: ${JSON.stringify(expected)}`);
        console.log(`      actual:   ${JSON.stringify(actual)}`);
    }
}

// Render a fixture through checkout.js and return what a guest would read.
async function render(fixture, cfg) {
    const dom = new JSDOM(
        `<body><form class="mphb_sc_checkout-form">${fixture}</form></body>`,
        { runScripts: 'dangerously', pretendToBeVisual: true }
    );
    const { window } = dom;
    window.DCC_CHECKOUT = Object.assign({
        i18n: {
            subtotal: 'Subtotal',
            taxNoteLead: 'Taxes applied:',
            taxNoteLabel: 'Show which taxes apply'
        },
        guestFeeSteps: {}, guestGroups: [], dogFieldNames: [],
        taxRates: {
            'lake county tourist development tax': '4%',
            'lake county discretionary sales surtax': '1%',
            'florida sales and use tax': '6%'
        }
    }, cfg || {});
    const el = window.document.createElement('script');
    el.textContent = SCRIPT;
    window.document.body.appendChild(el);
    // checkout.js waits for DOMContentLoaded, which jsdom fires after parsing.
    if (window.document.readyState === 'loading') {
        await new Promise(r => window.document.addEventListener('DOMContentLoaded', r));
    }
    return { window, doc: window.document };
}

// Only the rows a guest can actually see, as "label | amount".
// Visible = neither the element nor any ancestor carries one of the plugin's
// hide classes. The real page uses display:none; jsdom has no layout, so the
// classes are the honest proxy.
function visible(el) {
    if (!el) { return false; }
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        if (n.classList.contains('dcc_checkout-service-hidden') ||
            n.classList.contains('dcc_checkout-section-hidden')) {
            return false;
        }
    }
    return true;
}

function label(cell) {
    // Drop the expander glyph MotoPress renders ahead of the name.
    return cell.textContent.replace(/\s+/g, ' ').replace(/^\s*[-+\u2212]\s*/, '').trim();
}

function visibleRows(doc) {
    return Array.from(doc.querySelectorAll('tr'))
        .filter(r => !r.classList.contains('dcc_checkout-section-hidden'))
        .map(r => {
            const cells = r.cells;
            // Skip the wrapper row whose single cell holds the nested table.
            if (!cells || cells.length < 2) { return null; }
            const name = label(cells[0]);
            const amount = cells[cells.length - 1].textContent.replace(/\s+/g, ' ').trim();
            return name ? `${name} | ${amount}` : null;
        })
        .filter(Boolean);
}

// Top-level summary rows only (the collapsed view the owner signed off).
function summary(doc) {
    const table = doc.querySelector('table.dcc_checkout-breakdown');
    return Array.from(table.children)
        .flatMap(n => n.tagName === 'TBODY' ? Array.from(n.children) : [n])
        .filter(r => r.tagName === 'TR' && r.cells.length >= 2
                     && !r.classList.contains('dcc_checkout-section-hidden'))
        .map(r => `${label(r.cells[0])} | ${r.cells[r.cells.length - 1].textContent.trim()}`);
}

(async () => {
/* --- 1. The owner's verified booking, no services. ---------------------- */
{
    const { doc } = await render(F.noService);
    check('no-service: collapsed view reads as an invoice', summary(doc), [
        'Cottage 36: Sunshine Suite | $350',
        'Subtotal | $350',
        'Taxes* | $38.50',
        'Total | $388.50',
    ]);

    const rows = visibleRows(doc);
    check('no-service: no figure appears twice',
        rows.filter(r => /\$388\.50|\$38\.50|\$350/.test(r)).length, 4);
    check('no-service: no .mphb-price-breakdown-rate element survives',
        visible(doc.querySelector('.mphb-price-breakdown-rate')), false);
    check('no-service: removing the rate did NOT take the detail block with it',
        rows.includes('Number of Guests | 2'), true);
    check('no-service: the expanded block opens on Number of Guests',
        rows[1], 'Number of Guests | 2');
    check('no-service: nothing carries a rule where the Rate row was',
        doc.querySelectorAll('tr.dcc_checkout-section-hidden.dcc_checkout-row-first').length, 0);
    check('no-service: in-block duplicates are gone',
        rows.filter(r => /^(Accommodation Total|Accommodation Taxes Total|Subtotal) \|/.test(r)
                      && !/^Subtotal \| \$350$/.test(r)).length, 0);
}

/* --- 2. The 4-guest booking with the untaxed extra-guest fee. ----------- */
{
    const { doc } = await render(F.withService);
    check('with-service: line item shows pre-tax, matching Subtotal',
        summary(doc), [
            'Cottage 36: Sunshine Suite | $550',
            'Subtotal | $550',
            'Taxes* | $38.50',
            'Total | $588.50',
        ]);
    const rows = visibleRows(doc);
    check('with-service: Accommodation Total survives (it is not a duplicate)',
        rows.some(r => r === 'Accommodation Total | $350'), true);
    check('with-service: the extra-guest fee is still shown at $200',
        rows.some(r => /Extra Guest Fee.*\| \$200$/.test(r)), true);
    check('with-service: no .mphb-price-breakdown-rate element survives',
        visible(doc.querySelector('.mphb-price-breakdown-rate')), false);

    // Column headers read as headers; summary rows are deliberately left alone.
    // "Accommodation Taxes | Amount" is a column header too, and is marked —
    // it just lives behind the tax fold, so a guest never sees it.
    const heads = Array.from(doc.querySelectorAll('tr.dcc_checkout-breakdown-head'))
        .filter(r => !r.classList.contains('dcc_checkout-section-hidden'))
        .map(r => label(r.cells[0]));
    check('headers: every visible column header is marked, and nothing else',
        heads, ['Dates', 'Service']);
    // Items 15/16, extended by items 12/13 in v0.14.0: a divider above EVERY
    // visible column header (not just the first), above whatever follows the
    // last booked date, and above Subtotal. All four use the grand total's own
    // class-mate, so one CSS rule still governs every line on the breakdown.
    const ruled = Array.from(doc.querySelectorAll('tr.dcc_checkout-breakdown-rule'))
        .map(r => label(r.cells[0]));
    check('dividers: first detail row (item 2), Dates, after the dates, Service, Subtotal',
        ruled, ['Number of Guests', 'Dates', 'Accommodation Total', 'Service', 'Subtotal']);
    check('dividers: the date rows themselves carry none',
        Array.from(doc.querySelectorAll('tr.dcc_checkout-breakdown-rule'))
             .some(r => /September/.test(label(r.cells[0]))), false);

    check('headers: Subtotal / Taxes / Total are NOT marked',
        heads.filter(h => /^(Subtotal|Taxes|Total)/.test(h)).length, 0);
}

/* --- 3. A SECOND pass must leave the page in the same state. ------------ *
 * MotoPress re-renders the breakdown (country change, guest count, its own
 * init), and the MutationObserver runs the whole pipeline again. Everything
 * here is supposed to be idempotent. */
{
    const { window, doc } = await render(F.withService);
    const before = doc.querySelectorAll('.dcc_checkout-tax-asterisk').length;

    // Provoke the observer the way a re-render would.
    doc.querySelector('.mphb_sc_checkout-form').appendChild(doc.createElement('span'));
    await new Promise(r => setTimeout(r, 400));

    const star = doc.querySelector('.dcc_checkout-tax-asterisk');
    check('re-render: exactly one asterisk, not one per pass',
        doc.querySelectorAll('.dcc_checkout-tax-asterisk').length, before);
    check('re-render: the footnote still exists',
        !!doc.getElementById('dcc-tax-footnote'), true);
    check('re-render: aria-controls still resolves — a dangling one is a dead control',
        !!doc.getElementById(star.getAttribute('aria-controls')), true);
    // One click opens it.
    star.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const after = doc.getElementById('dcc-tax-footnote');
    check('re-render: the asterisk still works after a re-render',
        !!after && !after.classList.contains('dcc_checkout-section-hidden'), true);

    // THE BUG THE OWNER SAW. It is open; force another re-render. Before
    // v0.11.0 the open state lived inside foldTaxDetail, which formatBreakdown
    // destroys and rebuilds on every pass — so the note flashed and vanished.
    doc.querySelector('.mphb_sc_checkout-form').appendChild(doc.createElement('span'));
    await new Promise(r => setTimeout(r, 400));

    const reopened = doc.getElementById('dcc-tax-footnote');
    check('re-render: the open note SURVIVES a rebuild — no flash-and-vanish',
        !!reopened && !reopened.classList.contains('dcc_checkout-section-hidden'), true);
    check('re-render: aria-expanded survives with it',
        doc.querySelector('.dcc_checkout-tax-asterisk').getAttribute('aria-expanded'), 'true');
    check('re-render: the rebuilt note still carries the rates',
        /4%.+1%.+6%/.test(reopened ? reopened.textContent : ''), true);
}


/* --- 4. Two cottages: nothing duplicates, so nothing is removed. -------- */
{
    const { doc } = await render(F.twoAccommodations);
    const rows = visibleRows(doc);
    check('two cottages: both line items keep MotoPress\'s own tax-inclusive figures',
        rows.filter(r => /^Cottage|^#\d Cottage/.test(r)),
        ['#1 Cottage 36: Sunshine Suite | $388.50', '#2 Cottage 22: Palm Cottage | $222']);
    check('two cottages: per-cottage Accommodation Totals both survive',
        rows.filter(r => r.startsWith('Accommodation Total')).length, 2);
    check('two cottages: the index is kept, since it distinguishes them',
        rows.some(r => r.startsWith('#1 ')), true);
    check('two cottages: still no "Rate:" rows to remove, and none invented',
        rows.filter(r => /^Rate\b/i.test(r)).length, 0);
    check('two cottages: no tax fold — one cottage\'s taxes under a combined total would mislead',
        doc.querySelector('.dcc_checkout-tax-toggle'), null);
}

/* --- 5. Renamed labels: recognise nothing, change nothing. -------------- */
{
    const before = await render(F.renamedLabels);
    const beforeRows = visibleRows(before.doc);
    check('renamed labels: every row still visible',
        beforeRows.length,
        Array.from(before.doc.querySelectorAll('tr')).filter(r => r.cells.length >= 2).length);
    check('renamed labels: no figure was rewritten',
        beforeRows.filter(r => /\$/.test(r)).map(r => r.split(' | ')[1]),
        ['$388.50', '$350', '$14', '$24.50', '$38.50', '$388.50', '$350', '$38.50', '$388.50']);
    check('renamed labels: no toggle was injected',
        before.doc.querySelector('.dcc_checkout-tax-toggle'), null);
    check('renamed labels: nothing was hidden',
        before.doc.querySelectorAll('.dcc_checkout-section-hidden').length, 0);
    check('renamed labels: the "Levies Applied | Amount" header is still marked',
        Array.from(before.doc.querySelectorAll('tr.dcc_checkout-breakdown-head'))
             .map(r => label(r.cells[0])), ['Levies Applied']);
}

/* --- 6. Services removed; chooser kept; the fee still bills. ------------ */
{
    const { doc } = await render(F.sharedSection, {
        guestFeeEnabled: '1',
        guestServiceIds: { daily: 18063, weekly: 18063, monthly: 18063 },
        guestServiceIdList: [18063],
        guestAccommodations: [1742],
        includedGuests: 2,
        guestFeeSteps: { 1: '$50', 2: '$100' },
        couchBedsText: '1 queen-sized bed and a pull-out couch'
    });

    check('services: the "Choose Additional Services" heading is gone',
        visible(doc.querySelector('.services-heading')), false);
    check('services: no service row is visible',
        Array.from(doc.querySelectorAll('.mphb_sc_checkout-service')).filter(visible).length, 0);
    check('services: the "Extra Guest Fee" label text is not visible',
        visible(doc.querySelector('label.mphb-checkbox-label')), false);
    check('services: the quantity select is not visible',
        visible(doc.querySelector('.mphb_sc_checkout-service-adults')), false);
    // Item 18: a label that wraps its field must not pass an underline down to
    // the guest's typed text. An input cannot switch off an ancestor's
    // text-decoration, so the label has to.
    check('nested label: tagged so CSS can drop its underline',
        doc.querySelector('label.mphb-checkbox-label')
           .classList.contains('dcc_checkout-label-wraps-control'), true);
    check('nested label: its own words keep the underline span',
        !!doc.querySelector('label.mphb-checkbox-label .dcc_checkout-label-text'), true);
    check('nested label: the control was NOT moved out of it',
        !!doc.querySelector('label.mphb-checkbox-label > input[type="checkbox"]'), true);

    check('services: the <li> carrying the text and price is hidden, not just the checkbox',
        visible(doc.querySelector('.mphb_sc_checkout-services-list li')), false);
    check('services: the emptied list wrapper went too — no bordered gap left',
        visible(doc.querySelector('.mphb_sc_checkout-services-list')), false);

    // The guard that used to defeat all of this.
    check('services: the section SURVIVES (it also holds the guest chooser)',
        visible(doc.querySelector('.mphb-checkout-section')), true);
    check('services: "Number of Guests" is still visible',
        visible(doc.querySelector('.mphb-adults-chooser')), true);
    check('services: the Accommodation Details heading is untouched',
        visible(doc.querySelectorAll('h3')[0]), true);

    // The money. Hiding is display-based, so the input still submits.
    const fee = doc.querySelector('input[name="mphb_room_details[0][services][0][id]"]');
    check('fee: the $50 service input is still in the DOM', !!fee, true);
    check('fee: it is still checked, so MotoPress still prices it', fee.checked, true);
    check('fee: it is not disabled — a disabled input would not submit', fee.disabled, false);
    check('fee: 4 guests still bills 2 extra guests',
        doc.querySelector('select[name="mphb_room_details[0][services][0][adults]"]').value, '2');
}

/* --- 7. The tax footnote replaces the old toggle. ----------------------- */
{
    const { window, doc } = await render(F.withService);
    const star = doc.querySelector('.dcc_checkout-tax-asterisk');
    const note = doc.querySelector('.dcc_checkout-tax-footnote');

    check('footnote: the old "Show detail" control is retired',
        doc.querySelector('.dcc_checkout-tax-toggle'), null);
    check('footnote: the cloned tax rows are retired',
        doc.querySelectorAll('tr.dcc_checkout-tax-detail').length, 0);
    check('footnote: an asterisk sits beside Taxes', star && star.textContent, '*');
    check('footnote: it is a button, never a submit', star.type, 'button');
    check('footnote: it has an accessible name',
        star.getAttribute('aria-label'), 'Show which taxes apply');
    check('footnote: aria-controls points at the footnote',
        star.getAttribute('aria-controls'), note && note.id);
    // A button whose aria-controls dangles is an accessibility defect and a
    // dead control. This must hold after EVERY pass, not just the first.
    check('footnote: aria-controls resolves to a real element',
        !!doc.getElementById(star.getAttribute('aria-controls')), true);
    check('footnote: collapsed by default', star.getAttribute('aria-expanded'), 'false');
    check('footnote: it is in normal flow after the table, not a floating layer',
        note.previousElementSibling.tagName, 'TABLE');
    check('footnote: hidden until asked for',
        note.classList.contains('dcc_checkout-section-hidden'), true);

    star.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    check('footnote: opening names the taxes AND their rates',
        note.textContent,
        '* Taxes applied: Lake County Tourist Development Tax 4%, ' +
        'Lake County Discretionary Sales Surtax 1%, Florida Sales and Use Tax 6%.');
    check('footnote: aria-expanded follows', star.getAttribute('aria-expanded'), 'true');

    star.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    check('footnote: tapping again hides it',
        note.classList.contains('dcc_checkout-section-hidden'), true);
}

/* ===================================================================== *
 * v0.14.0 — items 7, 10, 11, 12, 13, 14, against the three-column services
 * block in the owner's live screenshot.
 * ===================================================================== */
{
    const CFG14 = {
        labelAliases: {
            'services': ['services', 'extras'],
            'service': ['service', 'item'],
            'services total': ['services total', 'extras total']
        },
        guestServiceIdList: [18063],
        guestServiceTitles: ['extra guest fee (per guest beyond 2)'],
        guestFeeAmountText: '$50',
        i18n: {
            subtotal: 'Subtotal',
            taxNoteLead: 'Taxes applied:',
            taxNoteLabel: 'Show which taxes apply',
            totalPriceLabel: 'Total Price',
            extraGuestService: 'Extra Guest(s) Fee',
            extraGuestRate: '%s/night',
            extraGuestGuest: 'x %d guest',
            extraGuestGuests: 'x %d guests'
        }
    };

    const { window, doc } = await render(F.servicesWithDetails, CFG14);
    const rows = visibleRows(doc);
    const labels = rows.map(r => r.split(' | ')[0]);

    // --- Item 11 -----------------------------------------------------------
    check('item 11: the bare "Services" row above the header is gone',
        labels.filter(l => l === 'Services').length, 0);
    check('item 11: the Service | Details | Amount header itself stays',
        labels.filter(l => l === 'Service').length, 1);

    // --- Item 14 -----------------------------------------------------------
    const feeRow = Array.from(doc.querySelectorAll('tr')).find(
        r => r.cells && r.cells.length === 3 &&
             r.cells[0].textContent.trim() === 'Extra Guest(s) Fee');
    check('item 14: the service is relabelled for display', !!feeRow, true);
    if (feeRow) {
        check('item 14 + item 3: details are two lines, lowercase x',
            feeRow.cells[1].textContent.trim(), '$50/night\nx 2 guests');
        check('item 14: the AMOUNT is never touched',
            feeRow.cells[2].textContent.trim(), '$200');
    }

    // --- Items 12 + 13 -----------------------------------------------------
    const ruled = Array.from(doc.querySelectorAll('tr.dcc_checkout-breakdown-rule'))
        .map(r => r.cells[0].textContent.replace(/\s+/g, ' ').trim());
    check('item 12: a divider sits above the Service | Details | Amount header',
        ruled.includes('Service'), true);
    check('items 15/16 still hold: a divider above the Dates header',
        ruled.includes('Dates'), true);
    check('item 13: a divider sits above Subtotal',
        ruled.some(l => l.indexOf('Subtotal') === 0), true);

    // --- Item 7 ------------------------------------------------------------
    const dupe = doc.querySelector('p.mphb-total-price');
    check('item 7: the second "Total Price:" below the upload field is hidden',
        dupe.classList.contains('dcc_checkout-section-hidden'), true);
    check('item 7: the breakdown\'s own Total is untouched',
        labels.filter(l => l === 'Total').length, 1);

    // --- Item 10 -----------------------------------------------------------
    const tip = doc.querySelector('.mphb-required-fields-tip');
    check('item 10: the tip\'s asterisk is wrapped so it can be coloured',
        tip.querySelectorAll('.dcc_checkout-tip-asterisk').length, 1);
    check('item 10: the sentence itself is unchanged',
        tip.textContent.replace(/\s+/g, ' ').trim(),
        'Required fields are followed by *');

    // Re-render: every one of these runs again on a MotoPress re-render, and
    // the rule this plugin learned the hard way is that a second pass must not
    // re-read what the first pass wrote.
    window.document.body.dispatchEvent(new window.Event('dcc-noop'));
    const sec = window.document.createElement('span');
    doc.querySelector('form').appendChild(sec);   // provoke the MutationObserver
    await new Promise(r => setTimeout(r, 250));
    check('item 10: a second pass does not wrap the asterisk twice',
        tip.querySelectorAll('.dcc_checkout-tip-asterisk').length, 1);
    const feeRow2 = Array.from(doc.querySelectorAll('tr')).find(
        r => r.cells && r.cells.length === 3 &&
             r.cells[0].textContent.trim() === 'Extra Guest(s) Fee');
    check('item 14: a second pass leaves the relabelled row alone',
        feeRow2 ? feeRow2.cells[1].textContent.trim() : null,
        '$50/night\nx 2 guests');

    // --- Item 7, the graceful half ----------------------------------------
    const bare = await render(F.totalWithoutBreakdown, CFG14);
    check('item 7: with no breakdown above it, the only total is LEFT ALONE',
        bare.doc.querySelector('p.mphb-total-price')
            .classList.contains('dcc_checkout-section-hidden'), false);
}

/* ===================================================================== *
 * v0.15.0 item 4 — the divider above Subtotal, on a breakdown whose summary
 * row is a plain "Subtotal". This is the owner's second ask for the same
 * divider, and it is the shape that explains why: the row was being found by
 * its "(excluding taxes)" qualifier, which this booking does not have.
 * ===================================================================== */
{
    const { doc } = await render(F.plainSubtotal, {
        labelAliases: {
            'services': ['services', 'extras'],
            'service': ['service', 'item'],
            'services total': ['services total', 'extras total']
        },
        i18n: { subtotal: 'Subtotal', taxNoteLead: 'Taxes applied:' }
    });
    const ruled = Array.from(doc.querySelectorAll('tr.dcc_checkout-breakdown-rule'))
        .map(r => label(r.cells[0]));
    check('item 4: a plain "Subtotal" still gets its divider',
        ruled.includes('Subtotal'), true);
    check('item 4: and the Service header still has one above it',
        ruled.includes('Service'), true);
    check('item 2: the first detail row under the title carries the divider',
        ruled.includes('Nights'), true);
}

/* ===================================================================== *
 * v0.15.0 items 1 and 6.
 * ===================================================================== */
{
    const { window, doc } = await render(F.plainSubtotal, {
        isAdmin: false,
        i18n: { subtotal: 'Subtotal' }
    });

    // Item 6: the breakdown expander must not be draggable — link-drag is the
    // iOS recogniser most likely to be eating these taps. This asserts the
    // attribute is applied; only the owner's phone can say whether iOS obeys.
    // Selected by class, not by tag: as of v0.17.0 this is a <button>, and a
    // tag-qualified selector here would silently match nothing.
    const expander = doc.querySelector('.mphb-price-breakdown-expand');
    check('item 6: the breakdown expander is marked not-draggable',
        expander.getAttribute('draggable'), 'false');

    // Item 1: errors wait for a submit attempt, and anything already in the
    // markup at load is left alone because it may be a real server-side error.
    const form = doc.querySelector('form');
    check('item 1: the form starts in preflight',
        form.classList.contains('dcc_checkout-preflight'), true);

    const late = doc.createElement('div');
    late.className = 'mphb-error';
    late.textContent = 'Please select the number of guests.';
    form.appendChild(late);
    check('item 1: a message that appears later is NOT tagged pre-existing',
        late.hasAttribute('data-dcc-preexisting'), false);

    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    check('item 1: a submit attempt ends preflight',
        form.classList.contains('dcc_checkout-preflight'), false);
}

{
    // A server-rendered error present at load must survive preflight — hiding
    // one of those leaves a guest stuck with no idea what is wrong.
    const { doc } = await render(
        '<div class="mphb-errors">Your session expired.</div>' + F.plainSubtotal,
        { i18n: { subtotal: 'Subtotal' } });
    check('item 1: an error present at load is tagged and left visible',
        doc.querySelector('.mphb-errors').getAttribute('data-dcc-preexisting'), '1');
}

/* ===================================================================== *
 * v0.15.0 — the ceiling on the service-row walk.
 *
 * serviceRowWrapper() falls back to input.parentNode with nothing above it,
 * so a checkbox close to the form root resolved to the <form> — and hiding
 * that takes the ENTIRE CHECKOUT with it. Found by rendering the fixture and
 * printing what was visible: nothing was.
 * ===================================================================== */
{
    const { doc } = await render(F.servicesWithDetails, {
        labelAliases: { 'services': ['services', 'extras'] },
        i18n: { subtotal: 'Subtotal' }
    });
    const form = doc.querySelector('form');
    check('the form itself is never hidden as a service row',
        form.classList.contains('dcc_checkout-service-hidden'), false);
    check('and the price breakdown is still on screen',
        visibleRows(doc).some(r => r.indexOf('Total') === 0), true);
}

/* ===================================================================== *
 * v0.17.0 — the expander becomes a real <button>, and the pipeline stops
 * rewriting the page while a finger is down.
 *
 * Across four tap logs the tax asterisk (a <button>) is 4 of 4 at every
 * duration from 64ms to 96ms; the expander (an <a>, then an <a> without href)
 * failed 15 of 18 clean stationary taps. And every press in rounds 3 and 4
 * that carried the ~100-attribute pipeline burst mid-tap failed, 6 of 6.
 * ===================================================================== */
{
    const { window, doc } = await render(F.plainSubtotal, {
        i18n: { subtotal: 'Subtotal' }
    });
    const el = doc.querySelector('.mphb-price-breakdown-expand');

    check('the expander is a real button', el.tagName, 'BUTTON');
    check('and can never submit the checkout', el.getAttribute('type'), 'button');
    check('MotoPress\'s delegated handler still matches it',
        el.classList.contains('mphb-price-breakdown-expand'), true);
    check('it is kept out of the site button spec',
        el.classList.contains('dcc_checkout-bare-button'), true);
    check('it is not a link', el.hasAttribute('href'), false);
    check('the old href is remembered', el.getAttribute('data-dcc-href'), '#');
    check('still marked not-draggable', el.getAttribute('draggable'), 'false');
    // A native button activates on Enter and Space by itself. The keyboard
    // handler v0.16.0 needed for a hrefless <a> must NOT be carried over, or
    // the toggle fires twice and lands back where it started.
    check('no duplicate keyboard handler on a native button',
        el.hasAttribute('data-dcc-keys'), false);
    check('there is exactly one expander', 
        doc.querySelectorAll('.mphb-price-breakdown-expand').length, 1);

    // The asterisk is a bare control too, and was previously excluded from the
    // button spec by name. Both now carry the class.
    const star = doc.querySelector('.dcc_checkout-tax-asterisk');
    if (star) {
        check('the tax asterisk carries the same bare-control class',
            star.classList.contains('dcc_checkout-bare-button'), true);
    }
}

{
    // THE HOLD. Nothing may rewrite the page while a tap is resolving.
    const { window, doc } = await render(F.plainSubtotal, {
        i18n: { subtotal: 'Subtotal' }
    });
    const form = doc.querySelector('form');
    const expander = () => doc.querySelector('.mphb-price-breakdown-expand');

    // Strip a class the pipeline restores, so its next run is observable.
    expander().classList.remove('dcc_checkout-bare-button');

    doc.dispatchEvent(new window.Event('touchstart', { bubbles: true }));
    form.appendChild(doc.createElement('span'));      // provoke the observer
    await new Promise(r => setTimeout(r, 900));
    check('the pipeline does NOT run while a finger is down',
        expander().classList.contains('dcc_checkout-bare-button'), false);

    doc.dispatchEvent(new window.Event('touchend', { bubbles: true }));
    await new Promise(r => setTimeout(r, 1100));
    check('and runs once the tap has resolved',
        expander().classList.contains('dcc_checkout-bare-button'), true);
}

/* ===================================================================== *
 * v0.18.0 — A RE-RUN WITH NOTHING TO DO MUST NOT TOUCH THE PAGE.
 *
 * Measured before this release: one no-op re-run produced 42 mutation records
 * on this fixture, 35 of them writes whose old value equalled the new one. On
 * the live page that is the ~100-mutation burst logged mid-tap on the owner's
 * phone, in every round, on inputs and on the expander alike. iOS Safari
 * decides whether a tap is a click or a hover by watching for content changes
 * around it; a page rewriting a hundred attributes on a timer is what it looks
 * for. This asserts the burst is gone at the source, not merely delayed.
 * ===================================================================== */
{
    const { window, doc } = await render(F.servicesWithDetails, {
        labelAliases: {
            'services': ['services', 'extras'],
            'service': ['service', 'item'],
            'services total': ['services total', 'extras total']
        },
        guestServiceIdList: [18063],
        guestServiceTitles: ['extra guest fee (per guest beyond 2)'],
        guestFeeAmountText: '$50',
        i18n: {
            subtotal: 'Subtotal', taxNoteLead: 'Taxes applied:',
            totalPriceLabel: 'Total Price', extraGuestService: 'Extra Guest(s) Fee',
            extraGuestRate: '%s/night',
            extraGuestGuest: 'x %d guest',
            extraGuestGuests: 'x %d guests'
        }
    });
    await new Promise(r => setTimeout(r, 1200));          // let the first pass settle
    const form = doc.querySelector('form');
    const recs = [];
    const mo = new window.MutationObserver(l => l.forEach(r => recs.push(r)));
    mo.observe(form, { attributes: true, childList: true, characterData: true,
                       subtree: true, attributeOldValue: true });
    const probe = doc.createElement('span');
    form.appendChild(probe);                              // provoke one re-run
    await new Promise(r => setTimeout(r, 1500));
    mo.disconnect();
    const mine = recs.filter(r => !(r.type === 'childList' &&
                                     Array.from(r.addedNodes).includes(probe)));
    check('a no-op re-run of the pipeline records ZERO mutations', mine.length, 0);
    if (mine.length) {
        const by = {};
        mine.forEach(r => { const k = r.type + ' ' + (r.attributeName || '') + ' on ' +
            r.target.nodeName; by[k] = (by[k] || 0) + 1; });
        console.log('      offenders:', JSON.stringify(by));
    }
}

{
    // And the observer must not INSTALL a timer while a finger is down — it
    // notes the work and the touch-up handler schedules it. Observable as: a
    // mutation during a touch is acted on ~450ms after the finger lifts, and
    // not before, however long the finger stays down.
    const { window, doc } = await render(F.plainSubtotal, { i18n: { subtotal: 'Subtotal' } });
    await new Promise(r => setTimeout(r, 800));
    const expander = () => doc.querySelector('.mphb-price-breakdown-expand');
    expander().classList.remove('dcc_checkout-bare-button');
    doc.dispatchEvent(new window.Event('touchstart', { bubbles: true }));
    doc.querySelector('form').appendChild(doc.createElement('span'));
    await new Promise(r => setTimeout(r, 1500));          // well past any 500ms debounce
    check('work noted during a long touch is still not run',
        expander().classList.contains('dcc_checkout-bare-button'), false);
    doc.dispatchEvent(new window.Event('touchend', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    check('and not in the first 300ms after the finger lifts',
        expander().classList.contains('dcc_checkout-bare-button'), false);
    await new Promise(r => setTimeout(r, 500));
    check('but it runs once the tap has had time to resolve',
        expander().classList.contains('dcc_checkout-bare-button'), true);
}

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
})();
