=== DCC Custom Checkout ===
Contributors: doracanalcourt
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 0.3.6
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

== Setup: Pull-out Couch Guests (one-time) ==

1. Raise mphb_adults_capacity AND mphb_total_capacity to 4 on the six cottages
   (the checkout dropdown is built from capacity — the plugin never injects
   options).
2. Create ONE MotoPress Service "Extra Guest Fee": price 50, per night,
   per adult, assigned to the six accommodation types only.
3. WP Admin → DCC → Custom Checkout → "Pull-out Couch Guests" → tick the box
   and enter that service's ID into all three bucket fields (flat pricing).
   While the box is off, or while any ID is 0, the offering stands down and
   bookings are capped at the included guest count.

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
