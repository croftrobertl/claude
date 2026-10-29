<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * v0.35.3 — THE CHECKOUT PAGE IS NEVER PAGE-CACHED (the Director's finding on
 * live 0.35.2, 2026-10-23, and his verification of what the stack honours).
 *
 * WHY THIS EXISTS. /submit-booking/ WAS being page-cached: SpeedyCache's
 * exclusion read `/submit-booking/`, but SpeedyCache compares the URI with its
 * slashes trimmed, so the rule never matched. A cookieless GET cached the
 * dead-end page and the pre-gzip rule then served that cached dead end **even
 * to a GET carrying MotoPress's date cookies**. The Director corrected the rule
 * and purged both caches; **that exclusion remains the first line of defence
 * and this is the second.**
 *
 * WHAT IS AT STAKE, because it is not performance. **Every PHP-side value this
 * plugin puts in the checkout's HTML is per-request**, so a page cache freezes
 * the FIRST visitor's answer for everyone:
 *
 *   - `DCC_RESTORE`'s `stay` and `offer` — the cottage, the dates, and whether
 *     they are available (`Restore`);
 *   - the hero's photo, cottage name and dates pill, and the suppression of the
 *     page's own featured image (`Hero`);
 *   - the `dcc_layout` body class and every gated asset, which hang off
 *     `Layout::active()` — **a PER-BROWSER preview cookie.** If the page is
 *     cached without the cache varying on that cookie, a cached PREVIEW could
 *     be served to a real guest, which is the one thing the preview gate exists
 *     to prevent. The gate fails closed per request; it cannot fail closed
 *     against a cache in front of it.
 *
 * Nothing in that list is private — the payload is a room type, two dates, a
 * cottage name, a photo URL and a `roomsDetails` pair, and the guest's own
 * answers never enter the HTML at all (sessionStorage only, by design). So a
 * cached page is WRONG, not a leak. It is still wrong.
 *
 * WHY `DONOTCACHEPAGE` AND NOTHING ELSE (Director, verified on live
 * 2026-10-23 — this constant is used because it was PROVEN, not because it is
 * conventional):
 *
 *   - SpeedyCache honours it: `speedycache/main/cache.php:190` reads
 *     `if(defined('DONOTCACHEPAGE') && DONOTCACHEPAGE) return false;` inside
 *     the output-buffer callback that decides whether to WRITE the cache file,
 *     after the page is built — so defining it anywhere during the request
 *     works, provided it is before output ends.
 *   - The host's nginx proxy cache was OBSERVED not to store the checkout:
 *     two consecutive plain GETs both came back `x-proxy-cache: MISS`, and the
 *     only HIT ever seen there was nginx serving SpeedyCache's static `.gz`,
 *     and no written file means nothing to serve. **That is an observation of
 *     two requests, not a rule** (the Director's own correction, 2026-10-24:
 *     his earlier note gave "nginx stores no response that sets a cookie" as
 *     if it were nginx's documented behaviour, and it was a reading of what he
 *     saw twice). MotoPress does set `WP_SESSION_COOKIE` and its `mphb_*`
 *     cookies on every checkout response, which is the likely reason — likely,
 *     not established. NOTHING HERE RESTS ON IT: this belt is the SpeedyCache
 *     code read above, which is why that is the line to keep correct.
 *   - **`Cache-Control: no-store` IS NOT SHIPPED.** It was not proven that
 *     either layer honours it, and an unverified header presented as the
 *     safeguard is the kind of line that looks like a fallback and is not.
 *
 * TWO LIMITS, STATED RATHER THAN IMPLIED:
 *
 *   1. This stops a cache file being WRITTEN. It does not delete one already
 *      on disk, and SpeedyCache's `advanced-cache.php` can serve such a file
 *      before WordPress loads — before this code exists. A stale copy has to
 *      be purged, which the Director has done.
 *   2. `define()` cannot redefine a constant, so if anything else has already
 *      defined `DONOTCACHEPAGE` as FALSE this leaves it false. The `defined()`
 *      guard is required anyway — redefining raises a PHP warning on a guest's
 *      checkout — and nothing on this site is known to set it.
 *
 * THERE IS DELIBERATELY NO FILTER. A page whose HTML carries per-request values
 * cannot be safely page-cached, so "cache the checkout anyway" is not a
 * preference to offer; a filter here would be a switch for re-opening the
 * defect. The gate is `Assets::is_checkout_page()`, which is already false for
 * admin, AJAX and anything that is not this page — so nothing else on the site
 * is affected.
 */
final class Page_Cache
{
    /** The constant SpeedyCache reads. */
    public const CONSTANT = 'DONOTCACHEPAGE';

    public function register(): void
    {
        /* `template_redirect` is the earliest point at which the main query is
           resolved — `Assets::is_checkout_page()` calls `is_page()` — and it
           is long before any output ends, which is all SpeedyCache's callback
           requires. */
        add_action('template_redirect', [$this, 'maybe_block_cache'], 1);
    }

    public function maybe_block_cache(): void
    {
        if (!Assets::is_checkout_page()) {
            return;
        }
        self::block();
    }

    /**
     * Define the constant, once, without ever raising a warning.
     *
     * Separate from the gate so the suite can drive each half on its own: a
     * test that only called the gate could not tell "already defined" from
     * "defined by us".
     */
    public static function block(): void
    {
        if (defined(self::CONSTANT)) {
            return;
        }
        define(self::CONSTANT, true);
    }
}
