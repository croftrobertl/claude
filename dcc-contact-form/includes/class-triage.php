<?php
namespace DCC_Contact;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Does a trapped submission look like it came from a person?
 *
 * The honeypot is the one spam layer that can plausibly fire on a real guest:
 * the field is hidden from humans, but an aggressive autofill — iOS, or a
 * password manager guessing at a field labelled "Code" — can put something in
 * it, and the guest is then shown a thank-you for a message nobody will read.
 * Flagging the handful that read as human lets Rob rescue them.
 *
 * This is a TRIAGE HINT, never a decision. A submission flagged here is still
 * stored as spam and still goes unemailed; all the flag does is raise a hand on
 * the admin notice. So the cost of a false positive is one glance at an entry,
 * and the test is tuned to be generous rather than precise.
 */
final class Triage
{
    /**
     * True when a trapped submission is worth a human look.
     *
     * Requires all three of:
     *   - no links anywhere (the single most reliable spam marker);
     *   - a contact route that could actually be replied to — a plausible
     *     email address, or a US phone number;
     *   - text that reads like prose rather than a payload.
     *
     * @param array<int,array{label:string,value:string}> $rows
     */
    public static function looks_human(array $rows): bool
    {
        $values = [];
        foreach ($rows as $row) {
            $value = trim((string) ($row['value'] ?? ''));
            if ($value !== '') {
                $values[] = $value;
            }
        }

        if ($values === []) {
            return false;
        }

        $all = implode("\n", $values);

        if (self::has_link($all)) {
            return false;
        }

        if (!self::has_contact_route($values)) {
            return false;
        }

        return self::reads_as_prose($values);
    }

    /** Any URL, bare domain, BBCode link or HTML anchor. */
    private static function has_link(string $text): bool
    {
        // Email addresses first, or the bare-domain pattern below matches the
        // domain inside the guest's OWN address and disqualifies every real
        // message. An address is a contact route, not a link.
        $text = preg_replace('/[^\s<>()]+@[^\s<>()]+/', ' ', $text) ?? $text;

        $patterns = [
            '~https?://~i',
            '~\bwww\.~i',
            '~\[url~i',
            '~<a\s~i',
            // A bare domain: "evil.example", "cheap-watches.ru/offer". Requires a
            // known-shaped TLD so ordinary sentences and decimals do not match.
            '~\b[a-z0-9][a-z0-9\-]{1,}\.(?:com|net|org|ru|cn|info|biz|top|xyz|online|site|shop|club|link|icu|live|store|website|space|fun|buzz|co|io|me)\b~i',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $text) === 1) {
                return true;
            }
        }
        return false;
    }

    /** A plausible email address, or a US phone number. */
    private static function has_contact_route(array $values): bool
    {
        foreach ($values as $value) {
            if (is_email($value)) {
                return true;
            }
            if (self::is_us_phone($value)) {
                return true;
            }
        }
        return false;
    }

    /**
     * A US number: ten digits, or eleven beginning with the country code 1.
     * Separators are ignored; anything else in the string disqualifies it, so
     * a sentence that merely contains digits is not read as a phone number.
     */
    private static function is_us_phone(string $value): bool
    {
        if (preg_match('/[^0-9+()\-.\s]/', $value) === 1) {
            return false;
        }

        $digits = preg_replace('/[^0-9]/', '', $value) ?? '';

        if (strlen($digits) === 11 && $digits[0] === '1') {
            $digits = substr($digits, 1);
        }

        if (strlen($digits) !== 10) {
            return false;
        }

        // US area codes and exchanges never start with 0 or 1.
        return $digits[0] >= '2' && $digits[3] >= '2';
    }

    /**
     * The longest value reads like written text rather than a payload.
     *
     * Checks the longest field because that is the message, whatever it is
     * labelled. Short submissions (a name and a phone number, no message)
     * pass: there is nothing there to look wrong.
     */
    private static function reads_as_prose(array $values): bool
    {
        $longest = '';
        foreach ($values as $value) {
            if (mb_strlen($value) > mb_strlen($longest)) {
                $longest = $value;
            }
        }

        $length = mb_strlen($longest);
        if ($length < 20) {
            return true;
        }

        // Mostly letters and ordinary punctuation, not markup or symbol soup.
        $letters = preg_match_all('/[\p{L}\s]/u', $longest);
        if ($letters === false || $letters / $length < 0.7) {
            return false;
        }

        // Not shouted. A long all-caps block is a spam signature, not prose.
        $upper = preg_match_all('/\p{Lu}/u', $longest);
        $lower = preg_match_all('/\p{Ll}/u', $longest);
        if ($upper !== false && $lower !== false && ($upper + $lower) > 0) {
            if ($upper / ($upper + $lower) > 0.6) {
                return false;
            }
        }

        return true;
    }
}
