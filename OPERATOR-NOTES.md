# Operator notes for doracanalcourt.com

Notes for Erica & Rob, generated 2026-06-24 from a session-time snapshot review.
Forward / share as useful. None of these are urgent failures — the site is up and
booking fine — but each one would tighten something.

---

## 1. Production hygiene — five cleanup items that have been deferred

These came up in a database review. None affect bookings; they're cruft from
plugins that were removed but left tables/options behind, plus one running
plugin that shouldn't be on in production.

### 1a. Query Monitor is active on the live site

Query Monitor is a developer debug plugin. It adds query, hook, and HTTP-request
profiling overhead to every WordPress request and leaks debug data to anyone
logged in as an admin. It's great during development; it shouldn't run in
production.

**Action.** WP Admin → Plugins → Query Monitor → Deactivate. Re-activate
only when actively debugging something.

### 1b. WooCommerce is installed but unused

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

### 1c. Old W3 Total Cache option rows in the database

W3TC was uninstalled but ~10 option rows remain in `portal_options`. Harmless
but messy. SpeedyCache Pro is now the active page-cache plugin.

**Action.**
```sql
DELETE FROM portal_options WHERE option_name LIKE 'w3tc%';
```

### 1d. WP Staging duplicate table set (`wpstg0_*`)

A previous staging operation left ~110 duplicate tables. They double the
database backup size with no benefit.

**Action.** WP Admin → WP Staging → Existing Staging Sites → Delete. If WP
Staging is no longer installed, drop the tables manually (back up first):
```sql
DROP TABLE wpstg0_*;
```

### 1e. Probe artifact: check for `wp-content/plugins/apikey/` directory

A previous malware-scanner log shows it caught and quarantined a file at
`wp-content/plugins/apikey/apikey.php`. The directory shouldn't exist now,
but worth verifying via cPanel File Manager or SSH:
```
ls -la /home2/doracurt/public_html/wp-content/plugins/apikey/
```
If the directory exists with `.suspected` files in it, delete the whole
directory.

---

## 2. API keys stored in the database

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

## 3. mphb-availability-calendar plugin status

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
