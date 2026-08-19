<?php
namespace DCC_Contact;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Google reCAPTCHA v3 server-side verification. Only ever called when both
 * site + secret keys are configured (callers check Settings::recaptcha_configured()).
 */
final class Recaptcha
{
    private const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

    /** Must match the action passed to grecaptcha.execute() in widget.js. */
    public const ACTION = 'dcc_contact';

    /**
     * @return bool True when the token verifies, was minted for our action on
     *              this site, and the score meets the threshold.
     */
    public static function verify(string $token): bool
    {
        $secret = Settings::recaptcha_secret_key();
        if ($secret === '' || $token === '') {
            return false;
        }

        $response = wp_remote_post(self::VERIFY_URL, [
            'timeout' => 8,
            'body'    => [
                'secret'   => $secret,
                'response' => $token,
            ],
        ]);

        if (is_wp_error($response)) {
            // Network failure verifying reCAPTCHA. Fail closed for the captcha
            // layer (the other three spam layers still ran).
            return false;
        }

        $data = json_decode((string) wp_remote_retrieve_body($response), true);
        if (!is_array($data) || empty($data['success'])) {
            return false;
        }

        // A valid token minted for a different action (or scraped from another
        // page/site using the same key) must not pass here.
        if (isset($data['action']) && $data['action'] !== self::ACTION) {
            return false;
        }
        if (isset($data['hostname']) && is_string($data['hostname']) && $data['hostname'] !== '') {
            if (!self::hostname_matches($data['hostname'])) {
                return false;
            }
        }

        $score = isset($data['score']) ? (float) $data['score'] : 0.0;
        return $score >= Settings::recaptcha_threshold();
    }

    /** Compare Google's reported solve hostname against this site (www-insensitive). */
    private static function hostname_matches(string $hostname): bool
    {
        $home = wp_parse_url(home_url(), PHP_URL_HOST);
        if (!is_string($home) || $home === '') {
            return true;
        }
        $strip = static fn(string $h): string => preg_replace('/^www\./i', '', strtolower($h)) ?? strtolower($h);
        return $strip($hostname) === $strip($home);
    }
}
