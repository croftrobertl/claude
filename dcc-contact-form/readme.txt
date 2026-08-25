=== DCC Contact Form ===
Contributors: doracanalcourt
Tags: elementor, contact form, recaptcha, email, spam
Requires at least: 6.0
Tested up to: 7.0
Requires PHP: 8.0
Stable tag: 1.2.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Self-contained native Elementor (free) contact form for Dora Canal Court.
Replaces a single WPForms form — look, email, spam protection and entry
storage — with no dependency on WPForms.

== Description ==

DCC Contact Form is a lightweight, self-contained WordPress plugin that adds a
native **Elementor** widget ("DCC Contact Form", in the **Dora Canal Court**
category). It reproduces the site's existing WPForms contact form as a first-
class Elementor widget so the WPForms subscription can be cancelled.

Highlights:

* **Native Elementor free widget** — no Elementor Pro required, no Pro-only
  base classes or controls.
* **Fully configurable** — a fields repeater (text, name, email, phone,
  textarea, select, checkbox, number), 100% / 50% column widths, submit and
  confirmation text, and email routing, all editable in the Elementor panel.
* **Four layered spam defences** — honeypot, time-trap, keyword filter and
  Google reCAPTCHA v3 (score threshold configurable; the floating badge is
  hidden and replaced with the compliant text line under the button).
* **Branded HTML email** — round logo header, rounded content card with bold
  labels, muted footer, and a `prefers-color-scheme` dark variant. Sends from a
  site-domain address (better SPF/DMARC deliverability) with Reply-To set to the
  submitter.
* **Entry storage** — every submission is saved to a custom database table
  (no IP address, no user-agent, no cookies, no UUID — GDPR-friendly) and
  viewable under the shared **DCC** admin menu.
* **Performance-minded** — vanilla JS, no external libraries or CDNs (aside from
  Google's reCAPTCHA script, and only when enabled). CSS/JS load **only** on
  pages where the widget is present, and are flagged to stay out of aggressive
  combine/defer caches (SpeedyCache Pro friendly).
* **Standalone** — works with WPForms fully deactivated or removed.

== Installation ==

1. In WP-Admin, go to **Plugins → Add New → Upload Plugin** and upload
   `dcc-contact-form.zip`.
2. Click **Install Now**, then **Activate**. Activation creates the submissions
   table automatically.
3. Edit a page with **Elementor**, search the widget panel for
   **DCC Contact Form** (under the *Dora Canal Court* category) and drag it onto
   the page. It arrives pre-loaded with the Name / Email + Phone / Message
   layout and a "Send Message" button.
4. Publish. The form submits via AJAX (no page reload) and emails
   `contact@doracanalcourt.com` by default.

== reCAPTCHA v3 setup (WP-Admin) ==

The reCAPTCHA secret key is sensitive, so it is configured site-wide in
WP-Admin rather than in the (per-page) Elementor panel.

1. Create a **reCAPTCHA v3** site at https://www.google.com/recaptcha/admin
   (choose the *v3* type and add your domain). Google gives you a **Site Key**
   and a **Secret Key**.
2. In WP-Admin go to **DCC → Contact Form**.
3. Paste the **Site Key** and **Secret Key**.
4. Optionally adjust:
   * **Score threshold** — default **0.4**. Submissions scoring below this are
     rejected.
   * **Minimum submit time** — default **2** seconds (time-trap).
   * **Prohibited words** — one word/phrase per line for the keyword filter
     (empty by default).
5. Save.

**Graceful degrade:** if either key is left blank, reCAPTCHA is skipped
entirely and the form still works — the honeypot, time-trap and keyword filter
remain active. A missing key never breaks the form.

Note: when reCAPTCHA is enabled with keys set, it is enforced on every
submission path (including the non-JavaScript fallback), so submitting requires
JavaScript — the same requirement WPForms' v3 integration has. Visitors with JS
disabled see the captcha failure message rather than a silent bypass.

To turn any individual layer on or off per form, use the **Spam Protection**
section of the Elementor panel.

== Admin: submissions ==

**DCC → Form Submissions** lists every submission (newest first) with a
status badge (Received / Spam), a **View** screen showing all fields, and
single or bulk **Delete**. There is no CSV export and no auto-purge, by design.

== Data & uninstall ==

Submissions store only the field values, a timestamp and the spam-check result.
No IP address, user-agent, cookie or UUID is stored. By design, uninstalling the
plugin does **not** delete your data (submissions, settings and per-form
configuration are preserved).

== Changelog ==

= 1.2.0 =
* Admin: both screens moved out of this plugin's own top-level menu and into the
  shared **DCC** menu that all DCC plugins register into — **DCC → Contact Form**
  (settings) and **DCC → Form Submissions** (the log). The old top-level "DCC
  Contact Form" menu is gone.
* The parent menu is registered idempotently, so exactly one "DCC" menu exists
  no matter which DCC plugins are active or in what order they load, and this
  plugin still creates it when it is the only one installed.
* Existing bookmarks keep working: both page slugs are unchanged and the old
  parent was already `admin.php`, so `admin.php?page=dcc-contact-form` and
  `admin.php?page=dcc-contact-settings` resolve exactly as before — no redirect
  needed.
* Admin screen IDs changed with the parent (`toplevel_page_dcc-contact-form` →
  `dcc_page_dcc-contact-form`, `dcc-contact-form_page_dcc-contact-settings` →
  `dcc_page_dcc-contact-settings`). The plugin held no hard-coded screen IDs;
  the assigned hook suffixes are now stored and exposed via
  `Admin::screen_ids()` so future code never hard-codes one.
* No changes to form handling, validation, spam protection or stored
  submissions.

= 1.1.1 =
* Fix: a logged-in user submitting from a cache-served page (whose embedded
  nonce belongs to an anonymous visitor) is no longer rejected with "Your
  request could not be verified" — logged-in submissions now go through the
  same validation path as visitors' (same-origin referer check plus all four
  spam layers), so the site owner's own logged-in tests behave like real
  visitor submissions.

= 1.1.0 =
* Security: reCAPTCHA is now enforced on the non-JS fallback endpoint too —
  previously a bot POSTing directly to the form's action URL bypassed the
  captcha layer entirely. (A genuine no-JS visitor now sees the captcha failure
  message when reCAPTCHA is enabled; disable the reCAPTCHA toggle to restore a
  fully no-JS-capable form.)
* Fix: the Elementor editor preview no longer overwrites the live submission
  config with unsaved draft settings; the trusted config now only updates on
  real front-end renders after publishing.
* Hardening: the honeypot field was renamed to an innocuous name/label so bots
  can't skip it by pattern-matching ("hp"/"leave this empty"); the old field
  name is still honoured for cached pages.
* Hardening: server-side reCAPTCHA verification now also checks the token's
  action and solve hostname, rejecting tokens minted elsewhere.
* i18n: client-side validation messages are now translatable
  (wp_localize_script) instead of hardcoded English.
* Fix: a reCAPTCHA threshold of 0 is now honoured as entered (accept any
  verified token) instead of being silently reset to 0.4; a blank field still
  means the 0.4 default.

= 1.0.3 =
* Style: placeholder text in inputs and the textarea is now centre-aligned.
* Style: the form now shrinks to an inline, centred block (like the old form)
  instead of stretching the full page width, via a new Style → Layout → "Form
  Max Width" control (default 600px; set to 100% for full width).

= 1.0.2 =
* Style: field labels now render true black (#000), overriding the theme's
  default gray label color; the Elementor label-color control also defaults to
  black.
* Style: the submit button is no longer forced ALL-CAPS by the theme — it shows
  the button text as authored ("Send Message"). Blue pill styling unchanged.
* Style: Email + Phone reliably share one 50/50 row. The columns are now held by
  max-width instead of a calc() flex-basis, which Safari/iOS ignored inside the
  `flex` shorthand (causing the fields to stack full-width). Name and Message
  remain full-width. No functional changes.

= 1.0.1 =
* Fix: opening any page in the Elementor editor failed with a 500 error.
  Widget::get_script_depends() called get_settings_for_display(), which
  Elementor invokes generically (with null settings) in the editor preview,
  throwing a TypeError. The reCAPTCHA script dependency is now gated on the
  site-wide key configuration only, never on per-instance settings.

= 1.0.0 =
* Initial release. Native Elementor widget, AJAX + non-JS submission, four-layer
  spam protection (honeypot, time-trap, keyword filter, reCAPTCHA v3), branded
  light/dark HTML email, custom-table entry storage, and an admin submissions +
  settings UI.
