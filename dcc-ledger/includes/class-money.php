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
     * The part of an amount belonging to a run of weights inside the whole.
     *
     * Rounding one share at a time does not add up. A stay of 7 nights whose
     * money is $100 gives October 3 nights and November 4: round each on its
     * own and the two come to a cent more or less than $100, which is how
     * the months of 2026 stopped tying to the year by one to three cents.
     *
     * So no share is rounded on its own. Every period reads the SAME running
     * total — the amount earned by the end of its last night, less the amount
     * earned by the end of the night before its first — and consecutive
     * periods cancel each other's rounding exactly. Any set of periods that
     * between them cover a stay's nights once each therefore sums to the
     * stay's money to the cent, whatever the periods are: the months of a
     * year, the year itself, or one query spanning both.
     *
     * $before is how many of the stay's nights fall before this period.
     */
    public static function slice(int $cents, int $before, int $within, int $total): int
    {
        if ($total <= 0 || $within <= 0) {
            return 0;
        }

        $before = max(0, min($before, $total));
        $within = min($within, $total - $before);
        if ($within <= 0) {
            return 0;
        }

        return self::upto($cents, $before + $within, $total)
            - self::upto($cents, $before, $total);
    }

    /**
     * The amount earned by the end of weight $upto of $total, rounded half
     * away from zero. upto(c, 0, t) is 0 and upto(c, t, t) is exactly c, so
     * the slices of a whole always sum to the whole.
     */
    private static function upto(int $cents, int $upto, int $total): int
    {
        if ($total <= 0) {
            return 0;
        }

        $sign    = ($cents < 0) ? -1 : 1;
        $rounded = intdiv(abs($cents) * $upto * 2 + $total, $total * 2);

        return $sign * $rounded;
    }
}
