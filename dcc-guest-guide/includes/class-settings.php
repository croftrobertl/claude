<?php
/**
 * Plugin-level settings: one option row, one schema.
 *
 * WHY ONE ROW. Every field lives in dccgg_settings as a single array, read
 * through get() which merges the stored row over the defaults on every read.
 * A key added in a later version is therefore live immediately — it does not
 * wait for anyone to press Save — which is the trap that bit Seasons 4.0.0,
 * where a new version's defaults never reached an already-stored row.
 *
 * WHY ONE SCHEMA. schema() drives the form AND the sanitiser. They cannot
 * drift, and absence on save is handled per TYPE rather than per field: an
 * unchecked checkbox posts nothing at all, so a boolean read with a plain
 * isset() on a partial form silently reverts every box the user did not
 * touch. The whole form posts together for exactly this reason.
 *
 * The two Gemini options keep their own rows and their own names. They work,
 * they are read elsewhere, and one of them is a credential — migrating them
 * would buy nothing and risk losing a key.
 *
 * @package DCC_Guest_Guide
 */

namespace DCCGG;

if (!defined('ABSPATH')) { exit; }

final class Settings
{
    public const OPTION = 'dccgg_settings';

    /** Cache within the request; get_option() is already object-cached. */
    private static $resolved = null;

    /**
     * Every setting, grouped by the tab it appears under.
     *
     * 'type' drives both the control and the sanitiser:
     *   bool   checkbox, absent == false
     *   int    number, clamped to min/max
     *   text   single line, sanitize_text_field
     *   select one of 'options'
     */
    public static function schema(): array
    {
        return [
            'guest' => [
                'label'  => __('Guest experience', 'dcc-guest-guide'),
                'fields' => [
                    'auto_hide_secrets' => [
                        'type'    => 'bool',
                        'default' => true,
                        'label'   => __('Re-hide a revealed password automatically', 'dcc-guest-guide'),
                        'help'    => __('When a guest closes the section or moves to another one, a password they revealed goes back to dots. Turning this off leaves it showing until they tap Hide.', 'dcc-guest-guide'),
                    ],
                    'copy_confirm_ms' => [
                        'type'    => 'int',
                        'default' => 1500,
                        'min'     => 400,
                        'max'     => 6000,
                        'label'   => __('How long the copy tick shows (ms)', 'dcc-guest-guide'),
                    ],
                    'log_search_misses' => [
                        'type'    => 'bool',
                        'default' => true,
                        'label'   => __('Record searches that found nothing', 'dcc-guest-guide'),
                        'help'    => __('Keeps only the words typed and when — never anything about the visitor. Shown at the bottom of this page.', 'dcc-guest-guide'),
                    ],
                    'search_miss_keep' => [
                        'type'    => 'int',
                        'default' => 50,
                        'min'     => 5,
                        'max'     => 500,
                        'label'   => __('How many of those to keep', 'dcc-guest-guide'),
                    ],
                ],
            ],
            'public' => [
                'label'  => __('Public guide', 'dcc-guest-guide'),
                'fields' => [
                    'public_cta_label' => [
                        'type'    => 'text',
                        'default' => '',
                        'label'   => __('Default button text on the public guide', 'dcc-guest-guide'),
                        'help'    => __('Used when a placement does not set its own. Leave empty to keep the widget default.', 'dcc-guest-guide'),
                    ],
                    'public_cta_url' => [
                        'type'    => 'url',
                        'default' => '',
                        'label'   => __('Default button link', 'dcc-guest-guide'),
                    ],
                ],
            ],
            'performance' => [
                'label'  => __('Performance', 'dcc-guest-guide'),
                'fields' => [
                    'split_guest_css' => [
                        'type'    => 'bool',
                        'default' => true,
                        'label'   => __('Send guest-only styling only to the full guide', 'dcc-guest-guide'),
                        'help'    => __('The public guide has no Request Support form, review prompt, ⋯ menu, emergency strip or AI search, so it does not need their styling. Off sends one stylesheet to both, as before.', 'dcc-guest-guide'),
                    ],
                    'inline_search_index' => [
                        'type'    => 'bool',
                        'default' => true,
                        'label'   => __('Put the search index in the page', 'dcc-guest-guide'),
                        'help'    => __('Off loads it only when a guest searches — a smaller page, but the first search waits for it.', 'dcc-guest-guide'),
                    ],
                ],
            ],
            'advanced' => [
                'label'  => __('Advanced', 'dcc-guest-guide'),
                'fields' => [
                    'report_rate_limit' => [
                        'type'    => 'int',
                        'default' => 3,
                        'min'     => 1,
                        'max'     => 20,
                        'label'   => __('Support requests allowed per 15 minutes', 'dcc-guest-guide'),
                        'help'    => __('Per visitor. Stops a stuck button from mailing the host repeatedly.', 'dcc-guest-guide'),
                    ],
                    'secret_reveal' => [
                        'type'    => 'select',
                        'default' => 'fetch',
                        'options' => [
                            'fetch'  => __('Fetch from the server when tapped (recommended)', 'dcc-guest-guide'),
                            'inline' => __('Put it in the page (older behaviour)', 'dcc-guest-guide'),
                        ],
                        'label'   => __('How a masked password reaches the guest', 'dcc-guest-guide'),
                        'help'    => __('Fetching keeps passwords out of the page source, where anyone with the link — or a crawler — could read them without tapping anything.', 'dcc-guest-guide'),
                    ],
                ],
            ],
        ];
    }

    /** Flat key => default. */
    public static function defaults(): array
    {
        $out = [];
        foreach (self::schema() as $tab) {
            foreach ($tab['fields'] as $key => $f) {
                $out[$key] = $f['default'];
            }
        }
        return $out;
    }

    /** Flat key => field definition. */
    public static function fields(): array
    {
        $out = [];
        foreach (self::schema() as $tab) {
            foreach ($tab['fields'] as $key => $f) { $out[$key] = $f; }
        }
        return $out;
    }

    /**
     * The live settings: stored values over defaults, every read.
     *
     * A new key is therefore correct from the moment the plugin updates. The
     * stored row is re-saved when the version moves so the database also
     * describes current behaviour, but nothing depends on that having happened.
     */
    public static function all(): array
    {
        if (self::$resolved !== null) { return self::$resolved; }
        $stored = get_option(self::OPTION, []);
        if (!is_array($stored)) { $stored = []; }
        $merged = array_merge(self::defaults(), array_intersect_key($stored, self::defaults()));
        if ((string) ($stored['_version'] ?? '') !== DCCGG_VERSION && did_action('init')) {
            $merged['_version'] = DCCGG_VERSION;
            update_option(self::OPTION, $merged, false);
        }
        self::$resolved = $merged;
        return $merged;
    }

    /** One setting, already sanitised at save time. */
    public static function get(string $key)
    {
        $all = self::all();
        $defaults = self::defaults();
        return array_key_exists($key, $all) ? $all[$key] : ($defaults[$key] ?? null);
    }

    /** Test seam: forget the per-request cache. */
    public static function flush(): void { self::$resolved = null; }

    /**
     * Sanitise a whole submitted form.
     *
     * Iterates the SCHEMA, never the POST: a checkbox that is off posts
     * nothing, so a loop over the input would leave every unchecked box at its
     * previous value and make Save look broken. The whole form posts together,
     * so absence of a boolean genuinely means off.
     */
    public static function sanitize($raw): array
    {
        $raw = is_array($raw) ? $raw : [];
        $out = [];
        foreach (self::fields() as $key => $f) {
            $has = array_key_exists($key, $raw);
            switch ($f['type']) {
                case 'bool':
                    $out[$key] = $has && (string) $raw[$key] !== '' && (string) $raw[$key] !== '0';
                    break;
                case 'int':
                    $n = $has ? (int) $raw[$key] : (int) $f['default'];
                    $out[$key] = max((int) $f['min'], min((int) $f['max'], $n));
                    break;
                case 'url':
                    $out[$key] = $has ? esc_url_raw(trim((string) $raw[$key])) : '';
                    break;
                case 'select':
                    $v = $has ? (string) $raw[$key] : '';
                    $out[$key] = isset($f['options'][$v]) ? $v : (string) $f['default'];
                    break;
                default:
                    $out[$key] = $has ? sanitize_text_field((string) $raw[$key]) : '';
            }
        }
        $out['_version'] = DCCGG_VERSION;
        return $out;
    }
}
