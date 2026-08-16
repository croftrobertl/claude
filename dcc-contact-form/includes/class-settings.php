<?php
namespace DCC_Contact;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Site-wide (secret) settings stored in a single option. The reCAPTCHA secret
 * key lives here — never in the Elementor panel — because per-page Elementor
 * data is comparatively exposed.
 */
final class Settings
{
    public const OPTION = 'dcc_contact_settings';

    public static function defaults(): array
    {
        return [
            'recaptcha_site_key'   => '',
            'recaptcha_secret_key' => '',
            'recaptcha_threshold'  => 0.4,
            'min_submit_time'      => 2,
            'keyword_filter'       => '',
        ];
    }

    public static function all(): array
    {
        $stored = get_option(self::OPTION, []);
        if (!is_array($stored)) {
            $stored = [];
        }
        return array_merge(self::defaults(), $stored);
    }

    public static function get(string $key)
    {
        $all = self::all();
        return $all[$key] ?? null;
    }

    public static function recaptcha_site_key(): string
    {
        return (string) self::get('recaptcha_site_key');
    }

    public static function recaptcha_secret_key(): string
    {
        return (string) self::get('recaptcha_secret_key');
    }

    /** reCAPTCHA is usable only when both keys are present. */
    public static function recaptcha_configured(): bool
    {
        return self::recaptcha_site_key() !== '' && self::recaptcha_secret_key() !== '';
    }

    public static function recaptcha_threshold(): float
    {
        $t = (float) self::get('recaptcha_threshold');
        if ($t <= 0 || $t > 1) {
            $t = 0.4;
        }
        return $t;
    }

    public static function min_submit_time(): int
    {
        return max(0, (int) self::get('min_submit_time'));
    }

    /** Prohibited words as a lowercased, trimmed list (one per line / comma). */
    public static function keywords(): array
    {
        $raw = (string) self::get('keyword_filter');
        if (trim($raw) === '') {
            return [];
        }
        $parts = preg_split('/[\r\n,]+/', $raw) ?: [];
        $out = [];
        foreach ($parts as $p) {
            $p = trim(mb_strtolower($p));
            if ($p !== '') {
                $out[] = $p;
            }
        }
        return array_values(array_unique($out));
    }

    /**
     * Sanitize the settings form payload into the stored shape. Keys are stored
     * verbatim (they may contain any characters Google issues) but stripped of
     * surrounding whitespace and tags.
     */
    public static function sanitize(array $input): array
    {
        $out = self::defaults();

        if (isset($input['recaptcha_site_key'])) {
            $out['recaptcha_site_key'] = sanitize_text_field((string) $input['recaptcha_site_key']);
        }
        if (isset($input['recaptcha_secret_key'])) {
            $out['recaptcha_secret_key'] = sanitize_text_field((string) $input['recaptcha_secret_key']);
        }
        if (isset($input['recaptcha_threshold'])) {
            $t = (float) $input['recaptcha_threshold'];
            $out['recaptcha_threshold'] = ($t > 0 && $t <= 1) ? $t : 0.4;
        }
        if (isset($input['min_submit_time'])) {
            $out['min_submit_time'] = max(0, (int) $input['min_submit_time']);
        }
        if (isset($input['keyword_filter'])) {
            $out['keyword_filter'] = sanitize_textarea_field((string) $input['keyword_filter']);
        }

        return $out;
    }
}
