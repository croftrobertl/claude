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

    /**
     * @return bool True when the token verifies and the score meets threshold.
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

        $score = isset($data['score']) ? (float) $data['score'] : 0.0;
        return $score >= Settings::recaptcha_threshold();
    }
}
