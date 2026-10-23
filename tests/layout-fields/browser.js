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
const CSS = fs.readFileSync(path.join(PLUGIN, 'assets', MIN ? 'checkout.min.css' : 'checkout.css'), 'utf8')
    + fs.readFileSync(path.join(PLUGIN, 'assets', MIN ? 'checkout-layout.min.css' : 'checkout-layout.css'), 'utf8');

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

/* What Layout_Script::segmented() produces; its own suite proves that. */
const SEGMENTED = [
    { match: 'suffix', name: '[adults]', label: 'Number of Guests' },
    { match: 'exact', name: 'mphb_dog_hair', label: 'Coat' },
    { match: 'exact', name: 'mphb_boat', label: 'Boat Or Trailer' },
];

const COUPON = { field: 'mphb_coupon_code', reveal: 'Have A Coupon Code?' };
const UPLOAD = {
    field: 'mphb_upload_id',
    ready: 'Ready',
    change: 'Change',
    document: 'Document',
    units: ['bytes', 'KB', 'MB'],
};

const BAR = {
    next: 'Next: %s',
    submit: 'Submit Booking',
    allSet: 'All Set',
    updating: 'Updating…',
    attention: '%s Need Attention',
    showMe: 'Show Me ↑ %1$s Of %2$s',
    total: 'Total',
};

const SUMMARY = { title: 'Your Stay', dates: 'Mon, Nov 16 → Thu, Nov 19 · 3 Nights' };

const page_html = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>checkout</title>
<style>
  /* THE THEME'S OWN RULES, which the plugin's stylesheets do not carry and
     this fixture did not either — so the "the clipping is removed" and "the
     phone's clipping is untouched" assertions were both vacuous until these
     were added: main.main simply had no overflow rule and read visible at
     every width. Bravada's clipping (Director: both boxes are overflow:
     hidden) and the matrix3d transform on the article. Loaded BEFORE the
     plugin's CSS, as on the real page. */
  main.main { overflow: hidden; }
  div.one-column { overflow: hidden; }
  article.hentry { transform: matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1); }
</style>
<style>${CSS}</style></head>
<body class="dcc_layout">
<!-- The page's real shape around the form (Director's measurements): the
     article carries Bravada's matrix3d transform, which makes it the
     containing block for any position:fixed inside it - a fixed box there
     was measured 2,156px off-screen — and both ancestors clip overflow. -->
<main class="main"><div class="one-column"><article class="hentry">
<div class="mphb_sc_checkout">
  <form class="mphb_sc_checkout-form dcc_checkout-preflight" method="post" action="/submit-booking/">
    <!-- The accommodation block, with the guest chooser: the control that
         reveals the guest panels. On the real checkout it is ABOVE the
         customer details, which is the whole reason item 2 has anything to
         do — checkout.js stacks the panels after the customer block, so they
         appear a long way from the answer that revealed them. -->
    <div class="mphb-room-details">
      <p class="mphb-adults-wrapper"><label>Number of Guests
        <select name="mphb_room_details[0][adults]">
          <option value="">— Select —</option>
          <option value="1">1</option><option value="2">2</option>
          <option value="3">3</option><option value="4">4</option>
        </select></label></p>
    </div>
    <div class="mphb-customer-details" id="customer">
    <p><label>First Name <input type="text" name="mphb_first_name" required></label></p>
    <p><input type="text" name="mphb_last_name"></p>
    <p><label>Phone <input type="tel" name="mphb_phone" required></label></p>
    <p><input type="email" name="mphb_email"></p>
    <!-- Google Places owns this one: it must stay autocomplete="off". -->
    <p><input type="text" name="mphb_address1" autocomplete="off"></p>
    <p><input type="text" name="mphb_apartment-units"></p>
    <p><input type="text" name="mphb_city"></p>
    <p><input type="text" name="mphb_state"></p>
    <p><input type="text" name="mphb_zip"></p>
    <p><select name="mphb_country"><option value="">—</option><option value="US">US</option></select></p>

    </div><!-- /.mphb-customer-details -->

    <!-- The per-guest panels AS checkout.js LEAVES THEM: built sections,
         carrying the rows it moved in from MotoPress's own markup, stacked
         after the customer block and hidden by its own hide class. This is a
         stand-in for checkout.js's output, not a capture of /submit-booking/
         (which needs a live reservation); the ordering assertion below loads
         nothing of checkout.js, so what it proves is this placement, given
         that shape. -->
    <section class="mphb-checkout-section dcc_checkout-section dcc_checkout-guest-section dcc_checkout-guest2-section dcc_checkout-section-hidden" id="g2">
      <h3 class="dcc_checkout-section-title">Guest #2 Information</h3>
      <p><input type="text" name="mphb_guest2_first_name"></p>
      <p><input type="text" name="mphb_guest2_last_name"></p>
      <p><input type="tel" name="mphb_guest2_phone"></p>
    </section>
    <section class="mphb-checkout-section dcc_checkout-section dcc_checkout-guest-section dcc_checkout-guest3-section dcc_checkout-section-hidden" id="g3">
      <h3 class="dcc_checkout-section-title">Guest #3 Information</h3>
      <p><input type="text" name="mphb_guest3_first_name"></p>
      <p><input type="text" name="mphb_guest3_last_name"></p>
    </section>
    <!-- Pet Information, as checkout.js leaves it: the question FIRST, its
         follow-ups under it, the whole section folded away until "Yes".
         Nothing in item 2 moves this — it is already what Rob asked for. -->
    <section class="mphb-checkout-section dcc_checkout-section dcc_checkout-pet-section" id="pet">
      <h3 class="dcc_checkout-section-title">Pet Information</h3>
      <!-- checkout.js's own pet block: a real fieldset of Yes/No radios. Item
           3 STYLES this and must never rebuild it — it is the control that
           applies the pet fee. -->
      <fieldset class="dcc_checkout-pet" id="petq">
        <legend class="dcc_checkout-pet__legend">Traveling with a dog?</legend>
        <div class="dcc_checkout-pet__toggle">
          <label><input type="radio" name="dcc_checkout_dog" value="no" checked><span>No</span></label>
          <label><input type="radio" name="dcc_checkout_dog" value="yes"><span>Yes</span></label>
        </div>
      </fieldset>
      <p class="dcc_checkout-section-hidden"><input type="text" name="mphb_dog_type"></p>
      <p><label>Coat <select name="mphb_dog_hair">
        <option value="">— Select —</option>
        <option value="short">Short</option>
        <option value="medium">Medium</option>
        <option value="long">Long</option>
      </select></label></p>
    </section>
    <p><label>Bringing a boat or trailer? <select name="mphb_boat">
      <option value="">— Select —</option>
      <option value="No">No</option>
      <option value="Yes">Yes</option>
    </select></label></p>
    <!-- Country: ~200 options on the real page, so it stays a drawn list and
         must NOT be segmented. -->
    <p><label>Country <select name="mphb_country_select">
      <option value="">—</option>
      <option value="US">United States</option><option value="CA">Canada</option>
      <option value="GB">United Kingdom</option><option value="FR">France</option>
      <option value="DE">Germany</option><option value="IT">Italy</option>
      <option value="ES">Spain</option>
    </select></label></p>

    <p><textarea name="mphb_note"></textarea></p>
    <p><input type="file" name="mphb_upload_id"></p>
    <!-- MotoPress's own coupon field, where MotoPress puts it. Item 4 folds
         it behind a link and moves nothing. The message span is where an
         "applied"/"invalid" note would land. -->
    <p class="mphb-terms-wrapper"><label>
      <input type="checkbox" name="mphb_accept_terms" value="1" required>
      I've read and accept the Terms &amp; Conditions.</label></p>
    <p class="mphb-coupon-wrapper"><label>Coupon
      <input type="text" name="mphb_coupon_code" value=""></label>
      <span class="mphb-coupon-message"></span></p>
    <!-- MotoPress's price breakdown, as checkout.js leaves it: the last row
         is the total, and its last cell is the amount. The bar COPIES that
         string; it never computes one. -->
    <table class="dcc_checkout-breakdown">
      <tr><td>Cottage</td><td>$499.50</td></tr>
      <tr class="dcc_checkout-breakdown-total"><td>Total</td><td>$649.50</td></tr>
    </table>
    <p><button type="submit" id="go">Book Now</button></p>
  </form>
</div>
</article></div></main>
<script>
  window.DCC_LAYOUT = ${JSON.stringify({
      autocomplete: TOKENS,
      placesField: 'mphb_address1',
      segmented: SEGMENTED,
      coupon: COUPON,
      upload: UPLOAD,
      bar: BAR,
      summary: SUMMARY,
  })};
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
    /* A REAL ORIGIN, because the bar's "Updating…" case opens a real
       XMLHttpRequest at MotoPress's own admin-ajax path — a setContent page
       has no base URL, so a relative URL there is a SyntaxError rather than a
       request. The route answers it without a server. */
    await page.route('**/*', (route) => {
        route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' });
    });
    await page.goto('https://example.test/submit-booking/');
    await page.setContent(page_html);

    /* ===================================================================== *
     * ITEM 2's PLACEMENT IS READ FIRST, BEFORE ANYTHING FIRES A `change`.
     *
     * init() both places the panels AND listens on `change` to re-place them.
     * Item 3's assertions tap a segmented button, which fires `change` on the
     * select — so by the time item 2's block ran, the listener had already
     * done the placing and mutation lf-panels-not-moved (which deletes the
     * call in init) SURVIVED. The snapshot is taken here, at load, where only
     * the init call can have produced it.
     * ===================================================================== */
    const placedAtLoad = await page.evaluate(() => {
        const row = document.querySelector('p.mphb-adults-wrapper');
        const ids = [];
        let at = row;
        while (at && at.nextElementSibling) { at = at.nextElementSibling; ids.push(at.id); }
        return ids;
    });
    check('the panels are under the chooser from the moment the page loads',
        placedAtLoad, ['g2', 'g3']);

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
     * ITEM 3 — SEGMENTED BUTTONS
     * ===================================================================== */
    const seg = await page.evaluate(() => {
        const groups = Array.prototype.map.call(
            document.querySelectorAll('.dcc_layout-segment'),
            (g) => ({
                legend: g.querySelector('legend').textContent.trim(),
                options: Array.prototype.map.call(
                    g.querySelectorAll('.dcc_layout-segment__option .dcc_layout-segment__text'),
                    (t) => t.textContent),
                /* A <fieldset> is not allowed inside a <label>, and a group
                   there would be part of the label's activation area. */
                parentIsLabel: g.parentElement.tagName === 'LABEL',
            })
        );
        return {
            groups: groups,
            /* Which selects were taken, and which were left. */
            taken: Array.prototype.map.call(
                document.querySelectorAll('select[data-dcc-segmented]'), (x) => x.name),
            /* Country has too many options to be a row of buttons: it stays a
               dropdown for select-list.js. */
            country: document.querySelector('[name="mphb_country_select"]')
                .hasAttribute('data-dcc-segmented'),
            /* The dog Yes/No is checkout.js's fieldset and must NOT be
               rebuilt — no segment is made for it. */
            dogRadiosIntact: document.querySelectorAll('input[name="dcc_checkout_dog"]').length,
            dogSegmented: !!document.querySelector('.dcc_layout-segment input[name^="dcc_seg_dcc_checkout_dog"]'),
        };
    });

    check('three dropdowns become segmented sets: guests, coat, boat',
        seg.taken, ['mphb_room_details[0][adults]', 'mphb_dog_hair', 'mphb_boat']);
    check('each is a labelled group, using the page\'s own label text',
        seg.groups.map((g) => g.legend),
        ['Number of Guests', 'Coat', 'Bringing a boat or trailer?']);
    check('the options are the select\'s, without its "— Select —" placeholder',
        seg.groups.map((g) => g.options),
        [['1', '2', '3', '4'], ['Short', 'Medium', 'Long'], ['No', 'Yes']]);
    check('no group is nested inside a <label>',
        seg.groups.map((g) => g.parentIsLabel), [false, false, false]);

    /* THE FIELD'S NAME IS NOT PRINTED TWICE. The original label becomes the
       legend's words, so leaving it showing put "Number of Guests" above
       "Number of Guests" — and the same for Coat and the boat question. */
    const dupes = await page.evaluate(() => {
        const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
        const shown = [];
        document.querySelectorAll('label').forEach((l) => {
            if (!l.offsetParent) { return; }       /* in a folded panel */
            /* A CLIPPED label still has an offsetParent — that is the whole
               point of clipping rather than display:none, so a screen reader
               keeps it. "Shown" has to mean it occupies real space. */
            const r = l.getBoundingClientRect();
            if (r.width <= 1 || r.height <= 1) { return; }
            if (l.closest('.dcc_layout-segment')) { return; }  /* an option */
            shown.push(text(l));
        });
        const legends = Array.prototype.map.call(
            document.querySelectorAll('.dcc_layout-segment__legend'), text);
        return legends.filter((g) => shown.some((s) => s.indexOf(g) === 0));
    });
    check('no segmented field prints its own name twice', dupes, []);
    check('Country keeps its dropdown — too many options to be buttons',
        seg.country, false);
    check('the dog Yes/No is checkout.js\'s own fieldset, styled and never rebuilt',
        [seg.dogRadiosIntact, seg.dogSegmented], [2, false]);

    /* THE BUTTONS DRIVE THE SELECT, and the select is what MotoPress reads. */
    const driven = await page.evaluate(() => {
        const fired = [];
        const sel = document.querySelector('[name="mphb_room_details[0][adults]"]');
        sel.addEventListener('input', () => fired.push('input'));
        sel.addEventListener('change', () => fired.push('change'));
        const three = document.querySelector('.dcc_layout-segment input[value="3"]');
        three.closest('label').click();
        return { value: sel.value, fired: fired, checked: three.checked };
    });
    check('tapping a button sets the real select', [driven.value, driven.checked], ['3', true]);
    check('… and fires its input AND change, so MotoPress re-prices as it does today',
        driven.fired, ['input', 'change']);

    /* AND THE SELECT DRIVES THEM BACK: item 10's restore, checkout.js's
       capping and MotoPress's presets all set the select directly, and a
       one-way binding would leave the guest looking at a stale answer. */
    const back = await page.evaluate(() => {
        const sel = document.querySelector('[name="mphb_room_details[0][adults]"]');
        sel.value = '2';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return Array.prototype.filter.call(
            document.querySelectorAll('.dcc_layout-segment__radio'), (r) => r.checked
        ).map((r) => r.value);
    });
    check('setting the select moves the chosen button', back, ['2']);

    /* The select stays in the form and stays what submits — never disabled,
       never removed (0.22.0's rule for anything carrying money, and 0.34.1's
       for the dropdown list). */
    const submits = await page.evaluate(() => {
        const sel = document.querySelector('[name="mphb_room_details[0][adults]"]');
        const data = new FormData(document.querySelector('form'));
        return {
            disabled: sel.disabled,
            connected: sel.isConnected,
            posted: data.get('mphb_room_details[0][adults]'),
            /* The buttons' own radios are this plugin's, and are allowed to
               submit — the same shape as checkout.js's dcc_checkout_dog. */
            segName: data.has('dcc_seg_mphb_room_details_0__adults_'),
        };
    });
    check('the select still submits its own value, and is never disabled or removed',
        [submits.disabled, submits.connected, submits.posted],
        [false, true, '2']);

    /* AND THE GUEST SEES ONE CONTROL, NOT TWO. The select stays in the form,
       so it has to be imperceptible AND out of the way of a finger: a 1px
       control that still accepted a tap would steal presses at that point.
       `pointer-events: none` is the load-bearing half — mutation
       css-seg-native-visible removed the clip, the opacity and that, and
       survived a suite which asserted none of them. */
    const nativeHidden = await page.evaluate(() => {
        const sel = document.querySelector('[name="mphb_room_details[0][adults]"]');
        const r = sel.getBoundingClientRect();
        const cs = getComputedStyle(sel);
        return {
            small: r.width <= 1 && r.height <= 1,
            opacity: cs.opacity,
            pointer: cs.pointerEvents,
            /* Not display:none and not visibility:hidden — a select hidden
               that way cannot be focused for the browser's own validation
               message, which is why 0.34.1 clips its selects instead. */
            display: cs.display,
            visibility: cs.visibility,
        };
    });
    check('the replaced select is imperceptible and cannot take a tap',
        [nativeHidden.small, nativeHidden.opacity, nativeHidden.pointer],
        [true, '0', 'none']);
    check('… but is not display:none or visibility:hidden, so it can still be focused',
        [nativeHidden.display !== 'none', nativeHidden.visibility], [true, 'visible']);

    /* A CAPPED OPTION IS NOT OFFERED AS A BUTTON, on its own page.
       checkout.js hides the counts above the offered number with `hidden` +
       `dcc_checkout-option-hidden` + `disabled` (0.25.2), and a button for one
       would offer a guest a count the server refuses. The rule mirrors
       select-list.js's shownOptions(), so both halves are pinned.
       A FRESH PAGE, because segments() runs once at init — the first version
       of this case capped the option on the live page and then asserted only
       its own setup, which proved nothing. */
    const cappedPage = await (async () => {
        const html = page_html.replace(
            '<option value="4">4</option>',
            '<option value="4" hidden disabled class="dcc_checkout-option-hidden">4</option>'
        );
        const p2 = await ctx.newPage();
        await p2.setContent(html);
        const got = await p2.evaluate(() => {
            const g = document.querySelector('.dcc_layout-segment');
            return {
                options: Array.prototype.map.call(
                    g.querySelectorAll('.dcc_layout-segment__text'), (t) => t.textContent),
                /* The guard: the group was built at all. */
                built: !!g,
            };
        });
        await p2.close();
        return got;
    })();
    check('a capped guest count gets no button', cappedPage.options, ['1', '2', '3']);
    check('… and the group was built, so the check is not vacuous', cappedPage.built, true);

    /* THE UPPER BOUND, on a cottage with a large capacity. MotoPress renders
       one option per guest the accommodation sleeps, so the bound is what
       stops a big cottage turning the chooser into a wall of buttons. It was
       written as a belt and mutation seg-no-max SURVIVED, because every field
       in the list has four options or fewer — the only long dropdown on the
       page, Country, is not in the list at all, so the bound could never
       decide anything. A capacity-8 cottage is the case that reaches it. */
    const bigPage = await (async () => {
        const html = page_html.replace(
            '<option value="3">3</option><option value="4">4</option>',
            '<option value="3">3</option><option value="4">4</option>' +
            '<option value="5">5</option><option value="6">6</option>' +
            '<option value="7">7</option><option value="8">8</option>'
        );
        const p2 = await ctx.newPage();
        await p2.setContent(html);
        const got = await p2.evaluate(() => ({
            segmented: document.querySelector('[name="mphb_room_details[0][adults]"]')
                .hasAttribute('data-dcc-segmented'),
            /* The guard: the other two sets were still built, so this is the
               bound deciding and not the script failing. */
            groups: document.querySelectorAll('.dcc_layout-segment').length,
        }));
        await p2.close();
        return got;
    })();
    check('a guest chooser with eight counts stays a dropdown, not eight buttons',
        bigPage.segmented, false);
    check('… and the coat and boat sets are still built (the guard)',
        bigPage.groups, 2);

    /* TOO FEW CHOICES IS NOT A SET EITHER: one option is not a choice, and a
       select with nothing but the placeholder must be left to the dropdown
       list rather than becoming a single dead button. */
    const tinyPage = await (async () => {
        const html = page_html.replace(
            /<select name="mphb_boat">[\s\S]*?<\/select>/,
            '<select name="mphb_boat"><option value="">—</option><option value="Yes">Yes</option></select>'
        );
        const p2 = await ctx.newPage();
        await p2.setContent(html);
        const got = await p2.evaluate(() => ({
            segmented: document.querySelector('[name="mphb_boat"]').hasAttribute('data-dcc-segmented'),
            groups: document.querySelectorAll('.dcc_layout-segment').length,
        }));
        await p2.close();
        return got;
    })();
    check('a select with one real choice is left as a dropdown',
        tinyPage.segmented, false);
    check('… and the other two groups are still built', tinyPage.groups, 2);

    /* ROB'S GEOMETRY: 44px targets and a visible focus ring. Both are
       load-bearing — under 44px a thumb misses, and the focus ring is the
       ONLY focus treatment, because the selected option's fill is the site
       blue and a focus style that depended on the fill would vanish on it. */
    const geom = await page.evaluate(() => {
        const opts = Array.prototype.slice.call(
            document.querySelectorAll('.dcc_layout-segment__option'));
        const dog = document.querySelector('.dcc_checkout-pet__toggle label');
        const rect = (el) => el.getBoundingClientRect();
        const first = opts[0];
        first.querySelector('input').focus();
        const focused = getComputedStyle(first);
        return {
            minHeight: Math.min.apply(null, opts.map((o) => Math.round(rect(o).height))),
            minWidth: Math.min.apply(null, opts.map((o) => Math.round(rect(o).width))),
            dogHeight: Math.round(rect(dog).height),
            /* Every option inside the page, no sideways overflow. */
            inside: opts.every((o) => rect(o).left >= 0 &&
                rect(o).right <= document.documentElement.clientWidth),
            outline: [focused.outlineStyle, focused.outlineWidth],
            /* An UNCHOSEN option: the chosen one is filled with the site
               blue and borders to match, which would hide a missing gold. */
            borderWidth: (() => {
                const off = opts.filter((o) => !o.querySelector('input').checked)[0];
                return off ? getComputedStyle(off).borderTopWidth : null;
            })(),
            borderColor: (() => {
                const off = opts.filter((o) => !o.querySelector('input').checked)[0];
                return off ? getComputedStyle(off).borderTopColor : null;
            })(),
            touch: getComputedStyle(first).touchAction,
            /* The chosen one reads as chosen. */
            chosenBg: (() => {
                const on = document.querySelector('.dcc_layout-segment__radio:checked');
                return on ? getComputedStyle(on.closest('label')).backgroundColor : null;
            })(),
        };
    });
    /* THE BORDER IS ASSERTED, because it was silently absent and nothing
       noticed: `--dcc-field-border` is a WIDTH token (2px), not a colour, so
       `border: 2px solid var(--dcc-field-border, …)` was invalid at
       computed-value time and produced NO BORDER AT ALL — on every segmented
       pill, both cards and the bar. The suite read the height and the radius
       and never the border, so it passed; a screenshot is what found it. */
    check('a segmented option has a real border, in the site gold',
        [geom.borderWidth, geom.borderColor], ['2px', 'rgb(244, 218, 98)']);
    check('every segmented option is at least a 44px tap target', geom.minHeight >= 44, true);
    check('… and at least 64px wide, so two or four fit a phone', geom.minWidth >= 64, true);
    check('the dog Yes/No gets the same target size from the same rules',
        geom.dogHeight >= 44, true);
    check('no option overflows the page sideways', geom.inside, true);
    check('a focused option shows a real outline, not a fill change',
        geom.outline, ['solid', '3px']);
    check('… and declares its gesture, so iOS does not wait for a double tap',
        geom.touch, 'manipulation');
    check('the chosen option is filled with the site blue',
        geom.chosenBg, 'rgb(0, 107, 207)');

    /* TAP RULES: choosing an option is one property write on the select and
       one on each radio — no DOM mutation at all. */
    const segMuts = await page.evaluate(() => {
        let n = 0;
        const obs = new MutationObserver((rs) => { n += rs.length; });
        obs.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
        document.querySelector('.dcc_layout-segment input[value="1"]').closest('label').click();
        return new Promise((resolve) => setTimeout(() => { obs.disconnect(); resolve(n); }, 300));
    });
    check('choosing a segmented option records NO DOM mutations (0.18.0)', segMuts, 0);

    /* ===================================================================== *
     * ITEM 2 — the panels sit under the answer that reveals them (picture 1)
     * ===================================================================== */
    const placed = await page.evaluate(() => {
        const row = document.querySelector('p.mphb-adults-wrapper');
        const order = [];
        let at = row;
        while (at && at.nextElementSibling) { at = at.nextElementSibling; order.push(at.id); }
        const g2 = document.getElementById('g2');
        return {
            /* The panels are the chooser's own next siblings, in guest order. */
            after: order,
            /* Still inside the accommodation block, with the chooser. */
            parent: g2.parentElement.className,
            /* MOVED, NOT REBUILT: the inputs are the same nodes, with their
               names and the heading checkout.js gave them. */
            inputs: Array.prototype.map.call(
                g2.querySelectorAll('input'), (i) => i.name),
            heading: g2.querySelector('h3').textContent,
            /* Never duplicated: one node per name in the whole form. */
            dupes: ['mphb_guest2_first_name', 'mphb_guest3_first_name', 'mphb_dog_type']
                .map((n) => document.querySelectorAll('[name="' + n + '"]').length),
            /* And still folded away — moving them reveals nothing. */
            hidden: [
                getComputedStyle(g2).display,
                getComputedStyle(document.getElementById('g3')).display,
            ],
        };
    });

    check('each guest panel is moved directly under the guest chooser, in order',
        placed.after, ['g2', 'g3']);
    check('… into the accommodation block, where the chooser is',
        placed.parent, 'mphb-room-details');
    check('… whole: the same inputs and the heading checkout.js built',
        [placed.inputs, placed.heading],
        [['mphb_guest2_first_name', 'mphb_guest2_last_name', 'mphb_guest2_phone'],
         'Guest #2 Information']);
    check('… and no input is duplicated anywhere in the form', placed.dupes, [1, 1, 1]);
    check('… and the panels are still folded away', placed.hidden, ['none', 'none']);

    /* The dog half needs no move: checkout.js already puts the question above
       its follow-ups inside one section. Asserted so a later change that
       "tidies" it is caught. */
    const petOrder = await page.evaluate(() => {
        const pet = document.getElementById('pet');
        return {
            question: pet.children[1].id,
            followUp: pet.children[2].querySelector('input').name,
            /* The pet section is NOT moved under the chooser. */
            parentIsCustomerBlock: pet.parentElement.className.indexOf('mphb-room-details') === -1,
        };
    });
    check('the dog question stays above its own follow-ups, and is not moved',
        petOrder, { question: 'petq', followUp: 'mphb_dog_type', parentIsCustomerBlock: true });

    /* RUNNING AGAIN MUST WRITE NOTHING. This is the 0.32.1 shape: a mover that
       re-appends whenever a node is not last loops forever once anything else
       touches the DOM, and detaches the focused control every time round. */
    const again = await page.evaluate(() => {
        let records = 0;
        const obs = new MutationObserver((rs) => { records += rs.length; });
        obs.observe(document.body, { childList: true, subtree: true, attributes: true });
        /* A stray DOM change of the kind WordPress's own scripts make, then
           the event the placement listens on. */
        document.body.appendChild(document.createElement('span'));
        document.querySelector('form').dispatchEvent(new Event('change', { bubbles: true }));
        return new Promise((resolve) => setTimeout(() => {
            obs.disconnect();
            /* The stray append is one record; anything more came from us. */
            resolve(records - 1);
        }, 600));
    });
    check('a re-run with the panels already in place writes NOTHING (0.32.1)', again, 0);

    /* A FOCUSED PANEL IS NEVER DETACHED. Out of place and focused, the move
       waits for the guest to leave the field — detaching a focused input
       closes the keyboard on iOS mid-answer. */
    const focusHeld = await page.evaluate(() => {
        const g2 = document.getElementById('g2');
        const field = g2.querySelector('input');
        g2.classList.remove('dcc_checkout-section-hidden');
        /* Put it out of place, then focus it. */
        document.querySelector('form').appendChild(g2);
        field.focus();
        document.querySelector('form').dispatchEvent(new Event('change', { bubbles: true }));
        return new Promise((resolve) => setTimeout(() => resolve({
            stillFocused: document.activeElement === field,
            stillConnected: field.isConnected,
            movedBack: document.querySelector('p.mphb-adults-wrapper').nextElementSibling === g2,
        }), 400));
    });
    check('a focused panel is not moved while it holds focus',
        [focusHeld.stillFocused, focusHeld.stillConnected, focusHeld.movedBack],
        [true, true, false]);

    /* … and it is moved the moment focus leaves. */
    const afterBlur = await page.evaluate(() => {
        document.activeElement.blur();
        return new Promise((resolve) => setTimeout(() => {
            var at = document.querySelector('p.mphb-adults-wrapper');
            var ids = [];
            while (at.nextElementSibling) { at = at.nextElementSibling; ids.push(at.id); }
            resolve(ids);
        }, 300));
    });
    /* AND IN GUEST ORDER, not the order it found them in. The focus case above
       appended Guest 2's panel to the END of the form, so DOM order is now
       [g3, g2]; a placement that trusted the DOM would put Guest 3's panel
       above Guest 2's. */
    check('… moved as soon as focus leaves it, and back into GUEST order',
        afterBlur, ['g2', 'g3']);

    /* ===================================================================== *
     * 3b again, now that the panels sit above the address block: the chain
     * follows DOCUMENT order, which is what "the next visible field" means.
     * ===================================================================== */
    const openKeys = await page.evaluate(() => ({
        zip: document.querySelector('[name="mphb_zip"]').getAttribute('enterkeyhint'),
        g2phone: document.querySelector('[name="mphb_guest2_phone"]').getAttribute('enterkeyhint'),
    }));
    check('with Guest 2 open, "done" is still the last field on the page, not the panel\'s',
        [openKeys.g2phone, openKeys.zip], ['next', 'done']);

    await page.focus('[name="mphb_guest2_phone"]');
    await page.keyboard.press('Enter');
    check('Next walks out of the revealed panel into the address block',
        await page.evaluate(() => document.activeElement.name), 'mphb_first_name');

    await page.focus('[name="mphb_guest2_first_name"]');
    await page.keyboard.press('Enter');
    check('… and through the panel in order first',
        await page.evaluate(() => document.activeElement.name), 'mphb_guest2_last_name');

    /* The dog follow-up is the last thing on the page and still folded, so the
       chain ends at the zip. */
    await page.focus('[name="mphb_zip"]');
    await page.keyboard.press('Enter');
    check('the still-folded dog field is never focused',
        await page.evaluate(() => document.activeElement.name || document.activeElement.tagName), 'BODY');
    check('nothing has been submitted at any point',
        await page.evaluate(() => window.__submits), 0);

    /* Reveal it: being last in document order, it becomes the "done" field. */
    await page.evaluate(() => {
        document.querySelector('[name="mphb_dog_type"]').closest('p')
            .classList.remove('dcc_checkout-section-hidden');
        document.querySelector('form').dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.focus('[name="mphb_zip"]');
    await page.keyboard.press('Enter');
    check('a revealed dog field joins the chain',
        await page.evaluate(() => document.activeElement.name), 'mphb_dog_type');
    check('… and it is the one that now says "done"',
        await page.evaluate(() => document.querySelector('[name="mphb_dog_type"]').getAttribute('enterkeyhint')), 'done');

    /* ===================================================================== *
     * ITEM 4 — the coupon, folded behind a link
     * ===================================================================== */
    const cp = await page.evaluate(() => {
        const field = document.querySelector('[name="mphb_coupon_code"]');
        const row = field.closest('p');
        const link = document.querySelector('.dcc_layout-coupon__reveal');
        return {
            link: link ? link.textContent : null,
            isButton: link ? link.tagName : null,
            /* 0.17.0: an anchor lost 15 of 18 clean taps on the owner's
               iPhone where a <button> lost none. */
            bare: link ? link.classList.contains('dcc_checkout-bare-button') : null,
            expanded: link ? link.getAttribute('aria-expanded') : null,
            rowHidden: getComputedStyle(row).display,
            /* The field is MotoPress's and stays where MotoPress put it. */
            stillInRow: row.contains(field),
            /* And still submits — it is simply empty while folded. */
            inForm: field.isConnected && !field.disabled,
            beforeRow: link && link.nextElementSibling === row,
        };
    });
    check('a link offers the coupon field, and it is a real button', 
        [cp.link, cp.isButton, cp.bare], ['Have A Coupon Code?', 'BUTTON', true]);
    check('the field is folded away to start with',
        [cp.rowHidden, cp.expanded], ['none', 'false']);
    check('… the field is MotoPress\'s own, left in its row and still submitting',
        [cp.stillInRow, cp.inForm], [true, true]);
    check('… and the link sits directly above it', cp.beforeRow, true);

    const opened = await page.evaluate(() => {
        const link = document.querySelector('.dcc_layout-coupon__reveal');
        link.click();
        const row = document.querySelector('[name="mphb_coupon_code"]').closest('p');
        return {
            display: getComputedStyle(row).display,
            expanded: link.getAttribute('aria-expanded'),
            focused: document.activeElement.name,
            /* Remembered on the FORM, so a re-render cannot fold it away. */
            remembered: document.querySelector('form').getAttribute('data-dcc-coupon-open'),
        };
    });
    check('tapping the link reveals the field and puts the cursor in it',
        [opened.display, opened.expanded, opened.focused], ['block', 'true', 'mphb_coupon_code']);
    check('… and the page remembers it is open, so a re-render cannot fold it away',
        opened.remembered, '1');

    const closed = await page.evaluate(() => {
        document.querySelector('.dcc_layout-coupon__reveal').click();
        return getComputedStyle(document.querySelector('[name="mphb_coupon_code"]').closest('p')).display;
    });
    check('tapping again folds it back', closed, 'none');

    /* A COUPON THAT HAS BEEN APPLIED MUST NOT HIDE. Two separate reasons to
       start open, each on its own page: the field carries a value, and the row
       is showing a message. */
    for (const [label, mutate] of [
        ['the field already has a code', (h) => h.replace(
            '<input type="text" name="mphb_coupon_code" value="">',
            '<input type="text" name="mphb_coupon_code" value="SPRING">')],
        ['the row is showing a message', (h) => h.replace(
            '<span class="mphb-coupon-message"></span>',
            '<span class="mphb-coupon-message">Coupon applied.</span>')],
    ]) {
        const p2 = await ctx.newPage();
        await p2.setContent(mutate(page_html));
        const state = await p2.evaluate(() => ({
            display: getComputedStyle(
                document.querySelector('[name="mphb_coupon_code"]').closest('p')).display,
            expanded: document.querySelector('.dcc_layout-coupon__reveal').getAttribute('aria-expanded'),
        }));
        await p2.close();
        check('the coupon starts OPEN when ' + label, [state.display, state.expanded], ['block', 'true']);
    }

    /* ===================================================================== *
     * ITEM 5 — the photo ID after choosing a file (picture 2)
     * ===================================================================== */

    /* Nothing is shown until a file is chosen. */
    check('no ID card is shown before a file is chosen',
        await page.evaluate(() => document.querySelector('.dcc_layout-id').hidden), true);

    /* A real image, through the real file input: Playwright hands the browser
       an actual File, so createObjectURL and the <img> are exercised rather
       than modelled. */
    const PNG = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/0EB/wAAAABJRU5ErkJggg==',
        'base64');
    await page.setInputFiles('input[type="file"]', {
        name: 'passport.png', mimeType: 'image/png', buffer: PNG,
    });
    /* The thumbnail appears on the image's own `load`, so it is waited for
       rather than assumed — and the wait is what would fail if the preview
       were never drawn. */
    await page.waitForFunction(
        () => !!document.querySelector('.dcc_layout-id__image, .dcc_layout-id__doc'),
        null, { timeout: 4000 });
    const shown = await page.evaluate(() => {
        const box = document.querySelector('.dcc_layout-id');
        const img = box.querySelector('.dcc_layout-id__image');
        return {
            hidden: box.hidden,
            name: (box.querySelector('.dcc_layout-id__name') || {}).textContent,
            size: (box.querySelector('.dcc_layout-id__size') || {}).textContent,
            ready: (box.querySelector('.dcc_layout-id__ready') || {}).textContent,
            change: (box.querySelector('.dcc_layout-id__change') || {}).textContent,
            img: img ? { blob: img.src.indexOf('blob:') === 0, decoding: img.decoding,
                         w: img.width, h: img.height } : null,
            doc: !!box.querySelector('.dcc_layout-id__doc'),
            /* MotoPress's input is untouched: still there, still a file
               input, still carrying the file. */
            input: (() => {
                const i = document.querySelector('input[type="file"]');
                return [i.isConnected, i.disabled, i.files.length];
            })(),
        };
    });
    check('choosing a file shows the card, with the name, the size and Ready',
        [shown.hidden, shown.name, shown.size, shown.ready, shown.change],
        [false, 'passport.png', PNG.length + ' bytes', '✓ Ready', 'Change']);
    check('a drawable image is previewed from the file itself, decoded async at thumbnail size',
        shown.img, { blob: true, decoding: 'async', w: 64, h: 64 });
    check('… and no document icon is shown for it', shown.doc, false);
    check('MotoPress\'s own file input is untouched and still holds the file',
        shown.input, [true, false, 1]);

    /* THE OBJECT URL IS REVOKED ON EVERY CHANGE, and that is a memory claim,
       so it is constructed rather than asserted in prose: each
       createObjectURL pins the whole file until it is revoked, and a guest who
       picks three photos on a phone would otherwise hold three of them, on the
       device with the least memory to spare, while paying.
       URL.revokeObjectURL is resolved at call time, so wrapping it here
       records what the script really does next. */
    await page.evaluate(() => {
        window.__revoked = [];
        const real = URL.revokeObjectURL.bind(URL);
        URL.revokeObjectURL = function (u) { window.__revoked.push(u); return real(u); };
        window.__firstUrl = document.querySelector('.dcc_layout-id__image').src;
    });
    await page.setInputFiles('input[type="file"]', {
        name: 'second.png', mimeType: 'image/png', buffer: PNG,
    });
    await page.waitForFunction(
        () => !!document.querySelector('.dcc_layout-id__image, .dcc_layout-id__doc'),
        null, { timeout: 4000 });
    const revoked = await page.evaluate(() => ({
        revoked: window.__revoked,
        first: window.__firstUrl,
        nowShowing: document.querySelector('.dcc_layout-id__name').textContent,
        /* The new preview is a DIFFERENT blob, so the first really was let go
           rather than reused. */
        newUrl: document.querySelector('.dcc_layout-id__image').src,
    }));
    check('choosing another file revokes the previous object URL',
        revoked.revoked, [revoked.first]);
    check('… and shows the new one instead',
        [revoked.nowShowing, revoked.newUrl !== revoked.first], ['second.png', true]);

    /* Clearing the selection hides the card and lets the last file go too. */
    const cleared = await page.evaluate(() => {
        const input = document.querySelector('input[type="file"]');
        const before = window.__revoked.length;
        input.value = '';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return { hidden: document.querySelector('.dcc_layout-id').hidden,
                 revokedMore: window.__revoked.length > before };
    });
    check('clearing the file hides the card and revokes the last URL',
        [cleared.hidden, cleared.revokedMore], [true, true]);

    /* A PDF — or any file the browser cannot draw — gets the document icon.
       Decided by the image FAILING, not by sniffing the name. */
    const PDF = Buffer.from('%PDF-1.4 not really');
    await page.setInputFiles('input[type="file"]', {
        name: 'scan.pdf', mimeType: 'application/pdf', buffer: PDF,
    });
    await page.waitForFunction(() => !!document.querySelector('.dcc_layout-id__doc'), null, { timeout: 4000 })
        .catch(() => {});
    const asDoc = await page.evaluate(() => {
        const box = document.querySelector('.dcc_layout-id');
        return {
            doc: !!box.querySelector('.dcc_layout-id__doc'),
            img: !!box.querySelector('.dcc_layout-id__image'),
            label: (box.querySelector('.dcc_layout-id__doc') || {}).getAttribute
                ? box.querySelector('.dcc_layout-id__doc').getAttribute('aria-label') : null,
            name: (box.querySelector('.dcc_layout-id__name') || {}).textContent,
            size: (box.querySelector('.dcc_layout-id__size') || {}).textContent,
        };
    });
    check('a file the browser cannot draw gets a document icon, not a broken image',
        [asDoc.doc, asDoc.img], [true, false]);
    check('… labelled for a screen reader, with the file still named and sized',
        [asDoc.label, asDoc.name, asDoc.size], ['Document', 'scan.pdf', PDF.length + ' bytes']);

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
            JSON.stringify({ autocomplete: TOKENS, placesField: 'mphb_address1', segmented: SEGMENTED, coupon: COUPON, upload: UPLOAD, bar: BAR, summary: SUMMARY }),
            JSON.stringify({
                autocomplete: Object.assign({}, TOKENS, { 'mphb_address1': 'address-line1' }),
                placesField: 'mphb_address1',
                segmented: SEGMENTED,
                coupon: COUPON,
                upload: UPLOAD,
                bar: BAR,
                summary: SUMMARY,
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
     * ITEM 6 — THE PINNED BAR
     * ===================================================================== */
    const bar = await page.evaluate(() => {
        const b = document.querySelector('.dcc_layout-bar');
        if (!b) { return null; }
        const cs = getComputedStyle(b);
        return {
            /* THE INVARIANT: whenever it is pinned, its parent is <body>.
               Bravada's matrix3d transform on article.hentry would otherwise
               become its containing block — a fixed box inside that article
               was measured 2,156px off-screen. */
            position: cs.position,
            parent: b.parentElement.tagName,
            insideArticle: !!b.closest('article.hentry'),
            /* Copied from MotoPress's own total cell, never computed. */
            amount: b.querySelector('.dcc_layout-bar__amount').textContent,
            label: b.querySelector('.dcc_layout-bar__label').textContent,
            action: b.querySelector('.dcc_layout-bar__action').textContent,
            pagePad: getComputedStyle(document.body).paddingBottom,
            height: Math.round(b.getBoundingClientRect().height),
            atBottom: Math.round(b.getBoundingClientRect().bottom) ===
                Math.round(window.innerHeight),
        };
    });
    check('the bar is pinned, on <body>, outside article.hentry',
        [bar.position, bar.parent, bar.insideArticle], ['fixed', 'BODY', false]);
    check('it sits on the bottom edge', bar.atBottom, true);
    check('the total is COPIED from MotoPress\'s own total cell',
        [bar.label, bar.amount], ['Total', '$649.50']);
    check('the page is padded by the bar\'s measured height',
        bar.pagePad, bar.height + 'px');
    check('the button names the next empty required field',
        bar.action, 'Next: First Name \u2193');

    const jumped = await page.evaluate(() => {
        document.querySelector('.dcc_layout-bar__action').click();
        return document.activeElement.name;
    });
    check('pressing it goes to that field', jumped, 'mphb_first_name');

    await page.fill('[name="mphb_first_name"]', 'Ada');
    check('once filled, the button names the NEXT one',
        await page.evaluate(() => document.querySelector('.dcc_layout-bar__action').textContent),
        'Next: Phone \u2193');

    /* A required field inside a FOLDED panel is never offered: focusing
       inside display:none does nothing on iOS and the page would not move. */
    const folded = await page.evaluate(() => {
        const first = document.getElementById('g3').querySelector('input');
        first.required = true;
        document.querySelector('form').dispatchEvent(new Event('change', { bubbles: true }));
        return document.querySelector('.dcc_layout-bar__action').textContent;
    });
    check('a required field in a folded panel is not offered', folded, 'Next: Phone \u2193');

    const revealed = await page.evaluate(() => {
        document.getElementById('g3').classList.remove('dcc_checkout-section-hidden');
        document.querySelector('form').dispatchEvent(new Event('change', { bubbles: true }));
        return document.querySelector('.dcc_layout-bar__action').textContent;
    });
    check('… and IS offered once the panel opens',
        revealed.indexOf('Guest') !== -1 || revealed.indexOf('mphb_guest3') !== -1, true);

    await page.evaluate(() => {
        const g3 = document.getElementById('g3');
        g3.querySelector('input').required = false;
        g3.classList.add('dcc_checkout-section-hidden');
        document.querySelector('form').dispatchEvent(new Event('change', { bubbles: true }));
    });

    /* "Updating…" WHILE MOTOPRESS IS RE-PRICING, and never a stale number. */
    const updating = await page.evaluate(() => new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/wp-admin/admin-ajax.php?action=mphb_update_checkout_info');
        xhr.addEventListener('loadend', () => {
            setTimeout(() => resolve({
                during: window.__during,
                after: document.querySelector('.dcc_layout-bar__amount').textContent,
            }), 30);
        });
        xhr.send();
        window.__during = document.querySelector('.dcc_layout-bar__amount').textContent;
    }));
    check('the bar says "Updating…" while MotoPress is re-pricing',
        updating.during, 'Updating\u2026');
    check('… and goes back to MotoPress\'s figure afterwards',
        updating.after, '$649.50');

    /* OUT OF THE WAY WHILE THE KEYBOARD IS UP, and while Google Places is
       showing suggestions — the site's Customizer CSS puts .pac-container at
       z-index 99999, so the bar would be UNDER the list the guest is tapping.
       No polling (Rob): focusin/focusout plus visualViewport's resize. */
    const away = await page.evaluate(() => {
        const b = document.querySelector('.dcc_layout-bar');
        const field = document.querySelector('[name="mphb_first_name"]');
        field.focus();
        const typing = getComputedStyle(b).display;
        field.blur();
        return new Promise((resolve) => setTimeout(() => {
            const back = getComputedStyle(b).display;
            const pac = document.createElement('div');
            pac.className = 'pac-container';
            pac.style.cssText = 'position:absolute;top:0;left:0;width:200px;height:120px;';
            document.body.appendChild(pac);
            document.dispatchEvent(new Event('focusin'));
            const withPac = getComputedStyle(b).display;
            pac.remove();
            document.dispatchEvent(new Event('focusin'));
            resolve({ typing, back, withPac, afterPac: getComputedStyle(b).display });
        }, 30));
    });
    check('the bar gets out of the way while a text field has focus', away.typing, 'none');
    check('… and comes back when it does not', away.back, 'flex');
    check('… and hides while the address suggestions are showing', away.withPac, 'none');
    check('… and comes back when they close', away.afterPac, 'flex');

    /* ALL FILLED: Submit, in site blue, with "All Set". The acceptance tick is
       `required` on the real page too, so it is part of "everything filled" —
       and it exercises the checkbox path of the bar's required-field reader,
       which no text field can. */
    await page.fill('[name="mphb_phone"]', '555 0100');
    check('an unticked required checkbox is offered next',
        (await page.evaluate(() => document.querySelector('.dcc_layout-bar__action').textContent))
            .indexOf('Terms') !== -1, true);
    await page.evaluate(() => {
        const t = document.querySelector('[name="mphb_accept_terms"]');
        t.checked = true;
        t.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const ready = await page.evaluate(() => ({
        action: document.querySelector('.dcc_layout-bar__action').textContent,
        note: document.querySelector('.dcc_layout-bar__note').textContent,
        blue: getComputedStyle(document.querySelector('.dcc_layout-bar__action')).backgroundColor,
    }));
    check('with everything filled the bar offers Submit, in site blue, with "All Set"',
        [ready.action, ready.note, ready.blue],
        ['\u2713 Submit Booking', 'All Set', 'rgb(0, 107, 207)']);

    /* NEVER AN ERROR BEFORE SUBMIT (Rob's standing rule). */
    const beforeSubmit = await page.evaluate(() => {
        const f = document.querySelector('[name="mphb_phone"]');
        f.classList.add('dcc_checkout-invalid');
        f.setAttribute('aria-invalid', 'true');
        document.querySelector('form').dispatchEvent(new Event('change', { bubbles: true }));
        return {
            action: document.querySelector('.dcc_layout-bar__action').textContent,
            attention: document.querySelector('.dcc_layout-bar')
                .classList.contains('dcc_layout-bar--attention'),
        };
    });
    check('a flagged field says NOTHING before a submit attempt (Rob\'s rule)',
        [beforeSubmit.action, beforeSubmit.attention], ['\u2713 Submit Booking', false]);

    /* ===================================================================== *
     * ITEM 7 — "Show Me" AFTER a failed submit
     * ===================================================================== */
    const attention = await page.evaluate(() => {
        /* The attempt is what checkout.js's own preflight records, and the
           flags are already on the fields. Nothing here re-validates. */
        document.querySelector('form').classList.remove('dcc_checkout-preflight');
        document.querySelector('[name="mphb_first_name"]').classList.add('dcc_checkout-invalid');
        document.querySelector('form').dispatchEvent(new Event('change', { bubbles: true }));
        const b = document.querySelector('.dcc_layout-bar');
        return {
            note: b.querySelector('.dcc_layout-bar__note').textContent,
            action: b.querySelector('.dcc_layout-bar__action').textContent,
            outlined: getComputedStyle(b.querySelector('.dcc_layout-bar__action')).backgroundColor,
        };
    });
    check('after a failed submit the bar counts what needs attention',
        attention.note, '2 Need Attention');
    check('… and offers Show Me, outlined rather than filled',
        [attention.action, attention.outlined], ['Show Me \u2191 1 Of 2', 'rgb(255, 255, 255)']);

    const walk = [];
    for (let i = 0; i < 3; i++) {
        walk.push(await page.evaluate(() => {
            document.querySelector('.dcc_layout-bar__action').click();
            return [document.activeElement.name,
                    document.querySelector('.dcc_layout-bar__action').textContent];
        }));
    }
    check('each tap jumps to the next flagged field, and wraps round',
        walk, [['mphb_first_name', 'Show Me \u2191 2 Of 2'],
               ['mphb_phone', 'Show Me \u2191 1 Of 2'],
               ['mphb_first_name', 'Show Me \u2191 2 Of 2']]);

    const fixedUp = await page.evaluate(() => {
        document.querySelectorAll('.dcc_checkout-invalid').forEach((el) => {
            el.classList.remove('dcc_checkout-invalid');
            el.removeAttribute('aria-invalid');
        });
        document.querySelector('form').dispatchEvent(new Event('change', { bubbles: true }));
        const b = document.querySelector('.dcc_layout-bar');
        return [b.querySelector('.dcc_layout-bar__action').textContent,
                b.classList.contains('dcc_layout-bar--attention')];
    });
    check('once they are fixed the bar goes back to Submit',
        fixedUp, ['\u2713 Submit Booking', false]);

    /* ===================================================================== *
     * ITEM 8 — THE SUMMARY CARD, AND DESKTOP
     * ===================================================================== */
    const cardPhone = await page.evaluate(() => {
        const c = document.querySelector('.dcc_layout-summary');
        if (!c) { return null; }
        const form = document.querySelector('form');
        return {
            /* INSIDE THE FORM, which is load-bearing: it holds the acceptance
               tick, and a tick outside the form would not submit — which is
               what 0.30.0's acceptance record reads from the request. */
            inForm: form.contains(c),
            tickInForm: (() => {
                const t = document.querySelector('[name="mphb_accept_terms"]');
                return !!(t.form && t.form === form && c.contains(t));
            })(),
            /* What it holds: the dates, MotoPress's own breakdown, the coupon
               link and its field, and the tick. */
            title: (c.querySelector('.dcc_layout-summary__title') || {}).textContent,
            dates: (c.querySelector('.dcc_layout-summary__dates') || {}).textContent,
            breakdown: !!c.querySelector('table.dcc_checkout-breakdown'),
            couponLink: !!c.querySelector('.dcc_layout-coupon__reveal'),
            couponField: !!c.querySelector('[name="mphb_coupon_code"]'),
            tick: !!c.querySelector('[name="mphb_accept_terms"]'),
            /* Everything else is in the sheet, and the sheet is the form's
               first child. */
            sheetFirst: form.firstElementChild.className === 'dcc_layout-sheet',
            firstNameInSheet: !!document.querySelector('.dcc_layout-sheet [name="mphb_first_name"]'),
            /* On a phone the card is simply the last block, which is Rob's own
               section order: Your Stay, About You, Price. */
            lastOnPhone: form.lastElementChild === c,
            /* And the bar is still pinned to <body> here. */
            barParent: document.querySelector('.dcc_layout-bar').parentElement.tagName,
            /* The breakdown table is only one node — it was MOVED, not copied. */
            breakdowns: document.querySelectorAll('table.dcc_checkout-breakdown').length,
            ticks: document.querySelectorAll('[name="mphb_accept_terms"]').length,
        };
    });
    check('the card is inside the form, and so is the acceptance tick it holds',
        [cardPhone.inForm, cardPhone.tickInForm], [true, true]);
    check('it holds the dates, the price, the coupon link and its field, and the tick',
        [cardPhone.title, cardPhone.dates, cardPhone.breakdown,
         cardPhone.couponLink, cardPhone.couponField, cardPhone.tick],
        ['Your Stay', 'Mon, Nov 16 → Thu, Nov 19 · 3 Nights', true, true, true, true]);
    check('everything else is in the sheet, which is the form\'s first child',
        [cardPhone.sheetFirst, cardPhone.firstNameInSheet], [true, true]);
    check('nothing was copied — one breakdown, one tick',
        [cardPhone.breakdowns, cardPhone.ticks], [1, 1]);
    check('on a phone the card is the last block, and the bar stays pinned to <body>',
        [cardPhone.lastOnPhone, cardPhone.barParent], [true, 'BODY']);

    /* AND THE PHONE'S CLIPPING IS UNTOUCHED: the unclipping is gated on
       min-width 900, so nothing about the phone layout changes. */
    check('at phone width the theme\'s overflow is still hidden',
        await page.evaluate(() => [
            getComputedStyle(document.querySelector('main.main')).overflow,
            getComputedStyle(document.querySelector('div.one-column')).overflow,
        ]), ['hidden', 'hidden']);

    /* ---- Desktop, in its own context ---------------------------------- */
    const deskCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const desk = await deskCtx.newPage();
    await desk.route('**/*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
    await desk.goto('https://example.test/submit-booking/');
    await desk.setContent(page_html);

    const deskLayout = await desk.evaluate(() => {
        const form = document.querySelector('form');
        const sheet = document.querySelector('.dcc_layout-sheet');
        const card = document.querySelector('.dcc_layout-summary');
        const bar = document.querySelector('.dcc_layout-bar');
        const sr = sheet.getBoundingClientRect();
        const cr = card.getBoundingClientRect();
        return {
            grid: getComputedStyle(form).display,
            /* The sheet left, the card right, side by side. */
            sideBySide: sr.right <= cr.left + 1 && Math.abs(sr.top - cr.top) < 40,
            /* NO PINNED BAR ON DESKTOP (Rob): it is in the card, in the flow. */
            barPosition: getComputedStyle(bar).position,
            barInCard: card.contains(bar),
            pagePad: getComputedStyle(document.body).paddingBottom,
            /* The clipping is removed HERE, which is what lets sticky work. */
            overflow: [getComputedStyle(document.querySelector('main.main')).overflow,
                       getComputedStyle(document.querySelector('div.one-column')).overflow],
            sticky: getComputedStyle(card).position,
            cardTop: Math.round(cr.top),
            noSideScroll: document.documentElement.scrollWidth <= window.innerWidth,
        };
    });
    check('the form becomes two columns, sheet left and card right',
        [deskLayout.grid, deskLayout.sideBySide], ['grid', true]);
    check('there is NO pinned bar on desktop — it is in the card, in the flow',
        [deskLayout.barPosition, deskLayout.barInCard, deskLayout.pagePad],
        ['static', true, '0px']);
    check('the clipping is removed at this width, which is what lets sticky work',
        deskLayout.overflow, ['visible', 'visible']);
    check('… and no sideways scroll comes of removing it', deskLayout.noSideScroll, true);

    /* THE MEASUREMENT THAT MATTERS: the card stays in view when the page
       scrolls. Measured, because with the theme's clipping in place a sticky
       card scrolls clean away — 1200px down it was at top:-1180px. */
    const stayed = await desk.evaluate(() => {
        const card = document.querySelector('.dcc_layout-summary');
        const before = Math.round(card.getBoundingClientRect().top);
        window.scrollTo(0, 1200);
        return new Promise((resolve) => setTimeout(() => resolve({
            before: before,
            after: Math.round(card.getBoundingClientRect().top),
            scrolled: window.scrollY,
            position: getComputedStyle(card).position,
        }), 60));
    });
    check('the page really scrolled (the guard: otherwise nothing is proven)',
        stayed.scrolled >= 600, true);
    check('the summary card stays in view as the page scrolls',
        [stayed.position, stayed.after >= 0 && stayed.after < 200], ['sticky', true]);

    /* And with the theme's clipping put back, it does NOT — which is what
       makes the unclipping the thing doing the work, rather than a tidy-up. */
    const clippedAgain = await desk.evaluate(() => {
        document.querySelector('main.main').style.setProperty('overflow', 'hidden', 'important');
        document.querySelector('div.one-column').style.setProperty('overflow', 'hidden', 'important');
        window.scrollTo(0, 0);
        window.scrollTo(0, 1200);
        return new Promise((resolve) => setTimeout(() => resolve(
            Math.round(document.querySelector('.dcc_layout-summary').getBoundingClientRect().top)
        ), 60));
    });
    check('with the clipping back, the same card scrolls away (so the unclipping is the fix)',
        clippedAgain < -500, true);

    await deskCtx.close();

    /* ===================================================================== *
     * TAP RULES (v0.18.0), AND WHAT THEY ACTUALLY REQUIRE NOW.
     *
     * The bar's words genuinely change as the guest fills the form — that IS
     * the feature, so "zero mutations while typing" is the wrong rule and this
     * assertion used to encode it. What v0.18.0 established is narrower and
     * sharper: nothing on this checkout may change content AROUND A TAP,
     * because iOS decides click-vs-hover by watching for exactly that. So:
     * typing may write, and only inside the bar; a TOUCH writes nothing.
     * ===================================================================== */
    const typingWrites = await page.evaluate(() => {
        const seen = [];
        const obs = new MutationObserver((rs) => rs.forEach((r) => {
            const node = r.target.nodeType === 3 ? r.target.parentElement : r.target;
            seen.push(node && node.closest('.dcc_layout-bar') ? 'bar' : 'OUTSIDE');
        }));
        obs.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
        const f = document.querySelector('[name="mphb_first_name"]');
        f.value = '';
        f.dispatchEvent(new Event('input', { bubbles: true }));
        f.value = 'Ada';
        f.dispatchEvent(new Event('input', { bubbles: true }));
        return new Promise((resolve) => setTimeout(() => {
            obs.disconnect();
            resolve({ outside: seen.filter((x) => x === 'OUTSIDE').length, total: seen.length });
        }, 200));
    });
    check('typing writes ONLY inside the bar, nowhere else on the page',
        typingWrites.outside, 0);
    check('… and it really did write there (the guard: otherwise this proves nothing)',
        typingWrites.total > 0, true);

    /* A TOUCH WRITES NOTHING, even though the same event would. */
    const touchWrites = await page.evaluate(() => {
        let n = 0;
        const obs = new MutationObserver((rs) => { n += rs.length; });
        obs.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
        document.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));
        const f = document.querySelector('[name="mphb_first_name"]');
        f.value = '';
        f.dispatchEvent(new Event('input', { bubbles: true }));
        return new Promise((resolve) => setTimeout(() => {
            const during = n;
            document.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
            setTimeout(() => { obs.disconnect(); resolve({ during: during, after: n }); }, 700);
        }, 150));
    });
    check('a change asked for while a finger is down writes NOTHING then (0.18.0)',
        touchWrites.during, 0);
    check('… and is written once the tap has had its time',
        touchWrites.after > 0, true);
    await page.fill('[name="mphb_first_name"]', 'Ada');

    /* NOTHING THIS BUILDS MAY COVER THE SUBMIT BUTTON. Playwright refused to
       click it while the fieldset itself was the flex container — the option
       labels overflowed far enough to swallow the press — so the overlap is
       now measured directly, in the suite's FINAL state, rather than left to
       a harness error message that could change meaning. */
    const covering = await page.evaluate(() => {
        const btn = document.getElementById('go').getBoundingClientRect();
        const over = [];
        document.querySelectorAll(
            '.dcc_layout-segment, .dcc_layout-segment__option, .dcc_checkout-pet__toggle label'
        ).forEach((el) => {
            const r = el.getBoundingClientRect();
            const hit = !(r.right < btn.left || r.left > btn.right ||
                          r.bottom < btn.top || r.top > btn.bottom);
            if (hit) { over.push(el.className); }
        });
        return over;
    });
    check('no segmented control overlaps the Submit button', covering, []);

    /* The button still submits — Enter is the only thing that changed. The
       click is dispatched on the element, because what is being asserted is
       that submission still happens, not the browser's hit-testing (which the
       check above covers on its own terms).
       THE REQUIRED FIELDS ARE FILLED FIRST, because the browser's own
       validation refuses to submit a form with an empty required field — and
       that refusal is correct, so the test has to meet it rather than route
       around it with novalidate. */
    await page.evaluate(() => {
        document.querySelector('[name="mphb_first_name"]').value = 'Ada';
        document.querySelector('[name="mphb_phone"]').value = '555 0100';
    });
    await page.evaluate(() => document.getElementById('go').click());
    check('the Submit button still submits',
        await page.evaluate(() => window.__submits), 1);

    /* AND BOTH SUBMIT CONTROLS LOCK AFTER THAT FIRST PRESS (Rob): a double
       submit on a booking form is a double booking, and a guest cannot tell
       they pressed twice when the page does not move. The lock is DEFERRED by
       a task — disabling a submit button inside its own click event cancels
       the submission the browser was about to make, so locking on the spot
       would stop the first press, which is the one that must work. */
    const locked = await page.evaluate(() => new Promise((resolve) => setTimeout(() => resolve({
        native: document.getElementById('go').disabled,
        bar: document.querySelector('.dcc_layout-bar__action').disabled,
    }), 50)));
    check('both Submit controls are locked after the first press',
        [locked.native, locked.bar], [true, true]);

    const twice = await page.evaluate(() => {
        document.getElementById('go').click();
        document.querySelector('.dcc_layout-bar__action').click();
        return window.__submits;
    });
    check('… so a second press sends nothing', twice, 1);

    /* REDUCED MOTION IS RESPECTED (Rob). A guest who has asked their phone to
       stop animating must not be given a smooth scroll. Measured in a context
       that really reports the preference, with scrollIntoView's own argument
       recorded — the only place the choice is visible. */
    for (const [pref, want] of [['reduce', 'auto'], ['no-preference', 'smooth']]) {
        const rctx = await browser.newContext({
            viewport: { width: 390, height: 844 },
            hasTouch: true, isMobile: true, reducedMotion: pref,
        });
        const rp = await rctx.newPage();
        await rp.setContent(page_html.replace(
            '<script>\n  window.DCC_LAYOUT',
            '<script>\n  window.__behaviors = [];\n'
            + '  Element.prototype.scrollIntoView = function (opts) {\n'
            + '    window.__behaviors.push(opts && opts.behavior);\n'
            + '  };\n</script>\n<script>\n  window.DCC_LAYOUT'
        ));
        const got = await rp.evaluate(() => {
            document.querySelector('.dcc_layout-bar__action').click();
            return window.__behaviors;
        });
        await rctx.close();
        check('with prefers-reduced-motion: ' + pref + ', the jump is ' + want, got, [want]);
    }

    await ctx.close();
    await browser.close();
    console.log(failures ? `\n${failures} failing` : '\nall passing');
    process.exit(failures ? 1 : 0);
})();
