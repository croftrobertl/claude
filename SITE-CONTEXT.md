# SITE-CONTEXT.md
> Snapshot date: 2026-06-23. DB export: doracurt_wp128.sql (150 MB uncompressed).
> This file contains NO secrets. See the companion SITE-CONTEXT-FULL.md in
> croftrobertl/dcc-site-snapshot for credential-adjacent details.

---

## 1. Site identity

| Key | Value |
|-----|-------|
| Domain | https://doracanalcourt.com |
| Description | Vacation rental cottages & motel rooms on the Dora Canal, Tavares FL |
| WordPress | DB schema version 61833 (≈ WP 6.9.x) |
| PHP | 8.3.x (HostGator shared hosting) |
| Server path | `/home2/doracurt/public_html/` |
| DB name / prefix | `doracurt_wp128` / `portal_` |
| WP_DEBUG | false (production) |
| Memory limit | 512 MB (WP_MEMORY_LIMIT + WP_MAX_MEMORY_LIMIT) |
| Table prefix | `portal_` (live) · `wpstg0_` (WP Staging leftover — unused) |

---

## 2. Active theme

| | |
|--|--|
| Theme | **Bravada** v1.2.0 by Cryout Creations |
| Child theme | None |
| Nav menus | Primary (menu id 28), Top (same), Socials, Sidebar |
| Custom logo | Media attachment ID 4383 |

Bravada's Elementor kit resets inputs/buttons with `(0,3,1)` specificity. All
mphb-availability-calendar style-control selectors must use the `Widget::SEL`
prefix (doubled `.mphbac-root.mphbac-root`) to reach `(0,4,0)` and win.

---

## 3. Active plugins (33 at snapshot time)

### Booking & MotoPress ecosystem

| Plugin | Version | Notes |
|--------|---------|-------|
| MotoPress Hotel Booking | 6.1.0 | Core booking engine |
| Hotel Booking Checkout Fields | 1.2.3 | Extra checkout form fields |
| Hotel Booking & Elementor Integration | 1.2.1 | Elementor widget bridge |
| Hotel Booking Notifier | 1.4.1 | Event-driven email triggers |
| Hotel Booking Styles & Templates | 1.1.5 | Template overrides |
| MotoPress Events Calendar | 2.3.0 | Separate events (not bookings) |
| MPHB Invoices | (not in plugins zip) | Adds PDF invoices to bookings |

### Custom / DCC-built plugins

| Plugin | Version | Description |
|--------|---------|-------------|
| **MPHB Availability Calendar** | 0.9.8 | Elementor widget; multi-property grid calendar |
| **Dora Canal Cottage Selector** | 0.11.0 | Client-rendered Elementor widget + shortcode; helps guests choose a cottage. No MotoPress dep. |
| **DCC Guest Guide** | 0.9.7.20 | Elementor widget; sectioned guest guide with multiple layout + reveal modes, Cmd-K search |
| **Features & Amenities Widget** | 1.6.1 | Elementor widget; sectioned amenity list per cottage |

### Page building & frontend

| Plugin | Version |
|--------|---------|
| Elementor (free) | not in zip — installed separately |
| Stratum Widgets for Elementor | 1.6.2 |
| Stratum Mega Menu | 1.0.5 |
| Essential Addons for Elementor Lite | (not in zip) |
| Angie | 1.1.9 — CSS/JS snippet manager |

### AI stack (WordPress.org experimental)

| Plugin | Version | Notes |
|--------|---------|-------|
| AI | 1.0.2 | WordPress.org AI capabilities framework |
| AI Provider for Anthropic | 1.0.3 | Connects AI plugin to Claude API |
| AI Provider for Google | 1.1.0 | Google Gemini provider |
| AI Provider for OpenAI | 1.0.3 | OpenAI provider |
| MCP Adapter | 0.5.0 | WordPress Abilities API → MCP tools/resources |

**Security note:** All three AI API keys are stored in `portal_options`
(option names `connectors_ai_anthropic_api_key`, `connectors_ai_openai_api_key`,
`connectors_ai_google_api_key`). **Rotate all three.** See §9 for urgency detail.

### SEO & Analytics

| Plugin | Version | Notes |
|--------|---------|-------|
| All in One SEO Pack | (not in zip — vendor) | Active SEO plugin |
| Loco Translate | 2.8.5 | Translation management |
| WPCode Lite (Insert Headers & Footers) | 2.3.6 | Code snippets injector |

Note: Rank Math and Yoast SEO tables exist in the DB (`portal_rank_math_*`,
`portal_yoast_*`) from historical installs. Neither plugin is currently active.
AIOSEO is the live SEO plugin.

### Forms

| Plugin | Version | Notes |
|--------|---------|-------|
| WPForms | (not in zip — vendor) | Active form plugin |

Historical: Everest Forms (`evf_*`), Formidable Forms (`frmt_*`), and WP Forms Lite
tables all exist in the DB — those plugins are inactive/removed.

### Caching (THREE-layer stack — see §7)

| Plugin | Version | Notes |
|--------|---------|-------|
| SpeedyCache | 1.3.9 | Free tier — pair with Pro |
| SpeedyCache Pro | 1.3.9 | Active cache plugin |
| Endurance Page Cache | 2.3.0 | HostGator mu-plugin (cannot be removed) |

### Utilities

| Plugin | Version |
|--------|---------|
| Query Monitor | 4.0.7 |
| WP Crontrol | 1.21.0 |
| Database Cleaner | 1.3.7 |
| UpdraftPlus | (not in zip — vendor) |
| Jetpack | (not in zip — vendor) |
| WP Staging | (in wpstg0_ tables, inactive) |
| wp-plugin-hostgator | (not in zip — HostGator bundled) |

### WooCommerce (installed, UNUSED)

WooCommerce and its full table set (`portal_wc_*`, `portal_woocommerce_*`) are present.
There are **zero WooCommerce products and zero WooCommerce orders** in the DB.
WooCommerce is not in the current active_plugins list but its tables persist.
**Recommendation: uninstall WooCommerce and clean its tables** — they add 25+ tables
of dead weight and a non-trivial attack surface.

WP Shopping Cart (`portal_wpsc_*`) has 11 legacy rows from an even older era.

---

## 4. MotoPress data model (as configured)

### Cottages: room types and physical rooms

Each cottage is modeled as one **room type** (the bookable unit shown to guests)
with exactly one **physical room** (no multi-unit types).

| Cottage | Room Type ID | Physical Room ID |
|---------|-------------|-----------------|
| Cottage 22: The Boathouse | 1071 | 1072 |
| Cottage 23: The Lighthouse | 1069 | 1070 |
| Cottage 31: Hibiscus Hut | 1067 | 1068 |
| Cottage 32: Flamingo Bungalow | 1065 | 1066 |
| Cottage 33: Pineapple Place | 1604 | 1613 |
| Cottage 34: Coconut Cottage | 1607 | 1614 |
| Cottage 35: Blue Heron Hideaway | 1740 | 1806 |
| Cottage 36: Sunshine Suite | 1742 | 1807 |

All 8 cottages are `publish` status.

### Booking data summary (snapshot date)

| Status | Count |
|--------|-------|
| confirmed | 469 |
| cancelled | 237 |
| abandoned | 32 |
| **Total** | **738** |

Most recent confirmed bookings extend to late 2026 (Oct 2026 sighting in sample).

### iCal sync (OTA channel feeds)

All 8 physical rooms have iCal feeds configured from three OTAs:

| OTA | Room count |
|-----|-----------|
| Booking.com | 8 |
| Airbnb | 7 (room 1068/Hibiscus Hut missing?) |
| VRBO | 8 |

Feeds are stored in `portal_mphb_sync_urls`. MotoPress syncs these every 15 minutes
via its own cron; imported reservations land as `mphb_booking` posts (same as
direct bookings). The mphb-availability-calendar plugin reads these correctly.

### Manual host blocks

`portal_mphb_blocks` is empty — no manual blocks exist at snapshot time.

### Key MotoPress options

| Option | Value |
|--------|-------|
| Checkout page ID | 1399 |
| Currency | USD (symbol before price) |
| Admin notification recipients | erica@doracanalcourt.com, rob@doracanalcourt.com |
| Admin confirms before guest | yes (pending → confirmed flow) |
| Skip booking rules for admin | yes |

### Compatibility note for mphb-availability-calendar

- The plugin reads `mphb_reserved_room` posts (738 records) and `portal_mphb_blocks`
  to determine occupancy. This is correct for the current data model.
- `Data_Provider::query_occupied_room_days()` SQL path is the right approach —
  the PHP API was intentionally bypassed due to room-type filter bugs in MPHB 6.x.
- All timezone math is US/Eastern (Florida) — confirmed correct for the property.
- The `mphbac_` transient prefix and 900 s TTL align with the 15-min iCal sync.

---

## 5. Custom code inventory

### Angie snippets (wp-content/angie-snippets/)

Three environments: `prod/`, `dev/`, `temp/`. Production has ~24 active snippets
(snippet IDs 10765–12900). These are CSS/JS injections managed via the Angie plugin.
Notable: `snippet-11984` is referenced in AIOSEO performance report as unminified JS.

### mu-plugins (auto-loaded, cannot be deactivated)

| File | Purpose |
|------|---------|
| `endurance-page-cache.php` | HostGator's built-in page cache purge layer |
| `sso.php` | HostGator SSO helper |

### Drop-in PHP files (wp-content/)

| File | Purpose |
|------|---------|
| `advanced-cache.php` | SpeedyCache's drop-in (handles object/page cache) |
| `db.php` | Unknown — inspect before touching |

---

## 6. Site architecture overview

```
doracanalcourt.com (HostGator shared, cPanel)
│
├── WordPress 6.9.x
│   ├── Theme: Bravada 1.2.0 (Cryout Creations)
│   ├── Page builder: Elementor (free)
│   ├── Booking engine: MotoPress Hotel Booking 6.1.0
│   │   ├── 8 cottage room types, 1 physical room each
│   │   ├── Direct bookings (admin confirmed)
│   │   └── iCal sync: Booking.com + Airbnb + VRBO (every 15 min)
│   │
│   ├── Custom Elementor widgets (all DCC-built):
│   │   ├── mphb-availability-calendar — multi-property availability grid
│   │   ├── dcc-cottage-selector — guest decision tool
│   │   ├── dcc-guest-guide — in-stay guest information
│   │   └── features-amenities — per-cottage amenity lists
│   │
│   ├── AI stack: WordPress AI + providers (Anthropic/OpenAI/Google) + MCP Adapter
│   ├── SEO: AIOSEO (active) — Rank Math + Yoast tables persist (inactive)
│   └── Forms: WPForms
│
├── Cache layers (3):
│   ├── SpeedyCache Pro 1.3.9 (active, configured)
│   ├── Endurance Page Cache 2.3.0 (HostGator mu-plugin, always-on)
│   └── W3 Total Cache (REMOVED plugin, but ~10 option rows linger in DB)
│
└── DB: MySQL, 150 MB, prefix portal_
    ├── Live tables: portal_* (~110 tables)
    └── Staging leftover: wpstg0_* (~110 duplicate tables, dead weight)
```

---

## 7. Performance & plugin conflict analysis

### Cache stack (three layers)

The site has historically run W3 Total Cache + SpeedyCache simultaneously. As of the
snapshot, W3TC is no longer an active plugin, but **10 W3TC option rows remain in
`portal_options`** (stats and setup data — not active config). The plugin file was
removed but the DB was never cleaned.

Current stack:
1. **Endurance Page Cache** (HostGator mu-plugin) — always present, handles server-level purge signaling
2. **SpeedyCache Pro** — handles page/object/browser caching with 526 option rows configured
3. `advanced-cache.php` drop-in — SpeedyCache's mechanism

The `admin-ajax.php?action=mphbac_query` endpoint must be excluded from full-page
caching. The `Cache_Integration` class in mphb-availability-calendar handles this
automatically on plugin activation (writes to SpeedyCache's exclusion list).

**Risk:** If SpeedyCache is ever deactivated/reactivated, or if settings are reset,
the exclusion may need to be re-applied. The plugin's activation hook re-runs it.

### WooCommerce bloat

WooCommerce is installed with ~25 tables but zero products/orders. It adds hooks,
REST routes, and admin overhead on every request. **Uninstall it.**

### SEO plugin duplication

Three SEO plugins have left DB tables: Rank Math, Yoast, and AIOSEO. Only AIOSEO is
active. The orphan tables waste ~several MB and can confuse future migrations.

### AIOSEO performance findings (from DB)

The AIOSEO site analysis (captured in DB at 2026-06-19) flagged:
- **97 page objects** (42 JS + 53 CSS) — well above recommended limit
- **Page size** too large (74 KB HTML)
- Unminified JS: `snippet-11984` from Angie, Bravada `frontend.js`
- Unminified CSS: MotoPress Events Calendar assets (4 files)
- External link ratio warning (44 external, 16 internal)

### Query Monitor

QM is **active on production** — this leaks debug data to logged-in admins and
adds overhead to every request. Should be deactivated when not actively debugging.

---

## 8. Security findings

### Malware scan artifact

The DB contains two AIOSEO log entries for probe requests:
```
/wp-content/plugins/apikey/apikey.php?test=hello
/wp-content/plugins/apikey/apikey.php.suspected?test=hello
```
The `.suspected` extension is created by Wordfence/Imunify360 when they quarantine
suspicious files. This suggests a past malware scan flagged or neutralized a file.
The `apikey/` plugin directory does not exist in the current snapshot — the file was
either quarantined or removed. **Verify the server has no residual files in
`wp-content/plugins/apikey/`.**

### API keys in the database (CRITICAL — rotate immediately)

Three AI service API keys are stored in plaintext in `portal_options`:
- **Anthropic Claude API key** (`connectors_ai_anthropic_api_key`)
- **OpenAI API key** (`connectors_ai_openai_api_key`)
- **Google AI key** (`connectors_ai_google_api_key`)

Since this DB dump is now in a GitHub repo (private), treat all three as compromised.
Rotate them at Anthropic Console, OpenAI Platform, and Google AI Studio respectively,
then update the values in WP Admin → AI → Settings.

Additionally, three Google Maps/Places API keys appear in options:
- `elementor_google_maps_api_key`
- `grw_google_api_key` (Google Reviews widget)
- `motopress-ce-google-geocode-api-key` / `eael_br_google_place_api_key`

These are likely restricted by domain/referrer, but review their restrictions in
Google Cloud Console and rotate if unrestricted.

### User accounts

| Login | Role | Email |
|-------|------|-------|
| admin | Administrator | croftrobertl@mac.com |
| claude | Subscriber | croftrobertl@gmail.com |
| james.mike | mphb_customer | (guest) |
| + ~10 more | mphb_customer | (guests) |

Only one administrator account. The `mphb_customer` role is the MotoPress guest role —
these are booking guests who registered. No unexpected admin accounts found.

**Note:** The `claude` subscriber account (ID 88) is likely your Claude Code session
account. Subscriber has no meaningful WP permissions.

### wp-config.php

`wp-config.php` is in the repo root (HostGator standard location at document root).
It contains DB credentials and WordPress salts. Do NOT commit wp-config.php to any
public repository. The snapshot copy is in the private `dcc-site-snapshot` repo only.

### WP_DEBUG is false

Good — debug output is off in production.

### SSO mu-plugin

HostGator's `sso.php` mu-plugin enables HostGator admin panel single-sign-on into WP.
This is standard HostGator behavior, not a security issue, but be aware that HostGator
staff can authenticate into your WordPress dashboard via cPanel SSO.

---

## 9. Urgent action items

1. **ROTATE Anthropic API key NOW.** The key `sk-ant-api03-…` is stored plaintext in
   the DB dump, which is committed to a (private) GitHub repo. Rotate at
   console.anthropic.com → API Keys. Update in WP Admin → AI → Settings.

2. **ROTATE OpenAI API key.** Same reason — `sk-proj-…` key found in DB.

3. **ROTATE Google AI key** (`connectors_ai_google_api_key`).

4. **Review Google Maps API keys** — ensure all three are restricted to
   `doracanalcourt.com` in Google Cloud Console.

5. **Deactivate Query Monitor** in production when not debugging.

6. **Uninstall WooCommerce** — no products, no orders, pure overhead and attack surface.

7. **Clean W3TC DB rows** — run `DELETE FROM portal_options WHERE option_name LIKE 'w3tc%';`

8. **Drop wpstg0_ tables** — the WP Staging duplicate tables (~110 tables) double the
   DB size with no benefit. Use WP Staging's "Delete Staging Site" to clean them.

9. **Check for residual `apikey/` plugin files** on the server —
   `ls /home2/doracurt/public_html/wp-content/plugins/apikey/`

10. **Review Angie snippets** — 24 production snippets, but they're opaque without
    reading each one. Audit periodically.

---

## 10. Plugin/theme version risk notes

These plugins were not in the snapshot zip (vendor-excluded), so version data comes
only from `active_plugins`:

- **Elementor** — actively developed, keep current
- **Essential Addons for Elementor Lite** — large plugin, historically has had vulns; keep current
- **Jetpack** — keep current
- **UpdraftPlus** — keep current
- **WPForms** — keep current
- **All in One SEO** — keep current; multiple vulns in older versions

Plugins in snapshot zip with version-risk notes:

| Plugin | Version | Notes |
|--------|---------|-------|
| Query Monitor | 4.0.7 | Latest as of mid-2025 — OK |
| Loco Translate | 2.8.5 | Recent — OK |
| Database Cleaner | 1.3.7 | Low-traffic utility — low risk |
| WP Crontrol | 1.21.0 | Recent — OK |
| Bravada theme | 1.2.0 | Tested up to WP 6.8 — OK for 6.9 |
| MotoPress Hotel Booking | 6.1.0 | Check for 6.x updates |
| MCP Adapter | 0.5.0 | Experimental WP.org plugin |
| AI / AI Providers | 1.0.x–1.1.x | Experimental WP.org plugins |

---

## 11. Gotchas for future Claude Code sessions

- **Table prefix is `portal_`**, not the default `wp_`. All raw SQL must use this prefix.
- **Two table sets in the DB:** `portal_` (live) and `wpstg0_` (WP Staging, inactive).
  Any analysis must filter to `portal_` only.
- **MotoPress availability:** read from `portal_mphb_reserved_room` posts + `portal_mphb_blocks`,
  **not** from the PHP API. See CLAUDE.md invariants.
- **Checkout page:** MotoPress checkout is at page ID 1399 (slug: `/submit-booking/`).
- **Elementor widget category slug for ALL DCC-built plugins:** `dcc-widgets`, displayed
  as "Dora Canal Court". Verified on the LIVE install: Guest Guide, Contact Form, and the
  Availability Calendar all register `dcc-widgets`; Cottage Selector joined them in
  0.21.1. Elementor groups the widget panel by *slug*, so a plugin on a different slug
  gets its own duplicate section even when the displayed title matches exactly — the
  0.17.1 lesson is "same slug as the rest of the family", not any particular slug.
  Both plugins in this repo now register it: Cottage Selector since 0.21.1,
  Availability Calendar since 0.9.9 (it had kept the stale `claude-code`, which
  would have re-split the panel on any rebuild from this repo).
  (History of wrong turns: 0.17.1 used `dora-canal-court`; 0.19.4 used `claude-code`
  after inferring the family slug from this repo's then-stale calendar code.)
  Rename the `title` freely; never the slug.
- **No child theme** — all Bravada customizations via Elementor kit + Angie snippets.
- **SpeedyCache has 526 options** — it's heavily configured. Don't reset settings without
  capturing the current config first.
- **iCal URLs contain Booking.com token UUIDs** — these are semi-secret OTA credentials.
  Treat with the same care as API keys.
- **Admin email recipients:** erica@doracanalcourt.com, rob@doracanalcourt.com —
  both receive booking confirmation emails.
