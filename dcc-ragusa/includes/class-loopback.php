<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Loopback requests to this site. Feature-detected the way core's Site
 * Health does it (a POST to wp-cron.php), remembered for a day. Page checks
 * carry a cache-busting query string so SpeedyCache serves the real page.
 */
final class Loopback
{
    public const TIMEOUT = 10;

    public static function available(bool $recheck = false): bool
    {
        $cached = (array) State::get('loopback', []);
        if (!$recheck && isset($cached['ok']) && time() - (int) ($cached['checked_at'] ?? 0) < 86400) {
            return (bool) $cached['ok'];
        }
        $url  = site_url('wp-cron.php');
        $resp = wp_remote_post($url, [
            'timeout'   => self::TIMEOUT,
            'body'      => ['ragusa' => 'loopback-test'],
            'headers'   => ['Cache-Control' => 'no-cache'],
            'sslverify' => apply_filters('https_local_ssl_verify', false, $url),
        ]);
        $ok = !is_wp_error($resp) && (int) wp_remote_retrieve_response_code($resp) === 200;
        State::set('loopback', ['ok' => $ok, 'checked_at' => time(), 'error' => is_wp_error($resp) ? $resp->get_error_message() : '']);
        return $ok;
    }

    /**
     * GET a site path with a cache-buster.
     *
     * @return array{ok:bool,code:int,body:string,error:string,ms:int}
     */
    public static function get(string $path): array
    {
        $url   = home_url($path);
        $url   = add_query_arg('ragusa_check', substr(bin2hex(random_bytes(6)), 0, 12), $url);
        $start = hrtime(true);
        $resp  = wp_remote_get($url, [
            'timeout'     => self::TIMEOUT,
            'redirection' => 3,
            'headers'     => ['Cache-Control' => 'no-cache', 'User-Agent' => 'DCC-Ragusa/' . DCCR_VERSION],
            'sslverify'   => apply_filters('https_local_ssl_verify', false, $url),
            'cookies'     => [],
        ]);
        $ms = (int) ((hrtime(true) - $start) / 1e6);
        if (is_wp_error($resp)) {
            return ['ok' => false, 'code' => 0, 'body' => '', 'error' => $resp->get_error_message(), 'ms' => $ms];
        }
        $code = (int) wp_remote_retrieve_response_code($resp);
        return ['ok' => $code === 200, 'code' => $code, 'body' => (string) wp_remote_retrieve_body($resp), 'error' => '', 'ms' => $ms];
    }
}
