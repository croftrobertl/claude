# Dora Canal Court — Developer Context

Pertinent site, stack, and lessons-learned reference for building WordPress
plugins and Elementor widgets for **doracanalcourt.com**. Paste this (or a
relevant section) at the start of a Claude session when starting a new
project for this site. This file is the generic cross-cutting one.

> **Note (2026-09):** every `mphb-availability-calendar/...` path in this document
> refers to the Availability Calendar's OWN repository, which is maintained in a
> separate session (live 0.21.2). That code is not in this repo — the stale 0.9.x
> copy that used to sit here was deleted. This repo holds the DCC Cottage Selector;
> see its `CLAUDE.md` at the repo root.

---

## 1. Site overview

- **URL:** doracanalcourt.com (staging at /staging/4706/, live at root)
- **Business:** vacation-rentals site for Dora Canal Court — 8 waterfront
  cottages in central Florida.
- **All bookings** are processed through MotoPress Hotel Booking. Cottages
  are `mphb_room_type` posts; reservations are `mphb_booking` posts with
  `mphb_reserved_room` child posts. The MotoPress accommodation single
  template (`/accommodation/<slug>/`) is the canonical "cottage page".

---

## 2. Stack & versions

| Layer | What | Version | Notes |
|---|---|---|---|
| WordPress | core | 6.9.x | Deployment site is current; codebase should be 6.0+ compatible. |
| PHP | runtime | 8.3.x | Codebase free to use 8.0+ syntax (typed props, named args, etc.). |
| Hosting | HostGator | shared | cPanel; no SSH; deploys via the Plugins → Upload-Zip route. |
| Theme | Bravada | latest | Bravada's Elementor Kit is aggressive — see Section 5. |
| Page builder | Elementor (free) | 4.0.9 stable | **No Elementor Pro.** Don't depend on Pro controls/widgets. **Avoid beta builds** — 4.1.0-beta crashed the editor with React #185. Beta Tester setting must be OFF. |
| Booking | MotoPress Hotel Booking | current | See Section 6. |
| Cache | SpeedyCache Pro | current | Full-page cache + JS/CSS minify/combine. See Section 7. |
| Translation | Loco Translate | current | Used in production to localize plugin strings. |
| Fonts | Raleway | via Google Fonts | Loaded by Bravada. |
| Code-snippet host | Angie Code (Elementor add-on) | current | Used for custom inline Elementor widgets — e.g. "Pricing Table v4". Each Angie snippet has a unique suffix like `d77343d4` baked into its class names and PHP class. |

---

## 3. Brand & locality

- **Brand colors:** primary `#0f6dbf` (navy-blue), secondary `#f08080` (coral).
- **Calendar palette** (use when widgets sit near the availability calendar so
  things look cohesive): header `#0A50B2`, available `#7BDCB5`, booked
  `#FB6962`, namecol bg `#F8F9FA` text `#111111`, nav buttons `#C43A3A` /
  hover `#078732`.
- **Font:** Raleway (already loaded site-wide by Bravada).
- **Timezone:** all "today" / cutoff / current-time calculations must use
  `America/New_York` regardless of the WordPress site timezone. The physical
  property is in Florida; visitors are global; the cutoff a guest sees must
  match the property's clock.
  ```php
  $now = new DateTimeImmutable('now', new DateTimeZone('America/New_York'));
  ```
  Do not use `date_default_timezone_set()` — it leaks into other code.

---

## 4. Build / deploy workflow

There is no SSH. Deploys are zip-uploads through the WP admin.

```bash
# Syntax check a plugin's PHP before zipping
find <plugin-folder> -name '*.php' -print0 | xargs -0 -n1 php -l

# Build the zip the user uploads via Plugins → Add New → Upload Plugin
( cd $(git rev-parse --show-toplevel) && zip -r <plugin>.zip <plugin-folder> )
```

After installing/updating a plugin on the site:
1. **Purge SpeedyCache** (WP Admin → SpeedyCache → Purge All) — otherwise
   the cached HTML still references the old asset versions or contains stale
   config.
2. **Hard-refresh** the browser (Ctrl+Shift+R / Cmd+Shift+R), and in DevTools
   tick "Disable cache" while DevTools is open.
3. Test on staging first, then mirror to live.

There are no automated tests — runtime behavior is only verified by
installing and clicking through the site.

---

## 5. Bravada theme — CSS specificity trap

Bravada's Elementor Kit injects high-specificity resets that fight custom
widget styles:

```css
.elementor-kit-NNN input:not([type=button]):not([type=submit]) { line-height: 1px; ... }
.elementor-kit-NNN button { ... }
.elementor-kit-NNN a { ... }
```

These have specificity around **(0,3,1)**. To override from a custom
widget, your selectors need to reach **(0,4,0)** or higher. The pattern
that works is **doubling the wrapper class**:

```php
private const SEL = '{{WRAPPER}} .my-widget.my-widget '; // (0,4,0)
```

Then every Elementor style-control `selectors` array uses `self::SEL .
'.my-target'`. Last resort is `!important`, but the doubled-class approach
keeps the cascade healthy.

Bake the visual defaults into the widget's CSS file (`assets/css/widget.css`)
— let Elementor's style controls be override-only on top. Don't rely on
control defaults alone, because untouched controls don't write any value
through `selectors`.

---

## 6. MotoPress quick reference

```php
// Test for MotoPress availability (also gates plugin activation):
function_exists('MPHB');

// The MotoPress global service container:
$mphb = MPHB();
$mphb->getRoomTypeRepository(); // accommodations
$mphb->getBookingRepository();
$mphb->settings()->pages()->getCheckoutPageUrl(); // default: /submit-booking/
```

### Data model

| What | Post type / table | Key fields |
|---|---|---|
| Cottage (accommodation type) | `mphb_room_type` post | Title, content, _thumbnail_id, plus MotoPress meta. |
| Booking (the umbrella reservation) | `mphb_booking` post | `mphb_check_in_date`, `mphb_check_out_date` (Y-m-d), `post_status` in `confirmed`, `pending`, `pending-payment`. |
| Reserved physical room (child of booking) | `mphb_reserved_room` post | `_mphb_room_id` meta links to physical room. `post_parent` is the booking. |
| Manual host blocks | `{prefix}mphb_blocks` table | `not_stay_in = 1` for unavailable ranges. |

### Lessons learned the hard way

- **Do not call `MPHB()->getRoomRepository()->getAvailableRooms()`** — it
  ignored the room-type filter in MotoPress 6.x and returned wrong results.
  Read the storage directly via `$wpdb->prepare` against the post tables
  joined by `post_parent`/meta. See
  `mphb-availability-calendar/includes/class-data-provider.php` for the
  pattern that works.
- **Never re-fetch iCal URLs from custom code.** MotoPress already syncs
  iCal feeds every 15 minutes; imported reservations land as `mphb_booking`
  posts (same as direct bookings). Direct iCal HTTP fetches would duplicate
  work and risk cron conflicts.
- **Cache invalidation hooks** (best-guess names; if they don't fire, the
  15-minute transient TTL is the safety net):
  - `mphb_after_sync_ical`
  - `mphb_ical_sync_finished`
  - `mphb_after_create_booking`
  - `mphb_booking_status_changed`

### Submitting a booking from a custom UI

MotoPress's checkout page (`getCheckoutPageUrl()` — default
`/submit-booking/`) accepts a plain hidden-form POST with these exact
fields. **No nonce.** This is what MotoPress's own widgets do internally.

```html
<form method="POST" action="/submit-booking/">
    <input name="mphb_room_type_id" value="<COTTAGE_POST_ID>">
    <input name="mphb_check_in_date" value="YYYY-MM-DD">
    <input name="mphb_check_out_date" value="YYYY-MM-DD">
    <input name="mphb_rooms_details[<COTTAGE_POST_ID>]" value="1">
    <input name="mphb_is_direct_booking" value="1">
</form>
```

### Rendering a cottage's full single-accommodation page outside of `/accommodation/<slug>/`

MotoPress's `the_content` filter callbacks bail unless
`is_singular('mphb_room_type')` returns true. A naive
`apply_filters('the_content', $post->post_content)` only gives you the
post body — gallery/attributes/rates are missing. Pattern that works
(snapshot/restore `$wp_query`):

```php
$saved_query = $GLOBALS['wp_query'] ?? null;
$saved_post  = $GLOBALS['post'] ?? null;
try {
    $query = new \WP_Query(['p' => $cottage_id, 'post_type' => 'mphb_room_type']);
    if (!$query->have_posts()) return '';
    $GLOBALS['wp_query'] = $query;
    $query->the_post();
    ob_start();
    the_content();
    return (string) ob_get_clean();
} finally {
    wp_reset_postdata();
    if ($saved_query !== null) $GLOBALS['wp_query'] = $saved_query;
    if ($saved_post  !== null) $GLOBALS['post']     = $saved_post;
}
```

---

## 7. SpeedyCache Pro — caching traps

SpeedyCache caches the rendered page HTML aggressively. Two specific
landmines we hit and how to avoid them:

### A. Don't put expiring WordPress nonces in cached HTML

If your widget embeds `wp_create_nonce(...)` in the page (e.g. for an
`admin-ajax.php` call), the nonce is captured in the cached HTML. WP
nonces expire ~24h. After that, every cached pageload returns 403/-1
from `check_ajax_referer` and the widget breaks silently until the
cache is manually purged.

**Solution:** for **public, read-only** AJAX endpoints — anything that
just reads data and performs no state-changing action — do not require
a nonce at all. There's no meaningful CSRF surface. Just skip
`check_ajax_referer`. (Of course, do require nonces for any endpoint
that writes/modifies state.)

### B. Exclude your AJAX endpoint from the page cache

SpeedyCache Pro will sometimes cache AJAX responses depending on its
settings. Auto-register the exclusion on plugin activation so you don't
rely on the user remembering:

```php
register_activation_hook(__FILE__, function () {
    // 1. Filter for SpeedyCache's runtime URL-exclusion list
    add_filter('speedycache_exclude_urls', static fn($u) =>
        array_merge((array) $u, ['/wp-admin/admin-ajax.php?action=your_action'])
    );
    // 2. Persistent — write to SpeedyCache's stored settings option
    $option_keys = ['speedycache_settings', 'speedycache_options', 'speedycache_pro_settings'];
    foreach ($option_keys as $k) { /* read, append, update_option */ }
    // 3. One-shot success admin-notice via transient
});
```

See `mphb-availability-calendar/includes/class-cache-integration.php` for
the full pattern.

### C. SpeedyCache also minifies/combines JS

If your JS handler depends on its file loading in a specific order
relative to jQuery / Elementor / theme JS, set the WP enqueue
`$deps` parameter correctly. Don't write code that races other scripts.

---

## 8. Elementor patterns that work on this site

### 8.1. Plugin bootstrap

Use a **lazy autoloader** so files that extend `\Elementor\Widget_Base`
aren't parsed before Elementor itself is loaded. Boot the plugin on
`plugins_loaded:20`.

```php
spl_autoload_register(static function (string $class): void {
    if (strncmp($class, 'YOURNS\\', 7) !== 0) return;
    $short = substr($class, 7);
    $file  = __DIR__ . '/includes/class-' . strtolower(str_replace('_', '-', $short)) . '.php';
    if (is_readable($file)) require_once $file;
});
add_action('plugins_loaded', static fn() => YOURNS\Plugin::instance()->boot(), 20);
```

The Plugin singleton's `boot()` should bail gracefully if Elementor or
MotoPress isn't active, with an `admin_notices` callback explaining what
to install.

### 8.2. Widget category

Register a category once via `elementor/elements/categories_registered`
and reuse the slug for every plugin's widgets. We use `claude-code`
("Claude Code") for this site.

### 8.3. Widget registration

```php
add_action('elementor/widgets/register', function ($widgets_manager) {
    $widgets_manager->register(new \YOURNS\Widget());
});
```

### 8.4. Editor preview iframe — MutationObserver pattern

**The Elementor editor preview iframe injects widget markup AFTER
DOMContentLoaded, and does not reliably fire `frontend/element_ready/<type>`
in every version.** A widget that wires itself up only at `DOMContentLoaded`
will sit dead in the editor preview ("Loading…" forever) even though it
works on the live frontend.

The fix is a `MutationObserver` on `document.body` that catches your
widget root whenever it appears (and re-appears after Elementor rebuilds
the widget on a setting change). Combine with the existing
`element_ready` hook for completeness:

```js
function boot() {
    document.querySelectorAll('.your-root').forEach(init);
    setupObserver();
}
function setupObserver() {
    if (!document.body || !window.MutationObserver) return;
    new MutationObserver(function () {
        document.querySelectorAll('.your-root').forEach(init);
    }).observe(document.body, { childList: true, subtree: true });
}
// init() must be idempotent — guard with dataset.yourInit === '1'.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
if (window.elementorFrontend?.hooks) {
    window.elementorFrontend.hooks.addAction('frontend/element_ready/your_widget.default', function ($el) {
        if ($el && $el[0]) init($el[0].querySelector('.your-root'));
    });
}
```

### 8.5. Force-load scripts in the editor preview

`get_script_depends()` alone isn't reliable in the editor preview. Add
an explicit hook:

```php
add_action('elementor/preview/enqueue_scripts', static function () {
    wp_enqueue_script('your-widget');
    wp_enqueue_style('your-widget');
});
```

### 8.6. Underscore content template

Every widget that has any non-trivial render should ship a
`content_template()` Underscore template alongside `render()`. Without it,
each setting change in the editor triggers a server round-trip, making the
editor sluggish.

### 8.7. Responsive controls

Use `add_responsive_control(...)` for per-device values. **Important
gotcha:** Elementor only persists values the editor has explicitly
touched. Untouched tablet/mobile slots arrive in PHP as empty strings.
Never cascade an empty per-device value to "the next larger device" —
fall back to the **declared per-device default** instead. Otherwise,
editing the widget without opening the per-device switcher silently
collapses every device to whatever the desktop value is.

```php
$days_desktop = (int) ($settings['visible_days'] ?? 0);
$days_desktop = $days_desktop > 0 ? $days_desktop : 31;
$days_tablet  = (int) ($settings['visible_days_tablet'] ?? 0);
$days_tablet  = $days_tablet  > 0 ? $days_tablet  : 14;
$days_mobile  = (int) ($settings['visible_days_mobile'] ?? 0);
$days_mobile  = $days_mobile  > 0 ? $days_mobile  : 7;
```

### 8.8. Embedding an Elementor template inside a widget

```php
\Elementor\Plugin::instance()->frontend->get_builder_content_for_display($template_id, true);
```

The second arg (`$with_css = true`) is **critical**. **CSS is only enqueued
on the parent page when this is called during the page's normal render
pass — not during an AJAX request.** If you AJAX-fetch template HTML
after the page has rendered, the widget's per-widget CSS file never
loads, multi-column widgets lose their styles, and switcher/accordion
interactions break. We tried lazy AJAX template loading once
(MPHB Availability Calendar v0.6.0) and had to revert it in v0.6.1.
Server-render templates during the page-render pass.

### 8.9. Re-binding handlers on cloned widget markup

When you clone Elementor widget markup via `innerHTML` (e.g. moving a
widget into a popup or modal), `<script>` tags don't execute and
`elementorFrontend.hooks` doesn't auto-re-fire. The cloned widget will
look right but its click/swipe handlers will be inert.

Walk the cloned markup and dispatch `frontend/element_ready/<type>`
manually:

```js
function reinitElementorWidgets(container) {
    if (!container || !window.elementorFrontend?.hooks || !window.jQuery) return;
    container.querySelectorAll('.elementor-widget[data-widget_type]').forEach(function (widget) {
        var widgetType = widget.getAttribute('data-widget_type');
        if (!widgetType) return;
        var $widget = window.jQuery(widget);
        try {
            window.elementorFrontend.hooks.doAction('frontend/element_ready/global', $widget, window.jQuery);
            window.elementorFrontend.hooks.doAction('frontend/element_ready/' + widgetType, $widget, window.jQuery);
        } catch (e) { /* keep going */ }
    });
}
```

Call this inside a `requestAnimationFrame` after the popup is on-screen
— handlers that measure offsets (carousel indicators, sticky positioners)
need real dimensions.

### 8.10. Custom Angie Code widgets co-existing

Each Angie snippet generates with a unique class suffix
(e.g. `d77343d4`). Examples: `Pricing_Table_d77343d4`,
`.pt-d77343d4-card`. Multiple snippets coexist on a page because none
share class names. Don't add CSS in your own plugin that targets another
snippet's classes by name — if you need to defensively style content
inside your own widget popup, use scoped selectors like
`.your-popup-body button` instead.

---

## 9. AJAX endpoint conventions

For public, read-only data endpoints (the most common case for vacation-
rental widgets — availability, pricing, photo data):

```php
add_action('wp_ajax_your_action', ['YOURNS\\Ajax', 'handle']);
add_action('wp_ajax_nopriv_your_action', ['YOURNS\\Ajax', 'handle']);

final class Ajax {
    public static function handle(): void {
        // NO nonce check — see Section 7A for why.
        // Sanitize every input: absint() for IDs, sanitize_text_field()
        // for short strings, DateTimeImmutable::createFromFormat('Y-m-d', ...)
        // for dates (with explicit timezone). Validate against an allowlist
        // when possible.
        // Wrap data fetches in Cache::get_or_set(...) with a 15-min TTL.
        wp_send_json_success([...]);
    }
}
```

For state-changing endpoints (writes, deletes, user-tied actions), **do**
require a nonce — but rotate it via a small unauth'd GET endpoint at
runtime so cached HTML doesn't go stale. Or accept that those endpoints
won't work in a fully-cached state.

---

## 10. Transient-cache wrapper pattern

```php
final class Cache {
    public const PREFIX      = 'yourns_';
    public const DEFAULT_TTL = 900; // 15 min — matches MotoPress's iCal sync interval

    public static function key(array $parts): string {
        return self::PREFIX . sha1((string) wp_json_encode($parts));
    }
    public static function get_or_set(string $key, callable $producer, int $ttl = self::DEFAULT_TTL) {
        $cached = get_transient($key);
        if ($cached !== false) return $cached;
        $value = $producer();
        set_transient($key, $value, $ttl);
        return $value;
    }
    public static function flush_all(): void {
        global $wpdb;
        $like   = $wpdb->esc_like('_transient_' . self::PREFIX) . '%';
        $tmout  = $wpdb->esc_like('_transient_timeout_' . self::PREFIX) . '%';
        $wpdb->query($wpdb->prepare(
            "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
            $like, $tmout
        ));
    }
}
```

Key things to remember:
- **Content-address the cache key** (`sha1(json_encode($parts))`) so the
  key reflects every input that affects the output. Forgetting a
  dimension creates wrong-data bugs that only appear when caches collide.
- **Don't cache failures.** If your producer can return an empty/error
  result, branch before `set_transient` so you don't pin the error for
  the TTL.
- Flush on every relevant MotoPress hook listed in Section 6.

---

## 11. Diagnostic workflow (Chrome DevTools)

Several bugs we chased were only diagnosable via DevTools. Common patterns:

### A. The Elementor editor preview is its own JavaScript context

The editor has the outer admin chrome and a separate `<iframe>` for the
canvas. DevTools' Console only listens to one frame at a time. To see
your widget's logs from inside the preview, you have to **switch the
Console's frame selector** (top-left of the Console panel — usually says
"top") to the frame whose URL contains `?elementor-preview=…`.

### B. Network tab to check asset loading

If a script "isn't loading," filter the Network tab by the file name
and confirm Status 200. A 200 confirms the file got to the browser; it
doesn't confirm the file executed.

### C. Instrument with a single labeled prefix

When debugging widget JS in the wild, ship a temporary build with a
`log()` helper prefixed with a unique tag (`[yourplugin]`) at every
checkpoint — top-of-IIFE, `init()`, AJAX request/response, render. Ask
the user to filter the Console by the prefix and paste back the lines.
Strip the logs in the next release.

### D. Quick DOM inspection without dev tools

These work great when the user can't easily share their screen:

```js
// What's actually in this frame?
location.href
document.querySelectorAll('.your-root').length
// Look around a known string in the markup:
document.body.innerHTML.indexOf('your-class')
document.body.innerHTML.substr(<offset>, 600)
// Inventory all matching classes/IDs:
[...new Set(document.body.innerHTML.match(/your-prefix-[a-zA-Z0-9_-]+/g))]
```

---

## 12. WordPress development best-practices to follow

The defaults referenced at <https://developer.wordpress.org/coding-standards/>.
On this site we are intentionally **looser than WPCS on formatting** (the
codebase isn't WordPress.org-distributed and the user doesn't run phpcs).
We are **strict on the underlying invariants**:

- All visible strings translatable: `__()`, `esc_html__()`, `esc_attr__()`.
- Every output escaped at the point of echo: `esc_html`, `esc_attr`,
  `esc_url`, `wp_kses_post`.
- All inputs sanitized at the entry point: `sanitize_text_field`,
  `absint`, format-validated parsing for dates.
- Use `$wpdb->prepare()` for every SQL query. Never concat user input.
- No direct DB writes from a GET request.
- No reliance on `$_GET`/`$_POST` superglobals without `wp_unslash` first.
- Use plugin prefixes on every global symbol: classes, constants, hooks,
  options, transient keys, CSS variables, CSS class names.

---

## 13. Recommended file layout for a new plugin

```
your-plugin/
├── your-plugin.php          # Plugin headers + constants + lazy autoloader + activation hook
├── readme.txt               # WP.org-style readme; user-facing changelog
├── uninstall.php            # If the plugin writes options/transients, clean them here
├── includes/
│   ├── class-plugin.php     # Singleton orchestrator; registers all WP/Elementor hooks
│   ├── class-widget.php     # extends \Elementor\Widget_Base
│   ├── class-data-provider.php   # Read layer over MotoPress / WP / external APIs
│   ├── class-cache.php           # Transient wrapper (Section 10)
│   ├── class-cache-integration.php  # SpeedyCache auto-exclusion on activation
│   └── class-ajax.php       # Public-read AJAX (Section 9)
├── assets/
│   ├── css/widget.css
│   └── js/widget.js         # Vanilla JS preferred; jQuery is loaded but optional
└── languages/.gitkeep       # Loco Translate scans this folder
```

Conventions to copy:
- Namespace: `YOURNS\` (short prefix matching the plugin)
- Function/option/transient prefix: `yourns_`
- Class names: `Plugin`, `Widget`, `Data_Provider`, `Cache`,
  `Cache_Integration`, `Ajax`
- Constants: `YOURNS_VERSION`, `YOURNS_FILE`, `YOURNS_DIR`, `YOURNS_URL`,
  `YOURNS_AJAX_ACTION`
- Text domain: matches plugin folder (`your-plugin`)

---

## 14. Existing plugin: MPHB Availability Calendar

> **Note (2026-09):** the calendar's code is no longer in this repository — it is
> maintained in its own session/repo (live 0.21.2). The `mphb-availability-calendar/`
> paths referenced in this section and in §5/§8 describe that separate codebase, not
> files you will find here. Its Elementor category is now `dcc-widgets`
> ("Dora Canal Court"), not the "Claude Code" name used below.

One Elementor widget displaying a mobile-friendly multi-property availability grid
for MotoPress accommodations. Useful patterns to copy:

- `\MPHBAC\Data_Provider::list_room_types()` returns `[id, title, abbrev, number]`
  for every cottage — reusable elsewhere on the site (e.g. a pricing
  widget that needs a cottage list).
- `\MPHBAC\Data_Provider::query_occupied_room_days()` is the
  battle-tested SQL pattern for "is cottage X available on date Y" —
  use it as the template for any custom availability logic. Don't
  re-invent.
- The whole cache/SpeedyCache/AJAX scaffolding is the canonical
  reference implementation for those concerns on this site.

---

## 15. Quick "I'm starting a new plugin" checklist

1. Copy the file layout in Section 13.
2. Pick a 4-6 char unique prefix; replace `YOURNS_`/`yourns_` everywhere.
3. Set widget category to `claude-code` to keep all our widgets together.
4. Bake visual defaults into `assets/css/widget.css`; let Elementor controls
   be override-only.
5. Use `.my-widget.my-widget` doubled-class wrapper to defeat Bravada.
6. Use `MutationObserver` on `document.body` so the widget initializes in
   the Elementor editor preview iframe.
7. If you have an AJAX endpoint: no nonce for read-only public data;
   auto-exclude from SpeedyCache on activation.
8. All "today" math in `America/New_York`.
9. Every string translatable; text domain = plugin folder name.
10. Test on staging; purge SpeedyCache + hard-refresh after each install.
