=== DCC Custom Checkout ===
Contributors: doracanalcourt
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 0.1.4
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
  * "Yes" reveals three required info fields: Dog type, Size, Hair length.
  * The correct native Service is auto-applied by length-of-stay bucket:
      2–6 nights  -> Daily   (ID 17712, $25/night)
      7–29 nights -> Weekly  (ID 17711, $20/night)
      30+ nights  -> Monthly (ID 14926, $10/night)
    so Price Breakdown / Total / Tax update natively (the fee is intentionally
    untaxed — no tax logic is added). A server-side check recomputes nights and
    rejects a submission whose attached pet service doesn't match the bucket, or
    that is missing the required info, or that attaches a pet service when the
    toggle said "No".
  * Dog type / Size / Hair are saved to booking meta (shown in a "Pet Details"
    box on the admin booking screen) and exposed to emails via the tag
    %dcc_dog_details% (add it to your MotoPress email template to include it).

== Admin settings ==

WP Admin → "DCC Custom Checkout":
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
  dcc_checkout_guests_selector      (default select[name^="mphb_room_details"][name*="[adults]"])
  dcc_checkout_page_id / dcc_checkout_is_checkout_page (enqueue detection overrides)

== Requirements ==

* MotoPress Hotel Booking (active). The checkout is the MotoPress Elementor
  "Checkout Form" widget on /submit-booking/.

== Changelog ==

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
