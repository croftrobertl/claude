=== DCC Custom Checkout ===
Contributors: doracanalcourt
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 0.3.2
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

Part C — Second guest, conditional on guest count
  * The Guest-2 fields (First name 8312, Last name 8313, Phone 8314) are hidden
    unless "Number of Guests" = 2. At 2 guests they are shown, marked required,
    and validated on submit. A server-side backstop blocks a 2-guest submission
    that leaves any of the three blank, so the client rule can't be bypassed.

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
      2–6 nights  -> Daily   (ID 17712, $25/night)
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

== Setup: extra-guest fee (one-time) ==

1. Raise mphb_adults_capacity AND mphb_total_capacity to 4 on the six cottages
   (the checkout dropdown is built from capacity — the plugin never injects
   options).
2. Create ONE MotoPress Service "Extra Guest Fee": price 50, per night,
   per adult, assigned to the six accommodation types only.
3. WP Admin → DCC → Custom Checkout → "Extra guest fee" → enter that service's
   ID into all three bucket fields (flat pricing) and keep the feature enabled.
   While any ID is 0 the feature is dormant.

== Setup: dog info fields (one-time, required for Part D data capture) ==

1. Bookings → Settings → Checkout Fields → add three fields, set NOT required:
     * Dog type  — text            (e.g. name mphb_dog_type)
     * Dog size  — select: 10–20 lbs / 20–30 lbs / 30–40 lbs   (mphb_dog_size)
     * Dog hair  — select: Short / Medium / Long               (mphb_dog_hair)
2. WP Admin → DCC → Custom Checkout → "Dog info fields" → enter those exact field
   names. The toggle then shows/hides + requires them; MotoPress saves them.
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
  * Service IDs (17712/17711/14926) and night thresholds (2–6 / 7–29 / 30+),
    global across all pet accommodations.

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
  dcc_checkout_guest_fee_enabled    (bool)
  dcc_checkout_guest_accommodations (int[]; default the six 4-sleeper cottages)
  dcc_checkout_guest_service_ids    (daily/weekly/monthly; defaults 0 = dormant)
  dcc_checkout_included_guests      (default 2)
  dcc_checkout_dog_field_names      (default mphb_dog_type / mphb_dog_size / mphb_dog_hair)
  dcc_checkout_dog_meta_keys        (default = the dog field names)
  dcc_checkout_guests_selector      (default select[name^="mphb_room_details"][name*="[adults]"])
  dcc_checkout_page_id / dcc_checkout_is_checkout_page (enqueue detection overrides)

== Requirements ==

* MotoPress Hotel Booking (active). The checkout is the MotoPress Elementor
  "Checkout Form" widget on /submit-booking/.

== Changelog ==

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
