/**
 * The DCC_RESTORE payload the fixture and the live-swap both send.
 *
 * ONE COPY, required by tests/real-theme/browser.js and by the live-swap
 * verification. The strings are compared against the shipped PHP by
 * tests/restore/run.php's fixture-drift guard, so this copy cannot drift from
 * what the server really prints — which is the apparent coverage 0.35.1 named.
 */
const I18N = {
    continueTitle: 'Continue Your Booking',
    continueLead: 'Your dates are still here. Pick up where you left off.',
    continueButton: 'Continue Your Booking',
    restartTitle: 'Pick Your Dates Again',
    restartLead: "We don't have your dates anymore. Pick them again and we'll bring you straight back to checkout.",
    restartButton: 'Pick Your Dates Again',
    takenTitle: "Those Dates Aren't Available",
    takenLead: "%s isn't available for those nights. Choose new dates and we'll bring you straight back.",
    takenLeadPlain: "Those nights aren't available. Choose new dates and we'll bring you straight back.",
    takenButton: 'Pick New Dates',
    welcome: 'Welcome back. We kept your answers. Please add your photo ID again.',
    startOver: 'Start Over',
    altTitle: 'Open Dates for This Cottage',
    chipLabel: '%1$s → %2$s · %3$s',
    chipOpen: 'Open',
    stripTitle: 'Or Browse the Cottages',
};

/* THE SITE'S REAL EIGHT, read from live's own menu and /cottages/ on
   2026-10-26. 0.36.0's fixture invented names that do not exist here. */
const COTTAGES = [
    ['Cottage 22: The Boathouse', 'cottage-22'],
    ['Cottage 23: The Lighthouse', 'cottage-23'],
    ['Cottage 31: Hibiscus Hut', 'cottage-31'],
    ['Cottage 32: Flamingo Bungalow', 'cottage-32'],
    ['Cottage 33: Pineapple Place', 'cottage-33'],
    ['Cottage 34: Coconut Cottage', 'cottage-34'],
    ['Cottage 35: Blue Heron Hideaway', 'cottage-35'],
    ['Cottage 36: Sunshine Suite', 'cottage-36'],
].map(([name, slug]) => ({
    name,
    url: 'https://doracanalcourt.com/accommodation/' + slug + '/',
    photo: 'https://i0.wp.com/doracanalcourt.com/' + slug + '.jpg?resize=150,150',
    w: 150,
    h: 150,
}));

/* Cottage 36 "Sunshine Suite", Jan 11-14 2027 — the cottage and the nights
   the Director reached the taken state with on staging. */
const STAY = {
    roomTypeId: 1607,
    checkIn: '2027-01-11',
    checkOut: '2027-01-14',
    name: 'Cottage 36: Sunshine Suite',
    roomsDetails: { 1607: 1 },
};

function cfg(state) {
    const taken = state === 'taken';
    return JSON.stringify({
        stay: taken ? STAY : {},
        offer: taken ? 'taken' : 'lost',
        checkout: 'https://doracanalcourt.com/submit-booking/',
        cottages: 'https://doracanalcourt.com/cottages/',
        avail: taken ? {
            url: 'https://doracanalcourt.com/wp-admin/admin-ajax.php',
            action: 'mphbac_query',
            windowDays: 94,
            timeoutMs: 5000,
            chips: 3,
            minNights: 2,
        } : {},
        cottageList: taken ? [] : COTTAGES,
        i18n: I18N,
    });
}

/** The Availability Calendar's own answer shape (its Booking_Rules::encode). */
function availBody() {
    const days = {};
    const d = new Date(Date.UTC(2027, 0, 11));
    for (let i = 0; i < 94; i++) {
        days[d.toISOString().slice(0, 10)] = i < 3 ? 'booked' : 'available';
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return JSON.stringify({
        success: true,
        data: {
            from: '2027-01-11',
            to: '2027-04-14',
            availability: { 1607: days },
            rules: { 1607: { in: '1'.repeat(94), out: '1'.repeat(94), min: 2, max: 0 } },
        },
    });
}

module.exports = { I18N, COTTAGES, STAY, cfg, availBody };
