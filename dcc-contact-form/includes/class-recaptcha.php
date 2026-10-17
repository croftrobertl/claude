<?php
namespace DCC_Contact;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Google reCAPTCHA v3 server-side verification. Only ever called when both
 * site + secret keys are configured (callers check Settings::recaptcha_configured()).
 *
 * THREE OUTCOMES, NOT TWO. A plain bool conflated two very different things:
 * "Google looked at this and judged it a bot" and "we never managed to ask
 * Google". The second turned a real guest away whenever their browser blocked
 * the reCAPTCHA script, their network dropped the verification call, or our own
 * keys were wrong — the enquiry was filed as spam and never emailed, so the
 * lead was lost silently. check() therefore reports:
 *
 *   PASS       — verified, minted for our action on our host, score at or above
 *                the threshold.
 *   SPAM       — Google ANSWERED and the answer condemns the submission: a score
 *                below the threshold, or a token that was never minted for this
 *                site/action (forged or replayed from elsewhere).
 *   UNVERIFIED — we could not obtain a verdict: no token at all, the API
 *                unreachable or timing out, a malformed reply, an expired or
 *                already-used token, or OUR OWN secret key being wrong. The
 *                caller saves and emails these, flagged "Unverified", because
 *                none of them is evidence against the visitor.
 *
 * Accepting UNVERIFIED is a deliberate trade: a scripted POST that sends no
 * token also lands here. What stops it is the other two layers — the honeypot,
 * and the time-trap, which since 1.7.0 REQUIRES a real elapsed-time field and
 * so already requires JavaScript — plus the per-IP limit, which caps whatever
 * does get through at Rate_Limit::MAX_IN_WINDOW per window.
 */
final class Recaptcha
{
    private const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

    /** Must match the action passed to grecaptcha.execute() in widget.js. */
    public const ACTION = 'dcc_contact';

    /** Outcomes of check(). */
    public const PASS = 'pass';
    public const SPAM = 'spam';
    public const UNVERIFIED = 'unverified';

    /**
     * Google error codes that mean the fault is OURS or the token simply aged
     * out — never that the visitor is a bot. These resolve to UNVERIFIED.
     *
     *  missing-input-secret / invalid-input-secret / bad-request
     *      the secret key on the Settings screen is empty, wrong, or the
     *      request was malformed. A misconfigured key must not silently
     *      reclassify every genuine enquiry as spam.
     *  timeout-or-duplicate
     *      the token expired (v3 tokens last ~2 minutes) or was already
     *      redeemed. A guest who opened the page, got interrupted and then
     *      submitted hits this routinely.
     *  missing-input-response
     *      no token reached Google. The caller screens '' before we get here,
     *      so this is belt-and-braces.
     */
    private const OUR_FAULT_CODES = [
        'missing-input-secret',
        'invalid-input-secret',
        'bad-request',
        'timeout-or-duplicate',
        'missing-input-response',
    ];

    /**
     * Verify a token and classify the result.
     *
     * @return self::PASS|self::SPAM|self::UNVERIFIED
     */
    public static function check(string $token): string
    {
        $secret = Settings::recaptcha_secret_key();

        // No secret configured, or no token minted: nothing was judged.
        if ($secret === '' || $token === '') {
            return self::UNVERIFIED;
        }

        $response = wp_remote_post(self::VERIFY_URL, [
            'timeout' => 8,
            'body'    => [
                'secret'   => $secret,
                'response' => $token,
            ],
        ]);

        // Network failure, DNS failure, or our 8s timeout elapsing. The guest
        // is not responsible for Google being unreachable.
        if (is_wp_error($response)) {
            return self::UNVERIFIED;
        }

        if (self::response_code($response) !== 200) {
            return self::UNVERIFIED;
        }

        $data = json_decode((string) wp_remote_retrieve_body($response), true);
        if (!is_array($data)) {
            return self::UNVERIFIED;
        }

        if (empty($data['success'])) {
            // Distinguish "your key is broken / the token aged out" from
            // "this token is a forgery". Only the latter is evidence.
            $codes = isset($data['error-codes']) && is_array($data['error-codes'])
                ? array_map('strval', $data['error-codes'])
                : [];

            foreach ($codes as $code) {
                if (in_array($code, self::OUR_FAULT_CODES, true)) {
                    return self::UNVERIFIED;
                }
            }

            // No codes at all tells us nothing; don't condemn on silence.
            if ($codes === []) {
                return self::UNVERIFIED;
            }

            // What remains is invalid-input-response and friends: a token that
            // this site never minted.
            return self::SPAM;
        }

        // A valid token minted for a different action (or scraped from another
        // page/site using the same key) must not pass here. Google answered,
        // and the answer is that this token is not ours — that is evidence.
        if (isset($data['action']) && $data['action'] !== self::ACTION) {
            return self::SPAM;
        }
        if (isset($data['hostname']) && is_string($data['hostname']) && $data['hostname'] !== '') {
            if (!self::hostname_matches($data['hostname'])) {
                return self::SPAM;
            }
        }

        // A reply that verified but carries no score is not a judgement.
        if (!isset($data['score']) || !is_numeric($data['score'])) {
            return self::UNVERIFIED;
        }

        return ((float) $data['score'] >= Settings::recaptcha_threshold())
            ? self::PASS
            : self::SPAM;
    }

    /**
     * Back-compatible boolean form. UNVERIFIED counts as a failure here, so any
     * caller still using this keeps the pre-1.7.1 behaviour; Form_Handler uses
     * check() so that it can tell the two failures apart.
     */
    public static function verify(string $token): bool
    {
        return self::check($token) === self::PASS;
    }

    /** HTTP status, tolerating stubs/filters that return a bare body array. */
    private static function response_code($response): int
    {
        if (function_exists('wp_remote_retrieve_response_code')) {
            $code = (int) wp_remote_retrieve_response_code($response);
            // An empty/absent status (some transports, and test doubles) must
            // not be read as a failure when a body is present.
            if ($code === 0) {
                return 200;
            }
            return $code;
        }
        return 200;
    }

    /** Compare Google's reported solve hostname against this site (www-insensitive). */
    private static function hostname_matches(string $hostname): bool
    {
        $home = wp_parse_url(home_url(), PHP_URL_HOST);
        if (!is_string($home) || $home === '') {
            return true;
        }
        return Urls::same_host($hostname, $home);
    }
}
