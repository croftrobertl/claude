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
    welcome: 'Welcome Back. We Kept Your Answers. Please add your photo ID again.',
    startOver: 'Start Over',
};

function cfg(stay) {
    return JSON.stringify({
        stay: stay || {},
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
<body><div class="mphb_sc_checkout">
  <p class="mphb-errors-wrapper">Check-in date is not valid. Check-out date is not valid.</p>
</div>
<script>window.DCC_RESTORE = ${cfg(null)};</script>
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
            heading: (c.querySelector('h2') || {}).textContent,
            text: c.textContent,
            photo: !!c.querySelector('.dcc_checkout-continue__photo'),
            alt: (c.querySelector('.dcc_checkout-continue__photo') || {}).alt,
            action: (c.querySelector('form') || {}).action,
            method: (c.querySelector('form') || {}).method,
            inputs: inputs,
            first: host.firstElementChild === c,
            deadEndHidden: getComputedStyle(document.querySelector('.mphb-errors-wrapper')).display,
        };
    });

    check('a card is drawn where MotoPress drew no form', card !== null, true);
    check('it is the FIRST thing in the content, above the dead end', card.first, true);
    check('it says Continue Your Booking', card.heading, 'Continue Your Booking');
    check('it names the cottage and the dates',
        [card.text.indexOf('Test Cottage') !== -1, card.text.indexOf('Nov 16') !== -1],
        [true, true]);
    check('it shows the cottage\'s photo, with its name as the alt text',
        [card.photo, card.alt], [true, 'Test Cottage']);
    check('MotoPress\'s dead-end message is hidden behind it', card.deadEndHidden, 'none');

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
            heading: c && (c.querySelector('h2') || {}).textContent,
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
                heading: c && (c.querySelector('h2') || {}).textContent,
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
