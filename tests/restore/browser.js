/**
 * v0.35.0 — ITEM 10 IN A REAL BROWSER: the kept answers and the Continue card.
 *
 *     node tests/restore/browser.js            # the source
 *     DCC_MIN=1 node tests/restore/browser.js  # the built bundle a guest gets
 *
 * WHY A BROWSER: everything here is sessionStorage, real events and a real
 * form POST. jsdom would let the storage and the event dispatch be modelled by
 * the same beliefs as the code.
 *
 * WHAT IS CONSTRUCTED, not asserted in prose:
 *   - the photo ID, the coupon and the acceptance tick are NOT in the store,
 *     with all three filled in;
 *   - a reload restores the answers and FIRES the events the sections and the
 *     price depend on — a filled form nothing reacted to is the real failure
 *     mode, so a listener counts them;
 *   - the Continue card posts the SAME dates that were stored, which is one of
 *     the twelve required mutations;
 *   - no stored stay gives "Pick Your Dates Again" at /cottages/;
 *   - Submit and Start Over both empty the store;
 *   - a stay whose key differs drops the answers rather than offering them.
 *
 * TAP RULES (0.18.0): typing and tapping must record NO DOM mutations from
 * this script. A MutationObserver counts them, as tests/breakdown does.
 *
 * THE FIXTURE IS THE CHECKOUT'S SHAPE, NOT A CAPTURE of /submit-booking/ —
 * that page needs a live reservation. It carries MotoPress's form class, the
 * field names the Director read on live (mphb_first_name, mphb_last_name,
 * mphb_phone, mphb_email, mphb_address1, mphb_guest2_first_name,
 * mphb_room_details[0][adults], dcc_checkout_dog, mphb_dog_type,
 * mphb_boat), a file input, a coupon field, the acceptance tick and a
 * service checkbox. The v0.9.0 rule applies: replace it when real markup is
 * available.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PLUGIN = path.join(__dirname, '..', '..', 'dcc-custom-checkout');
const MIN = !!process.env.DCC_MIN;
const JS = fs.readFileSync(path.join(PLUGIN, 'assets', MIN ? 'restore.min.js' : 'restore.js'), 'utf8');
const CSS = fs.readFileSync(path.join(PLUGIN, 'assets', MIN ? 'checkout.min.css' : 'checkout.css'), 'utf8');

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) { failures++; }
    console.log((ok ? 'PASS  ' : 'FAIL  ') + name);
    if (!ok) {
        console.log('      expected: ' + JSON.stringify(expected));
        console.log('      actual:   ' + JSON.stringify(actual));
    }
}

const STAY = {
    roomTypeId: '1607',
    checkIn: '2026-11-16',
    checkOut: '2026-11-19',
    roomsDetails: { 1607: '1' },
    name: 'Test Cottage',
    photo: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
    dates: 'Mon, Nov 16 → Thu, Nov 19 · 3 Nights',
    key: '1607|2026-11-16|2026-11-19',
};

const I18N = {
    continueTitle: 'Continue Your Booking',
    continueLead: 'Your dates are still here. Pick up where you left off.',
    continueButton: 'Continue Your Booking',
    restartTitle: 'Pick Your Dates Again',
    restartLead: 'We do not have your dates any more.',
    restartButton: 'Pick Your Dates Again',
    // v0.35.1 item 2, reworded in v0.35.2: the dates are known and not
    // available, which is neither "lost" nor "someone just booked it" - the
    // site's two-night minimum refuses a one-night stay with no form and no
    // booking having happened.
    takenTitle: "Those Dates Aren't Available",
    takenLead: "%s isn't available for those nights. Choose new dates and we'll bring you straight back.",
    takenLeadPlain: "Those nights aren't available. Choose new dates and we'll bring you straight back.",
    takenButton: 'Pick New Dates',
    // v0.35.1, item 6 - three sentences, so sentence case.
    welcome: 'Welcome back. We kept your answers. Please add your photo ID again.',
    startOver: 'Start Over',
};

/**
 * PHP's half of the state decision (Restore::offer()) is a WORD, so the
 * fixture sends one. 'lost' is what a request carrying no stay gets.
 */
function cfg(stay, offer) {
    return JSON.stringify({
        stay: stay || {},
        offer: offer || 'lost',
        checkout: 'https://example.test/submit-booking/',
        cottages: 'https://example.test/cottages/',
        i18n: I18N,
    });
}

/** The checkout, with a form. */
function pageWithForm(stay) {
    return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>checkout</title><style>${CSS}</style></head>
<body><div class="mphb_sc_checkout">
  <form class="mphb_sc_checkout-form" method="post" action="/submit-booking/">
    <input type="hidden" name="mphb_nonce" value="SECRET-NONCE">
    <p><input type="text" name="mphb_first_name" value=""></p>
    <p><input type="text" name="mphb_last_name" value=""></p>
    <p><input type="tel" name="mphb_phone" value=""></p>
    <p><input type="email" name="mphb_email" value=""></p>
    <p><input type="text" name="mphb_address1" autocomplete="off" value=""></p>
    <p><input type="text" name="mphb_guest2_first_name" value=""></p>
    <p><select name="mphb_room_details[0][adults]">
      <option value="">— Select —</option><option value="1">1</option>
      <option value="2">2</option><option value="3">3</option><option value="4">4</option>
    </select></p>
    <p><select name="dcc_checkout_dog"><option value="">—</option>
      <option value="no">No</option><option value="yes">Yes</option></select></p>
    <p><input type="text" name="mphb_dog_type" value=""></p>
    <p><select name="mphb_boat"><option value="">—</option>
      <option value="No">No</option><option value="Yes">Yes</option></select></p>
    <p><input type="file" name="mphb_upload_id"></p>
    <p><input type="text" name="mphb_coupon_code" value=""></p>
    <p><label><input type="checkbox" name="mphb_accept_terms" value="1"> I accept</label></p>
    <p><label><input type="checkbox" class="mphb_sc_checkout-service"
         name="mphb_room_details[0][services][0][id]" value="19692"> Pet fee</label></p>
    <!-- THE TWO MONEY GUARDS ARE SEPARATE, so each needs a control only it
         catches. Mutation res-service-stored removed the NAME test and
         survived, because the row above carries the class as well: an
         equivalent mutant made by a fixture that never separates them. -->
    <p><label><input type="checkbox"
         name="mphb_room_details[0][services][1][id]" value="17712"> A service with no class</label></p>
    <p><label><input type="checkbox" class="mphb_sc_checkout-service"
         name="dcc_service_oddly_named" value="x"> A service-classed control with another name</label></p>
    <p><button type="submit" id="go">Book Now</button></p>
  </form>
</div>
<script>window.DCC_RESTORE = ${cfg(stay)};</script>
<script>${JS}</script>
</body></html>`;
}

/** The dead end: MotoPress rendered no form, only its message. */
function pageWithoutForm() {
    return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>checkout</title><style>${CSS}</style></head>
<body>
<!-- EXACTLY WHAT LIVE SERVES a fresh GET with no POST (Director, 2026-10-22):
     the wrapper, and p.mphb-data-incorrect inside it. There is no
     .mphb-errors-wrapper on this path - the first version of this fixture
     invented one, which is the v0.9.0 trap: a plausible fixture agreeing with
     a plausible selector. -->
<div class="mphb_sc_checkout-wrapper">
  <p class="mphb-data-incorrect"> <br/>Check-in date is not valid.<br/>Check-out date is not valid.</p>
</div>
<script>window.DCC_RESTORE = ${cfg(null)};</script>
<script>${JS}</script>
</body></html>`;
}

/**
 * THE BOOKED PAGE (v0.35.1, item 2). MotoPress drew no form and printed
 * "Accommodation is already booked." — and this request DID carry a complete
 * stay, which is what tells "taken" from "lost".
 *
 * ITS MARKUP HAS NOT BEEN READ. The Director quoted the sentence, not the
 * element, so the fixture deliberately uses shapes the pinned
 * `p.mphb-data-incorrect` selector does NOT match: a classless `<p>`, and a
 * nested block. That is the honest worst case and it is the case 0.35.0
 * failed — its message stayed visible under the card. The structural sweep is
 * what has to cover it.
 *
 * @param {string} inner  what MotoPress put in its wrapper
 */
function pageBooked(inner) {
    return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>checkout</title><style>${CSS}</style></head>
<body>
<!-- TIGHT, as live serves it: the Director read the wrapper's children as
     [SECTION.dcc_checkout-continue, TEXT "Accommodation is already booked."] -
     one text node holding the sentence and nothing else. Padding the inner
     onto its own line would have made the text node "\n  Accommodation…\n",
     which is not what live sends and would have made the "moved character for
     character" assertion pass for the wrong reason. -->
<div class="mphb_sc_checkout-wrapper">${inner || '<p>Accommodation is already booked.</p>'}</div>
<script>window.DCC_RESTORE = ${cfg(STAY, 'taken')};</script>
<script>${JS}</script>
</body></html>`;
}

/** What a guest types. */
const TYPED = {
    'mphb_first_name': 'Ada',
    'mphb_last_name': 'Lovelace',
    'mphb_phone': '555 0100',
    'mphb_email': 'ada@example.test',
    'mphb_address1': '1 Canal Road',
    'mphb_guest2_first_name': 'Grace',
    'mphb_dog_type': 'Beagle',
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
    });
    const page = await ctx.newPage();

    /* The POST the Continue card makes must go somewhere real, so the request
       can be read rather than inferred. */
    await page.route('https://example.test/submit-booking/', (route) => {
        route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>posted</body></html>' });
    });
    await page.route('https://example.test/cottages/', (route) => {
        route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>cottages</body></html>' });
    });

    /* ===================================================================== *
     * 1. The form is there: answers are kept, and the forbidden three are not
     * ===================================================================== */
    await page.goto('https://example.test/submit-booking/');
    await page.setContent(pageWithForm(STAY));

    /* Count this script's DOM writes while the guest types. */
    await page.evaluate(() => {
        window.__muts = 0;
        new MutationObserver((rs) => { window.__muts += rs.length; })
            .observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    });

    for (const [name, value] of Object.entries(TYPED)) {
        await page.fill(`[name="${name}"]`, value);
    }
    await page.selectOption('[name="mphb_room_details[0][adults]"]', '3');
    await page.selectOption('[name="dcc_checkout_dog"]', 'yes');
    await page.selectOption('[name="mphb_boat"]', 'Yes');
    await page.fill('[name="mphb_coupon_code"]', 'SPRING');
    await page.check('[name="mphb_accept_terms"]');
    await page.check('.mphb_sc_checkout-service');

    const muts = await page.evaluate(() => window.__muts);
    check('typing and ticking record NO DOM mutations from this script (0.18.0)', muts, 0);

    const stored = await page.evaluate(() => {
        return {
            answers: JSON.parse(sessionStorage.getItem('dcc_checkout_answers_v1') || 'null'),
            stay: JSON.parse(sessionStorage.getItem('dcc_checkout_stay_v1') || 'null'),
            local: Object.keys(window.localStorage),
            cookie: document.cookie,
        };
    });

    check('the stay is stored', stored.stay && stored.stay.key, STAY.key);
    check('the answers are stored against that stay', stored.answers && stored.answers.key, STAY.key);
    check('the typed answers are all there', {
        first: stored.answers.data['mphb_first_name'],
        last: stored.answers.data['mphb_last_name'],
        phone: stored.answers.data['mphb_phone'],
        email: stored.answers.data['mphb_email'],
        address: stored.answers.data['mphb_address1'],
        guest2: stored.answers.data['mphb_guest2_first_name'],
        adults: stored.answers.data['mphb_room_details[0][adults]'],
        dog: stored.answers.data['dcc_checkout_dog'],
        dogType: stored.answers.data['mphb_dog_type'],
        boat: stored.answers.data['mphb_boat'],
    }, {
        first: 'Ada', last: 'Lovelace', phone: '555 0100', email: 'ada@example.test',
        address: '1 Canal Road', guest2: 'Grace', adults: '3',
        dog: 'yes', dogType: 'Beagle', boat: 'Yes',
    });

    /* THE THREE THAT ARE NEVER STORED, each filled in above. */
    const keys = Object.keys(stored.answers.data);
    check('the photo ID is NEVER in the store',
        keys.some((k) => /upload_id/.test(k)), false);
    check('the coupon code is NEVER in the store',
        keys.some((k) => /coupon/i.test(k)), false);
    check('the acceptance tick is NEVER in the store',
        keys.some((k) => /accept_terms/.test(k)), false);
    check('… and neither is the service checkbox that carries money',
        keys.some((k) => /\[services\]/.test(k)), false);
    /* Each money guard on its own: a [services] name with no class, and the
       service class on a control named something else. */
    check('… a [services] control is skipped by its NAME, class or no class',
        keys.some((k) => /services\]\[1\]/.test(k)), false);
    check('… and a service-classed control is skipped by its CLASS, name or no name',
        keys.indexOf('dcc_service_oddly_named'), -1);
    check('… nor MotoPress\'s nonce',
        keys.some((k) => /nonce/i.test(k)), false);
    check('nothing is written to localStorage or a cookie',
        [stored.local, stored.cookie], [[], '']);

    /* ===================================================================== *
     * 2. The reload: the answers go back, and the page REACTS
     * ===================================================================== */
    await page.setContent(pageWithForm(STAY));
    const back = await page.evaluate(() => {
        const v = (n) => (document.querySelector('[name="' + n + '"]') || {}).value;
        return {
            first: v('mphb_first_name'),
            phone: v('mphb_phone'),
            address: v('mphb_address1'),
            guest2: v('mphb_guest2_first_name'),
            adults: v('mphb_room_details[0][adults]'),
            dog: v('dcc_checkout_dog'),
            dogType: v('mphb_dog_type'),
            boat: v('mphb_boat'),
            coupon: v('mphb_coupon_code'),
            terms: document.querySelector('[name="mphb_accept_terms"]').checked,
            file: document.querySelector('[name="mphb_upload_id"]').value,
            welcome: (document.querySelector('.dcc_checkout-welcome') || {}).textContent || '',
            startOver: !!document.querySelector('.dcc_checkout-startover'),
        };
    });

    check('the guest\'s answers are back', {
        first: back.first, phone: back.phone, address: back.address,
        guest2: back.guest2, adults: back.adults, dog: back.dog,
        dogType: back.dogType, boat: back.boat,
    }, {
        first: 'Ada', phone: '555 0100', address: '1 Canal Road',
        guest2: 'Grace', adults: '3', dog: 'yes', dogType: 'Beagle', boat: 'Yes',
    });
    check('the coupon is NOT restored — it is a decision, not an answer', back.coupon, '');
    check('the acceptance tick is NOT restored', back.terms, false);
    check('the photo ID is empty, as it must be', back.file, '');
    check('the guest is told, and told to add the ID again',
        back.welcome.indexOf('photo ID again') !== -1, true);
    /* ITEM 6, MEASURED ON THE RENDERED NOTE. The substring above survives both
       casings, so on its own it could not see 0.35.0's "Welcome Back. We Kept
       Your Answers." The whole sentence is the assertion. */
    check('… in sentence case, as Rob asked',
        back.welcome.replace(/\s*Start Over\s*$/, '').trim(),
        'Welcome back. We kept your answers. Please add your photo ID again.');
    check('… with a Start Over next to it', back.startOver, true);

    /* THE EVENTS. A filled form that nothing reacted to would have the right
       answers with the wrong sections and the wrong price — so the listeners
       have to be installed BEFORE the script runs, by an inline script of
       their own ahead of it. */
    const events = await (async () => {
        const probe = pageWithForm(STAY).replace(
            '<script>window.DCC_RESTORE',
            `<script>
               window.__ev = { input: [], change: [] };
               document.addEventListener('input', function (e) { window.__ev.input.push(e.target.name); }, true);
               document.addEventListener('change', function (e) { window.__ev.change.push(e.target.name); }, true);
             </script><script>window.DCC_RESTORE`
        );
        await page.setContent(probe);
        return page.evaluate(() => window.__ev);
    })();

    check('restoring the guest chooser fires `change`, so MotoPress re-prices',
        events.change.indexOf('mphb_room_details[0][adults]') !== -1, true);
    check('restoring the dog answer fires `change`, so the dog section opens',
        events.change.indexOf('dcc_checkout_dog') !== -1, true);
    check('restoring a text field fires `input` too',
        events.input.indexOf('mphb_first_name') !== -1, true);
    check('nothing fires an event for a field it did not restore',
        events.change.indexOf('mphb_coupon_code'), -1);

    /* ===================================================================== *
     * 3. A different stay: the answers are dropped, not offered
     * ===================================================================== */
    const other = Object.assign({}, STAY, {
        checkIn: '2026-12-01', checkOut: '2026-12-04',
        key: '1607|2026-12-01|2026-12-04',
    });
    await page.setContent(pageWithForm(other));
    const crossed = await page.evaluate(() => ({
        first: document.querySelector('[name="mphb_first_name"]').value,
        welcome: !!document.querySelector('.dcc_checkout-welcome'),
        answers: sessionStorage.getItem('dcc_checkout_answers_v1'),
    }));
    check('answers typed against other dates are NOT offered against these',
        [crossed.first, crossed.welcome], ['', false]);
    check('… and they are cleared rather than left to be found later',
        crossed.answers, null);

    /* ===================================================================== *
     * 4. Submit and Start Over both empty the store
     * ===================================================================== */
    await page.setContent(pageWithForm(STAY));
    await page.fill('[name="mphb_first_name"]', 'Ada');
    check('something is stored before submitting (the guard)',
        await page.evaluate(() => !!sessionStorage.getItem('dcc_checkout_answers_v1')), true);
    await page.evaluate(() => {
        /* The form must not actually navigate here; the listener is what is
           being measured. MotoPress submits over REST anyway (0.15.0). */
        document.querySelector('form').addEventListener('submit', (e) => e.preventDefault());
        document.querySelector('#go').click();
    });
    check('submitting empties the store — a completed booking is the server\'s',
        await page.evaluate(() => [
            sessionStorage.getItem('dcc_checkout_answers_v1'),
            sessionStorage.getItem('dcc_checkout_stay_v1'),
        ]), [null, null]);

    /* THE SUBMIT EVENT ALONE, with no click. The two listeners exist for
       different reasons (0.15.0: MotoPress submits over REST, so a submit
       event is not guaranteed) and each must be sufficient by itself —
       mutation res-submit-keeps survived a click-driven test, because the
       click listener covered for it. */
    await page.setContent(pageWithForm(STAY));
    await page.fill('[name="mphb_first_name"]', 'Ada');
    await page.evaluate(() => {
        var f = document.querySelector('form');
        f.addEventListener('submit', (e) => e.preventDefault());
        f.requestSubmit();
    });
    check('a submit event with no click empties the store',
        await page.evaluate(() => sessionStorage.getItem('dcc_checkout_answers_v1')), null);

    /* And the click on a submit control alone, with the submit event never
       fired — which is the REST case the second listener is there for. */
    await page.setContent(pageWithForm(STAY));
    await page.fill('[name="mphb_first_name"]', 'Ada');
    await page.evaluate(() => {
        /* Swallow the submit entirely, so only the click can clear. */
        document.querySelector('form').addEventListener('submit', (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
        }, true);
        document.querySelector('#go').click();
    });
    check('a submit-control press with no submit event empties the store too',
        await page.evaluate(() => sessionStorage.getItem('dcc_checkout_answers_v1')), null);

    await page.setContent(pageWithForm(STAY));
    await page.fill('[name="mphb_first_name"]', 'Ada');
    await page.setContent(pageWithForm(STAY));
    check('Start Over is offered (the guard)',
        await page.evaluate(() => !!document.querySelector('.dcc_checkout-startover')), true);
    /* Start Over clears the store and then reloads. `window.location.reload`
       cannot be overridden in a real browser — the first draft tried, and the
       context was destroyed under the next read — so the navigation is awaited
       and the store read afterwards. sessionStorage is per origin and per tab,
       so it survives the reload, which is exactly what makes the assertion
       meaningful: it is empty because the button emptied it, not because the
       page changed. */
    await Promise.all([
        page.waitForLoadState('load'),
        page.click('.dcc_checkout-startover'),
    ]);
    check('Start Over empties the store, and it stays empty across the reload',
        await page.evaluate(() => [
            sessionStorage.getItem('dcc_checkout_answers_v1'),
            sessionStorage.getItem('dcc_checkout_stay_v1'),
        ]), [null, null]);

    /* ===================================================================== *
     * 5. THE DEAD END: the card, and the dates it posts
     * ===================================================================== */

    /* Store a stay the way a real visit would have, then land on a formless
       checkout — which is exactly the reload the Director reproduced. */
    await page.setContent(pageWithForm(STAY));
    await page.fill('[name="mphb_first_name"]', 'Ada');
    await page.setContent(pageWithoutForm());

    const card = await page.evaluate(() => {
        const c = document.querySelector('.dcc_checkout-continue');
        if (!c) { return null; }
        const inputs = {};
        c.querySelectorAll('input[type="hidden"]').forEach((i) => { inputs[i.name] = i.value; });
        const host = c.parentElement;
        return {
            heading: (c.querySelector('.dcc_checkout-continue__title') || {}).textContent,
            text: c.textContent,
            photo: !!c.querySelector('.dcc_checkout-continue__photo'),
            alt: (c.querySelector('.dcc_checkout-continue__photo') || {}).alt,
            action: (c.querySelector('form') || {}).action,
            method: (c.querySelector('form') || {}).method,
            inputs: inputs,
            first: host.firstElementChild === c,
            deadEndHidden: getComputedStyle(document.querySelector('.mphb-data-incorrect')).display,
            /* The card is INSIDE the wrapper MotoPress rendered, above the
               message, so the two read as one block. */
            hostClass: host.className,
        };
    });

    /* THE HEADING IS READ BY ITS CLASS, NEVER ITS TAG (0.36.0). The tag is
       an h1 or an h2 depending on what else the page holds — cardHeading() —
       and a check keyed on `h2` stopped matching the day that changed. That
       is v0.22.0's lesson in a third shape: the expander's hover rule was
       keyed on `a` and died silently when it became a button. */
    check('a card is drawn where MotoPress drew no form', card !== null, true);
    check('it is the FIRST thing in the content, above the dead end', card.first, true);
    check('it says Continue Your Booking', card.heading, 'Continue Your Booking');
    check('it names the cottage and the dates',
        [card.text.indexOf('Test Cottage') !== -1, card.text.indexOf('Nov 16') !== -1],
        [true, true]);
    check('it shows the cottage\'s photo, with its name as the alt text',
        [card.photo, card.alt], [true, 'Test Cottage']);
    check('MotoPress\'s dead-end message is hidden behind it', card.deadEndHidden, 'none');
    check('… and the card is inside the wrapper MotoPress rendered',
        card.hostClass, 'mphb_sc_checkout-wrapper');

    /* THE FIVE FIELDS, AND THE DATES. One of the twelve required mutations is
       "Continue Your Booking posting different dates from those saved". */
    check('it POSTs to MotoPress\'s checkout page',
        [card.method, card.action], ['post', 'https://example.test/submit-booking/']);
    check('it posts EXACTLY the five fields the cottage page sends, with the SAME dates',
        card.inputs, {
            'mphb_room_type_id': '1607',
            'mphb_check_in_date': '2026-11-16',
            'mphb_check_out_date': '2026-11-19',
            'mphb_rooms_details[1607]': '1',
            'mphb_is_direct_booking': '1',
        });

    /* And the POST really is that, read off the wire rather than off the DOM. */
    const [request] = await Promise.all([
        page.waitForRequest((r) => r.method() === 'POST'),
        page.click('.dcc_checkout-continue__button'),
    ]);
    check('the request on the wire carries the stored dates',
        request.postData(),
        'mphb_room_type_id=1607&mphb_check_in_date=2026-11-16&mphb_check_out_date=2026-11-19'
        + '&mphb_rooms_details%5B1607%5D=1&mphb_is_direct_booking=1');

    /* THE FALLBACK ORDER IS REAL, not decorative. A selector LIST would have
       returned <body> for every one of these, because body is an ancestor of
       them all and querySelector answers in document order — which is exactly
       what the original did. Each container is constructed on its own. */
    for (const [label, host, expect] of [
        ['MotoPress\'s own wrapper', '<div class="mphb_sc_checkout-wrapper"><p class="mphb-data-incorrect">x</p></div>', 'mphb_sc_checkout-wrapper'],
        ['the checkout block', '<div class="mphb_sc_checkout"><p>x</p></div>', 'mphb_sc_checkout'],
        ['the entry content', '<div class="entry-content"><p>x</p></div>', 'entry-content'],
        ['the main element', '<main><p>x</p></main>', ''],
    ]) {
        const p2 = await ctx.newPage();
        await p2.setContent(pageWithoutForm().replace(
            /<div class="mphb_sc_checkout-wrapper">[\s\S]*?<\/div>/, host));
        const got = await p2.evaluate(() => {
            const c = document.querySelector('.dcc_checkout-continue');
            return c ? { parent: c.parentElement.className, tag: c.parentElement.tagName } : null;
        });
        await p2.close();
        check('the card lands in ' + label, got && got.parent, expect);
        if (expect === '') {
            check('… which is <main>, not <body>', got && got.tag, 'MAIN');
        }
    }

    /* ===================================================================== *
     * 5b. "THOSE DATES ARE TAKEN" (v0.35.1, item 2)
     *
     * No form, and a complete still-bookable stay in THIS request: the dates
     * are not lost, they are taken. The one action is forward.
     * ===================================================================== */
    for (const [label, inner] of [
        /* THE ONE LIVE SERVES (Director, 2026-10-23, Cottage 36 Jan 11-14
           2027): a BARE TEXT NODE directly inside the wrapper. 0.35.1's sweep
           walked `host.children` — elements only — so there was nothing to put
           a class on and the sentence stayed under the card. It is first in
           this list because it is the real one. */
        ['the bare text node live serves', 'Accommodation is already booked.'],
        ['a classless <p>', '<p>Accommodation is already booked.</p>'],
        ['a nested block', '<div class="mphb_sc_checkout"><p>Accommodation is already booked.</p></div>'],
        ['the pinned dead-end element', '<p class="mphb-data-incorrect">Accommodation is already booked.</p>'],
    ]) {
        await page.goto('https://example.test/submit-booking/');
        /* A STORED STAY IS PRESENT ON PURPOSE. "Taken" has to beat it: a guest
           whose answers are still in the tab must not be offered Continue for
           a stay MotoPress has just refused, which would walk them into the
           same wall. */
        await page.evaluate((st) => {
            sessionStorage.clear();
            sessionStorage.setItem('dcc_checkout_stay_v1', JSON.stringify(st));
        }, STAY);
        await page.setContent(pageBooked(inner));

        const taken = await page.evaluate(() => {
            const c = document.querySelector('.dcc_checkout-continue');
            if (!c) { return null; }
            const a = c.querySelector('a.dcc_checkout-continue__button');
            const lead = c.querySelector('.dcc_checkout-continue__lead');
            const wrapper = document.querySelector('.mphb_sc_checkout-wrapper');
            /* Every one of MotoPress's own children, whatever its shape. */
            const theirs = Array.prototype.slice.call(wrapper.children)
                .filter((el) => !el.classList.contains('dcc_checkout-continue'));
            return {
                heading: (c.querySelector('.dcc_checkout-continue__title') || {}).textContent,
                lead: lead && lead.textContent,
                leadAlign: lead && getComputedStyle(lead).textAlign,
                headAlign: getComputedStyle(c.querySelector('.dcc_checkout-continue__title')).textAlign,
                href: a && a.getAttribute('href'),
                posts: !!c.querySelector('form'),
                cardVisible: getComputedStyle(c).display !== 'none',
                theirsShown: theirs.map((el) => getComputedStyle(el).display),
                theirCount: theirs.length,
                dates: c.textContent.indexOf('Nov 16') !== -1,
            };
        });

        check('the unavailable page gets the taken card (' + label + ')',
            taken && taken.heading, "Those Dates Aren't Available");
        check('… it names the cottage in the lead (' + label + ')',
            taken.lead, "Test Cottage isn't available for those nights."
                + " Choose new dates and we'll bring you straight back.");
        check('… it links forward to /cottages/ and never re-POSTs the refused stay ('
            + label + ')',
            [taken.href, taken.posts], ['https://example.test/cottages/', false]);
        check('… it still shows the dates, because we have them (' + label + ')',
            taken.dates, true);
        check('… MotoPress\'s own line is out of view (' + label + ')',
            [taken.theirCount > 0, taken.theirsShown.every((d) => d === 'none')],
            [true, true]);
        check('… and the card itself is not (' + label + ')', taken.cardVisible, true);
        /* Rob's alignment rule, measured rather than read off the stylesheet. */
        check('… the title is centred and the two-sentence lead is not ('
            + label + ')',
            [taken.headAlign, taken.leadAlign], ['center', 'left']);
    }

    /* ===================================================================== *
     * 5c. THE BARE TEXT NODE, IN DETAIL (v0.35.2)
     *
     * A text node cannot carry a class, so it is wrapped in a hidden span.
     * That is DOM surgery, so the mechanics are asserted rather than assumed:
     * the text is MOVED not retyped, whitespace is left alone, and a second
     * pass finds an element it has already hidden rather than text to wrap
     * again.
     * ===================================================================== */
    await page.goto('https://example.test/submit-booking/');
    await page.evaluate((st) => {
        sessionStorage.clear();
        sessionStorage.setItem('dcc_checkout_stay_v1', JSON.stringify(st));
    }, STAY);
    await page.setContent(pageBooked('Accommodation is already booked.'));

    const bare = await page.evaluate(() => {
        const w = document.querySelector('.mphb_sc_checkout-wrapper');
        const spans = w.querySelectorAll('span.dcc_checkout-hidden');
        /* Every direct child, in order, as live reports them. */
        const kids = Array.prototype.map.call(w.childNodes, (n) => {
            if (n.nodeType === 1) { return n.tagName + (n.className ? '.' + n.className : ''); }
            return 'TEXT ' + JSON.stringify(n.nodeValue);
        });
        return {
            kids: kids,
            spanCount: spans.length,
            spanText: spans.length ? spans[0].textContent : null,
            spanShown: spans.length ? getComputedStyle(spans[0]).display : null,
            /* The moved node is still a text node, and the only child. */
            spanChildren: spans.length
                ? Array.prototype.map.call(spans[0].childNodes, (n) => n.nodeType) : null,
            nested: w.querySelectorAll('span.dcc_checkout-hidden span').length,
            /* Nothing of MotoPress's sentence survives as visible text. */
            visibleText: Array.prototype.filter.call(w.childNodes, (n) =>
                n.nodeType === 3 && n.nodeValue.trim()).length,
        };
    });

    check('the bare text node is wrapped in exactly one hidden span',
        [bare.spanCount, bare.nested], [1, 0]);
    check('… the sentence is MOVED into it, character for character',
        bare.spanText, 'Accommodation is already booked.');
    check('… it is still a text node inside, not re-typed markup',
        bare.spanChildren, [3]);
    check('… and the span computes to display:none',
        bare.spanShown, 'none');
    check('no visible bare text is left directly in the wrapper',
        bare.visibleText, 0);
    check('the wrapper holds the card and the hidden span, and nothing else',
        bare.kids, ['SECTION.dcc_checkout-continue', 'SPAN.dcc_checkout-hidden']);

    /* WHITESPACE IS LEFT ALONE — there is nothing to see in it and wrapping it
       would litter the markup. The live wrapper is tight, so this needs its
       own page: an element with real indentation and newlines around it, plus
       a sentence of bare text. */
    await page.setContent(pageBooked(
        '\n  <p class="mphb-data-incorrect">Check-in date is not valid.</p>\n  '
        + 'Accommodation is already booked.\n'));
    const mixed = await page.evaluate(() => {
        const w = document.querySelector('.mphb_sc_checkout-wrapper');
        return {
            kids: Array.prototype.map.call(w.childNodes, (n) => n.nodeType === 1
                ? n.tagName + (n.className ? '.' + n.className : '')
                : 'TEXT ' + JSON.stringify(n.nodeValue)),
            hiddenSentence: !!Array.prototype.find.call(
                w.querySelectorAll('span.dcc_checkout-hidden'),
                (sp) => sp.textContent.indexOf('already booked') !== -1),
        };
    });
    check('whitespace-only text nodes survive unwrapped, beside the wrapped sentence',
        mixed.kids.filter((k) => k.startsWith('TEXT ')).every((k) => !/\S/.test(
            JSON.parse(k.slice(5)))), true);
    check('… there is still whitespace there to have been left alone (the guard)',
        mixed.kids.filter((k) => k.startsWith('TEXT ')).length > 0, true);
    check('… and the sentence itself is wrapped and hidden',
        mixed.hiddenSentence, true);
    check('… with MotoPress\'s own element hidden too',
        mixed.kids.indexOf('P.mphb-data-incorrect dcc_checkout-hidden') !== -1, true);

    /* MOVED, NOT RE-TYPED — AND THIS NEEDS A SENTENCE THAT CAN TELL THE
       DIFFERENCE. The assertions above cannot: `innerHTML = node.nodeValue`
       on plain prose produces an identical single text node, so mutation
       `js-bare-text-retyped` SURVIVED them. The condition the claim names is
       text that HTML would re-parse, and MotoPress's strings really can carry
       it — an ampersand in a cottage name, an escaped entity in a
       translation. So the text node here holds `&` and angle brackets, as
       text. Re-typed through innerHTML, `<today>` becomes an element and the
       brackets vanish from the text; moved, the node arrives intact. */
    await page.setContent(pageBooked(
        'Accommodation &amp; cottage 36 are already booked &lt;today&gt;.'));
    const moved = await page.evaluate(() => {
        const w = document.querySelector('.mphb_sc_checkout-wrapper');
        const sp = w.querySelector('span.dcc_checkout-hidden');
        if (!sp) { return null; }
        return {
            text: sp.textContent,
            types: Array.prototype.map.call(sp.childNodes, (n) => n.nodeType),
            tags: Array.prototype.map.call(sp.childNodes,
                (n) => n.nodeType === 1 ? n.tagName : null).filter(Boolean),
        };
    });
    check('the text node is MOVED, so markup-looking text survives verbatim',
        moved && moved.text,
        'Accommodation & cottage 36 are already booked <today>.');
    check('… as ONE text node, with nothing re-parsed into an element',
        [moved.types, moved.tags], [[3], []]);

    /* A SECOND RUN FINDS NOTHING TO DO. `hideDeadEnd` is called once at init,
       but a text node wrapped twice would nest spans and re-moving it would be
       a DOM write nobody asked for, so the idempotence is asserted by running
       the whole script again over the finished page. */
    await page.setContent(pageBooked('Accommodation is already booked.'));
    await page.addScriptTag({ content: JS });
    const again = await page.evaluate(() => {
        const w = document.querySelector('.mphb_sc_checkout-wrapper');
        return {
            spans: w.querySelectorAll('span.dcc_checkout-hidden').length,
            nested: w.querySelectorAll('span.dcc_checkout-hidden span').length,
            cards: w.querySelectorAll('.dcc_checkout-continue').length,
        };
    });
    check('running the script again wraps nothing twice and adds no second card',
        again, { spans: 1, nested: 0, cards: 1 });

    /* WITHOUT PHP'S WORD, NOTHING CHANGES. The browser never decides this on
       its own — it does not read MotoPress's message, and a page whose request
       carried no stay is still the dead end it was. */
    await page.goto('https://example.test/submit-booking/');
    await page.evaluate(() => sessionStorage.clear());
    await page.setContent(pageBooked().replace("'offer':'taken'", "'offer':'lost'")
        .replace('"offer":"taken"', '"offer":"lost"'));
    const notTaken = await page.evaluate(() => {
        const c = document.querySelector('.dcc_checkout-continue');
        return c && (c.querySelector('.dcc_checkout-continue__title') || {}).textContent;
    });
    check('with PHP saying "lost", the taken card is not drawn', notTaken, 'Pick Your Dates Again');

    /* AND A STAY PHP HANDED OVER HALF-WRITTEN IS NOT ENOUGH EITHER. */
    await page.setContent(pageBooked().replace(
        '"checkOut":"2026-11-19"', '"checkOut":""'));
    const halfTaken = await page.evaluate(() => {
        const c = document.querySelector('.dcc_checkout-continue');
        return c && (c.querySelector('.dcc_checkout-continue__title') || {}).textContent;
    });
    check('a half-written stay is not "taken" even when PHP says so', halfTaken,
        'Pick Your Dates Again');

    /* THE STRUCTURAL SWEEP IS CONFINED TO MOTOPRESS'S OWN WRAPPER AND MUST
       STAY SO. The host list also holds .entry-content, main and body; hiding
       every child of one of those would blank the page. */
    for (const [label, host] of [
        ['the checkout block', '<div class="mphb_sc_checkout"><p id="keep">Accommodation is already booked.</p></div>'],
        ['the entry content', '<div class="entry-content"><p id="keep">Accommodation is already booked.</p></div>'],
        ['the main element', '<main><p id="keep">Accommodation is already booked.</p></main>'],
    ]) {
        const p3 = await ctx.newPage();
        await p3.setContent(pageBooked().replace(
            /<div class="mphb_sc_checkout-wrapper">[\s\S]*?<\/div>\n*(?=<script)/, host));
        const kept = await p3.evaluate(() => {
            const el = document.getElementById('keep');
            const c = document.querySelector('.dcc_checkout-continue');
            return {
                card: !!c && (c.querySelector('.dcc_checkout-continue__title') || {}).textContent,
                shown: el ? getComputedStyle(el).display : 'missing',
                siblings: document.body.children.length,
            };
        });
        await p3.close();
        check('outside MotoPress\'s wrapper nothing is swept (' + label + ')',
            [kept.card, kept.shown], ["Those Dates Aren't Available", 'block']);
    }

    /* ===================================================================== *
     * 6. Nothing stored: ask for the dates again
     * ===================================================================== */
    await page.goto('https://example.test/submit-booking/');
    await page.evaluate(() => sessionStorage.clear());
    await page.setContent(pageWithoutForm());
    const restart = await page.evaluate(() => {
        const c = document.querySelector('.dcc_checkout-continue');
        const a = c && c.querySelector('a.dcc_checkout-continue__button');
        return {
            heading: c && (c.querySelector('.dcc_checkout-continue__title') || {}).textContent,
            href: a && a.getAttribute('href'),
            noForm: !!c && !c.querySelector('form'),
        };
    });
    check('with nothing stored, the card asks for the dates again',
        restart.heading, 'Pick Your Dates Again');
    check('… and links to /cottages/ rather than posting a stay it does not have',
        [restart.href, restart.noForm], ['https://example.test/cottages/', true]);

    /* A HALF-WRITTEN STAY IS NOT A STAY. PHP never hands over one (its own
       suite constructs that), but storage is the one input here that does not
       come from PHP: a corrupted entry, or one left by a future shape, could
       carry a room type and no dates. Offering "Continue" then would post an
       empty check-in — mutation res-restart-posts-nothing survived a test
       that only ever had nothing stored at all. */
    for (const partial of [
        { roomTypeId: '1607' },
        { roomTypeId: '1607', checkIn: '2026-11-16' },
        { checkIn: '2026-11-16', checkOut: '2026-11-19' },
        { roomTypeId: '1607', checkIn: '', checkOut: '' },
    ]) {
        await page.goto('https://example.test/submit-booking/');
        await page.evaluate((p) => {
            sessionStorage.clear();
            sessionStorage.setItem('dcc_checkout_stay_v1', JSON.stringify(p));
        }, partial);
        await page.setContent(pageWithoutForm());
        const half = await page.evaluate(() => {
            const c = document.querySelector('.dcc_checkout-continue');
            return {
                heading: c && (c.querySelector('.dcc_checkout-continue__title') || {}).textContent,
                posts: !!(c && c.querySelector('form')),
            };
        });
        check('a half-written stored stay asks for the dates again rather than posting one'
            + ' (' + Object.keys(partial).join('+') + ')',
            [half.heading, half.posts], ['Pick Your Dates Again', false]);
    }

    /* ===================================================================== *
     * 7. The card is a real tap target, and reads as a button
     * ===================================================================== */
    await page.setContent(pageWithoutForm());
    const geom = await page.evaluate(() => {
        const a = document.querySelector('.dcc_checkout-continue__button');
        const r = a.getBoundingClientRect();
        const s = getComputedStyle(a);
        return {
            height: Math.round(r.height),
            inside: r.left >= 0 && r.right <= document.documentElement.clientWidth,
            bg: s.backgroundColor,
            colour: s.color,
            radius: s.borderTopLeftRadius,
            touch: s.touchAction,
            face: s.fontFamily.indexOf('Raleway') === 0,
            size: s.fontSize,
        };
    });
    check('the button is at least a 44px tap target', geom.height >= 44, true);
    check('… inside the page, with no sideways overflow', geom.inside, true);
    check('… and follows the site button spec',
        [geom.bg, geom.colour, geom.radius, geom.size, geom.face],
        ['rgb(0, 107, 207)', 'rgb(255, 255, 255)', '30px', '20px', true]);
    check('… with a declared gesture, so iOS does not wait for a double tap',
        geom.touch, 'manipulation');

    await ctx.close();
    await browser.close();
    console.log(failures ? `\n${failures} failing` : '\nall passing');
    process.exit(failures ? 1 : 0);
})();
