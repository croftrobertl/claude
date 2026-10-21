<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The four settings, validated on every load. Bad values become safe
 * defaults plus an amber notice, never a fatal. The two secrets live in a
 * separate autoload=no option, encrypted with the vault key.
 */
final class Settings
{
    public const OPTION  = 'dcc_ragusa_settings';
    public const SECRETS = 'dcc_ragusa_secrets';
    public const SCHEMA  = 1;

    private static ?array $cache   = null;
    private static array  $notices = [];
    private static ?array $secrets = null;

    public static function defaults(): array
    {
        return [
            'schema'              => self::SCHEMA,
            'alert_email'         => '',
            'delete_on_uninstall' => false,
            'has_heartbeat'       => false,
            'has_feed_key'        => false,
        ];
    }

    public static function get(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }
        $raw          = get_option(self::OPTION, null);
        self::$cache  = self::normalise(is_array($raw) ? $raw : [], $raw !== null);
        if ($raw === null) {
            add_option(self::OPTION, self::$cache, '', 'yes');
        }
        return self::$cache;
    }

    /** @return string[] amber notices found while loading */
    public static function notices(): array
    {
        self::get();
        return self::$notices;
    }

    private static function normalise(array $in, bool $stored): array
    {
        $out = self::defaults();
        if ($stored && (int) ($in['schema'] ?? 0) !== self::SCHEMA) {
            self::$notices[] = __('The saved settings had an unknown layout, so the defaults are in use.', 'dcc-ragusa');
            return $out;
        }
        $email = is_string($in['alert_email'] ?? null) ? trim($in['alert_email']) : '';
        if ($email !== '' && !is_email($email)) {
            self::$notices[] = __('The alert email address was not valid, so alerts go to the site administrator address.', 'dcc-ragusa');
            $email = '';
        }
        $out['alert_email']         = $email;
        $out['delete_on_uninstall'] = !empty($in['delete_on_uninstall']);
        $out['has_heartbeat']       = !empty($in['has_heartbeat']);
        $out['has_feed_key']        = !empty($in['has_feed_key']);
        return $out;
    }

    /** The address alerts go to. */
    public static function alert_email(): string
    {
        $s = self::get();
        return $s['alert_email'] !== '' ? $s['alert_email'] : (string) get_option('admin_email', '');
    }

    /**
     * Save from the settings form. Secrets arrive as plain text only when
     * the user typed a replacement; an empty field keeps the stored one.
     *
     * @return string[] notices to show
     */
    public static function save(array $in): array
    {
        $current = self::get();
        $notices = [];

        $email = is_string($in['alert_email'] ?? null) ? sanitize_email(trim($in['alert_email'])) : '';
        if ($email !== '' && !is_email($email)) {
            $notices[] = __('That alert email address is not valid, so the site administrator address stays in use.', 'dcc-ragusa');
            $email     = '';
        }
        $current['alert_email']         = $email;
        $current['delete_on_uninstall'] = !empty($in['delete_on_uninstall']);

        if (!empty($in['heartbeat_url'])) {
            $url = trim((string) $in['heartbeat_url']);
            if (self::valid_heartbeat_url($url)) {
                self::set_secret('heartbeat_url', $url);
            } else {
                $notices[] = __('The heartbeat URL was not a healthchecks.io ping URL, so it was not saved.', 'dcc-ragusa');
            }
        }
        if (!empty($in['feed_key'])) {
            $key = trim((string) $in['feed_key']);
            if (self::valid_feed_key($key)) {
                self::set_secret('feed_key', $key);
            } else {
                $notices[] = __('The feed key did not look like an API key (16 to 128 plain characters), so it was not saved.', 'dcc-ragusa');
            }
        }
        if (!empty($in['clear_heartbeat'])) {
            self::set_secret('heartbeat_url', '');
        }
        if (!empty($in['clear_feed_key'])) {
            self::set_secret('feed_key', '');
        }

        $current['has_heartbeat'] = self::secret('heartbeat_url') !== '';
        $current['has_feed_key']  = self::secret('feed_key') !== '';
        $current['schema']        = self::SCHEMA;

        update_option(self::OPTION, $current, 'yes');
        self::$cache = $current;
        return $notices;
    }

    public static function valid_heartbeat_url(string $url): bool
    {
        if (strlen($url) > 300 || !str_starts_with($url, 'https://')) {
            return false;
        }
        $p = wp_parse_url($url);
        if (!is_array($p) || empty($p['host']) || !empty($p['query']) || !empty($p['fragment'])) {
            return false;
        }
        $path = (string) ($p['path'] ?? '');
        if (preg_match('#^/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/?$#i', $path)) {
            return true;
        }
        // Slug form: /<ping key>/<slug>
        return (bool) preg_match('#^/[A-Za-z0-9_-]{8,64}/[A-Za-z0-9_-]{1,100}/?$#', $path);
    }

    public static function valid_feed_key(string $key): bool
    {
        $len = strlen($key);
        return $len >= 16 && $len <= 128 && (bool) preg_match('/^[\x21-\x7e]+$/', $key);
    }

    // ----------------------------------------------------------- secrets

    public static function secret(string $name): string
    {
        self::load_secrets();
        return (string) (self::$secrets[$name] ?? '');
    }

    public static function set_secret(string $name, string $value): void
    {
        self::load_secrets();
        self::$secrets[$name] = $value;
        $blob = Crypto::seal((string) wp_json_encode(self::$secrets), Vault::key());
        if (get_option(self::SECRETS, null) === null) {
            add_option(self::SECRETS, $blob, '', 'no');
        } else {
            update_option(self::SECRETS, $blob, 'no');
        }
    }

    /** True when a stored secrets blob exists but cannot be opened. */
    public static function secrets_unreadable(): bool
    {
        self::load_secrets();
        return self::$secrets === [] && is_string(get_option(self::SECRETS, null)) && get_option(self::SECRETS) !== '';
    }

    private static function load_secrets(): void
    {
        if (self::$secrets !== null) {
            return;
        }
        self::$secrets = [];
        $blob          = get_option(self::SECRETS, '');
        if (!is_string($blob) || $blob === '') {
            return;
        }
        $json = Crypto::open($blob, Vault::key());
        if ($json === null) {
            return;
        }
        $data = json_decode($json, true);
        if (is_array($data)) {
            foreach (['heartbeat_url', 'feed_key'] as $k) {
                if (isset($data[$k]) && is_string($data[$k])) {
                    self::$secrets[$k] = $data[$k];
                }
            }
        }
    }

    /** "https://hc-ping.com/••••••••-••••-…-c2f1" — never the whole value. */
    public static function mask(string $value): string
    {
        if ($value === '') {
            return '';
        }
        $tail = substr($value, -4);
        if (str_starts_with($value, 'https://')) {
            $p    = wp_parse_url($value);
            $host = (string) ($p['host'] ?? '');
            return 'https://' . $host . '/••••••••…' . $tail;
        }
        return str_repeat('•', max(4, min(12, strlen($value) - 4))) . $tail;
    }

    public static function reset_cache(): void
    {
        self::$cache   = null;
        self::$secrets = null;
        self::$notices = [];
    }
}
