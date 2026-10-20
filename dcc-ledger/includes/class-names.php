<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Surname matching, without ever keeping a surname.
 *
 * A guest moved to another cottage is the same guest. Dates alone cannot say
 * that — two different parties booking the same Friday to Sunday is an
 * ordinary busy weekend — so a move has to match on the person.
 *
 * A name is turned into a small set of salted hashes the moment it is read,
 * inside the row loop, and the name itself is dropped. Nothing here returns,
 * stores, logs or prints a name: only hashes, and only ever compared against
 * other hashes. The salt is per-site and never leaves the options table, so
 * the hashes cannot be taken away and reversed with a dictionary.
 *
 * Several hashes per person, because the same surname is written several ways:
 * "Smith-Jones", "Smith Jones" and "smithjones" all have to meet, and a
 * two-word surname ("van der Berg") must not be cut down to its last word.
 */
final class Names
{
    public const SALT_OPTION = 'dccl_guest_key_salt';

    /**
     * The hashes that stand for one person's surname.
     *
     * @return array<int,string> sha256 hashes, or [] when there is no name
     */
    public static function keys(string $full_name): array
    {
        $candidates = self::candidates($full_name);
        if ($candidates === []) {
            return [];
        }

        $salt = self::salt();
        $out  = [];
        foreach ($candidates as $candidate) {
            $out[] = hash_hmac('sha256', $candidate, $salt);
        }

        return array_values(array_unique($out));
    }

    /**
     * Build the keys from a first-name and last-name pair, falling back the
     * way MotoPress's own data forces: some customers have an empty last name
     * and the whole name sitting in the first-name field.
     *
     * @return array<int,string>
     */
    public static function keys_from_parts(string $first, string $last, string $fallback = ''): array
    {
        $last  = trim($last);
        $first = trim($first);

        if ($last !== '') {
            // A first name is passed too, so "van der Berg" in the last-name
            // field and "Berg" elsewhere still meet.
            return self::keys(trim($first . ' ' . $last));
        }

        // No last name. The first-name field often holds the whole name.
        if ($first !== '' && str_contains($first, ' ')) {
            return self::keys($first);
        }

        $fallback = trim($fallback);
        if ($fallback !== '' && str_contains($fallback, ' ')) {
            return self::keys($fallback);
        }

        // A single word and nothing else is a first name, not a surname.
        // There is nothing here to match on, and guessing would be worse.
        return [];
    }

    /** Do these two people share a surname? */
    public static function match(array $a, array $b): bool
    {
        if ($a === [] || $b === []) {
            return false;
        }
        return array_intersect($a, $b) !== [];
    }

    /**
     * The surname forms worth comparing, normalised and with nothing but
     * letters and digits left.
     *
     * @return array<int,string>
     */
    public static function candidates(string $full_name): array
    {
        $name = self::normalise($full_name);
        if ($name === '') {
            return [];
        }

        // "O'Neal, Pat" — Booking.com writes some names surname-first.
        if (str_contains($full_name, ',')) {
            $before = self::normalise(substr($full_name, 0, (int) strpos($full_name, ',')));
            if ($before !== '') {
                $name = $before;
            }
        }

        $parts = array_values(array_filter(explode(' ', $name), static fn ($p) => $p !== ''));
        if ($parts === []) {
            return [];
        }

        $out = [];

        // The last word: the common case.
        $out[] = end($parts);

        if (count($parts) >= 2) {
            // The last two words, for a surname that is two words.
            $out[] = $parts[count($parts) - 2] . $parts[count($parts) - 1];
            // Everything after the first word, for a longer surname.
            $out[] = implode('', array_slice($parts, 1));
        }

        if (count($parts) === 1) {
            // A single word given on its own is taken as the surname.
            $out[] = $parts[0];
        }

        return array_values(array_unique(array_filter($out, static fn ($p) => strlen($p) >= 2)));
    }

    /**
     * Lower case, accents folded, HTML entities decoded, and every mark of
     * punctuation removed — so "O'Neal", "O&#39;neal" and "oneal" are one
     * name, and "Smith-Jones" meets "Smith Jones".
     */
    public static function normalise(string $value): string
    {
        $value = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $value = self::fold_accents($value);
        $value = strtolower($value);
        // Hyphens and apostrophes join, other punctuation separates.
        $value = str_replace(['-', "'", '’', '`'], '', $value);
        $value = (string) preg_replace('/[^a-z0-9]+/', ' ', $value);
        return trim((string) preg_replace('/\s+/', ' ', $value));
    }

    private static function fold_accents(string $value): string
    {
        if (function_exists('transliterator_transliterate')) {
            $folded = @transliterator_transliterate('Any-Latin; Latin-ASCII', $value);
            if (is_string($folded) && $folded !== '') {
                return $folded;
            }
        }
        if (function_exists('iconv')) {
            $folded = @iconv('UTF-8', 'ASCII//TRANSLIT', $value);
            if (is_string($folded) && $folded !== '') {
                return $folded;
            }
        }
        return $value;
    }

    /**
     * The per-site salt. Made once and never remade: changing it would make
     * every stored key meaningless.
     */
    public static function salt(): string
    {
        $salt = get_option(self::SALT_OPTION, '');
        if (is_string($salt) && $salt !== '') {
            return $salt;
        }

        $salt = bin2hex(random_bytes(32));
        update_option(self::SALT_OPTION, $salt, false);

        return $salt;
    }

    /**
     * @param array<int,string> $keys
     */
    public static function encode(array $keys): ?string
    {
        return $keys === [] ? null : (string) wp_json_encode(array_values($keys));
    }

    /** @return array<int,string> */
    public static function decode(?string $stored): array
    {
        if ($stored === null || $stored === '') {
            return [];
        }
        $decoded = json_decode($stored, true);
        if (!is_array($decoded)) {
            return [];
        }
        $out = [];
        foreach ($decoded as $key) {
            if (is_string($key) && $key !== '') {
                $out[] = $key;
            }
        }
        return $out;
    }
}
