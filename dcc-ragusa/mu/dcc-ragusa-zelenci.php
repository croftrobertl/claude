<?php
/**
 * Plugin Name: Zelenci · Rings If Ragusa Falls
 * Description: The two bronze bell-ringers on the City Bell Tower. If DCC Ragusa is switched off or removed for more than ten minutes, Zelenci sends one email a day and one failure ping to the heartbeat. It does nothing else. Installed by `wp ragusa zelenci install`.
 * Version: 0.1.0
 *
 * Standalone on purpose: it must work when Ragusa is gone. It reads
 * Ragusa's encrypted secrets with the same vault key, from the same vault
 * folder, computed the same way. Zero front-end cost: it runs only in cron,
 * on the login page and on the Plugins screen.
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!function_exists('dccr_zelenci_boot')) {
    function dccr_zelenci_boot(): void
    {
        $watched = (function_exists('wp_doing_cron') && wp_doing_cron())
            || (($GLOBALS['pagenow'] ?? '') === 'wp-login.php')
            || (($GLOBALS['pagenow'] ?? '') === 'plugins.php');
        if (!$watched) {
            return;
        }
        add_action('init', 'dccr_zelenci_check', 99);
    }

    function dccr_zelenci_check(): void
    {
        try {
            $now     = time();
            $state   = get_option('dcc_ragusa_zelenci', []);
            $state   = is_array($state) ? $state : [];
            if ($now - (int) ($state['last_check'] ?? 0) < 600) {
                return;
            }
            $state['last_check'] = $now;
            $active   = (array) get_option('active_plugins', []);
            $present  = is_file(WP_PLUGIN_DIR . '/dcc-ragusa/dcc-ragusa.php');
            $standing = $present && in_array('dcc-ragusa/dcc-ragusa.php', $active, true);
            if ($standing) {
                $state['missing_since'] = 0;
                dccr_zelenci_save($state);
                return;
            }
            if (empty($state['missing_since'])) {
                $state['missing_since'] = $now;
                dccr_zelenci_save($state);
                return;
            }
            if ($now - (int) $state['missing_since'] < 600) {
                dccr_zelenci_save($state);
                return;
            }
            if ($now - (int) ($state['last_alert'] ?? 0) < 86400) {
                dccr_zelenci_save($state);
                return;
            }
            $state['last_alert'] = $now;
            dccr_zelenci_save($state);
            if (!dccr_zelenci_is_live()) {
                return;
            }
            $why  = $present ? 'DCC Ragusa is installed but not active.' : 'The DCC Ragusa plugin folder is gone.';
            $body = $why . "\n\n"
                . "Zelenci did nothing else: it only rings.\n\n"
                . "Open Plugins and activate Ragusa. If you did not switch it off, change the administrator passwords and tell the site director.\n\n"
                . 'Plugins: ' . admin_url('plugins.php');
            $to = (string) get_option('admin_email', '');
            $settings = get_option('dcc_ragusa_settings', []);
            if (is_array($settings) && !empty($settings['alert_email']) && is_email((string) $settings['alert_email'])) {
                $to = (string) $settings['alert_email'];
            }
            if ($to !== '') {
                wp_mail($to, 'Ragusa · Zelenci · Ragusa Is Not Standing', $body, ['Content-Type: text/plain; charset=UTF-8']);
            }
            $url = dccr_zelenci_heartbeat_url();
            if ($url !== '') {
                wp_remote_post(rtrim($url, '/') . '/fail', ['timeout' => 5, 'body' => 'Zelenci: ' . $why, 'headers' => ['Content-Type' => 'text/plain; charset=UTF-8']]);
            }
        } catch (\Throwable $e) {
            // A bell that breaks must not break the site.
        }
    }

    function dccr_zelenci_save(array $state): void
    {
        if (get_option('dcc_ragusa_zelenci', null) === null) {
            add_option('dcc_ragusa_zelenci', $state, '', 'no');
        } else {
            update_option('dcc_ragusa_zelenci', $state, 'no');
        }
    }

    function dccr_zelenci_is_live(): bool
    {
        $parts = wp_parse_url(home_url('/'));
        $host  = preg_replace('/^www\./', '', strtolower((string) ($parts['host'] ?? ''))) ?? '';
        $path  = trim((string) ($parts['path'] ?? '/'), '/');
        $prefix = (string) ($GLOBALS['table_prefix'] ?? '');
        return $prefix === 'portal_' && $host === 'doracanalcourt.com' && $path === '';
    }

    /** The same site id, vault folder and key as Ragusa, computed the same way. */
    function dccr_zelenci_heartbeat_url(): string
    {
        $blob = get_option('dcc_ragusa_secrets', '');
        if (!is_string($blob) || $blob === '') {
            return '';
        }
        $key = '';
        if (defined('DCC_RAGUSA_VAULT_KEY') && is_string(DCC_RAGUSA_VAULT_KEY) && strlen(DCC_RAGUSA_VAULT_KEY) >= 16) {
            $key = hash('sha256', DCC_RAGUSA_VAULT_KEY, true);
        } else {
            $parts  = wp_parse_url(home_url('/'));
            $host   = preg_replace('/^www\./', '', strtolower((string) ($parts['host'] ?? ''))) ?? '';
            $path   = trim((string) ($parts['path'] ?? '/'), '/');
            $prefix = (string) ($GLOBALS['table_prefix'] ?? '');
            $role   = ($prefix === 'wpstg0_' || str_starts_with($path, 'staging')) ? 'staging'
                : (($prefix === 'portal_' && $host === 'doracanalcourt.com' && $path === '') ? 'live' : 'other');
            $id     = $role . '-' . substr(hash('sha256', rtrim(ABSPATH, '/\\') . '|' . $prefix . '|' . home_url('/')), 0, 8);
            $home   = getenv('HOME');
            if (!is_string($home) || $home === '' || !is_dir($home)) {
                $home = function_exists('posix_getpwuid') ? (posix_getpwuid(posix_geteuid())['dir'] ?? '') : '';
            }
            $candidates = [];
            if ($home !== '') {
                $candidates[] = rtrim($home, '/') . '/ragusa-vault/' . $id . '/.key';
            }
            $candidates[] = WP_CONTENT_DIR . '/uploads/ragusa-vault/' . $id . '/.key';
            foreach ($candidates as $file) {
                if (is_readable($file)) {
                    $raw = (string) file_get_contents($file);
                    if (strlen($raw) === 64 && ctype_xdigit($raw)) {
                        $key = (string) hex2bin($raw);
                        break;
                    }
                }
            }
        }
        if ($key === '') {
            return '';
        }
        $json = dccr_zelenci_open($blob, $key);
        if ($json === null) {
            return '';
        }
        $data = json_decode($json, true);
        return is_array($data) && isset($data['heartbeat_url']) && is_string($data['heartbeat_url']) && str_starts_with($data['heartbeat_url'], 'https://') ? $data['heartbeat_url'] : '';
    }

    function dccr_zelenci_open(string $blob, string $key): ?string
    {
        if (strlen($blob) < 4 || $blob[2] !== ':') {
            return null;
        }
        $kind = substr($blob, 0, 2);
        $raw  = base64_decode(substr($blob, 3), true);
        if ($raw === false) {
            return null;
        }
        try {
            if ($kind === 's1' && function_exists('sodium_crypto_secretbox_open')) {
                $n   = SODIUM_CRYPTO_SECRETBOX_NONCEBYTES;
                $out = strlen($raw) > $n ? sodium_crypto_secretbox_open(substr($raw, $n), substr($raw, 0, $n), $key) : false;
                return $out === false ? null : $out;
            }
            if ($kind === 'o1' && function_exists('openssl_decrypt') && strlen($raw) > 28) {
                $out = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
                return $out === false ? null : $out;
            }
            if ($kind === 'p1') {
                return $raw;
            }
        } catch (\Throwable $e) {
            return null;
        }
        return null;
    }

    dccr_zelenci_boot();
}
