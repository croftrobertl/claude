<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/** The DCC Security block, and the rule for an uploads .htaccess that re-enables execution. */
final class Htaccess
{
    public const BEGIN = '# BEGIN DCC Security';
    public const END   = '# END DCC Security';

    /** The pre-gzipped cache block must sit above SpeedyCache's, whose rule ends in [L]. */
    public const PREGZ_BEGIN  = '# BEGIN DCC Pre-gzipped Cache';
    public const SPEEDY_BEGIN = '# BEGIN speedycache';

    public const ORDER_OK            = '';
    public const ORDER_NO_SPEEDY     = 'no-speedycache';
    public const ORDER_PREGZ_MISSING = 'pregz-missing';
    public const ORDER_WRONG         = 'wrong-order';

    public static function path(): string
    {
        return Site::abspath() . '/.htaccess';
    }

    /** The text between the markers, markers included, or null when absent. */
    public static function extract_block(string $content): ?string
    {
        $start = strpos($content, self::BEGIN);
        if ($start === false) {
            return null;
        }
        $end = strpos($content, self::END, $start);
        if ($end === false) {
            return null;
        }
        return substr($content, $start, $end + strlen(self::END) - $start);
    }

    /**
     * Is the DCC Pre-gzipped Cache block above SpeedyCache's? SpeedyCache's
     * rewrite rule ends in [L], so a pre-gzipped block below it never runs
     * and every page goes out uncompressed. Judged by position only; the
     * SpeedyCache marker is matched whatever its case. Without a SpeedyCache
     * block there is nothing to order (staging has none): ORDER_NO_SPEEDY,
     * which is never a finding. Returns one of the ORDER_* constants,
     * ORDER_OK (an empty string) when all is well.
     */
    public static function order_problem(string $content): string
    {
        $speedy = stripos($content, self::SPEEDY_BEGIN);
        if ($speedy === false) {
            return self::ORDER_NO_SPEEDY;
        }
        $pregz = strpos($content, self::PREGZ_BEGIN);
        if ($pregz === false) {
            return self::ORDER_PREGZ_MISSING;
        }
        return $pregz < $speedy ? self::ORDER_OK : self::ORDER_WRONG;
    }

    /** Replace only the marked block; everything else byte for byte. Missing markers: the block goes at line 1. */
    public static function replace_block(string $content, string $block): string
    {
        $block = rtrim($block) . "\n";
        $start = strpos($content, self::BEGIN);
        $end   = $start === false ? false : strpos($content, self::END, $start);
        if ($start === false || $end === false) {
            $rest = ltrim($content, "\r\n");
            return $rest === '' ? $block : $block . $rest;
        }
        $end_len = $end + strlen(self::END);
        // Swallow one trailing newline of the old block so we do not add blank lines.
        if (isset($content[$end_len]) && $content[$end_len] === "\n") {
            $end_len++;
        }
        return substr($content, 0, $start) . $block . substr($content, $end_len);
    }

    /**
     * Does an uploads .htaccess re-enable execution? The meaning is judged,
     * not the keyword: `php_flag engine off` is protection.
     */
    public static function enables_execution(string $content): bool
    {
        $lines = preg_split('/\r?\n/', $content) ?: [];
        $in_files = false;
        $files_matches_php = false;
        foreach ($lines as $raw) {
            $line = trim($raw);
            if ($line === '' || $line[0] === '#') {
                continue;
            }
            $lower = strtolower($line);
            if (preg_match('/^(addhandler|sethandler|addtype)\s+(.+)$/i', $line, $m)) {
                if (preg_match('/php|cgi|x-httpd|fcgid|phtml|phar|x-mapp/i', $m[2])) {
                    return true;
                }
            }
            if (preg_match('/^php_(admin_)?flag\s+engine\s+(on|1|true)\b/i', $line)) {
                return true;
            }
            if (preg_match('/^php_(admin_)?value\s+auto_(prepend|append)_file\s+\S/i', $line)) {
                return true;
            }
            if (preg_match('/^options\b/i', $line) && preg_match('/(^|\s|\+)execcgi\b/i', $line) && !preg_match('/-execcgi\b/i', $line)) {
                return true;
            }
            if (preg_match('/^<(filesmatch|files)\b(.*)>$/i', $line, $m)) {
                $in_files          = true;
                $files_matches_php = (bool) preg_match('/php|phtml|phar/i', $m[2]);
                continue;
            }
            if (preg_match('#^</(filesmatch|files)>$#i', $line)) {
                $in_files = false;
                continue;
            }
            if ($in_files && $files_matches_php) {
                if (preg_match('/^(allow\s+from\s+all|require\s+all\s+granted|order\s+allow,deny)/i', $line)) {
                    return true;
                }
            }
            unset($lower);
        }
        return false;
    }

    /** A .user.ini that prepends code or turns the engine on. */
    public static function ini_enables_execution(string $content): bool
    {
        foreach (preg_split('/\r?\n/', $content) ?: [] as $raw) {
            $line = trim($raw);
            if ($line === '' || $line[0] === ';' || $line[0] === '#') {
                continue;
            }
            if (preg_match('/^auto_(prepend|append)_file\s*=\s*["\']?\S/i', $line)) {
                return true;
            }
            if (preg_match('/^engine\s*=\s*(1|on|true)\b/i', $line)) {
                return true;
            }
        }
        return false;
    }
}
