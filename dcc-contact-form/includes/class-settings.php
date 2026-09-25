<?php
namespace DCC_Contact;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Site-wide settings, stored in a single option.
 *
 * These values are the DEFAULTS every form inherits. An Elementor widget may
 * override any of them per placement, but a control left alone stores nothing
 * and falls back here — so changing a value on this screen moves every form
 * that has not been overridden.
 *
 * Two shapes matter and they are easy to confuse:
 *
 *  - all() merges defaults() into the stored row AT READ TIME, so a key added
 *    by a later plugin version is returned with its default even though the
 *    stored row predates it. New features never silently read as "off".
 *  - sanitize() rebuilds the row from the schema on every save. That is why
 *    absence must be handled PER KEY: an unchecked checkbox posts nothing, so
 *    a boolean read with the "use the default when absent" rule would flip
 *    itself back on at every save. Booleans therefore treat absent as false.
 */
final class Settings
{
    public const OPTION = 'dcc_contact_settings';

    /**
     * The single source of truth for keys, types and defaults.
     *
     * Every default here reproduces the behaviour shipped in 1.5.0 exactly.
     * `from_name` is deliberately '' rather than the site name: Email resolves
     * an empty name to get_bloginfo('name') at send time, which is what 1.5.0
     * did, and hard-coding it here would freeze a stale site title into the
     * stored row.
     *
     * @return array<string,array{type:string,default:mixed,group:string}>
     */
    public static function schema(): array
    {
        return [
            // ---- Common: the things Rob changes ----
            'notify_to'            => ['type' => 'email',    'default' => 'contact@doracanalcourt.com', 'group' => 'common'],
            'notify_subject'       => ['type' => 'text',     'default' => 'Contact Request: {Name}',    'group' => 'common'],
            'confirmation_message' => ['type' => 'textarea', 'default' => 'Thank you. We will contact you shortly.', 'group' => 'common'],
            'submit_text'          => ['type' => 'text',     'default' => 'Send Message', 'group' => 'common'],
            'submit_processing'    => ['type' => 'text',     'default' => 'Sending...',   'group' => 'common'],
            'copy_to_sender'       => ['type' => 'bool',     'default' => false,          'group' => 'common'],
            'copy_label'           => ['type' => 'text',     'default' => 'Send me a copy of this message', 'group' => 'common'],

            // ---- Advanced: deliverability ----
            'from_email'           => ['type' => 'email',    'default' => 'contact@doracanalcourt.com', 'group' => 'mail'],
            'from_name'            => ['type' => 'text',     'default' => '',        'group' => 'mail'],
            'reply_to'             => ['type' => 'text',     'default' => '{email}', 'group' => 'mail'],

            // ---- Advanced: spam layers ----
            'spam_honeypot'        => ['type' => 'bool',     'default' => true,  'group' => 'spam'],
            'spam_time_trap'       => ['type' => 'bool',     'default' => true,  'group' => 'spam'],
            'spam_keyword_filter'  => ['type' => 'bool',     'default' => true,  'group' => 'spam'],
            'spam_recaptcha'       => ['type' => 'bool',     'default' => true,  'group' => 'spam'],
            'recaptcha_site_key'   => ['type' => 'text',     'default' => '',    'group' => 'spam'],
            'recaptcha_secret_key' => ['type' => 'text',     'default' => '',    'group' => 'spam'],
            'recaptcha_threshold'  => ['type' => 'float01',  'default' => 0.4,   'group' => 'spam'],
            'min_submit_time'      => ['type' => 'int',      'default' => 2,     'group' => 'spam'],
            'keyword_filter'       => ['type' => 'textarea', 'default' => '',    'group' => 'spam'],
        ];
    }

    /** @return array<string,mixed> */
    public static function defaults(): array
    {
        $out = [];
        foreach (self::schema() as $key => $spec) {
            $out[$key] = $spec['default'];
        }
        return $out;
    }

    /** @return array<string,mixed> */
    public static function all(): array
    {
        $stored = get_option(self::OPTION, []);
        if (!is_array($stored)) {
            $stored = [];
        }
        // Read-time merge: keys the stored row has never heard of come back
        // with their defaults rather than null.
        return array_merge(self::defaults(), $stored);
    }

    public static function get(string $key)
    {
        $all = self::all();
        return $all[$key] ?? null;
    }

    /** Booleans, resolved without the caller having to know the storage shape. */
    public static function flag(string $key): bool
    {
        return (bool) self::get($key);
    }

    /* ------------------------------------------------------------------ */
    /* Typed accessors                                                     */
    /* ------------------------------------------------------------------ */

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

    /**
     * 0.0–1.0 inclusive; anything outside falls back to 0.4. A threshold of 0
     * is legitimate: it accepts every submission carrying a VALID token (the
     * token is still verified), regardless of score.
     */
    public static function recaptcha_threshold(): float
    {
        $t = (float) self::get('recaptcha_threshold');
        return ($t < 0 || $t > 1) ? 0.4 : $t;
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

    /* ------------------------------------------------------------------ */
    /* Save                                                                */
    /* ------------------------------------------------------------------ */

    /**
     * Schema-driven sanitisation. Absence is handled per key BY TYPE:
     *
     *  - bool: absent means false. An unchecked checkbox posts nothing, so the
     *    "fall back to the default" rule would silently switch a disabled layer
     *    back on at the next save. This is the trap the audit found.
     *  - everything else: absent means "not on this form", so the stored value
     *    is preserved rather than reset to the default.
     *
     * @param array<string,mixed> $input
     * @return array<string,mixed>
     */
    public static function sanitize($input): array
    {
        $input  = is_array($input) ? $input : [];
        $stored = get_option(self::OPTION, []);
        $stored = is_array($stored) ? $stored : [];

        $out = [];
        foreach (self::schema() as $key => $spec) {
            $type    = $spec['type'];
            $default = $spec['default'];

            if ($type === 'bool') {
                // Absent === unchecked === false. Never the default.
                $out[$key] = !empty($input[$key]);
                continue;
            }

            if (!array_key_exists($key, $input)) {
                // Preserve what is stored; fall back to the default only when
                // the key has never been stored at all.
                $out[$key] = array_key_exists($key, $stored) ? $stored[$key] : $default;
                continue;
            }

            $out[$key] = self::sanitize_value($type, $input[$key], $default);
        }

        return $out;
    }

    private static function sanitize_value(string $type, $value, $default)
    {
        switch ($type) {
            case 'email':
                $v = sanitize_text_field((string) $value);
                return $v;

            case 'textarea':
                return sanitize_textarea_field((string) $value);

            case 'int':
                return max(0, (int) $value);

            case 'float01':
                if ($value === '' || $value === null) {
                    return $default;
                }
                $t = (float) $value;
                return ($t >= 0 && $t <= 1) ? $t : $default;

            case 'text':
            default:
                return sanitize_text_field((string) $value);
        }
    }
}
