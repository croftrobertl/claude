<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * v0.35.0 — WHO SEES THE NEW CHECKOUT LAYOUT (Rob's pick C, item 9).
 *
 * The new layout ships switched OFF. Guests keep today's checkout until Rob
 * turns it on from the settings page. Before that, anyone holding the preview
 * key can see it on LIVE, on a real phone, without logging in — which is the
 * whole point: the Director has to be able to check it where it will run.
 *
 * THREE WAYS IN, AND THEY ARE DELIBERATELY SEPARATE:
 *   1. The switch "Use The New Layout For Everyone" (`layout_enabled`), off by
 *      default. On → every guest.
 *   2. `/submit-booking/?dcc_layout=<key>` → a SESSION cookie for that browser
 *      only, so the rest of the visit keeps the new layout without the key in
 *      every URL. Nobody else is affected.
 *   3. `?dcc_layout=off` → clears the cookie, so a preview can be ended
 *      without closing the browser. It does NOT turn the layout off for a site
 *      whose switch is on; the switch is the owner's and a URL cannot override
 *      it.
 *
 * THE KEY IS A SECRET, AND IS COMPARED IN CONSTANT TIME. It is generated once,
 * on first read, and stored in the plugin's own settings row so the Director
 * can read it over WP-CLI:
 *
 *     wp option get dcc_checkout_settings --format=json
 *
 * It is never printed on a page, never logged, and never put in a redirect.
 * A wrong key is treated exactly like no key at all — no message, no hint that
 * a key exists, nothing that tells a prober they are close.
 *
 * FAIL CLOSED, ALWAYS. Every path that cannot answer the question returns
 * false: no key stored, an empty key in the URL, a cookie that does not match
 * the CURRENT key (so rotating the key ends every preview at once). The
 * consequence of a wrong `false` is that someone sees today's checkout, which
 * works; the consequence of a wrong `true` is a guest meeting an unreviewed
 * layout mid-booking.
 */
final class Layout
{
    /** The settings key holding the preview secret. */
    public const KEY_SETTING = 'layout_preview_key';

    /** The settings key holding the on/off switch. */
    public const SWITCH_SETTING = 'layout_enabled';

    /** The URL parameter and the cookie share a name; neither is a nonce. */
    public const PARAM  = 'dcc_layout';
    public const COOKIE = 'dcc_layout_preview';

    /** `?dcc_layout=off` ends a preview. */
    public const OFF = 'off';

    /** Decided once per request, so every reader gets the same answer. */
    private static ?bool $decided = null;

    public function register(): void
    {
        // Before anything renders: the cookie has to be set before output
        // starts, and the decision has to be made before the checkout's
        // assets are enqueued.
        add_action('init', [$this, 'handle_preview_request'], 1);
    }

    /**
     * `?dcc_layout=…` — set, clear, or ignore.
     *
     * No redirect: a redirect would put the key in a Referer header, in server
     * logs and in the browser's history, and the page renders correctly with
     * the parameter still in the URL.
     */
    public function handle_preview_request(): void
    {
        // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- not a state change on the site; it sets a per-browser display preference.
        $raw = $_GET[self::PARAM] ?? null;
        if (!is_scalar($raw)) {
            return;
        }
        $given = trim((string) $raw);
        if ($given === '') {
            return;
        }

        if ($given === self::OFF) {
            self::$decided = null;
            self::set_cookie('', time() - YEAR_IN_SECONDS);
            // phpcs:ignore WordPress.Security.NonceVerification.Recommended
            unset($_COOKIE[self::COOKIE]);
            return;
        }

        if (!self::key_matches($given)) {
            return; // A wrong key is no key. Nothing is said about it.
        }

        self::$decided = null;
        self::set_cookie($given, 0); // 0 = a session cookie: it dies with the browser.
        $_COOKIE[self::COOKIE] = $given;
    }

    /**
     * Does this request get the new layout?
     *
     * Read by Assets (which script and stylesheet to enqueue) and by the
     * renderers. Decided once per request.
     */
    public static function active(): bool
    {
        if (self::$decided !== null) {
            return self::$decided;
        }
        self::$decided = self::enabled_for_everyone() || self::previewing();
        return self::$decided;
    }

    /** The owner's switch. Absent or anything but 1 → off. */
    public static function enabled_for_everyone(): bool
    {
        $settings = Config::settings();
        return !empty($settings[self::SWITCH_SETTING]);
    }

    /** Is this browser carrying a valid preview cookie? */
    public static function previewing(): bool
    {
        // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a display preference, not a capability.
        $cookie = $_COOKIE[self::COOKIE] ?? null;
        return is_scalar($cookie) && self::key_matches((string) $cookie);
    }

    /**
     * The preview key, generated on first read and stored.
     *
     * Generated lazily rather than on activation: activation hooks do not run
     * on every upgrade path, and a key that silently failed to exist would
     * make the preview link impossible to use with nothing to explain it.
     */
    public static function preview_key(): string
    {
        $settings = Config::settings();
        $key = isset($settings[self::KEY_SETTING]) ? (string) $settings[self::KEY_SETTING] : '';
        if (self::is_well_formed($key)) {
            return $key;
        }

        $key   = self::generate_key();
        $saved = get_option(Config::OPTION, []);
        if (!is_array($saved)) {
            $saved = [];
        }
        $saved[self::KEY_SETTING] = $key;
        update_option(Config::OPTION, $saved);
        Config::flush_cache();
        return $key;
    }

    /** The preview URL, for the settings page. */
    public static function preview_url(): string
    {
        $checkout = '';
        if (function_exists('MPHB')) {
            try {
                $checkout = (string) MPHB()->settings()->pages()->getCheckoutPageUrl();
            } catch (\Throwable $e) {
                $checkout = '';
            }
        }
        if ($checkout === '') {
            $checkout = home_url('/submit-booking/');
        }
        return add_query_arg(self::PARAM, self::preview_key(), $checkout);
    }

    /**
     * 32 hex characters from the strongest source available.
     *
     * wp_generate_password() is not used: it is not documented as
     * cryptographically secure, and this value is the only thing standing
     * between the public and an unreviewed checkout.
     */
    private static function generate_key(): string
    {
        try {
            return bin2hex(random_bytes(16));
        } catch (\Throwable $e) {
            // random_bytes only throws when no secure source exists at all.
            return bin2hex((string) wp_generate_password(16, false, false));
        }
    }

    /** A stored value that is the right shape to be a key. */
    private static function is_well_formed(string $key): bool
    {
        return (bool) preg_match('/\A[0-9a-f]{32}\z/', $key);
    }

    /**
     * Constant-time comparison against the stored key.
     *
     * A length check first would leak the length, and `===` on secrets leaks
     * timing; hash_equals is what both are for. An unset or malformed stored
     * key matches nothing — never "everything".
     */
    private static function key_matches(string $given): bool
    {
        $settings = Config::settings();
        $stored   = isset($settings[self::KEY_SETTING]) ? (string) $settings[self::KEY_SETTING] : '';
        if (!self::is_well_formed($stored)) {
            return false;
        }
        return hash_equals($stored, $given);
    }

    /** Session cookie, path-wide, secure where the site is. */
    private static function set_cookie(string $value, int $expires): void
    {
        if (headers_sent()) {
            return;
        }
        setcookie(self::COOKIE, $value, [
            'expires'  => $expires,
            'path'     => defined('COOKIEPATH') && COOKIEPATH !== '' ? COOKIEPATH : '/',
            'domain'   => defined('COOKIE_DOMAIN') ? COOKIE_DOMAIN : '',
            'secure'   => is_ssl(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    /** Tests and the settings page: forget this request's decision. */
    public static function flush(): void
    {
        self::$decided = null;
    }
}
