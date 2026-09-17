=== DCC Custom Checkout ===
Contributors: doracanalcourt
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 0.22.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Self-contained customizations for the MotoPress Hotel Booking checkout on
doracanalcourt.com. CSS + vanilla JS + WordPress/MotoPress hooks only — it edits
no MotoPress templates and touches no core files. Loads on the checkout page only.

== What it does ==

Part A — Styling (match the "DCC Contact Form" look)
  * Field & dropdown labels set to solid #000.
  * <select> menus given the gold pill (2px #f4da62, 30px radius) + custom caret.
  * Buttons: text-transform:none (so "Submit Booking" / "Apply" read proper-case),
    blue pill kept (#006bcf).
  * Upload helper text calmed to ~13px/400 muted so it stops competing with "Total".
  * Four section headers unified to 25px/700 and underlined.
  * File-field "Choose File" button left corners rounded to sit flush in the pill.
  * Input/select text centred to match the centred labels.
  * Price-breakdown accommodation row: "Cottage N:" stays on line 1, the name
    wraps below (a <br> is inserted after the colon).

Part B — Required-marker cleanup (one JS pass + CSS)
  * The "*" sits immediately after the last letter (no trailing space).
  * The underline covers the words only — never the space or the marker.
  * The dotted underline and the "Required" tooltip are removed; the visible "*"
    stays, coloured #c62828 (accessible).

Part C — Additional-guest details, conditional on guest count
  * Guest 2 (first name, last name, phone) appears at 2+ guests; guests 3 and 4
    (first and last name only) appear at 3+ and 4 guests respectively. Each
    group is its own titled section after "Your Information", shown/hidden and
    made required by the guest dropdown, and validated on submit. A server-side
    backstop (form POST and REST route alike) blocks a submission that leaves a
    visible group's fields blank, so the client rule can't be bypassed.
  * Guests 3/4 need native Checkout Fields (NOT required), created with the
    names guest3_first_name, guest3_last_name, guest4_first_name,
    guest4_last_name — MotoPress renders those as mphb_guest3_first_name etc.
    (see "Checkout Field names" below). Without them the sections simply
    don't render. Field order doesn't matter; the rows are moved into their
    section on load.

Part D — Pet flow + per-night pet fee (native MotoPress Services)
  * Applies to the accommodations selected on the settings page (default:
    Cottage 34, type ID 1607), and only when the pet fee is enabled.
  * The three native pet-service selectors are hidden and replaced by a
    "Traveling with a dog?" toggle (No default / Yes).
  * "Yes" reveals three required info fields: Dog type, Size, Hair length. These
    are NATIVE MotoPress Checkout Fields the owner creates (see setup below) —
    MotoPress submits and saves them; the plugin only shows/hides + requires them
    by the toggle. (MotoPress drops bespoke, non-native inputs from its checkout
    payload, so native fields are required for the data to reach the server.)
  * The correct native Service is auto-applied by length-of-stay bucket:
      1–6 nights  -> Daily   (ID 17712, $25/night)   (from night one since 0.3.5)
      7–29 nights -> Weekly  (ID 17711, $20/night)
      30+ nights  -> Monthly (ID 14926, $10/night)
    so Price Breakdown / Total / Tax update natively (the fee is intentionally
    untaxed — no tax logic is added). A server-side check recomputes nights and
    rejects a submission whose attached pet service doesn't match the bucket, or
    that is missing the required info, or that attaches a pet service when the
    toggle said "No".
  * Dog type / Size / Hair are saved to booking meta by MotoPress (native
    fields, shown on the admin booking screen) and exposed to emails via the tag
    %dcc_dog_details% (MotoPress may already list checkout fields in the email
    booking details, so the tag is a convenience/fallback).

Admin booking screen — conditional fields gated by accommodation (0.4.0)
  * MotoPress enables Checkout Fields GLOBALLY, and this plugin's front-end
    script and server backstops all exempt wp-admin on purpose (so an admin is
    never fought while overriding something). The cost was that an admin
    booking any cottage was asked for dog type/size/hair, and any cottage
    offered guest 3/4 name fields.
  * An admin-only script now mirrors the front-end gate on the booking screens:
    it reads the chosen accommodation and shows/hides the dog rows and the
    guest 3/4 rows to match what that cottage can offer. Pet capability is read
    from the Services actually attached to the accommodation, so making another
    cottage pet-friendly is a MotoPress data change, not a code change.
  * Two ways of knowing the accommodation, in order of trust. On the
    create-booking wizard's checkout step there is no room-type control in the
    markup at all — it was chosen in an earlier step and exists only in PHP —
    so the plugin hooks mphb_cb_checkout_form and prints the reserved room-type
    ids for the script to read. Everywhere else (the edit-booking screen, whose
    room-type selects MotoPress creates dynamically) it derives them from the
    DOM: any select offering a known room-type id, or an input naming one.
  * It only shows and hides — nothing is removed, no value is cleared, nothing
    is validated or blocked, and no server-side backstop was extended into
    wp-admin. It fails open (unreadable capability, or an accommodation control
    it cannot identify, hides nothing), keeps any field that already holds a
    value on an EXISTING booking visible whatever the accommodation, and offers
    a "Show all booking fields" checkbox for the deliberate-override case.

== Setup: Pull-out Couch Guests (one-time) ==

1. Raise mphb_adults_capacity AND mphb_total_capacity to 4 on the six cottages
   (the checkout dropdown is built from capacity — the plugin never injects
   options).
2. Create ONE MotoPress Service "Extra Guest Fee": price 50, per night,
   per adult, assigned to the six accommodation types only.
3. WP Admin → DCC → Custom Checkout → "Pull-out Couch Guests" → tick the box
   and enter that service's ID into all three bucket fields (flat pricing).
   While the box is off, or while any ID is 0, the offering stands down: no
   labels, no note, no service attached, and bookings are capped at the
   included guest count.
4. Check the "What the guest sees" preview on that settings page. It renders
   the dropdown labels and the note from the live settings, so the money copy
   can be verified without loading a checkout.

The guest never sees the Extra Guest Fee as a service to tick: its row is
hidden and the charge is driven from the "Number of Guests" dropdown, so the
count charged is always max(0, guests - included) and the two cannot disagree
(the server rejects any submission where they do). On a cottage whose only
service was the Extra Guest Fee, that leaves "Choose Additional Services"
showing an empty heading. That is deliberate as of 0.4.2: collapsing the
section meant locating an ancestor to hide, and hiding the wrong ancestor can
take the guest-count dropdown with it. An empty heading is a far smaller
problem than a checkout that cannot be completed.

== Checkout Field names: slug vs. rendered input name ==

MotoPress builds a Checkout Field's input name as "mphb_" + the field's own
name (mphb-checkout-fields, CheckoutView). So there are two different strings
and they must not be confused:

  * The NAME you type when creating the field in MotoPress   -> guest3_first_name
  * The input name it renders as, which this plugin matches  -> mphb_guest3_first_name

Create the field WITHOUT the mphb_ prefix. A field created as
"mphb_guest3_first_name" renders as mphb_mphb_guest3_first_name; nothing
matches it, and the section silently never appears with no error shown.

Where the plugin asks you for a value (the dog fields on the settings page)
it wants the RENDERED input name — mphb_dog_type — and it flags both mistakes:
a double-prefixed value, and a bare slug entered where the input name belongs.
If a double-prefixed field exists on the live checkout, the checkout page also
prints a notice naming the fix — visible to logged-in administrators only.

== Setup: additional-guest fields (one-time, for guests 3 and 4) ==

Bookings → Settings → Checkout Fields → add four text fields, set NOT required,
named: guest3_first_name, guest3_last_name, guest4_first_name, guest4_last_name.
(Guest 2's three fields — guest2_first_name, guest2_last_name, guest2_phone —
already exist on the live site and follow the same pattern.) The exact list,
with the input name each one renders as, is shown on the settings page under
"Checkout Fields these sections need".

== Setup: dog info fields (one-time, required for Part D data capture) ==

1. Bookings → Settings → Checkout Fields → add three fields, set NOT required.
   Create them with these names (MotoPress adds the mphb_ prefix itself):
     * Dog type  — text                                        (name: dog_type)
     * Dog size  — select: 10–20 lbs / 20–30 lbs / 30–40 lbs   (name: dog_size)
     * Dog hair  — select: Short / Medium / Long               (name: dog_hair)
2. WP Admin → DCC → Custom Checkout → "Dog info fields" → enter the RENDERED
   input names: mphb_dog_type, mphb_dog_size, mphb_dog_hair. Each row shows a
   status confirming the slug it maps to, or flagging a wrong shape. The toggle
   then shows/hides + requires them; MotoPress saves them.
3. (Optional) add %dcc_dog_details% to the email template if the fields don't
   already appear in the booking details.

== Admin settings ==

WP Admin → DCC → Custom Checkout:
  * Enable pet fee — master on/off. When off, the dog toggle/fields never render
    and no pet service is applied on any cottage.
  * Applies to accommodations — multi-select of accommodation types (default
    Cottage 34). The dog flow shows only for a booking whose accommodation is
    selected here AND when the pet fee is enabled. Cottages whose three pet
    Services aren't enabled in MotoPress are flagged (best-effort).
  * Service IDs (17712/17711/14926) and the shared weekly/monthly night
    thresholds (7 / 30). Both fees apply from the first night. Each service-ID
    field shows a live status (the service's title, or a warning if no
    published service has that ID).
  * Pull-out Couch Guests — master on/off for the extra-guest offering (default
    ON). ON: guests beyond the included count are offered and billed per night.
    OFF (or any service ID still 0): no fee UI, no service attached, and
    bookings are capped at the included guest count on the listed
    accommodations — enforced server-side on both the form POST and the REST
    checkout route.
  * Fee amount shown to guests — per night, per extra guest. 0 (the default)
    means "read it off the Service", which is the only setting where the label
    and the charge cannot disagree. A number here overrides what is DISPLAYED
    only; it never changes what MotoPress bills.
  * Sleeping arrangement — the phrase used in the guest-facing note, default
    "1 queen-sized bed and a pull-out couch".
  * "What the guest sees" — a live preview of the dropdown labels and the note,
    rendered from the current settings.

Reminder: for each cottage added, the three pet-fee Services must also be enabled
for that accommodation type in MotoPress (Bookings → Accommodation Types →
cottage → Services).

== Configuration (filters) ==

Settings above are stored in the option `dcc_checkout_settings`. Each value is
also filterable for snippet-level overrides:

  dcc_checkout_pet_fee_enabled      (bool)
  dcc_checkout_pet_accommodations   (int[]; default [1607])
  dcc_checkout_pet_service_ids      (default daily 17712 / weekly 17711 / monthly 14926)
  dcc_checkout_bucket_thresholds    (default min_daily 2 / min_weekly 7 / min_monthly 30)
  dcc_checkout_guest2_field_names   (default mphb_guest2_first_name / _last_name / _phone)
  dcc_checkout_guest3_field_names   (default mphb_guest3_first_name / _last_name)
  dcc_checkout_guest4_field_names   (default mphb_guest4_first_name / _last_name)
  dcc_checkout_guest_fee_enabled    (bool)
  dcc_checkout_guest_accommodations (int[]; default the six 4-sleeper cottages)
  dcc_checkout_guest_service_ids    (daily/weekly/monthly; defaults 0 = dormant)
  dcc_checkout_included_guests      (default 2)
  dcc_checkout_guest_fee_amount     (per night, per extra guest; 0 = read the Service)
  dcc_checkout_couch_beds_text      (phrase used in the guest-facing note)
  dcc_checkout_format_price         (how an amount is rendered in that copy)
  dcc_checkout_admin_fields_enabled (bool; false disables the wp-admin gating)
  dcc_checkout_dog_field_names      (default mphb_dog_type / mphb_dog_size / mphb_dog_hair)
    (all field-name filters take RENDERED INPUT names — 'mphb_' + the
     MotoPress Checkout Field slug — not the slug itself)
  dcc_checkout_dog_meta_keys        (default = the dog field names)
  dcc_checkout_guests_selector      (default select[name^="mphb_room_details"][name*="[adults]"])
  dcc_checkout_page_id / dcc_checkout_is_checkout_page (enqueue detection overrides)

== Requirements ==

* MotoPress Hotel Booking (active). The checkout is the MotoPress Elementor
  "Checkout Form" widget on /submit-booking/.

== Changelog ==

= 0.22.0 =
* Item 1 - the price-breakdown expander is blue again. It went black in
  v0.17.0, when the <a> became a <button>: a button does not get the theme's
  link colour, and the bare-control reset's `color: inherit` took the table's
  black. Two further rules broke silently at the same time -- the hover and
  focus rules were written as `a.mphb-price-breakdown-expand` and stopped
  matching altogether. All three now key on the class alone, as everything
  else in this plugin does, and the resting colour is var(--dcc-blue)
  (#006bcf), the token this form already uses for its focus ring and select
  caret. Asserted in tests/fields; against 0.21.0 that assertion reads
  rgb(0,0,0).
  WHY IT WENT UNNOTICED FOR FIVE RELEASES: tests/button DID assert the toggle's
  resting colour the whole time -- against a fixture that was still an <a>,
  because only the live page's element changed. That fixture now carries BOTH
  forms, the <a> MotoPress renders and the <button> this plugin leaves, and
  asserts the colour on each.
* Item 2 - the dog fields are now DISABLED when the pet question is off, not
  merely hidden, so a booking with no dog carries no dog_* keys at all. A
  hidden control still submits: before this, a no-dog booking was posting
  "10-20 lbs" and "short-haired" because those were the selects' first
  options. The blank first option being added in MotoPress fixes the VALUE;
  only `disabled` removes the KEY. Asserted by reading a real FormData: zero
  dog_* keys, and against 0.21.0 the same assertion returns all three.
  GUARDED: setDisabled() REFUSES to disable anything that carries money -- any
  control named [services] or classed mphb_sc_checkout-service. A
  hidden-but-checked service still submits and MotoPress still prices it, so
  disabling one would silently stop charging the $50 extra-guest fee or the pet
  fee with the page looking entirely normal. The test asserts the service
  checkbox stays enabled and still submits.
* Item 3 - a guest-count control on the WP-Admin booking screen. One dropdown
  per reserved room: "Not provided", then 1..the room type's adults capacity.
  Saving writes _mphb_adults on that reserved room; "Not provided" DELETES the
  meta rather than storing a zero, so "nobody told us" and "two guests" stay
  different facts -- which is the point, since MotoPress fills that meta with
  the cottage's CAPACITY when an import supplies no count (booking #18433
  shows 4 for a 2-guest Booking.com reservation). If the capacity cannot be
  read the list is not capped and the screen says so, rather than capping the
  owner below the truth. Changes are noted in MotoPress's own booking log,
  where the guest-ID deletions already go. The save path is tested directly
  against a fake post store: nonce, capability, range, the delete-not-zero
  rule, and that a reserved room belonging to a different booking is never
  touched.
* The "Show all booking fields" checkbox names how many fields it is hiding,
  and hides itself when it is hiding none. It was reported as appearing beside
  a screen that already showed everything -- which is exactly what happens on
  an existing booking, where any field holding a value stays visible whatever
  the accommodation. The checkbox was not broken, but it promised something it
  had nothing to deliver.

= 0.21.0 =
* The validation banner's ground is white (owner decision, having seen the
  pink). Text and the 2px border stay in the error ink exactly as they were.
  #bc003e on white is 6.55:1, up from 6.29:1 on the pink. The fields are white
  too, with a gold border; the red border is what keeps the banner distinct
  from them.

= 0.20.0 =
* A divider above "Extras Total", the shared divider class, keyed on
  MotoPress's pre-relabel text in either spelling -- the same way the Subtotal
  divider was fixed in 0.15.0.
* The two file-upload hint lines ("Maximum upload file size", "Accepted file
  types") now match the tax footnote: 14px, line-height 1.4, #4b5563, left.
  They are MotoPress's (mphb-checkout-fields 1.2.3, FileUploadField.php:66-97;
  the second class is misspelt "mphp-" in its source and is targeted as
  written) and the markup is untouched. All three share ONE rule so they
  cannot drift, and font-weight is deliberately not declared: the footnote's
  is inherited from html{font-weight:700} on this site, so the spans match its
  COMPUTED weight rather than a value typed from the standard. The <br>
  MotoPress puts before each span is hidden so the two do not get a blank line
  between them. Asserted in tests/fields.
  This supersedes an early rule that calmed only ONE of the hints: its selector
  for the other, .mphb-accepted-file-types, was a guess that never matched the
  misspelt class MotoPress actually renders. Fixtures from real markup, again.

= 0.19.0 =
* Item 2 - a divider between the accommodation title row and the first detail
  row beneath it ("Number of Guests" on this site). Found structurally as the
  first visible, non-wrapper row after each title row, so it is MotoPress's own
  row and needs no placement of ours; same shared divider class as every other
  rule, so they all move together.
* Item 3 - the extra-guest details cell is two lines: "$50/night" over
  "x N guests", lowercase x. A newline in the text rendered by white-space:
  pre-line, so the write stays a single idempotent setText.
* Item 5 - the pull-out-couch sentence is the owner's new literal: "Guests 1-2
  are included in the nightly rate and will have a queen bed. Guests 3-4 will
  have a pull-out couch and be charged a nightly fee." ONE string, 138 bytes,
  pinned by sha256 in tests/copy/run.php to the same hash the Cottage Selector
  pins, so the two plugins cannot drift. The owner's line break between the
  sentences is presentation, applied at render, so the literal hashes identical.

= 0.18.0 =
* THE MUTATION BURST IS GONE AT THE SOURCE. Every round of the owner's tap log,
  on inputs and on the expander alike, showed the same thing mid-tap: a burst
  of ~100 DOM mutations. That burst was this plugin's own restructure pipeline
  re-running with nothing to do. Measured on the test fixture: one no-op re-run
  produced 42 mutation records, 35 of them writes whose old value equalled the
  new one -- classList.add() of a class already present, textContent set to the
  text already there. Per the DOM spec a no-op classList.add still queues a
  MutationRecord, and browsers honour that. iOS Safari decides whether a tap is
  a click or a hover by watching the page for content changes around it; a
  page rewriting a hundred attributes on a timer is exactly what it looks for.
  Every write in checkout.js now goes through an idempotent helper (addClass,
  removeClass, setClass, setAttr, setText) that does nothing when nothing
  changes, and the three "strip the class from every row, then add it back to
  some" patterns now decide first and write only the difference. A no-op
  re-run now records ZERO mutations, and that is asserted -- tests/breakdown
  fails on a single one. 0.17.0 delayed the burst past the tap; this removes it.
* The observer no longer INSTALLS a timer while a finger is down. WebKit's
  content observer tracks DOM timers installed during touch handling and
  watches what they do when they fire; 0.17.0 delayed the run but still
  installed the timer inside the touch. While a finger is down the observer
  now only notes that work is pending, and the touch-up handler schedules it
  450ms later. Asserted: work noted during a 1.5s touch is not run until the
  finger lifts and the tap has had time to resolve.

= 0.17.0 =
* THE EXPANDER IS NOW A REAL <button>. Across four tap logs the tax asterisk --
  a <button> -- is 4 of 4 at every duration from 64ms to 96ms, while the
  expander has failed 15 of 18 clean stationary taps, first as an <a> and then
  as an <a> with its href removed. Removing the href was not enough. Every
  class is carried over, so MotoPress's delegated handler
  ('.mphb-price-breakdown-expand' click, mphb.js:1446) still matches it, and
  type="button" means it can never submit the checkout. The keyboard handler
  0.16.0 needed for a hrefless <a> is deliberately NOT carried over: a native
  button activates on Enter and Space by itself, and a second handler would
  toggle twice and land back where it started.
  CAUGHT BEFORE SHIPPING: the site button spec matches a bare `button` at
  (0,3,1), so the swapped control rendered as a full-width blue 50px pill in
  the middle of the price breakdown -- measured in Chromium at rgb(0,107,207)
  with a 30px radius. Bare controls now carry .dcc_checkout-bare-button, which
  the spec excludes; the tax asterisk carries it too, replacing the
  exclusion-by-name that did not scale. Give any future bare control that class
  rather than adding another :not() to three selectors.
* THE PLUGIN NO LONGER REWRITES THE PAGE WHILE A FINGER IS DOWN. The
  MutationObserver ran the whole restructure pipeline 150ms after any childList
  change under the form, and that pipeline writes on the order of a hundred
  attributes and toggles visibility classes. In rounds 3 and 4 of the owner's
  tap log, every press that carried one of those bursts mid-tap failed -- 6 of
  6. The pipeline is now held while a finger is down and for 400ms after it
  lifts, on a 500ms debounce instead of 150ms. There is a 3s ceiling so a
  finger resting on the screen can delay it but never starve it: this code
  decides what the guest is told they owe.
* Both changes are asserted: the button's identity, class, type and the absence
  of a duplicate keyboard handler in tests/breakdown; that it is NOT styled as
  a site button in tests/fields (that assertion fails three ways against the
  unclassed control); and the hold itself, by stripping a class the pipeline
  restores, holding a finger down, and checking it stays stripped until the
  touch resolves.

= 0.16.0 =
* The breakdown expander stops being a hyperlink. Round 4 of the owner's tap
  log ended the timing hypothesis 0.15.0 was built on: the expander clicked
  twice at 82ms, where in round 3 nothing above 27ms had ever clicked -- but it
  still lost taps at 63ms, 79ms and 81ms. A 63ms failure standing next to an
  82ms success cannot come from a duration threshold. 0.15.0's gesture hints
  moved the needle and did not close it.
  What iOS arms its link recognisers on is not the <a> tag, it is the HREF. So
  the href now comes off: nothing to drag, nothing to preview, no recogniser to
  claim the gesture. The control keeps every class, so MotoPress's delegated
  handler ('.mphb-price-breakdown-expand' click, mphb.js:1446) fires exactly as
  before -- and its own preventDefault() on the next line shows the href was
  never navigated anyway. The href is remembered in data-dcc-href rather than
  destroyed, so this is reversible.
  An <a> without an href is neither focusable nor keyboard-operable, so both
  are given back explicitly: role="button", tabindex="0", and Enter/Space
  activation. The control ends up more usable than it was, not less.
* Tap diagnostic, round 5, built to settle the ONE thing round 4 pointed at and
  could not prove. Round 4's successes were both the SECOND tap of a pair --
  fail, then success, twice over -- and "first tap consumed, second works" is
  the signature of sticky :hover on iOS. The logger now reads the touched
  element's own :hover state at touchstart, so if a failing press reads "not
  hovered" and the success right after it reads "ALREADY :HOVER", that is the
  mechanism measured rather than argued.
  Three smaller things that cost a round each: the log now stamps the plugin
  VERSION in its header (round 4 could not be attributed to a build without
  asking); presses are NUMBERED and the delayed verdict names its own press
  (round 4 printed "+5ms NO CLICK" because that line belongs to the press
  before); and each press records whether the element is still a link, its
  draggable state and its computed touch-action, so a log says for itself
  whether the fix under test was even installed.

= 0.15.0 =
* FIXED, and it is the most serious thing in this release: hideNativeServices()
  could hide the ENTIRE CHECKOUT. serviceRowWrapper() walks up from a service
  checkbox looking for its row and its last fallback is input.parentNode, with
  nothing above it -- so a checkbox sitting close to the form root resolved to
  the <form>, which then got the hide class and took every field, the price
  breakdown and the submit button with it. A guest would see a blank checkout
  and nothing saying why. MotoPress nests these inside a services section
  today, so this was latent rather than live. There is now a ceiling: nothing
  containing the price breakdown, the customer details, another service's
  checkbox, or the form itself can be a service row. Found by rendering the
  test fixture and printing what was actually visible -- which was nothing.
* Item 4 - the divider above "Subtotal", asked for twice. It WAS targeted at
  that row in 0.14.0; what it could not do was find the row. The matcher keyed
  on "Subtotal (excluding taxes)", and a breakdown whose summary line is a
  plain "Subtotal" has no such row, so nothing was marked. The divider now
  takes the last subtotal on the page, read from MotoPress's own text before
  the relabel rewrites that cell. A fixture with a plain "Subtotal" proves it,
  and fails against 0.14.0.
* Item 2 - the validation banner now reads "Please complete all of the required
  fields." and is the asterisks' own red. Text AND border are
  var(--dcc-error); the pale ground stays. #bc003e on #fdecea measures 6.29:1,
  past WCAG AA for body text. It used to be three different reds at once.
* Items 1 + 2 share one presentation path so they cannot drift apart again:
  --dcc-required is now DEFINED AS --dcc-error rather than repeating its value,
  so there is one literal on the form and everything red points at it.
* Item 1 - error messages now wait for a submit attempt. NOTHING HERE HOOKS
  MOTOPRESS'S VALIDATION: the form carries .dcc_checkout-preflight from load
  until the first submit attempt, and messages that appear after load are held
  back by CSS. Anything already in the markup when the script ran is tagged and
  left visible -- that could be a real server-rendered error, and hiding one
  would leave a guest stuck with no idea what is wrong. An admin-only note on
  the page says how many were present at load, which settles which case the
  live page is.
* Item 3 - two reasons the "Extras" rename may not have been reaching the
  checkout, both closed. A string passed through _x() never fires the plain
  `gettext_` filter, so `gettext_with_context_` and `ngettext_` are now
  registered too. And the rename was gated on is_checkout_page(), which
  deliberately returns false for AJAX and REST -- but MotoPress RE-RENDERS THE
  PRICE BREAKDOWN OVER AJAX/REST whenever the guest changes the guest count or
  the dates, so the first paint said "Extras" and every re-render after it said
  "Services". The rename (not the script loading) now applies on MotoPress's
  own front-end AJAX/REST requests, still never on a request coming from
  wp-admin. The REST re-render path is REASONED, not observed -- it could not
  be reproduced without a booking in session.
* Item 6 - the multi-tap bug: the discriminator is the ELEMENT TYPE, not the
  timing. In the owner's round-3 log the breakdown expander (an <a>) failed at
  76ms and 77ms while the tax asterisk (a <button>) succeeded at 79ms. No
  single threshold does that. iOS arms gesture recognisers on links that it
  does not arm on buttons -- link dragging and the press-and-hold callout --
  and a search of the 473KB served bundle found ZERO occurrences of
  touch-action and zero of -webkit-touch-callout, so that anchor was running on
  iOS defaults with both armed. Every control in the form now declares
  touch-action: manipulation; the expander and the asterisk also switch off the
  callout and text selection; and the expander is marked draggable="false",
  which is an attribute and has no CSS equivalent. A genuine link keeps its
  long-press menu. THIS IS A PREDICTION: after this, anchor presses of 80-110ms
  should click. If they still do not, the hypothesis is wrong.

= 0.14.0 =
* Item 6 - field width. The fields now match the Availability Calendar's date
  pills. That plugin's field is `width: 100%` and is narrowed by its TRACK, not
  by a width of its own, so the width: 100% here stays and the WRAPPER is what
  is capped: 360px, centred, with the field filling it. Both halves or neither
  -- capping the field alone puts back the dead strip beside it that 0.13.0
  measured out of the owner's tap log. 360 rather than 320 is deliberate: at a
  390px viewport the section's content box is about 358px, so the cap is INERT
  ON A PHONE and the restored tap targets are untouched. Font-size moves to
  18px to match the calendar; 16px remains an absolute floor, asserted, because
  below it iOS zooms the whole page when a field takes focus. <input
  type="date"> also gets appearance:none -- iOS will not shrink a native date
  control below its intrinsic width, which was the whole of the calendar's
  iPhone overlap bug. The checkout's dates are hidden inputs today, so that one
  is a guard rather than a fix.
* Item 4 - the tax footnote no longer widens the checkout. Measured: in a
  content-sized container, opening it took the widget from 210px to 769px and
  every field grew with it. The footnote now contributes nothing to the
  container's intrinsic width while still filling it.
* Item 7 - the second "Total Price:" below the upload line is hidden. Only when
  the price breakdown is actually present above it: without it that would be
  the only total a guest is shown before paying, and it is left alone.
* Item 8 - error messages on the checkout, including "Please select the number
  of guests.", are #bc003e.
* Item 9 - the extra-guest note is the owner's new wording, and it now lives in
  ONE place (Config::couch_note_text()) that the checkout, the admin preview
  and the Cottage Selector all read, so the two plugins cannot drift apart.
* Item 10 - the "*" inside "Required fields are followed by *" is now the same
  #bc003e as the "*" that marks a required field. Both asterisks moved to that
  colour; the required marker was #c62828.
* Item 11 - the bare "Services" row above the "Service | Details | Amount"
  header is removed. Only when it carries no figure AND the next visible row
  really is that header; anything else is left as MotoPress rendered it.
* Items 12 + 13 - dividers above the "Service | Details | Amount" header and
  above "Subtotal", using the SAME class as the existing ones, so one CSS rule
  still governs every line on the breakdown.
* Item 14 - the extra-guest row reads "Extra Guest(s) Fee" with details
  "$50/night x N guests". DISPLAY ONLY: the MotoPress service (18063) keeps its
  own title, which is what admin screens and guest emails show. The row is
  found by that title read from MotoPress BY ID, so renaming the service in the
  admin moves the match with it. N comes from the [adults] value this plugin
  itself sets, never from parsing MotoPress's prose; if it cannot be read the
  details cell is left alone.
* The breakdown matchers now know BOTH spellings of every label they look for
  -- MotoPress's own word and this site's override of it -- supplied by the PHP
  that owns the rename so the two cannot drift.
* Tap diagnostic, round three, after two reading errors round two introduced:
  a successful tap no longer logs "NO CLICK FOLLOWED THIS PRESS" (iOS splits one
  tap into a touch block and a synthesised mouse block ~300ms later, and round
  two counted the second as a new press), and Elementor's device-mode attribute
  write on <body> is reported as a measured baseline instead of as churn on the
  touched path. It now also records viewport height per press, which is what
  actually moves on that page -- the log showed "page still" on every press
  while the URL bar swung the viewport 108px.
* New suites: tests/footnote (item 4) and desktop-width assertions in
  tests/fields (item 6).

= 0.13.0 =
* FIXED, and this is the likely cause of a good part of the multi-tap problem:
  this plugin never styled MotoPress's OWN text inputs. It styled `select` and
  its own injected pet fields and left First Name, Last Name, Email, Phone,
  Address, Apartment and Note to the theme -- while the standard this plugin
  publishes, "Custom Checkout - Field Standard.css", had declared the full pill
  all along. The export and its source had diverged and the checkout was
  running on the wrong one. Those fields now get the standard: full width of
  their wrapper, border-box, 44px minimum height, 16px text, the gold pill.
  Three consequences, all of them visible in the owner's tap log:
  - WIDTH. The input did not fill its <p>, so each row carried a dead strip
    that looks tappable and is not. On his 390px screen the presses that
    reached an input were at x 261-277; the ones that hit nothing were at
    x 339-374. Tapping a <p> does nothing, so the tap is lost and he taps
    again. This alone costs taps on every field on the page.
  - HEIGHT. Without a min-height the target could be under 44px.
  - FONT SIZE. Under 16px, iOS Safari ZOOMS THE WHOLE PAGE when the field takes
    focus. That is a page-wide movement under the finger, and a tap arriving
    while the page is still moving is spent stopping it.
* FIXED: the handler that keeps the ID upload field the same width as the
  Country select fired on every window resize. On iOS, resize fires when the
  URL bar collapses or expands -- which happens on ordinary scrolling -- so it
  was re-writing layout several times per scroll on a 150ms debounce that lands
  exactly as the page settles and the guest taps. It now ignores height-only
  resizes (the field follows a WIDTH, so a height change cannot alter the
  answer) and skips the write when the measured width has not changed.
* The tap diagnostic (?dcc_tap_debug=1, administrators only) is round two. It
  now measures, per press: whether the page scrolled or the target moved,
  whether the page ZOOMED, whether the touched node was still connected at
  touchend, whether the DOM changed mid-press and whether any of it was on the
  touched node's own ancestor chain, whether Google Places' pac-container is
  open, and -- when the press lands on a wrapper rather than a control -- where
  the control actually is and by how much the tap missed. It logs a verdict
  line, "NO CLICK FOLLOWED THIS PRESS", instead of leaving that to be inferred
  from an absent line. Separately it names what moves the page after load, via
  layout-shift entries and page-height changes. Still listener-only: no
  preventDefault, no stopPropagation, nothing stored.
* New test suite, tests/fields/, in real Chromium at 390x844 with touch
  emulation. It asserts the geometry above and then re-checks the symptom in
  the owner's own coordinates. Against the 0.12.0 stylesheet it fails 33 ways.

= 0.12.0 =
* Price Breakdown: "Dates" and "Amount" are underlined, matching the site's
  convention that underline means label (.elementor-kit-331 label).
* Price Breakdown: dividers above the "Dates" header and above the row that
  follows the last booked date. Both use the SAME class-mate as the grand
  total's divider, so one CSS rule governs all three and restyling one moves
  all of them.
* The "*" beside Taxes is one step larger (font-size only). The 44x44 box and
  the negative margin that pulls it out of the flow are untouched, so the Taxes
  row keeps its height — asserted in Chromium at exactly 44x44.
* Field labels, the typed-in value and the placeholder are all centred, and the
  typed value and placeholder are DECLARED rather than inherited.
* A label that WRAPS its field no longer passes an underline down to the
  guest's typed text. An input cannot switch off an ancestor's text-decoration,
  so the label does: it is tagged, CSS drops the underline there, and the
  label's own words keep it via the usual span. The control is never moved.
* NEW: an admin-only tap diagnostic at ?dcc_tap_debug=1 on the checkout. It
  records pointer/touch/mouse/click on the device where the multi-tap problem
  actually happens, including whether the event was defaultPrevented, whether
  a click followed its touchstart, and what element is really topmost at those
  coordinates. It only listens — no preventDefault, no stopPropagation, nothing
  stored. Guests can never reach it; it is gated on manage_options AND the
  explicit URL flag, so there is no setting with a wrong default.
* Mobile multi-tap: two candidate causes in this plugin were tested. A
  self-feeding MutationObserver loop was REFUTED (the pipeline settles after
  one pass). The asterisk's 44x44 box was MEASURED overflowing its 20px row by
  12px above and below, and elementFromPoint above the row returns the
  asterisk — real, but local to the Taxes row and its neighbours are static
  text, so it is not the page-wide cause. Left as-is: shrinking it would cost
  the accessible target, and moving the row is explicitly unwanted.

= 0.11.0 =
* The tax asterisk no longer flashes and vanishes. foldTaxDetail() held its
  open state in a local variable, and formatBreakdown() rebuilds the breakdown
  table on EVERY re-render — destroying the note and its button and recreating
  them closed. The state now lives outside that function and is restored on
  rebuild. Reproduced as a failing assertion against 0.10.1 before the fix.
* The tax note now gives the RATES as well as the names:
  "Lake County Tourist Development Tax 4%, ... Florida Sales and Use Tax 6%".
  Read from MotoPress's own mphb_accommodation_taxes option, so changing a rate
  in MotoPress changes what the guest is told. The `type` is checked, not
  assumed — a fixed-amount tax renders as money, never as a percentage.
* It opens on hover on a mouse AND on tap on anything. A hover-only tooltip was
  asked for and is deliberately not what shipped: hover does not exist on a
  touch screen, and most of this site's traffic is touch. It also stays a
  disclosure in normal flow rather than a floating layer, which would be
  clipped by scroll containers on iOS.
* The price-breakdown expand link has a hover colour for the first time
  (#f08080). It had none, so hovering dropped it to the black it inherits from
  the table — measured rgb(15,109,191) at rest, rgb(0,0,0) on hover. On iOS the
  first tap applies :hover and it sticks, which is why it turned black and did
  not open.
* EVERY hover rule on the checkout is now inside
  @media (hover: hover) and (pointer: fine), so a touch device cannot enter a
  sticky hover state it has no way to leave. Focus is deliberately outside that
  query — a keyboard user needs it, and a tapped link keeps focus.
* The guest note is 15px (was 14px). Colour and weight unchanged.
* The field styling is now portable. Tokens read an optional --dcc-site-* and
  fall back to the literal, so a shared layer can be added later without any
  plugin depending on one. Two rules that were only ever INHERITED are now
  declared: the typed-in value colour and the ::placeholder colour. On this
  form they compute to the same thing as before; in another plugin's cascade
  they would not have.
* Tests: 56 jsdom, 25 Chromium (including a touch-emulated context asserting
  that the hover media query does not match a coarse pointer), 31 PHP.

= 0.10.1 =
* The deletion note now goes into MotoPress's own booking log, so it appears in
  the Logs box on the booking screen rather than in a panel of this plugin's
  own. Uses \MPHB\Entities\Booking::addLog() via
  MPHB()->getBookingRepository()->findById(), guarded by method_exists and
  wrapped so a MotoPress update can never make a deletion fatal.
* The write is VERIFIED, not assumed: mphb_booking_log comment rows are counted
  before and after. addLog() returning nothing and silently doing nothing would
  otherwise look like success and leave no audit trail at all — and a renamed
  comment_type on some future MotoPress version would do exactly that.
* The plugin's own history panel is now a real fallback rather than a duplicate:
  it renders ONLY for deletions that did not reach MotoPress's log. One visible
  record per deletion, either way. Entries that did land are still written to
  post meta as an independent copy, since MotoPress's logs are comments and
  anything that prunes comments would take them.
* The audit line reads: Guest ID image "licence.jpg" deleted on request by
  Rob Croft (rob). — file, act and actor, in MotoPress's own log voice. Pinned
  by three assertions; 31 PHP assertions now.
* Note for the permanent-delete path: the booking's logs are comments on the
  booking post, so they go with it. Nothing is lost that could have been kept.

= 0.10.0 =
Guest photo IDs. Retention is ON REQUEST ONLY (owner decision) — there is no
schedule — so the manual path is the whole practice, and until now that path
was SSH and rm.

* NEW: a "Delete ID image" button on the booking screen. Nonce'd, gated on
  manage_options, with a confirm dialog. Deletes the file from the protected
  store, clears mphb_upload_id, and records what was deleted, when, and by whom
  in a deletion history shown on the same screen.
* The booking screen shows the FILENAME and size only. The image itself is
  never rendered — not there, and nothing is added to any list view.
* NEW: the ID file follows a booking into PERMANENT deletion. Trash does not
  trigger it, so a booking that is trashed and restored keeps its ID.
* NEW: the protected store is kept unreadable. It had .htaccess but no
  index.php; both are now written on activation, after any checkout upload, and
  at most hourly on an admin request — so a host migration that drops dotfiles
  cannot silently expose sixteen driving licences. Existing files are never
  overwritten, in case a host or admin has hardened them further.
* NEW: "Check public access now" on the settings page writes a throwaway probe
  file, fetches it over HTTP and deletes it, then reports the status code.
  /privacy/ promises IDs are "blocked from public access — we verify this"; a
  filesystem check cannot verify that, only asking the web server can.
* NEW: tests/id-files/ — 28 assertions on the path safety. delete_for_booking()
  unlinks a path derived from post meta, so contain() and resolve() are pure
  functions tested directly against real symlinks, encoded and Windows-style
  traversal, a sibling directory sharing the store's name prefix, directories,
  and attachment IDs resolving outside the store. Nothing reaches unlink()
  without passing contain().
* The MotoPress booking-note API is not confirmed on this install, so the
  guaranteed audit trail is the deletion history on the booking screen. A
  dcc_checkout_id_deleted action fires for anyone who wants to forward it into
  MPHB's own notes.
* Checkout behaviour is untouched: 53 jsdom and 21 Chromium assertions still
  pass, and the $50 extra-guest fee still bills.

= 0.9.0 =
Three defects, all found by rebuilding the test fixtures from real
/submit-booking/ markup. The old fixtures were plausible but wrong, which is
why two of these survived several releases with a passing suite.

* FIX: the Extra Guest Fee row was still fully visible — the label text, the
  price, the quantity select and "guest(s)". MotoPress puts the class
  .mphb_sc_checkout-service ON THE CHECKBOX, and Element.closest() matches the
  element itself, so serviceRowWrapper() returned the input and the plugin hid
  the tick box while leaving its row. It now refuses to treat a form control as
  a row and resolves to the enclosing <li>. The checkbox stays in the DOM,
  checked and enabled, so the $50 still bills — asserted.
* FIX: the tax asterisk did nothing. The plugin appends the "*" to the Taxes
  cell, and the asterisk is text content, so on the NEXT pass that row read
  "Taxes*" and stopped matching. foldTaxDetail() bailed — after the cleanup at
  the top of the pass had already removed the footnote — leaving a live button
  whose aria-controls pointed at an id that no longer existed. Every re-render
  of the breakdown hit it. Row labels are now read from MotoPress's own nodes
  only, ignoring anything this plugin injected, and both halves of the control
  are cleared together. The suite now runs the pipeline twice and fails if the
  target does not survive.
* FIX (third attempt, first correct one): "Rate: Cottage 22: The Boathouse" is
  not a row. It is <div class="mphb-price-breakdown-rate"> inside a <td> that
  holds the rest of the expanded detail, so matching row labels beginning
  "Rate" never touched it — and when that div was the first thing in the cell,
  the match hid the ENTIRE detail block instead. Now targeted by its class,
  which is exact and survives translation. The enclosing row goes only if the
  rate was all it held.
* Fixtures rebuilt from production markup, and every new assertion was watched
  failing against 0.8.1 before the fix: 7 failures, now 53 assertions passing.
* Submit Booking is untouched and still measures to spec.

= 0.8.1 =
* Buttons now hover to the site standard #F08080 with #FFFFFF text. 0.8.0 used
  this plugin's older darker blue because the spec transitioned
  background-color without saying to what; the standard has since been settled.
  --dcc-blue-hover stays defined, since other rules use it.
* The hover selectors are the resting selectors with :hover appended, so each
  is (0,4,2) against the resting (0,3,2). A hover rule that loses to its own
  resting rule fails silently and still reads correctly in the file, so this is
  now measured rather than assumed.
* White on #F08080 is 2.59:1, below WCAG AA. The owner has chosen it knowingly.
  Focus stays a gold outline and never depends on the fill, so a keyboard user
  can still see where they are.
* NEW: tests/button/ — measures COMPUTED styles in real Chromium, rendering the
  button in isolation with the competing theme and Elementor-kit rules
  reproduced and loaded first. /submit-booking/ only renders with a live
  reservation, so this is how the button gets verified without making a booking
  on a live site. It caught a false failure on its first run (reading the hover
  colour mid-transition) and now waits for the transition to settle.
* Resting appearance is unchanged from 0.8.0, and the tax asterisk is still
  excluded — both asserted.

= 0.8.0 =
* Buttons follow the site button spec — the "Send Message" button at /contact/,
  which the owner has made the standard for every plugin. Applied to Submit
  Booking and to every other button this plugin renders:
    Raleway 20px / weight 500 / line-height 50px / letter-spacing 0.5px /
    text-transform none / #ffffff on #006BCF / no border / radius 30px /
    no box-shadow / transition background-color .15s, opacity .15s.
* This REVERSES 0.8.0's predecessor. In 0.7.0 the plugin's button block was
  removed so the theme would own the button; the owner has since decided the
  reference button IS the standard and every plugin declares it.
* No !important anywhere in that block. Bravada forces text-transform:
  uppercase at (0,0,1) and the Elementor kit forces 18px / 900 /
  letter-spacing 1.5px / capitalize at (0,1,1); the doubled form class takes
  these selectors to (0,3,1)-(0,3,2) and wins on specificity alone, so a later
  deliberate override still works.
* One deviation from the measured reference, and why: the reference measures
  padding 0 because its width comes from its container, so the zero never
  shows. On a button whose width follows its content that would put the label
  inside the 30px corner radius. Vertical padding is 0 as measured — height is
  exactly the 50px line-height — with symmetric horizontal padding for the
  radius. Set it to 0 if the button is ever given a width.
* The asterisk that opens the tax footnote is excluded by selector: it is a
  control this plugin draws, not a site button.
* Everything from 0.7.0 is untouched — the "Rate:" row removal, the breakdown
  column headers, the tax footnote, the services-section hiding and the
  runtime width-matching on the file input. All 44 assertions still pass.

= 0.7.0 =
* FIX: "Choose Additional Services" is now actually removed. hideNativeServices()
  looked for the enclosing .mphb-checkout-section and skipped it whenever it
  contained a guest-count dropdown — and on this site MotoPress renders the
  services and the chooser inside the SAME section, so that guard fired every
  time and nothing was ever hidden. It now hides the services SUBTREE: the
  rows, the heading (located by position, not wording), and only those wrappers
  left holding nothing else. The chooser is out of the blast radius
  structurally instead of by a guard that has to be right.
  Hiding stays display-based, so the ticked service input still submits and
  MotoPress still prices it — the $50 extra-guest fee is unaffected, and that
  is asserted.
* FIX: the safety net that reverses this if the guest chooser disappears now
  judges visibility on computed styles rather than measured boxes.
  offsetParent / getClientRects report "invisible" for anything not yet laid
  out, which could make the net un-hide everything during first paint.
* The "Choose File" field is pinned to the Country select's width, measured at
  runtime and re-measured on resize, so the two match at every viewport without
  a hard-coded figure. The ::file-selector-button treatment and the long-filename
  ellipsis are unchanged.
* "Show detail" is replaced by an asterisk beside "Taxes" that reveals one
  quiet line beneath the breakdown naming the taxes applied — no amounts, since
  they already sum to the line above. Deliberately in normal flow, not a
  floating tooltip: a popover gets clipped by scroll containers on iOS. The
  asterisk is a real button with an accessible name, aria-expanded,
  aria-controls, a focus ring and a 44x44 touch target.
* The guest note is 14px (was 13px), keeping its existing colour treatment.
* Buttons: the THEME owns them again. The block forcing background, border,
  colour, radius, font-family and text-transform with !important is gone, so
  Submit Booking now matches every other button on the site. text-transform:none
  went with it — keeping it would have left Submit Booking the only button with
  a different case treatment, which is the mismatch being fixed. Restore that
  one line if the uppercase is genuinely unwanted. The coupon "Apply" button
  shared the selector list; coupons are off site-wide so it does not render, and
  if they are re-enabled it takes the theme style too.
  The file field's ::file-selector-button is NOT a theme button and keeps its
  blue treatment.

= 0.6.1 =
* The "Rate: Cottage 22: The Boathouse" row is removed from the price
  breakdown, row and rule together, so the expanded block opens straight on
  "Number of Guests" with no leftover band or stray line. Removed
  UNCONDITIONALLY (owner decision): every rate on this site is named after its
  cottage, so the row only restated the title above it. Consequence worth
  knowing: a differently-named rate ("Winter Special") would not be shown on
  the breakdown either — see CLAUDE.md.
* Column-header rows ("Dates | Amount", "Service | Details | Amount") now read
  as headers rather than as more data: bold, and #111111 ink, which is 18.9:1
  on the white breakdown ground (WCAG AA wants 4.5:1). Same font size, same
  alignment, same row height — no uppercasing, no letter-spacing, no tinted
  strip. Subtotal, Taxes and Total are deliberately untouched: they are summary
  rows and already carry their own weight.
* A block's first VISIBLE row now carries no rule above it. CSS :first-child
  still matches a row the plugin has hidden, so removing the "Rate:" row would
  otherwise have left a line floating where it used to be.
* tests/breakdown: assertions that no "Rate:" row survives on any fixture, that
  the expanded block opens on "Number of Guests", that nothing is left carrying
  a rule where that row was, and that exactly the column-header rows are marked
  while the summary rows are not. 28 assertions, all passing.

= 0.6.0 =
* Price Breakdown reshaped into standard invoice arithmetic. MotoPress printed
  the same figure in three places at once — Accommodation Total == Subtotal,
  Accommodation Taxes Total == Taxes, the in-block Subtotal == Total — which
  reads as though the guest is being charged repeatedly. Each of those is now
  removed, and ONLY when its amount string is identical to the row that
  supersedes it: with a second cottage, or a service, they are real figures and
  they stay. "Subtotal (excluding taxes)" is now just "Subtotal", since Taxes
  is the very next line.
* The accommodation line item now shows its PRE-TAX amount, so the items sum to
  Subtotal, tax is added once, and Total closes it. That figure is COPIED from
  MotoPress's own subtotal row, never derived by subtracting tax — an
  equivalence that only holds for a single accommodation, so with two or more
  the row is left exactly as MotoPress rendered it.
* The accommodation title reads "Cottage 36: Sunshine Suite" on one line. The
  forced line break after the colon (Part A, item 13) is removed, and the "#1"
  index is dropped when there is only one accommodation — with several it
  distinguishes them and stays.
* "Show detail" is now a quiet underlined text link at the row's own size in
  the site blue, with a visible focus ring and a 44px touch target, instead of
  a filled pill. Book Now should be the only control that shouts on this page.
  It moved onto the surviving summary Taxes row, and stands down entirely when
  more than one accommodation is booked, where one cottage's components under a
  combined total would misrepresent the bill.
* NO ARITHMETIC is performed anywhere in the breakdown: every figure displayed
  is one MotoPress rendered, moved or copied verbatim.
* NEW: tests/breakdown/ — jsdom fixtures driving the real checkout.js against
  real breakdown markup, including one with every label renamed that proves an
  unrecognised breakdown is passed through completely untouched. Run with
  `cd tests/breakdown && npm install && npm test`.

= 0.5.1 =
* VERIFIED on live: 4 guests x 2 nights bills the Extra Guest Fee at
  $50 x 2 nights x 2 guests = $200, subtotal $550, total $588.50 — exactly what
  the "4 (+$100/night)" label promises. Taxes were unchanged at $38.50 with and
  without the fee, confirming it stays untaxed as intended. This is the first
  end-to-end confirmation of the extra-guest money path.
* Price Breakdown: expanding an accommodation listed every individual tax and
  then MotoPress's own "Accommodation Taxes Total". The components (and their
  column header) now collapse under a "Show detail" toggle on that total row.
  The total shown is MotoPress's own — no arithmetic is done here. Rows are
  matched on their rendered label, so this is English-only and a miss simply
  leaves the breakdown unchanged; override with dcc_checkout_tax_row_pattern.
* "Service" and "Services Total" join "Services" in reading as Extras wording
  on the checkout, so the fees are no longer presented as services a guest
  picked from a menu.

= 0.5.0 =
* FIX: the "$" showed as "&#36;" in the guest-count labels and the note.
  MotoPress stores the currency symbol HTML-encoded, and those strings are
  written with textContent, which does not decode entities. Decoded once,
  where the price is formatted.
* "Choose Additional Services" is now removed entirely, not just the Extra
  Guest Fee row. Every service this site sells is driven by a control the
  guest already used — the pet fee by "Traveling with a dog?", the extra-guest
  fee by "Number of Guests" — so the native section was a second control for a
  decision already made. Hiding does not stop the inputs submitting, so
  MotoPress still receives and prices them exactly as before.
* The "Traveling with a dog?" toggle moves out of that section and into "Pet
  Information", above Dog type / Size / Hair, where it belongs.
* Two guards on that removal, because an earlier attempt at it hid the guest
  dropdown: a section containing a guest-count dropdown is never hidden, and
  the hide uses the class the post-pass assertion undoes, so if the chooser
  disappears anyway the removal reverses itself.
* Price Breakdown: rules between rows, amounts right-aligned in their own
  column, and the final total called out with a heavier rule and bolder type.
  The rules are structural rather than keyed to any row's wording, so nothing
  breaks if MotoPress changes or translates a label.
* "Services" reads "Extras" on the checkout. The pet and extra-guest fees are
  not services chosen from a menu — they follow from answers already given.

= 0.4.4 =
* Hardening (no live behaviour change): the guest-count options above the
  offered cap were hidden with the bare `hidden` attribute, which is only a
  UA-stylesheet rule that any author rule outranks — the same trap that let a
  button in the availability calendar render while its `hidden` attribute was
  set. They now also carry a class with an !important rule. Selection was and
  remains gated on `disabled`, which is honoured everywhere (Safari and iOS
  honour neither `hidden` nor `display` on an <option>), so this only affects
  whether a capped option is seen, never whether it can be chosen. The path is
  dormant while the pull-out couch offering is on, which it is on live.
* Audited every other hide/reveal path: all use classes carrying
  `display: none !important`, and the one runtime assertion already tests
  computed visibility rather than an attribute.

= 0.4.3 =
* FIX (money path): relabelling the guest-count options was CHANGING THEIR
  SUBMITTED VALUES. MotoPress renders them as <option>1</option> with no value
  attribute, and an option without one takes its value from its text, so
  "3 (+$50/night)" was being submitted as mphb_room_details[N][adults] instead
  of "3". The value is now pinned before the label is touched, in both the
  checkout and the admin script. This is the likeliest reason MotoPress's own
  chooser scripts (which read data-max-allowed / data-max-total) misbehaved.
* FIX: one of the fallback selectors added in 0.4.2 could never match. The
  classes mphb_sc_checkout-guests-chooser / mphb_checkout-guests-chooser sit ON
  the <select>, wrapped in <p class="mphb-adults-chooser">; they were written as
  descendant selectors. Corrected against MotoPress's checkout-view.php.
* FIX: the note under the guest dropdown was appended INSIDE
  <p class="mphb-adults-chooser">, and a <p> cannot contain a <p>. It is now
  placed as the wrapper's next sibling.
* The administrator-only diagnostic now distinguishes the two failure cases and
  names the culprit: "no dropdown found" (listing every selector tried) versus
  "present but not visible, hidden by <element.class>", found by walking
  computed styles. The remedies are completely different.

= 0.4.2 =
* FIX (blocker): removed the services-section collapse added in 0.4.0. It
  worked by finding an ancestor to hide, and hiding the wrong ancestor takes
  the "Number of Guests" dropdown down with it — which disables extra-guest
  pricing and the conditional guest fields entirely. An empty "Choose
  Additional Services" heading is a far smaller problem, so it stays.
* Hardened everything around that failure mode:
  - serviceRowWrapper() now rejects any candidate containing a guest-count
    dropdown or a second service input, so a service row can never resolve to
    a shared container. It returns null (hide nothing) rather than too much.
  - The guest-count dropdown is now found by four widening selectors, not one:
    a miss disables the entire guest flow, so it is worth more than one try.
  - After every pass the plugin proves the dropdown is still present AND
    visible. If it is not, every row this plugin hid is un-hidden and the check
    repeats; if it is genuinely absent from the markup, an administrator-only
    notice on the page says so instead of failing silently.
* FIX: the guest 2/3/4 fields no longer appear before a guest count is chosen.
  When the dropdown could not be read the flow used to stand down completely,
  leaving MotoPress's globally-enabled fields on screen. With no readable count
  the count is 0, so every conditional group stays hidden.
* Admin: guest 3/4 fields are now hidden by default and revealed only by "Show
  all booking fields" — not by the accommodation, and not by any guest count —
  matching what that checkbox's label promises. Fields on an existing booking
  that already hold data still show regardless.
* Admin: the checkout simplification now reaches wp-admin. The Extra Guest Fee
  row sits behind the same "Show all booking fields" switch, the guest-count
  options carry the same cumulative labels, and the fee's quantity is slaved to
  the guest count — so "Number of Guests: 1" can no longer sit beside "Extra
  Guest Fee for 4 guest(s)". Presentation and input-slaving only; no
  server-side validation was extended into wp-admin.

= 0.4.1 =
* Fix: the admin gating added in 0.4.0 did not reach the create-booking
  wizard's checkout step — the screen Rob actually reported. Two reasons, both
  fixed: the script was only enqueued on post.php/post-new.php, and the wizard
  is a menu page; and that step carries no room-type control in its markup
  (the accommodation is chosen in an earlier step and exists only in PHP), so
  deriving it from the DOM found nothing and the gate correctly stood down.
  The plugin now hooks mphb_cb_checkout_form to both load the script there and
  print the reserved room-type ids, which the script prefers over derivation.
  The DOM derivation and its MutationObserver stay for the edit-booking screen.
* The script is now also enqueued on other MotoPress admin pages, so a wizard
  step that renders checkout fields without firing that hook is covered rather
  than silently unprotected. It no-ops where none of the managed fields exist.

= 0.4.0 =
* Checkout: the Extra Guest Fee service row is removed from "Choose Additional
  Services" — having both it and the guest dropdown was redundant, and the two
  could disagree (a 1-guest booking showed the fee row set to 2 guests, because
  MotoPress presets that select to full capacity independently of the guest
  count). The charge is now driven solely by the guest dropdown, so the count
  charged is always max(0, guests - included). The server already rejected any
  submission where those differ, on both the form POST and the REST route.
  Where that was a cottage's only service, the now-empty "Choose Additional
  Services" section is dropped too.
* Pet-fee selection on Cottage 34 is untouched: its services section is kept,
  with the "Traveling with a dog?" toggle standing in for the raw service rows
  exactly as before. Only the Extra Guest Fee row is taken away.
* Checkout: guest-count options are labelled with the CUMULATIVE amount each
  one adds — "1", "2", "3 (+$50/night)", "4 (+$100/night)" — so a guest reads
  the single extra amount for the number they pick instead of a per-head rate
  they have to multiply. Amounts are read off the same MotoPress Service that
  does the billing (never hard-coded), formatted server-side, and only appear
  where a fee can actually be charged. Option VALUES are unchanged.
* Checkout: the fee hint is replaced by the owner-approved wording — "NOTE: Up
  to 4 guests can stay since this cottage has 1 queen-sized bed and a pull-out
  couch. A per-night fee of $50/night applies for each additional guest." The
  maximum comes from the cottage's own dropdown, the arrangement and the fee
  from settings, so it cannot state something false; it does not render at all
  on a cottage that tops out at the included guest count (33 and 34).
* Settings: "Fee amount shown to guests" (0 = read it off the Service, the
  default and the only value where label and charge cannot disagree) and
  "Sleeping arrangement", plus a "What the guest sees" preview that renders the
  labels and the note from the live settings.
* NEW: admin booking screen gating. The dog fields and the guest 3/4 name
  fields are native Checkout Fields, which MotoPress enables globally, so they
  rendered for every accommodation in wp-admin — booking Cottage 36 asked for
  the dog's type, size and hair. An admin-only script now shows/hides them to
  match the chosen accommodation, reactively. It fails open, keeps fields that
  already hold data on an existing booking visible, and offers a "Show all
  booking fields" escape hatch. No server-side backstop was extended into
  wp-admin — those exemptions are deliberate and remain.
* Coupons were switched off at the MotoPress option level by the owner
  (mphb_enable_coupons 0); no plugin change was needed or made.

= 0.3.6 =
* Docs correction (no behaviour change): the install steps named the RENDERED
  input names (mphb_guest3_first_name, mphb_dog_type) where they should have
  named the MotoPress Checkout Field SLUGS (guest3_first_name, dog_type).
  MotoPress builds the input as 'mphb_' . $field->name, so a field created with
  the prefix already on it renders as mphb_mphb_guest3_first_name, nothing
  matches, and the section silently never appears with no error shown. The
  readme, the settings page and the code docblocks now state both strings and
  which is which. The plugin's own defaults were always correct — they are
  input names, and they are unchanged.
* New "Checkout Field names: slug vs. rendered input name" section in the
  readme, plus a dedicated setup section for the guest 3/4 fields.
* Settings page: the three dog field-name rows now show a live status —
  the slug the value maps to, or a warning for the two ways it gets typed
  wrong (a double-prefixed mphb_mphb_ value, or a bare slug entered where the
  rendered input name belongs). Same spirit as the 0.3.5 service-ID status.
* Settings page: new "Checkout Fields these sections need" reference table,
  built from the same Config definition the JS and the server backstop use, so
  the documented names can't drift from the ones actually looked for.
* Checkout page: if a guest or dog Checkout Field exists but is
  double-prefixed, the plugin now says so instead of doing nothing — a console
  warning always, and an on-page notice naming the fix for logged-in
  administrators only.

= 0.3.5 =
* Guests 3 and 4 now collect first and last name (no phone) — owner decision.
  Sections "Guest #3 Information" / "Guest #4 Information" appear at 3+ / 4
  guests, mirroring guest 2; titles editable in settings; required-when-visible
  on the client and enforced by the shared server backstop on both transports.
  All three groups come from ONE Config definition so JS, PHP and the settings
  page can't drift. Requires the owner to create the four Checkout Fields.
* Pet fee now applies from the first night (owner decision), matching the
  pull-out couch fee. The unused "Daily bucket: minimum nights" setting row is
  removed (the option key is kept so saved settings stay valid). The pet
  backstop no longer demands a bucket service when the stay length is unknown.
* Pull-out couch: a fee hint under the guest dropdown ("$50.00 per night for
  each guest beyond 2") — the amount is read from MotoPress's own rendered
  service row, so the plugin still does no price math. When the offering is
  OFF and a guest arrives with 3–4 selected, the dropdown is capped AND a note
  explains it ("This cottage sleeps up to 2 guests.") instead of silently
  reducing them.
* Accessibility: the "Traveling with a dog?" toggle is a real fieldset/legend
  (the question now labels the radio group for screen readers); invalid fields
  get aria-invalid so the alert can be traced to a field; the dynamic "*" is
  aria-hidden (aria-required carries the meaning); keyboard focus is always
  visible on the pill fields (:focus-visible ring).
* Mobile: the Yes/No radio targets are now ≥44px tall (were ~20px).
* Settings: every service-ID field shows a live status — the service's title,
  or a warning that no published MotoPress Service has that ID (a typo can no
  longer silently leave a feature dormant). Thresholds description updated to
  say they're shared by both fees.

= 0.3.4 =
* New setting "Pull-out Couch Guests" (DCC → Custom Checkout), default ON.
  This is the existing extra-guest master switch, relabelled to the name Rob
  uses — the option key (guest_fee_enabled) is unchanged, so a saved value
  carries over. A second, separate checkbox was deliberately NOT added: two
  switches governing one feature would both have to be ON, which is a classic
  "why isn't this working" trap.
* OFF now actually stands the offering down. Previously OFF meant NO enforcement
  at all, so with MotoPress capacity raised to 4 a 3-4 guest booking went
  through FREE. With the switch off (or while any service ID is still 0, which
  is the same thing from a guest's point of view) the server now caps bookings
  at the included guest count and rejects any extra-guest service riding along.
  The client also disables — never removes or injects — guest-count options
  above the included count, so a guest isn't offered a choice that will be
  refused at submit.
* Gating is server-side: Extra_Guest_Service::validate_submission() no longer
  early-returns when the feature is off, and the shared find_violation() runs on
  both transports (form POST and the REST checkout route), so the cap holds for
  a crafted JSON request too.
* Pet-fee logic untouched.

= 0.3.3 =
* Audit pass over the 0.3.0-0.3.2 work; three defects fixed.
* SECURITY: the wp_loaded backstops stood down on a URI substring match while
  the REST guard only enforced on an exact route match. Any divergence (a
  trailing slash, a route variant) meant the legacy path stepped aside and the
  guard declined — leaving the submission completely unguarded, worse than
  before the REST work. Both sides now call one shared Rest_Guard::route_matches(),
  so they cannot disagree. Over-matching is harmless (a request without
  room_details makes every validator a no-op); under-matching was the risk.
* FIX: a 1-night booking with 3-4 guests was REJECTED outright. The extra-guest
  resolver returned 0 below the 2-night daily threshold, so the JS attached no
  service and the backstop then demanded one. The decided rule is a flat
  per-night fee "identical for every stay length", so the daily bucket now has
  no lower bound and applies from night one. (bucket_thresholds()['min_daily']
  still governs the PET fee only — that policy is separate and live-verified.)
  The backstop additionally skips rooms whose stay length is unknown rather
  than blocking a booking it cannot evaluate.
* FIX: silent overcharge risk. If a service's "for N guests" select was not
  found, the JS still ticked the checkbox — and MotoPress presets that select to
  FULL capacity, billing 4 extra guests instead of the real count. It now
  refuses to attach without control of the multiplier, so the server rejects
  with a clear message instead of overcharging.
* Cleanup: removed dead code left by earlier refactors (JS nextId()/UID, the
  unread cottageTypeId and requiredColor localized keys) and corrected the
  Checkout_Request and checkout.js file headers, which still described
  $_POST-only reading and omitted the extra-guest flow.

= 0.3.2 =
* Security (2026-08-30 audit): the server backstops read $_POST, but MotoPress's
  public REST route POST /mphb/v1/checkout also accepts application/json, which
  leaves $_POST empty — a crafted JSON request could book 3–4 guests on the
  4-sleeper cottages with no extra-guest fee (and dodge the pet/guest-2 rules).
  All three backstops are now transport-agnostic:
  - Each exposes a shared find_violation() validator; Checkout_Request can be
    fed the parsed REST body (WP_REST_Request::get_params(), JSON and multipart
    alike) instead of $_POST.
  - New Rest_Guard hooks rest_request_before_callbacks (core WP, post-parse,
    pre-callback — before the booking exists) on /mphb/v1/checkout and runs the
    three validators there. Rejections return a 422 JSON WP_Error with a
    readable message — not the 302 redirect that a fetch() follows opaquely
    (audit finding 2). A LEGITIMATE JSON checkout carrying the correct services
    now succeeds instead of being blanket-refused.
  - The wp_loaded $_POST backstops remain fully active for any non-REST form
    post; they stand down only on the checkout REST route, and only while the
    REST guard is registered (belt and braces).
  - No capability exemption on the REST route (it is the public booking
    pipeline); the wp-admin exemption for admin screens is unchanged.
* With this verified on staging, the mu-plugin stopgap
  wp-content/mu-plugins/dcc-checkout-rest-guard.php must be deleted in the same
  deployment window (it blanket-rejects JSON checkouts this version handles).

= 0.3.1 =
* Checkout copy & layout polish (six items from 2026-08-30 phone screenshots):
  - "Selected Accommodation:" -> "Accommodation:" via a gettext filter on
    MotoPress's "Accommodation Type:" msgid, checkout page only (delete the
    site's Loco Translate override for that msgid so the string has one owner).
  - Exactly one underline per field label: the label-text span keeps its
    underline; the processed label's own inline/theme underline (a second line
    at a different offset, which also underlined the marker) is now cleared,
    scoped via label.dcc_checkout-label-fixed — no global label reset. Section
    headers unchanged; required markers still red and never underlined.
  - Accommodation row: label on its own line, cottage link beneath (per room,
    so two-cottage checkouts split in both blocks).
  - Check-in/Check-out: label on its own line; date+time normalized to
    "August 29, 2026, from 2:00pm" (template whitespace inside <time> trimmed,
    " am"/" pm" collapsed) — text nodes only, <time datetime> attributes
    untouched, idempotent under re-renders.
  - Photo ID file input: pill-width like the other fields (100%, border-box),
    long filenames ellipsize, no horizontal scroll at 320px.

= 0.3.0 =
* New: extra-guest fee for guests 3 and 4. On the configured accommodations
  (default: the six 4-sleeper cottages 22/23/31/32/35/36), each guest beyond the
  second is charged per night via a native MotoPress Service (per night · per
  adult): the plugin hides the service's native row, checks it when the room's
  guest count exceeds 2, and sets the service's "for N guest(s)" select to the
  EXTRA guest count (adults − 2), so MotoPress prices fee × nights × extra
  natively — no price math in the plugin. Handled per room, so a two-cottage
  checkout charges only the room with extra guests. Cottages 33/34 stay capped
  at 2 and never get the fee.
* Settings: new "Extra guest fee" section — enable toggle, accommodations
  multi-select, and three bucket service-ID fields (defaults 0 = the feature is
  DORMANT until the real service ID is entered; enter the same ID in all three
  for flat pricing). Night thresholds are the shared bucket fields (pet fee and
  extra-guest fee alike).
* Server backstop (new class): per-room validation — the correct bucket service
  with the correct extra-guest multiplier on eligible rooms, no extra-guest
  service ever on ineligible rooms, and adults capped at 2 on non-listed
  cottages. Rejects with ?dcc_checkout_error=guests; skips AJAX and wp-admin
  (admin edits deliberately exempt).
* Fix: room-adults detection now excludes the services branch. A per-adult
  service renders its own "for N guest(s)" select whose name also matches the
  guests-select pattern (and MotoPress presets it to full capacity) — without
  the exclusion, the guest-2 flow would have misread it as the room's guest
  count. Same fix server-side: attached_service_ids() no longer collects a
  services[adults] value as a "service ID".

= 0.2.0 =
* Admin: the settings screen moved from its own top-level "DCC Custom Checkout"
  menu into the shared "DCC" (Dora Canal Court) menu, as WP Admin →
  DCC → Custom Checkout. The plugin registers the shared parent only if no
  other DCC plugin has (idempotent, order-independent), and removes the
  auto-generated duplicate first item.
* The page slug is unchanged, so the existing admin.php?page=dcc-custom-checkout
  URL still resolves — no redirect needed.
* Screen ID changes from toplevel_page_dcc-custom-checkout to
  dcc_page_dcc-custom-checkout. Nothing in the plugin compared against the old
  ID; the hook suffix returned by add_submenu_page() is now stored so future
  screen checks can't hard-code it.
* No checkout behaviour, field, or template changes.

= 0.1.9 =
* Style: center the "Traveling with a dog?" Yes/No options (were left-aligned).

= 0.1.8 =
* Hardening (review pass):
  - The server-side guest-2 and pet backstops now skip wp-admin requests
    entirely (alongside the existing AJAX skip), so MotoPress admin booking
    screens and deliberate admin overrides can never be redirected away.
  - Uninstall now deletes the plugin's settings option (dcc_checkout_settings);
    per-booking dog meta is still intentionally kept.
  - The required-marker cleanup (Part B) re-applies after MotoPress re-renders
    (coupon apply, country change) via the existing MutationObserver — both
    passes are idempotent.
  - The server-side "is this pet service attached?" scan now only matches IDs
    inside the room_details `services` branch (excluding quantities), instead of
    any numeric value in the payload — a future rate/room post whose ID collides
    with a pet Service ID can no longer false-positive.

= 0.1.7 =
* Fix: the dog Checkout Fields are enabled globally in MotoPress, so they
  rendered on EVERY cottage's checkout — including non-pet cottages, where the
  plugin previously left them alone (the pet flow bails there). The dog fields
  (and their "Pet Information" section) are now hidden and not-required by
  default on every checkout; only the "Traveling with a dog?" toggle on a pet
  cottage reveals them. Non-pet cottages (or pet fee disabled) never show them
  and can't be blocked by them.

= 0.1.6 =
* New: two conditional titled sections after "Your Information" —
  "Guest #2 Information" (guest-2 fields, shown at 2 guests) and
  "Pet Information" (dog fields, shown when the dog toggle = Yes). The plugin
  moves the native field rows into these sections (still inside the form, so
  MotoPress submission/saving is unchanged) and hides/shows + requires them at
  the SECTION level. Empty sections aren't rendered. The pet toggle + note stay
  in the services area.
* Section headers reuse `.mphb-customer-details-title` plus a new
  `.dcc_checkout-section-title` (added to the item-7 header rule) so they match
  (25px, underlined). Editable titles on the settings page (+ filters
  dcc_checkout_guest2_section_title / dcc_checkout_pet_section_title).

= 0.1.5 =
* Root-cause fix: MotoPress submits a NORMALIZED payload and DROPS bespoke,
  non-native inputs, so the old dcc_checkout_dog* fields never reached the server
  (dog info never saved; %dcc_dog_details% empty). The dog info fields are now
  NATIVE MotoPress Checkout Fields (owner-created; names set in settings); the
  toggle shows/hides + requires them, MotoPress saves them, and the email tag
  reads from that native meta. Removed the custom capture/persist code + the
  custom "Pet Details" meta box (MotoPress handles both natively now).
* Fixed the payload keys every server-side check used: room_details (was
  mphb_room_details), check_in_date/check_out_date (was mphb_*), and customer
  fields under customer_fields — so the guest-2 and pet backstops actually run.
  "Has dog" is now inferred server-side from the attached pet Service.
* Safety: server backstops skip AJAX submissions (a redirect would break an AJAX
  checkout response); client-side validation remains the primary guard.
* Settings: new "Dog info fields" section to enter the three native field names.

= 0.1.4 =
* CRITICAL fix: the email-tag registration added a string element to
  mphb_email_booking_tags, but MotoPress's EmailTemplater::setupTags() treats it
  as a numeric array of tag arrays and does $tag['name'] on each element — a
  string there fataled on init (whole site down on activation). Now appends a
  properly-shaped ['name' => 'dcc_dog_details', 'description' => …] array, and
  registers on mphb_email_booking_tags only (dropped the unverified
  mphb_email_booking_details_tags hook).

= 0.1.3 =
* Fix (guest-2): target the fields by NAME (mphb_guest2_first_name/last_name/
  phone) instead of by Checkout Fields post ID, which isn't in the markup. JS
  hides/shows + requires the row (input.closest('.mphb-text-control')); PHP
  enforces required-when-adults>=2 by reading the posted names.
* Fix (dog-info save): the previous creation hooks did not exist. Now stash the
  dog values on wp_loaded and persist to booking meta on the real creation hook
  mphb_booking_create_before_set_status (+ mphb_create_booking_by_user fallback).
* Fix (dog-info email): the previous email filters did not exist. Now register a
  %dcc_dog_details% tag via mphb_email_booking_tags / mphb_email_booking_details_tags
  and supply its value from booking meta via mphb_email_replace_tag.
* New: admin settings page "DCC Custom Checkout" — enable pet fee on/off, choose
  which accommodations it applies to (multi-select, default Cottage 34), and set
  the service IDs + night thresholds. Config is now settings-backed (option
  dcc_checkout_settings) with the same values still filterable.
* Verified-live selectors from v0.1.2 retained; the styling, dog toggle, native
  service ticking, and end-to-end pet fee are unchanged.

= 0.1.2 =
* Fix: the plugin scoped everything to `.mphb-checkout`, which does not exist in
  this MotoPress build, so nothing applied. Re-scoped the CSS and the JS root to
  the real checkout form `.mphb_sc_checkout-form`, and corrected the inner
  selectors verified live: buttons (input.button / button.mphb-apply-coupon-code-button),
  service rows (.mphb_sc_checkout-service in .mphb_sc_checkout-services-list),
  guests select (select.mphb_sc_checkout-guests-chooser), guest-2 customer-field
  wrappers (.mphb-text-control / .mphb-customer-*), and upload helper text.
  No behaviour change to Parts B/C/D logic; Part D server hooks stay provisional.

= 0.1.1 =
* Renamed the plugin to "DCC Custom Checkout" (folder, main file, and display
  name). No behaviour change. Internal prefixes (DCC_Checkout\, dcc_checkout_)
  and text-domain (dcc-checkout) are unchanged.

= 0.1.0 =
* Initial build: Parts A–D. Pet-fee PHP drafted against MotoPress's documented
  service/booking APIs; to be verified/tuned on staging.
