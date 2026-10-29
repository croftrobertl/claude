<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Money, as whole cents.
 *
 * Every amount in this plugin is an integer number of cents from the moment
 * it is read out of a source document until the moment it is printed. There
 * is no float arithmetic on money anywhere: a float cannot hold 0.1, so a
 * column of them does not add up to what a person adding the same column by
 * hand would get, and a ledger whose parts do not sum to its whole is not a
 * ledger.
 *
 * The only places a decimal string appears are the edges — a CSV cell coming
 * in, a figure going out — and both edges go through this class.
 */
final class Money
{
    /**
     * A decimal amount from a source document, as whole cents.
     *
     * Parses the string itself rather than multiplying a float by 100:
     * (int) (19.99 * 100) is 1998, because 19.99 is not 19.99. Accepts the
     * shapes the exports actually use — "1,234.56", "$1,234.56", "(12.34)"
     * for a negative, a leading minus, and a bare integer.
     *
     * @param mixed $value
     */
    public static function to_cents($value): int
    {
        if (is_int($value)) {
            return $value * 100;
        }

        $text = trim((string) $value);
        if ($text === '') {
            return 0;
        }

        // Accounting negatives: (12.34) means −12.34.
        $negative = false;
        if (preg_match('/^\((.*)\)$/', $text, $m) === 1) {
            $negative = true;
            $text     = trim($m[1]);
        }

        $text = str_replace([',', '$', ' ', "\xc2\xa0"], '', $text);

        if (strncmp($text, '-', 1) === 0) {
            $negative = !$negative;
            $text     = substr($text, 1);
        } elseif (strncmp($text, '+', 1) === 0) {
            $text = substr($text, 1);
        }

        if ($text === '' || preg_match('/^[0-9]*(\.[0-9]*)?$/', $text) !== 1) {
            // A float is the last resort, for a value that reached us as one.
            // Rounding half away from zero matches the decimal path below.
            if (is_float($value) || is_numeric($value)) {
                $cents = (int) round(((float) $value) * 100);

                return $negative ? -$cents : $cents;
            }

            return 0;
        }

        $parts   = explode('.', $text, 2);
        $whole   = $parts[0] === '' ? '0' : $parts[0];
        $decimal = $parts[1] ?? '';

        // Round half away from zero on the third decimal place, the way a
        // person with a pencil would, rather than banker's rounding.
        $hundredths = substr($decimal . '00', 0, 2);
        $cents      = ((int) $whole) * 100 + (int) $hundredths;
        if (strlen($decimal) > 2 && (int) $decimal[2] >= 5) {
            $cents++;
        }

        return $negative ? -$cents : $cents;
    }

    /** Cents as a plain decimal string, for a `decimal(12,2)` column. */
    public static function to_decimal(int $cents): string
    {
        $sign  = $cents < 0 ? '-' : '';
        $abs   = abs($cents);

        return sprintf('%s%d.%02d', $sign, intdiv($abs, 100), $abs % 100);
    }

    /** Cents as dollars, for arithmetic that genuinely needs a float. */
    public static function to_float(int $cents): float
    {
        return $cents / 100;
    }

    /**
     * Cents formatted for a person: $1,234.56, or −$12.34.
     *
     * The minus sits outside the currency symbol, which is how an accountant
     * reads it and how every other figure on the screen is written.
     */
    public static function format(int $cents): string
    {
        $sign = $cents < 0 ? '−' : '';

        return $sign . '$' . number_format(abs($cents) / 100, 2);
    }

    /**
     * Split an amount across parts, to the cent.
     *
     * Used wherever a stay's money is divided by nights across a period
     * boundary. Each part gets its proportional share rounded down, and the
     * cents left over go to the LAST part — so the parts always sum to
     * exactly the whole, and the remainder lands in one named place rather
     * than wherever the rounding happened to fall.
     *
     * @param array<int,int> $weights e.g. nights per period
     * @return array<int,int> cents per part, summing to $cents exactly
     */
    public static function allocate(int $cents, array $weights): array
    {
        $total = array_sum($weights);
        if ($total <= 0) {
            return array_fill_keys(array_keys($weights), 0);
        }

        $out       = [];
        $allocated = 0;
        $last      = null;
        foreach ($weights as $key => $weight) {
            $share     = intdiv($cents * (int) $weight, $total);
            $out[$key] = $share;
            $allocated += $share;
            $last = $key;
        }

        if ($last !== null) {
            $out[$last] += $cents - $allocated;
        }

        return $out;
    }

    /**
     * One part of an amount, split by weight, rounded half away from zero.
     *
     * For the common case where only one share is wanted and the rest is not
     * being reported alongside it. Where the parts must sum exactly, use
     * allocate().
     */
    public static function share(int $cents, int $weight, int $total): int
    {
        if ($total <= 0) {
            return 0;
        }

        $sign    = ($cents < 0) ? -1 : 1;
        $scaled  = abs($cents) * $weight;
        $rounded = intdiv($scaled * 2 + $total, $total * 2);

        return $sign * $rounded;
    }
}
