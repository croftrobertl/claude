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
        guestFeeSteps: {}, guestGroups: [], dogFieldNames: []
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
    check('no-service: no "Rate:" row survives',
        rows.filter(r => /^Rate\b/i.test(r)).length, 0);
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
    check('with-service: no "Rate:" row survives',
        rows.filter(r => /^Rate\b/i.test(r)).length, 0);

    // Column headers read as headers; summary rows are deliberately left alone.
    // "Accommodation Taxes | Amount" is a column header too, and is marked —
    // it just lives behind the tax fold, so a guest never sees it.
    const heads = Array.from(doc.querySelectorAll('tr.dcc_checkout-breakdown-head'))
        .filter(r => !r.classList.contains('dcc_checkout-section-hidden'))
        .map(r => label(r.cells[0]));
    check('headers: every visible column header is marked, and nothing else',
        heads, ['Dates', 'Service']);
    check('headers: Subtotal / Taxes / Total are NOT marked',
        heads.filter(h => /^(Subtotal|Taxes|Total)/.test(h)).length, 0);
}

/* Suite 3 (the old "Show detail" fold) is retired; see suite 7. */

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
    const shown = el => el && !el.classList.contains('dcc_checkout-service-hidden');

    check('services: the "Choose Additional Services" heading is gone',
        shown(doc.querySelector('.services-heading')), false);
    check('services: no service row is visible',
        Array.from(doc.querySelectorAll('.mphb_sc_checkout-service')).filter(shown).length, 0);
    check('services: the emptied list wrapper went too — no bordered gap left',
        shown(doc.querySelector('.mphb_sc_checkout-services-list')), false);

    // The guard that used to defeat all of this.
    check('services: the section SURVIVES (it also holds the guest chooser)',
        shown(doc.querySelector('.mphb-checkout-section')), true);
    check('services: "Number of Guests" is still visible',
        shown(doc.querySelector('.mphb-adults-chooser')), true);
    check('services: the Accommodation Details heading is untouched',
        shown(doc.querySelectorAll('h3')[0]), true);

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
        star.getAttribute('aria-controls'), note.id);
    check('footnote: collapsed by default', star.getAttribute('aria-expanded'), 'false');
    check('footnote: it is in normal flow after the table, not a floating layer',
        note.previousElementSibling.tagName, 'TABLE');
    check('footnote: hidden until asked for',
        note.classList.contains('dcc_checkout-section-hidden'), true);

    star.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    check('footnote: opening names the taxes, without repeating the amounts',
        note.textContent,
        '* Taxes applied: Lake County Tourist Development Tax, ' +
        'Lake County Discretionary Sales Surtax, Florida Sales and Use Tax.');
    check('footnote: aria-expanded follows', star.getAttribute('aria-expanded'), 'true');

    star.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    check('footnote: tapping again hides it',
        note.classList.contains('dcc_checkout-section-hidden'), true);
}

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
})();
