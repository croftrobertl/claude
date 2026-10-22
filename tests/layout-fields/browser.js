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

const page_html = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>checkout</title><style>${CSS}</style></head>
<body class="dcc_layout"><div class="mphb_sc_checkout">
  <form class="mphb_sc_checkout-form" method="post" action="/submit-booking/">
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
    <p><button type="submit" id="go">Book Now</button></p>
  </form>
</div>
<script>
  window.DCC_LAYOUT = ${JSON.stringify({
      autocomplete: TOKENS,
      placesField: 'mphb_address1',
      segmented: SEGMENTED,
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
            touch: getComputedStyle(first).touchAction,
            /* The chosen one reads as chosen. */
            chosenBg: (() => {
                const on = document.querySelector('.dcc_layout-segment__radio:checked');
                return on ? getComputedStyle(on.closest('label')).backgroundColor : null;
            })(),
        };
    });
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
            JSON.stringify({ autocomplete: TOKENS, placesField: 'mphb_address1', segmented: SEGMENTED }),
            JSON.stringify({
                autocomplete: Object.assign({}, TOKENS, { 'mphb_address1': 'address-line1' }),
                placesField: 'mphb_address1',
                segmented: SEGMENTED,
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
       check above covers on its own terms). */
    await page.evaluate(() => document.getElementById('go').click());
    check('the Submit button still submits',
        await page.evaluate(() => window.__submits), 1);

    await ctx.close();
    await browser.close();
    console.log(failures ? `\n${failures} failing` : '\nall passing');
    process.exit(failures ? 1 : 0);
})();
