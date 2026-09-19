/**
 * Runs assets/checkout.js's serviceForNights() against the PHP table.
 *
 * The function is EXTRACTED FROM THE SHIPPED FILE rather than copied here: a
 * copy would be a second implementation to keep in step, which is the very
 * problem this check exists to catch.
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
    path.join(__dirname, '../../dcc-custom-checkout/assets/checkout.js'), 'utf8');

function extract(name) {
    const re = new RegExp('function ' + name + '\\(nights\\) \\{[\\s\\S]*?\\n    \\}');
    const hit = src.match(re);
    if (!hit) {
        console.log(`FAIL  could not find ${name}() in checkout.js — the mirror ` +
                    'check is not running, which is not the same as passing');
        process.exit(1);
    }
    return hit[0];
}
const petSrc   = extract('serviceForNights');
const guestSrc = extract('guestServiceForNights');

const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const CFG = {
    thresholds:      payload.thresholds,
    serviceIds:      payload.serviceIds,
    guestServiceIds: payload.guestServiceIds,
};
const petFn   = new Function('CFG', petSrc   + '; return serviceForNights;')(CFG);
const guestFn = new Function('CFG', guestSrc + '; return guestServiceForNights;')(CFG);

let failures = 0;
function compare(label, fn, table) {
    for (const [nights, want] of Object.entries(table)) {
        const got = fn(Number(nights));
        const ok = got === want;
        if (!ok) { failures++; }
        console.log(`${ok ? 'PASS' : 'FAIL'}  mirror ${label}: ${nights} nights agrees with PHP`);
        if (!ok) { console.log(`      PHP said ${want}, JS said ${got}`); }
    }
}
compare('pet', petFn, payload.expected);
compare('extra-guest', guestFn, payload.expectedGuest);
process.exit(failures ? 1 : 0);
