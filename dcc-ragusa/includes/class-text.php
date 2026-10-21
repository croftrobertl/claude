<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/** Small text helpers. */
final class Text
{
    /** Title Case for labels and email subjects, keeping diacritics intact. */
    public static function title_case(string $s): string
    {
        $words = preg_split('/(\s+)/u', $s, -1, PREG_SPLIT_DELIM_CAPTURE) ?: [];
        $out   = '';
        foreach ($words as $w) {
            if ($w === '' || preg_match('/^\s+$/u', $w)) {
                $out .= $w;
                continue;
            }
            // Leave acronyms, file names and paths alone.
            if (preg_match('/[.\/_\\\\]/u', $w) || mb_strtoupper($w, 'UTF-8') === $w) {
                $out .= $w;
                continue;
            }
            $out .= mb_strtoupper(mb_substr($w, 0, 1, 'UTF-8'), 'UTF-8') . mb_substr($w, 1, null, 'UTF-8');
        }
        return $out;
    }

    public static function bytes(int|float $n): string
    {
        $n = (float) $n;
        if ($n >= 1024 ** 3) {
            return number_format($n / 1024 ** 3, 1) . ' GB';
        }
        if ($n >= 1024 ** 2) {
            return number_format($n / 1024 ** 2, 0) . ' MB';
        }
        if ($n >= 1024) {
            return number_format($n / 1024, 0) . ' kB';
        }
        return number_format($n, 0) . ' B';
    }

    /** Never let a secret-looking string into a log line. */
    public static function scrub(string $s): string
    {
        $s = preg_replace('#https://hc-ping\.com/\S+#i', 'https://hc-ping.com/[hidden]', $s) ?? $s;
        $s = preg_replace('/Bearer\s+\S+/i', 'Bearer [hidden]', $s) ?? $s;
        return $s;
    }

    /** A safe, short token for ids and file names. */
    public static function slug(string $s, int $max = 40): string
    {
        $s = strtolower(preg_replace('/[^A-Za-z0-9]+/', '-', $s) ?? '');
        return substr(trim($s, '-'), 0, $max) ?: 'x';
    }
}
