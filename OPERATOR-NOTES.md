# Operator notes for doracanalcourt.com

Notes for Erica & Rob, generated 2026-06-24 from a session-time snapshot review.
Forward / share as useful. None of these are urgent failures — the site is up and
booking fine — but each one would tighten something.

---

## 1. Airbnb iCal feed appears to be missing for Cottage 31 (Hibiscus Hut)

The snapshot shows iCal feeds configured for all 8 cottages on Booking.com and
VRBO (8 of 8 rooms each), but only **7 of 8 rooms** on Airbnb — and the missing
one is **Cottage 31 / Hibiscus Hut** (physical room ID 1068).

**What this means in practice.** Airbnb reservations for any other cottage flow
into our MotoPress booking storage every 15 minutes via iCal sync, so they
correctly block off availability on the website calendar. For Hibiscus Hut,
that link doesn't exist — so an Airbnb guest could book Hibiscus on the same
night a direct-website guest tries to book it, and the website wouldn't have
known to mark it occupied. Double-booking risk.

**To verify.**
1. Log into the Airbnb host dashboard.
2. Look at the Hibiscus Hut listing. Is it actually listed on Airbnb at all?
   - If no — this is intentional, ignore this note.
   - If yes — go to "Listing → Calendar → Availability settings → Sync calendars"
     and check the Export URL / iCal export is enabled.
3. In WordPress, go to MotoPress → Calendar → Sync (or equivalent) and confirm
   Hibiscus Hut has an Airbnb feed URL configured. If not, paste the export
   URL from step 2 in.

---

## 2. Production hygiene — three cleanup items that have been deferred

These came up in a database review. None affect bookings; they're cruft from
plugins that were removed but left tables/options behind, plus one running
plugin that shouldn't be on in production.

### 2a. Query Monitor is active on the live site

Query Monitor is a developer debug plugin. It adds query, hook, and HTTP-request
profiling overhead to every WordPress request and leaks debug data to anyone
logged in as an admin. It's great during development; it shouldn't run in
production.

**Action.** WP Admin → Plugins → Query Monitor → Deactivate. Re-activate
only when actively debugging something.

### 2b. WooCommerce is installed but unused

WooCommerce was installed at some point but never carried products or orders.
It's not in the active-plugins list anymore, but its ~25 database tables are
still present and it can still register hooks on activation. Pure overhead.

**Action.** WP Admin → Plugins → WooCommerce → Delete (not just deactivate).
After deletion run the WP-CLI cleanup or use a DB tool:
```sql
DROP TABLE portal_wc_*;
DROP TABLE portal_woocommerce_*;
```
(Test on staging first; verify with Database Cleaner plugin if uncertain.)

### 2c. Old W3 Total Cache option rows in the database

W3TC was uninstalled but ~10 option rows remain in `portal_options`. Harmless
but messy. SpeedyCache Pro is now the active page-cache plugin.

**Action.**
```sql
DELETE FROM portal_options WHERE option_name LIKE 'w3tc%';
```

### 2d. WP Staging duplicate table set (`wpstg0_*`)

A previous staging operation left ~110 duplicate tables. They double the
database backup size with no benefit.

**Action.** WP Admin → WP Staging → Existing Staging Sites → Delete. If WP
Staging is no longer installed, drop the tables manually (back up first):
```sql
DROP TABLE wpstg0_*;
```

### 2e. Probe artifact: check for `wp-content/plugins/apikey/` directory

A previous malware-scanner log shows it caught and quarantined a file at
`wp-content/plugins/apikey/apikey.php`. The directory shouldn't exist now,
but worth verifying via cPanel File Manager or SSH:
```
ls -la /home2/doracurt/public_html/wp-content/plugins/apikey/
```
If the directory exists with `.suspected` files in it, delete the whole
directory.

---

## 3. API keys stored in the database

Three AI service API keys live in `portal_options` (Anthropic Claude,
OpenAI, Google AI). If the database has ever been exported or shared,
those keys should be rotated.

**Action.**
- console.anthropic.com → API Keys → revoke the current key, generate a new
  one, paste into WP Admin → AI → Settings → Anthropic provider.
- platform.openai.com/api-keys → same flow.
- aistudio.google.com → API keys → same flow.

Also worth reviewing in Google Cloud Console: the three Google Maps / Places
API keys used by Elementor, the Google Reviews widget, and MotoPress. Confirm
each is restricted to `doracanalcourt.com` referrer.

---

## 4. mphb-availability-calendar plugin status

For Claude Code's reference, not yours — but useful to know what was changed
in this session:

- v0.9.7: dead-code sweep + info-popup keyboard focus-trap parity
- v0.9.8: on mobile, the calendar's cottage column now shows just the cottage
  number (`#22`, `#23`, etc.) instead of a truncated name above it. Rows are
  shorter; day cells are squarer; tap any number to open the existing info
  popup with the full cottage name + details.
- v0.9.9: the mobile `#N` IDs are centered and use tabular numerals so every
  digit lines up character-for-character down the column.

Nothing else in this list affects bookings or visible behavior; the plugin is
otherwise stable.
