<?php
namespace DCC_Contact;

if (!defined('ABSPATH')) {
    exit;
}

/** Host comparison, shared by the referer check and reCAPTCHA's hostname check. */
final class Urls
{
    /**
     * True when two hostnames name the same site.
     *
     * Deliberately www-insensitive. A site reachable at both www. and the bare
     * domain would otherwise refuse a real submission whose Referer carries the
     * other spelling, which is a far likelier event than an attacker being
     * stopped by the distinction.
     */
    public static function same_host(string $a, string $b): bool
    {
        return self::canonical($a) === self::canonical($b) && self::canonical($a) !== '';
    }

    private static function canonical(string $host): string
    {
        $host = strtolower(trim($host));
        // Strip a trailing dot (a fully-qualified root) and a leading www.
        $host = rtrim($host, '.');
        return preg_replace('/^www\./', '', $host) ?? $host;
    }
}
