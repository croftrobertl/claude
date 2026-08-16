=== DCC Custom Checkout ===
Contributors: doracanalcourt
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 0.1.2
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

Part D — Cottage 34 pet flow + per-night pet fee (native MotoPress Services)
  * Applies to Cottage 34 (accommodation type ID 1607) only.
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
    box on the admin booking screen) and appended to the notification email.

== Configuration (filters) ==

All site-specific IDs/thresholds are filterable — no admin page:

  dcc_checkout_cottage_type_id      (default 1607)
  dcc_checkout_pet_service_ids      (default daily 17712 / weekly 17711 / monthly 14926)
  dcc_checkout_bucket_thresholds    (default min_daily 2 / min_weekly 7 / min_monthly 30)
  dcc_checkout_guest2_field_ids     (default first 8312 / last 8313 / phone 8314)
  dcc_checkout_guests_selector      (default select[name^="mphb_room_details"][name*="[adults]"])
  dcc_checkout_page_id / dcc_checkout_is_checkout_page (enqueue detection overrides)

== Staging verification (Part D) ==

The exact MotoPress hook names for (a) reading reserved services, (b) forcing the
bucket service server-side, and (c) saving booking meta / injecting email content
vary by MotoPress version and are to be confirmed on staging against the installed
build. They are wired defensively (candidate hooks that don't exist simply never
fire). The reject-on-mismatch validation reads $_POST directly and does NOT depend
on any MotoPress internal hook, so the anti-tamper safety property holds regardless.
Verify + tune the pet-fee behaviour with real test bookings on Cottage 34 before
going live.

== Requirements ==

* MotoPress Hotel Booking (active). The checkout is the MotoPress Elementor
  "Checkout Form" widget on /submit-booking/.

== Changelog ==

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
