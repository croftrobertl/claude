/**
 * v0.35.0 — ITEMS 3a AND 3b IN A REAL BROWSER.
 *
 *     node tests/layout-fields/browser.js            # the source
 *     DCC_MIN=1 node tests/layout-fields/browser.js  # the built bundle
 *
 * WHAT IS CONSTRUCTED, not asserted in prose:
 *   - the tokens land on the real fields, and NOT on mphb_address1;
 *   - Enter on the last field does NOT submit — one of the brief's twelve
 *     required mutations is "Done submitting the form", so the form's submit
 *     is recorded and must never fire;
 *   - Enter on any other field does not submit either, and moves focus to the
 *     next VISIBLE field — the other required mutation here is "Next skipping
 *     a revealed Guest 2 or dog field", so a folded panel is opened mid-test
 *     and the chain must pick the new fields up;
 *   - which field says "done" follows what is visible, so opening a panel
 *     moves it;
 *   - a folded field is never focused;
 *   - nothing records a DOM mutation while the guest types or presses keys.
 *
 * THE FIXTURE IS THE CHECKOUT'S SHAPE, NOT A CAPTURE — /submit-booking/ needs
 * a live reservation. The field names are the ones PHP hands over, and the
 * folded panels use the plugin's own `display: none !important` hide classes,
 * which is how every panel on the real checkout is hidden. v0.9.0 applies:
 * replace it when real markup is available.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PLUGIN = path.join(__dirname, '..', '..', 'dcc-custom-checkout');
const MIN = !!process.env.DCC_MIN;
const JS = fs.readFileSync(path.join(PLUGIN, 'assets', MIN ? 'layout.min.js' : 'layout.js'), 'utf8');
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

/* What PHP produces; the PHP suite is what proves it produces this. */
const TOKENS = {
    'mphb_first_name': 'given-name',
    'mphb_last_name': 'family-name',
    'mphb_phone': 'tel',
    'mphb_email': 'email',
    'mphb_apartment-units': 'address-line2',
    'mphb_city': 'address-level2',
    'mphb_state': 'address-level1',
    'mphb_zip': 'postal-code',
    'mphb_country': 'country',
    'mphb_guest2_first_name': 'section-guest2 given-name',
    'mphb_guest2_last_name': 'section-guest2 family-name',
    'mphb_guest2_phone': 'section-guest2 tel',
    'mphb_guest3_first_name': 'section-guest3 given-name',
    'mphb_guest3_last_name': 'section-guest3 family-name',
};

const page_html = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>checkout</title><style>${CSS}</style></head>
<body><div class="mphb_sc_checkout">
  <form class="mphb_sc_checkout-form" method="post" action="/submit-booking/">
    <p><input type="text" name="mphb_first_name"></p>
    <p><input type="text" name="mphb_last_name"></p>
    <p><input type="tel" name="mphb_phone"></p>
    <p><input type="email" name="mphb_email"></p>
    <!-- Google Places owns this one: it must stay autocomplete="off". -->
    <p><input type="text" name="mphb_address1" autocomplete="off"></p>
    <p><input type="text" name="mphb_apartment-units"></p>
    <p><input type="text" name="mphb_city"></p>
    <p><input type="text" name="mphb_state"></p>
    <p><input type="text" name="mphb_zip"></p>
    <p><select name="mphb_country"><option value="">—</option><option value="US">US</option></select></p>

    <!-- A folded panel, hidden exactly as the real checkout hides one. -->
    <div class="dcc_checkout-section dcc_checkout-guest2-section dcc_checkout-section-hidden" id="g2">
      <p><input type="text" name="mphb_guest2_first_name"></p>
      <p><input type="text" name="mphb_guest2_last_name"></p>
      <p><input type="tel" name="mphb_guest2_phone"></p>
    </div>
    <div class="dcc_checkout-section dcc_checkout-section-hidden" id="dog">
      <p><input type="text" name="mphb_dog_type"></p>
    </div>

    <p><textarea name="mphb_note"></textarea></p>
    <p><input type="file" name="mphb_upload_id"></p>
    <p><button type="submit" id="go">Book Now</button></p>
  </form>
</div>
<script>
  window.DCC_LAYOUT = ${JSON.stringify({ autocomplete: TOKENS, placesField: 'mphb_address1' })};
  /* Record a submit rather than letting it navigate: "Done must never submit"
     is only evidence if an attempt would have been seen. */
  window.__submits = 0;
  document.addEventListener('submit', function (e) { window.__submits++; e.preventDefault(); }, true);
</script>
<script>${JS}</script>
</body></html>`;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
    });
    const page = await ctx.newPage();
    await page.setContent(page_html);

    /* ===================================================================== *
     * 3a — the tokens
     * ===================================================================== */
    const tokens = await page.evaluate(() => {
        const out = {};
        document.querySelectorAll('[name]').forEach((el) => {
            out[el.name] = el.getAttribute('autocomplete');
        });
        return out;
    });

    check('the contact fields carry the tokens a phone understands', {
        first: tokens['mphb_first_name'], last: tokens['mphb_last_name'],
        phone: tokens['mphb_phone'], email: tokens['mphb_email'],
    }, { first: 'given-name', last: 'family-name', phone: 'tel', email: 'email' });

    check('the address fields too', {
        unit: tokens['mphb_apartment-units'], city: tokens['mphb_city'],
        state: tokens['mphb_state'], zip: tokens['mphb_zip'], country: tokens['mphb_country'],
    }, {
        unit: 'address-line2', city: 'address-level2',
        state: 'address-level1', zip: 'postal-code', country: 'country',
    });

    /* THE REQUIRED MUTATION: an autocomplete token on mphb_address1. */
    check('mphb_address1 is STILL autocomplete="off" — Google Places owns it',
        tokens['mphb_address1'], 'off');

    check('a folded guest field is described too, so autofill works when it opens',
        tokens['mphb_guest2_first_name'], 'section-guest2 given-name');

    /* ===================================================================== *
     * 3b — Next, then Done
     * ===================================================================== */
    const keys = await page.evaluate(() => {
        const out = {};
        document.querySelectorAll('[name]').forEach((el) => {
            out[el.name] = el.getAttribute('enterkeyhint');
        });
        return out;
    });

    check('every typed field says "next"', {
        first: keys['mphb_first_name'], phone: keys['mphb_phone'],
        city: keys['mphb_city'], state: keys['mphb_state'],
    }, { first: 'next', phone: 'next', city: 'next', state: 'next' });

    check('the LAST visible one says "done"', keys['mphb_zip'], 'done');
    check('a field in a folded panel does not say "done"',
        keys['mphb_guest2_phone'], 'next');
    check('the note and the file input are not in the chain at all',
        [keys['mphb_note'], keys['mphb_upload_id']], [null, null]);
    check('and neither is a select — select-list.js owns those (0.34.1)',
        keys['mphb_country'], null);

    /* Enter in the middle: focus moves on, and NOTHING is submitted. */
    await page.focus('[name="mphb_first_name"]');
    await page.keyboard.press('Enter');
    check('Enter moves to the next field',
        await page.evaluate(() => document.activeElement.name), 'mphb_last_name');
    check('… and does not submit', await page.evaluate(() => window.__submits), 0);

    /* Enter must SKIP the folded panel rather than focusing into it: focusing
       a field inside display:none does nothing on iOS, and the guest is left
       looking at a page that did not move. */
    await page.focus('[name="mphb_zip"]');
    await page.keyboard.press('Enter');
    const afterLast = await page.evaluate(() => ({
        active: document.activeElement.name || document.activeElement.tagName,
        submits: window.__submits,
    }));
    /* THE REQUIRED MUTATION: Done submitting the form. */
    check('Done on the last visible field does NOT submit', afterLast.submits, 0);
    check('… and closes the keyboard rather than focusing a folded field',
        afterLast.active, 'BODY');

    /* ===================================================================== *
     * The panel opens: the chain and the "done" field follow it
     * ===================================================================== */
    await page.evaluate(() => {
        document.getElementById('g2').classList.remove('dcc_checkout-section-hidden');
        /* The hints are refreshed off `change`, which is the event checkout.js
           itself reacts to — so the page is told the same way it would be. */
        document.querySelector('form').dispatchEvent(new Event('change', { bubbles: true }));
    });

    const reKeys = await page.evaluate(() => ({
        zip: document.querySelector('[name="mphb_zip"]').getAttribute('enterkeyhint'),
        g2phone: document.querySelector('[name="mphb_guest2_phone"]').getAttribute('enterkeyhint'),
    }));
    check('opening a panel moves "done" to its last field', reKeys.g2phone, 'done');
    check('… and the field that used to say "done" says "next" again', reKeys.zip, 'next');

    /* THE REQUIRED MUTATION: Next skipping a revealed Guest 2 field. */
    await page.focus('[name="mphb_zip"]');
    await page.keyboard.press('Enter');
    check('Next from the last address field now reaches the revealed Guest 2 field',
        await page.evaluate(() => document.activeElement.name), 'mphb_guest2_first_name');

    await page.focus('[name="mphb_guest2_first_name"]');
    await page.keyboard.press('Enter');
    check('… and walks through the panel in order',
        await page.evaluate(() => document.activeElement.name), 'mphb_guest2_last_name');

    /* The dog panel is still folded, so the chain stops at Guest 2's phone. */
    await page.focus('[name="mphb_guest2_phone"]');
    await page.keyboard.press('Enter');
    check('the still-folded dog field is never focused',
        await page.evaluate(() => document.activeElement.name || document.activeElement.tagName), 'BODY');
    check('nothing has been submitted at any point',
        await page.evaluate(() => window.__submits), 0);

    /* And once the dog panel opens, it joins the chain. */
    await page.evaluate(() => {
        document.getElementById('dog').classList.remove('dcc_checkout-section-hidden');
        document.querySelector('form').dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.focus('[name="mphb_guest2_phone"]');
    await page.keyboard.press('Enter');
    check('a revealed dog field joins the chain',
        await page.evaluate(() => document.activeElement.name), 'mphb_dog_type');
    check('… and it is the one that now says "done"',
        await page.evaluate(() => document.querySelector('[name="mphb_dog_type"]').getAttribute('enterkeyhint')), 'done');

    /* ===================================================================== *
     * THE BROWSER'S OWN REFUSAL TO TOKEN THE PLACES FIELD.
     *
     * PHP removes that field from the map, so on a real page the browser half
     * never sees it and mutation lf-places-not-skipped-in-js SURVIVED: an
     * equivalent mutant, because the only input it guards against could not
     * arrive. The belt exists for the day the map DOES carry it — a future
     * change to the map, or a filter on the localized data — so the config is
     * handed that field here deliberately.
     * ===================================================================== */
    const belted = await (async () => {
        const forced = page_html.replace(
            'window.DCC_LAYOUT = ' + JSON.stringify({ autocomplete: TOKENS, placesField: 'mphb_address1' }),
            'window.DCC_LAYOUT = ' + JSON.stringify({
                autocomplete: Object.assign({}, TOKENS, { 'mphb_address1': 'address-line1' }),
                placesField: 'mphb_address1',
            })
        );
        const p2 = await ctx.newPage();
        await p2.setContent(forced);
        const got = await p2.evaluate(() => ({
            places: document.querySelector('[name="mphb_address1"]').getAttribute('autocomplete'),
            /* The guard on this case: the rest of the map still applied, so a
               page that simply failed to run would not pass. */
            first: document.querySelector('[name="mphb_first_name"]').getAttribute('autocomplete'),
        }));
        await p2.close();
        return got;
    })();
    check('even a map that CARRIES mphb_address1 leaves it autocomplete="off"',
        belted.places, 'off');
    check('… and the rest of the map still applied (the guard on that)',
        belted.first, 'given-name');

    /* ===================================================================== *
     * Tap rules: typing and pressing keys write nothing
     * ===================================================================== */
    await page.evaluate(() => {
        window.__muts = 0;
        new MutationObserver((rs) => { window.__muts += rs.length; })
            .observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    });
    await page.fill('[name="mphb_first_name"]', 'Ada');
    await page.focus('[name="mphb_first_name"]');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    check('typing and pressing the key record NO DOM mutations (0.18.0)',
        await page.evaluate(() => window.__muts), 0);

    /* The button still submits — Enter is the only thing that changed. */
    await page.click('#go');
    check('the Submit button still submits',
        await page.evaluate(() => window.__submits), 1);

    await ctx.close();
    await browser.close();
    console.log(failures ? `\n${failures} failing` : '\nall passing');
    process.exit(failures ? 1 : 0);
})();
