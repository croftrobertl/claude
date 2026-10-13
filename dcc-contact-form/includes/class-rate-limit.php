<?php
namespace DCC_Contact;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Per-IP submission limit.
 *
 * PRIVACY — this plugin deliberately stores no IP address with an entry, and
 * that posture is unchanged: no raw IP is written anywhere. The limiter keys a
 * short-lived transient on an HMAC of the address, salted with the site's own
 * salt, so the stored value is unguessable, not reversible to an address, and
 * gone when the window expires. Nothing lands in the entries table.
 *
 * WHAT IS METERED — accepted submissions only, counted after every spam layer
 * has passed and immediately before anything is stored or mailed. Metering
 * attempts instead would lock out a guest who simply mistyped their email three
 * times, while buying nothing: a submission that fails validation sends no mail
 * and so cannot be used for abuse. Volume of invalid attempts is reCAPTCHA's
 * job, not this limiter's.
 *
 * TRUST — the address comes from REMOTE_ADDR only. X-Forwarded-For is set by
 * the client and an attacker could rotate it to get an unlimited number of
 * fresh buckets, which would defeat the limit entirely. A site genuinely behind
 * a trusted proxy can supply the real address via the
 * `dcc_contact_client_ip` filter, which is the only way this is overridden.
 */
final class Rate_Limit
{
    /** Length of the window, in seconds. */
    public const WINDOW_SECONDS = 900;

    /** Accepted submissions permitted per address per window. */
    public const MAX_IN_WINDOW = 3;

    private const PREFIX = 'dcc_cf_rl_';

    /**
     * True when this address has already used its allowance.
     *
     * Fails OPEN when no usable address is available: a missing or malformed
     * REMOTE_ADDR must not take the contact form offline.
     */
    public static function exceeded(): bool
    {
        $key = self::key();
        if ($key === '') {
            return false;
        }

        $data = self::window($key);
        return $data['count'] >= self::MAX_IN_WINDOW;
    }

    /** Count one accepted submission against this address. */
    public static function record(): void
    {
        $key = self::key();
        if ($key === '') {
            return;
        }

        $data = self::window($key);
        $data['count']++;

        // The TTL covers whatever remains of the window, so re-setting the
        // transient on each hit cannot extend the window past its true end.
        $remaining = max(1, ($data['start'] + self::WINDOW_SECONDS) - time());
        set_transient($key, $data, $remaining);
    }

    /** How long until this address may submit again, in seconds. */
    public static function retry_after(): int
    {
        $key = self::key();
        if ($key === '') {
            return 0;
        }
        $data = self::window($key);
        return max(0, ($data['start'] + self::WINDOW_SECONDS) - time());
    }

    /**
     * The current window for a key, starting a fresh one when none is live.
     *
     * @return array{start:int,count:int}
     */
    private static function window(string $key): array
    {
        $data = get_transient($key);
        if (
            !is_array($data)
            || !isset($data['start'], $data['count'])
            || ((int) $data['start'] + self::WINDOW_SECONDS) < time()
        ) {
            return ['start' => time(), 'count' => 0];
        }
        return ['start' => (int) $data['start'], 'count' => (int) $data['count']];
    }

    /** Transient key: an HMAC of the address, never the address itself. */
    private static function key(): string
    {
        $ip = self::client_ip();
        if ($ip === '') {
            return '';
        }
        return self::PREFIX . substr(hash_hmac('sha256', $ip, wp_salt('nonce')), 0, 32);
    }

    private static function client_ip(): string
    {
        $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';

        /**
         * Filters the client address used for rate limiting.
         *
         * Only for a site behind a proxy it actually controls. Returning a
         * client-supplied header here reopens the bypass this guards against.
         */
        $ip = (string) apply_filters('dcc_contact_client_ip', $ip);

        return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '';
    }
}
