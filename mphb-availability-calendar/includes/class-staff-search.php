<?php
/**
 * Staff board search (0.45.0).
 *
 * WHAT IT SEARCHES: every booking in a visible status (Staff::VISIBLE_STATUSES,
 * filterable — never cancelled or abandoned), past, present and future, over
 * exactly what its detail sheet shows (Staff_Data::search_doc()): every sheet
 * row except the Photo ID, plus the booking number, the cottage and the sync
 * text. Decided by the Website Director (answers 12–16) and Rob (13, 18, 19).
 *
 * HOW: all in PHP, on this server — no semantic / AI search, and guest data
 * never leaves it (WD, 17). From 2 characters: exact, prefix and substring.
 * From 4: typo distance (Damerau-Levenshtein, Jaro-Winkler), trigram overlap,
 * and sound (Metaphone, Soundex). Plus the readings a desk actually types: a
 * booking number, a date ("Dec 24", "12/24", "2026-12-24", "12/2024"), phone
 * digits in any format (the last four alone included), and a country by name
 * ("United States" finds US). One mixed list, best match first, NO cap (Rob).
 *
 * WHAT IT RETURNS: summary rows only — name, cottage, dates, status, source —
 * and a plain-text "why it matched". The sheet itself is fetched through the
 * gated booking endpoint when a result is tapped.
 *
 * PRIVACY: the query is never logged and never stored, here or in the
 * browser. The index holds guest details, so it lives in a NON-autoloaded
 * transient (it has an expiry), is cleared on every booking change, and is
 * deleted on uninstall with the plugin's other mphbac_ transients.
 *
 * @package MPHBAC
 */

namespace MPHBAC;

defined('ABSPATH') || exit;

final class Staff_Search
{
    public const INDEX_KEY = 'mphbac_staff_search_v1';
    private const INDEX_TTL = 6 * HOUR_IN_SECONDS;
    public const MAX_QUERY = 100;

    private const MONTHS = ['jan' => 1, 'feb' => 2, 'mar' => 3, 'apr' => 4, 'may' => 5, 'jun' => 6,
        'jul' => 7, 'aug' => 8, 'sep' => 9, 'sept' => 9, 'oct' => 10, 'nov' => 11, 'dec' => 12,
        'january' => 1, 'february' => 2, 'march' => 3, 'april' => 4, 'june' => 6, 'july' => 7,
        'august' => 8, 'september' => 9, 'october' => 10, 'november' => 11, 'december' => 12];

    /** Clear the index. Hooked to every booking change (class-plugin.php). */
    public static function flush(): void
    {
        delete_transient(self::INDEX_KEY);
    }

    /** deleted_post passes ($post_id, $post): only a booking clears it. */
    public static function flush_if_booking($post_id, $post = null): void
    {
        if (is_object($post) && in_array($post->post_type ?? '', ['mphb_booking', 'mphb_payment'], true)) {
            self::flush();
        }
    }

    /**
     * The index: one entry per visible booking, with its fields normalised
     * and tokenised (and each token's sound keys) ONCE, here, not per query.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function index(): array
    {
        $cached = get_transient(self::INDEX_KEY);
        if (is_array($cached)) {
            return $cached;
        }
        $statuses = (array) apply_filters('mphbac_staff_statuses', Staff::VISIBLE_STATUSES);
        $ids = get_posts([
            'post_type'      => 'mphb_booking',
            'post_status'    => $statuses,
            'posts_per_page' => -1,
            'fields'         => 'ids',
            'no_found_rows'  => true,
            'orderby'        => 'ID',
            'order'          => 'DESC',
        ]);
        $index = [];
        foreach ((array) $ids as $id) {
            $doc = Staff_Data::search_doc((int) $id);
            if ($doc === null) {
                continue;
            }
            $tokens = [];
            $phones = [];
            foreach ($doc['fields'] as $fi => $f) {
                $norm = self::norm($f[1]);
                $doc['fields'][$fi][2] = $norm;
                foreach (self::words($norm) as $w) {
                    if (!isset($tokens[$w])) {
                        $tokens[$w] = [$fi, metaphone($w), strlen($w) >= 2 ? soundex($w) : ''];
                    }
                }
                if (preg_match('/phone|tel|mobile|cell/i', $f[0])) {
                    $d = preg_replace('/\D+/', '', $f[1]);
                    if (strlen((string) $d) >= 4) {
                        $phones[] = [(string) $d, $fi];
                    }
                }
            }
            $doc['tokens'] = $tokens;
            $doc['phones'] = $phones;
            $index[] = $doc;
        }
        set_transient(self::INDEX_KEY, $index, self::INDEX_TTL);
        return $index;
    }

    /**
     * Search. Returns summary rows, best match first, every match (no cap).
     *
     * @return array<int,array<string,mixed>>
     */
    public static function search(string $query): array
    {
        $q = trim(self::plain_query($query));
        if (self::len($q) < 2) {
            return [];
        }
        $index = self::index();
        $hits = [];   // id => [score, why]
        $keep = static function (int $id, int $score, string $why) use (&$hits): void {
            if (!isset($hits[$id]) || $score > $hits[$id][0]) {
                $hits[$id] = [$score, $why];
            }
        };

        // 1. A booking number finds that booking directly.
        if (preg_match('/^#?\s*(\d+)$/', $q, $m)) {
            foreach ($index as $doc) {
                if ((int) $doc['id'] === (int) $m[1]) {
                    $keep((int) $doc['id'], 1000, sprintf(__('booking #%d', 'mphb-availability-calendar'), (int) $doc['id']));
                }
            }
        }

        // 2. A date: every stay that includes that night (or month).
        $date = self::parse_date($q);
        if ($date !== null) {
            foreach ($index as $doc) {
                if (self::stay_matches($doc, $date)) {
                    $keep((int) $doc['id'], 600, $date['why']);
                }
            }
        }

        // A query that reads as a DATE is searched as a date only: its parts
        // ("2026", "12") are in every booking's own dates and would match
        // them all as words.
        if ($date !== null) {
            return self::rows($hits, $index);
        }

        // 3. Phone digits, however formatted, the last four alone included.
        if (preg_match('/^[\d\s().+\-]+$/', $q)) {
            $digits = preg_replace('/\D+/', '', $q);
            if (strlen((string) $digits) >= 4) {
                foreach ($index as $doc) {
                    foreach ($doc['phones'] as [$p]) {
                        if ($p === $digits || str_ends_with($p, (string) $digits)) {
                            $keep((int) $doc['id'], 550, sprintf(__('phone ends %s', 'mphb-availability-calendar'), substr($p, -4)));
                        } elseif (strpos($p, (string) $digits) !== false) {
                            $keep((int) $doc['id'], 500, sprintf(__('phone contains %s', 'mphb-availability-calendar'), $digits));
                        }
                    }
                }
            }
        }

        // 4. A country by name: "United States" finds US.
        $code = self::country_code($q);
        if ($code !== '') {
            foreach ($index as $doc) {
                foreach ($doc['fields'] as $f) {
                    if (preg_match('/country/i', $f[0]) && strtoupper(trim($f[1])) === $code) {
                        $keep((int) $doc['id'], 300, sprintf(__('country %s', 'mphb-availability-calendar'), $code));
                    }
                }
            }
        }

        // 5. Words: every word of the query must match somewhere (AND).
        $qn = self::norm($q);
        $qwords = self::words($qn);
        if ($qwords) {
            foreach ($index as $doc) {
                $total = 0;
                $best = null;
                foreach ($qwords as $qw) {
                    $m = self::match_word($qw, $doc);
                    if ($m === null) {
                        $total = 0;
                        break;
                    }
                    $total += $m[0];
                    if ($best === null || $m[0] > $best[0]) {
                        $best = $m;
                    }
                }
                if ($total > 0 && $best !== null) {
                    // The whole query as typed, inside one field: a phrase hit.
                    foreach ($doc['fields'] as $f) {
                        if (count($qwords) > 1 && strpos($f[2], $qn) !== false) {
                            $total += 50;
                            $best = [0, $f[0], 'contains', self::snippet($f[1], $q)];
                            break;
                        }
                    }
                    $keep((int) $doc['id'], $total, self::why($best));
                }
            }
        }

        return self::rows($hits, $index);
    }

    /**
     * The hits as summary rows, best match first.
     *
     * @param array<int,array{0:int,1:string}> $hits
     * @return array<int,array<string,mixed>>
     */
    private static function rows(array $hits, array $index): array
    {
        $byId = [];
        foreach ($index as $doc) {
            $byId[(int) $doc['id']] = $doc;
        }
        $out = [];
        foreach ($hits as $id => [$score, $why]) {
            $doc = $byId[$id];
            $out[] = [
                'id'         => $id,
                'name'       => (string) $doc['name'],
                'cottages'   => array_map(static fn($c) => ['id' => $c['id'], 'number' => $c['number'], 'title' => $c['title'], 'abbrev' => $c['abbrev']], $doc['cottages']),
                'checkin'    => (string) $doc['checkin'],
                'checkout'   => (string) $doc['checkout'],
                'status'     => (string) $doc['status'],
                'statusLabel'=> (string) $doc['statusLabel'],
                'sourceKey'  => (string) $doc['sourceKey'],
                'sourceName' => (string) $doc['sourceName'],
                'why'        => $why,
                'score'      => $score,
            ];
        }
        // Best match first (Rob); among equals, the latest stay first.
        usort($out, static fn($a, $b) => [$b['score'], $b['checkin'], $b['id']] <=> [$a['score'], $a['checkin'], $a['id']]);
        return $out;
    }

    /**
     * The best way one query word matches one booking, or null.
     *
     * @return array{0:int,1:string,2:string,3:string}|null [score, field label, kind, shown word]
     */
    private static function match_word(string $qw, array $doc): ?array
    {
        $len = self::len($qw);
        $best = null;
        $take = static function (array $m) use (&$best): void {
            if ($best === null || $m[0] > $best[0]) {
                $best = $m;
            }
        };
        foreach ($doc['tokens'] as $tok => [$fi, $meta, $sdx]) {
            $tok = (string) $tok;
            $label = $doc['fields'][$fi][0];
            if ($tok === $qw) {
                $take([100, $label, 'exact', $tok]);
                break;
            }
            if (strpos($tok, $qw) === 0) {
                $take([85, $label, 'prefix', $tok]);
                continue;
            }
            if (strpos($tok, $qw) !== false) {
                $take([70, $label, 'contains', $tok]);
                continue;
            }
            if ($len < 4 || self::len($tok) < 4) {
                // Fuzzy and phonetic from 4 characters — on BOTH sides: "jones"
                // is 0.91 Jaro-Winkler from "jon", which is noise, not a typo.
                continue;
            }
            $dl = self::damerau($qw, $tok);
            $limit = $len <= 5 ? 1 : 2;
            if ($dl <= $limit) {
                $take([62 - 8 * $dl, $label, 'typo', $tok]);
                continue;
            }
            if (self::jaro_winkler($qw, $tok) >= 0.9) {
                $take([55, $label, 'typo', $tok]);
                continue;
            }
            if ($meta !== '' && $meta === metaphone($qw)) {
                $take([52, $label, 'sound', $tok]);
                continue;
            }
            if (self::dice($qw, $tok) >= 0.5) {
                $take([48, $label, 'typo', $tok]);
                continue;
            }
            if ($sdx !== '' && $sdx === soundex($qw)) {
                $take([42, $label, 'sound', $tok]);
            }
        }
        // A word that runs across tokens ("ann@ex", "4b") still counts as a
        // substring of the field as written.
        if ($best === null) {
            foreach ($doc['fields'] as $f) {
                if (strpos($f[2], $qw) !== false) {
                    return [65, $f[0], 'contains', $qw];
                }
            }
        }
        return $best;
    }

    /** "why it matched", plain text — the board writes it with textContent. */
    private static function why(array $m): string
    {
        [, $label, $kind, $word] = $m;
        switch ($kind) {
            case 'sound':
                return sprintf(__('%1$s sounds like %2$s', 'mphb-availability-calendar'), $label, self::show($word));
            case 'typo':
                return sprintf(__('%1$s close to %2$s', 'mphb-availability-calendar'), $label, self::show($word));
            default:
                return sprintf(__('%1$s: %2$s', 'mphb-availability-calendar'), $label, self::show($word));
        }
    }

    private static function show(string $w): string
    {
        $w = self::len($w) > 40 ? mb_substr($w, 0, 40) . '…' : $w;
        return ucfirst($w);
    }

    /** About 40 characters of the field around the match. */
    private static function snippet(string $value, string $q): string
    {
        $pos = stripos($value, $q);
        if ($pos === false || self::len($value) <= 40) {
            return mb_substr($value, 0, 40);
        }
        $start = max(0, $pos - 10);
        return ($start > 0 ? '…' : '') . mb_substr($value, $start, 40) . '…';
    }

    // ------------------------------------------------------------- dates

    /**
     * "2026-12-24", "12/24/2026", "12/24/26", "Dec 24 2026", "24 Dec" → a
     * night (year optional); "12/2024", "Dec 2026" → a month. US order: a
     * bare "12/24" is Dec 24 in any year, never Dec 2024.
     *
     * @return array{kind:string,y:int,m:int,d:int,why:string}|null
     */
    private static function parse_date(string $q): ?array
    {
        $q = strtolower(trim(preg_replace('/\s+/', ' ', $q) ?? $q));
        $mon = '(' . implode('|', array_keys(self::MONTHS)) . ')\.?';
        $night = static function (int $y, int $m, int $d) {
            if ($m < 1 || $m > 12 || $d < 1 || $d > 31 || ($y && !checkdate($m, $d, $y)) || (!$y && !checkdate($m, $d, 2024))) {
                return null;
            }
            $label = date('M j', mktime(0, 0, 0, $m, $d, 2024)) . ($y ? ', ' . $y : '');
            return ['kind' => 'night', 'y' => $y, 'm' => $m, 'd' => $d,
                'why' => sprintf(__('stay includes %s', 'mphb-availability-calendar'), $label)];
        };
        $month = static function (int $y, int $m) {
            if ($m < 1 || $m > 12 || $y < 1970 || $y > 2100) {
                return null;
            }
            return ['kind' => 'month', 'y' => $y, 'm' => $m, 'd' => 0,
                'why' => sprintf(__('stay in %s', 'mphb-availability-calendar'), date('M Y', mktime(0, 0, 0, $m, 1, $y)))];
        };
        $year = static fn(string $y): int => strlen($y) === 2 ? 2000 + (int) $y : (int) $y;
        if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})$/', $q, $m)) {
            return $night((int) $m[1], (int) $m[2], (int) $m[3]);
        }
        if (preg_match('/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/', $q, $m)) {
            return $night($year($m[3]), (int) $m[1], (int) $m[2]);
        }
        if (preg_match('/^(\d{1,2})\/(\d{4})$/', $q, $m)) {
            return $month((int) $m[2], (int) $m[1]);
        }
        if (preg_match('/^(\d{1,2})\/(\d{1,2})$/', $q, $m)) {
            return $night(0, (int) $m[1], (int) $m[2]);
        }
        if (preg_match('/^' . $mon . ' (\d{1,2})(?:,? (\d{4}))?$/', $q, $m)) {
            return $night(isset($m[3]) ? (int) $m[3] : 0, self::MONTHS[$m[1]], (int) $m[2]);
        }
        if (preg_match('/^(\d{1,2}) ' . $mon . '(?:,? (\d{4}))?$/', $q, $m)) {
            return $night(isset($m[3]) ? (int) $m[3] : 0, self::MONTHS[$m[2]], (int) $m[1]);
        }
        if (preg_match('/^' . $mon . ',? (\d{4})$/', $q, $m)) {
            return $month((int) $m[2], self::MONTHS[$m[1]]);
        }
        return null;
    }

    /** Does the stay include that night (checkin <= night < checkout), or a night of that month? */
    private static function stay_matches(array $doc, array $date): bool
    {
        $in = (string) $doc['checkin'];
        $out = (string) $doc['checkout'];
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $in) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $out)) {
            return false;
        }
        if ($date['kind'] === 'month') {
            $first = sprintf('%04d-%02d-01', $date['y'], $date['m']);
            $last = date('Y-m-t', strtotime($first));
            return $in <= $last && $out > $first;
        }
        $years = $date['y'] ? [$date['y']] : range((int) substr($in, 0, 4), (int) substr($out, 0, 4));
        foreach ($years as $y) {
            if (!checkdate($date['m'], $date['d'], $y)) {
                continue;
            }
            $night = sprintf('%04d-%02d-%02d', $y, $date['m'], $date['d']);
            if ($in <= $night && $night < $out) {
                return true;
            }
        }
        return false;
    }

    // ------------------------------------------------------------- countries

    /** ISO 3166-1 alpha-2 code for a country NAME typed in full, or ''. */
    private static function country_code(string $q): string
    {
        static $map = null;
        $n = self::norm($q);
        if (self::len($n) < 3) {
            return '';                   // "US" itself is matched as text
        }
        if ($map === null) {
            $map = require __DIR__ . '/data-countries.php';
        }
        return (string) ($map[$n] ?? '');
    }

    // ------------------------------------------------------------- text

    /** Lower case, accents off, punctuation to spaces except inside emails / numbers. */
    public static function norm(string $s): string
    {
        $s = function_exists('remove_accents') ? remove_accents($s) : $s;
        $s = function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtolower($s);
        $s = preg_replace('/[^\p{L}\p{N}@.\-\/]+/u', ' ', $s) ?? $s;
        return trim(preg_replace('/\s+/', ' ', $s) ?? $s);
    }

    /** @return string[] the words of a normalised string, 2+ characters */
    private static function words(string $norm): array
    {
        $out = [];
        foreach (preg_split('/[\s@.\-\/]+/', $norm) ?: [] as $w) {
            if (self::len($w) >= 2) {
                $out[$w] = $w;
            }
        }
        return array_values($out);
    }

    private static function plain_query(string $q): string
    {
        $q = function_exists('wp_unslash') ? wp_unslash($q) : $q;
        $q = function_exists('wp_strip_all_tags') ? wp_strip_all_tags($q) : strip_tags($q);
        return self::len($q) > self::MAX_QUERY ? mb_substr($q, 0, self::MAX_QUERY) : $q;
    }

    private static function len(string $s): int
    {
        return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen($s);
    }

    /** Optimal-string-alignment Damerau-Levenshtein distance. */
    public static function damerau(string $a, string $b): int
    {
        $la = strlen($a);
        $lb = strlen($b);
        if (abs($la - $lb) > 2) {
            return 99;
        }
        $d = [];
        for ($i = 0; $i <= $la; $i++) { $d[$i][0] = $i; }
        for ($j = 0; $j <= $lb; $j++) { $d[0][$j] = $j; }
        for ($i = 1; $i <= $la; $i++) {
            for ($j = 1; $j <= $lb; $j++) {
                $cost = $a[$i - 1] === $b[$j - 1] ? 0 : 1;
                $d[$i][$j] = min($d[$i - 1][$j] + 1, $d[$i][$j - 1] + 1, $d[$i - 1][$j - 1] + $cost);
                if ($i > 1 && $j > 1 && $a[$i - 1] === $b[$j - 2] && $a[$i - 2] === $b[$j - 1]) {
                    $d[$i][$j] = min($d[$i][$j], $d[$i - 2][$j - 2] + 1);
                }
            }
        }
        return $d[$la][$lb];
    }

    /** Jaro-Winkler similarity, 0..1. */
    public static function jaro_winkler(string $a, string $b): float
    {
        $la = strlen($a);
        $lb = strlen($b);
        if ($la === 0 || $lb === 0) {
            return 0.0;
        }
        $range = max(0, (int) floor(max($la, $lb) / 2) - 1);
        $ma = array_fill(0, $la, false);
        $mb = array_fill(0, $lb, false);
        $matches = 0;
        for ($i = 0; $i < $la; $i++) {
            for ($j = max(0, $i - $range); $j < min($lb, $i + $range + 1); $j++) {
                if (!$mb[$j] && $a[$i] === $b[$j]) {
                    $ma[$i] = $mb[$j] = true;
                    $matches++;
                    break;
                }
            }
        }
        if ($matches === 0) {
            return 0.0;
        }
        $t = 0;
        $k = 0;
        for ($i = 0; $i < $la; $i++) {
            if (!$ma[$i]) { continue; }
            while (!$mb[$k]) { $k++; }
            if ($a[$i] !== $b[$k]) { $t++; }
            $k++;
        }
        $jaro = ($matches / $la + $matches / $lb + ($matches - $t / 2) / $matches) / 3;
        $prefix = 0;
        for ($i = 0; $i < min(4, $la, $lb) && $a[$i] === $b[$i]; $i++) { $prefix++; }
        return $jaro + $prefix * 0.1 * (1 - $jaro);
    }

    /** Dice coefficient over character trigrams (the n-gram measure). */
    public static function dice(string $a, string $b): float
    {
        $grams = static function (string $s): array {
            $s = '  ' . $s . ' ';
            $g = [];
            for ($i = 0; $i < strlen($s) - 2; $i++) {
                $g[] = substr($s, $i, 3);
            }
            return $g;
        };
        $ga = $grams($a);
        $gb = $grams($b);
        if (!$ga || !$gb) {
            return 0.0;
        }
        $common = count(array_intersect($ga, $gb));
        return 2 * $common / (count($ga) + count($gb));
    }
}
