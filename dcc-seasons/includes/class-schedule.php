<?php
/**
 * Recurring schedule: rows expressed as RULES, not dates, so the calendar
 * never expires and moveable holidays land on the right day every year.
 *
 * A row is {start, end, theme, label, year}. `start` and `end` are each a
 * rule {on, off} — `on` is either 'fixed' (with m/d) or the key of a named
 * anchor below, and `off` is a signed day offset. `year` is 0 for "every
 * year" or a specific year for a one-off.
 *
 * Resolution happens in TWO places on purpose: here (for the admin's
 * resolved-dates table and validation) and in ambient.js (for the visitor,
 * from their LOCAL date — the cache-safety doctrine: PHP never bakes "today"
 * into cached HTML). The two implementations are cross-checked by the test
 * suite for every anchor across a span of years.
 *
 * Overlaps are allowed and expected: when several rows contain a day, the
 * NARROWEST range wins. That is what lets a single-day holiday sit inside a
 * season without the owner having to split the season around it.
 *
 * @package DCC_Seasons
 */

namespace DCC_Seasons;

if (!defined('ABSPATH')) {
    exit;
}

class Schedule {

    /** The year-round base theme: what shows when nothing else claims the day. */
    public const BASE_THEME = 'florida_keys';

    /**
     * Named anchors. 'nth' = nth weekday of month (n = -1 for last),
     * 'easter' = computus, 'fixed' = month/day. Labels are what the settings
     * dropdown shows.
     *
     * @return array<string, array>
     */
    public static function anchors(): array {
        return [
            'new_year'     => ['type' => 'fixed', 'm' => 1,  'd' => 1,  'label' => __('New Year\'s Day (Jan 1)', 'dcc-seasons')],
            'mlk'          => ['type' => 'nth', 'm' => 1,  'wd' => 1, 'n' => 3,  'label' => __('MLK Day (3rd Mon Jan)', 'dcc-seasons')],
            'valentines'   => ['type' => 'fixed', 'm' => 2,  'd' => 14, 'label' => __('Valentine\'s Day (Feb 14)', 'dcc-seasons')],
            'presidents'   => ['type' => 'nth', 'm' => 2,  'wd' => 1, 'n' => 3,  'label' => __('Presidents Day (3rd Mon Feb)', 'dcc-seasons')],
            'mardi_gras'   => ['type' => 'easter', 'off' => -47, 'label' => __('Mardi Gras (47 days before Easter)', 'dcc-seasons')],
            'st_patricks'  => ['type' => 'fixed', 'm' => 3,  'd' => 17, 'label' => __('St. Patrick\'s Day (Mar 17)', 'dcc-seasons')],
            'easter'       => ['type' => 'easter', 'off' => 0,   'label' => __('Easter Sunday', 'dcc-seasons')],
            'april_fools'  => ['type' => 'fixed', 'm' => 4,  'd' => 1,  'label' => __('April Fool\'s (Apr 1)', 'dcc-seasons')],
            'four_twenty'  => ['type' => 'fixed', 'm' => 4,  'd' => 20, 'label' => __('4/20', 'dcc-seasons')],
            'earth_day'    => ['type' => 'fixed', 'm' => 4,  'd' => 22, 'label' => __('Earth Day (Apr 22)', 'dcc-seasons')],
            'mothers_day'  => ['type' => 'nth', 'm' => 5,  'wd' => 0, 'n' => 2,  'label' => __('Mother\'s Day (2nd Sun May)', 'dcc-seasons')],
            'memorial_day' => ['type' => 'nth', 'm' => 5,  'wd' => 1, 'n' => -1, 'label' => __('Memorial Day (last Mon May)', 'dcc-seasons')],
            'fathers_day'  => ['type' => 'nth', 'm' => 6,  'wd' => 0, 'n' => 3,  'label' => __('Father\'s Day (3rd Sun Jun)', 'dcc-seasons')],
            'juneteenth'   => ['type' => 'fixed', 'm' => 6,  'd' => 19, 'label' => __('Juneteenth (Jun 19)', 'dcc-seasons')],
            'july4'        => ['type' => 'fixed', 'm' => 7,  'd' => 4,  'label' => __('Independence Day (Jul 4)', 'dcc-seasons')],
            'labor_day'    => ['type' => 'nth', 'm' => 9,  'wd' => 1, 'n' => 1,  'label' => __('Labor Day (1st Mon Sep)', 'dcc-seasons')],
            'patriot_day'  => ['type' => 'fixed', 'm' => 9,  'd' => 11, 'label' => __('Patriot Day (Sep 11)', 'dcc-seasons')],
            'columbus'     => ['type' => 'nth', 'm' => 10, 'wd' => 1, 'n' => 2,  'label' => __('Columbus / Indigenous Peoples\' Day (2nd Mon Oct)', 'dcc-seasons')],
            'halloween'    => ['type' => 'fixed', 'm' => 10, 'd' => 31, 'label' => __('Halloween (Oct 31)', 'dcc-seasons')],
            'veterans_day' => ['type' => 'fixed', 'm' => 11, 'd' => 11, 'label' => __('Veterans Day (Nov 11)', 'dcc-seasons')],
            'thanksgiving' => ['type' => 'nth', 'm' => 11, 'wd' => 4, 'n' => 4,  'label' => __('Thanksgiving (4th Thu Nov)', 'dcc-seasons')],
            'christmas'    => ['type' => 'fixed', 'm' => 12, 'd' => 25, 'label' => __('Christmas (Dec 25)', 'dcc-seasons')],
        ];
    }

    /** Easter Sunday (Gregorian, anonymous algorithm) as [m, d]. */
    public static function easter(int $y): array {
        $a = $y % 19;
        $b = intdiv($y, 100);
        $c = $y % 100;
        $d = intdiv($b, 4);
        $e = $b % 4;
        $f = intdiv($b + 8, 25);
        $g = intdiv($b - $f + 1, 3);
        $h = (19 * $a + $b - $d - $g + 15) % 30;
        $i = intdiv($c, 4);
        $k = $c % 4;
        $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7;
        $m = intdiv($a + 11 * $h + 22 * $l, 451);
        $month = intdiv($h + $l - 7 * $m + 114, 31);
        $day   = (($h + $l - 7 * $m + 114) % 31) + 1;
        return [$month, $day];
    }

    /** Day of month for the nth weekday (wd 0=Sun..6=Sat; n=-1 for last). */
    public static function nth_weekday(int $y, int $m, int $wd, int $n): int {
        if ($n > 0) {
            $first = (int) (new \DateTimeImmutable(sprintf('%04d-%02d-01', $y, $m)))->format('w');
            return 1 + (($wd - $first + 7) % 7) + ($n - 1) * 7;
        }
        $days = (int) (new \DateTimeImmutable(sprintf('%04d-%02d-01', $y, $m)))->format('t');
        $last = (int) (new \DateTimeImmutable(sprintf('%04d-%02d-%02d', $y, $m, $days)))->format('w');
        return $days - (($last - $wd + 7) % 7);
    }

    /**
     * Resolve one rule for a year to a Y-m-d string. Unknown anchors resolve
     * to null so a stale row can never throw on the front end.
     *
     * @param array $rule {on, off, m?, d?}
     */
    public static function resolve(array $rule, int $y): ?string {
        $on  = (string) ($rule['on'] ?? 'fixed');
        $off = (int) ($rule['off'] ?? 0);
        if ($on === 'fixed') {
            $m = (int) ($rule['m'] ?? 0);
            $d = (int) ($rule['d'] ?? 0);
            if ($m < 1 || $m > 12 || $d < 1 || $d > 31) {
                return null;
            }
            // Feb 29 in a common year clamps to Feb 28 (the last day of the month).
            $days = (int) (new \DateTimeImmutable(sprintf('%04d-%02d-01', $y, $m)))->format('t');
            $d    = min($d, $days);
        } else {
            $anchors = self::anchors();
            if (!isset($anchors[$on])) {
                return null;
            }
            $a = $anchors[$on];
            if ($a['type'] === 'fixed') {
                $m = $a['m'];
                $d = $a['d'];
            } elseif ($a['type'] === 'nth') {
                $m = $a['m'];
                $d = self::nth_weekday($y, $m, $a['wd'], $a['n']);
            } else {
                [$m, $d] = self::easter($y);
                $off += (int) $a['off'];
            }
        }
        $dt = new \DateTimeImmutable(sprintf('%04d-%02d-%02d', $y, $m, $d));
        if ($off) {
            $dt = $dt->modify(($off > 0 ? '+' : '') . $off . ' days');
        }
        return $dt->format('Y-m-d');
    }

    /**
     * A row's concrete [start, end] for the instance that BEGINS in $y. An
     * end that resolves before its start belongs to the following year (the
     * New Year's row runs Dec 26 → Jan 3).
     *
     * @return array{0:string,1:string}|null
     */
    public static function resolve_row(array $row, int $y): ?array {
        if (!empty($row['year']) && (int) $row['year'] !== $y) {
            return null;
        }
        $s = self::resolve($row['start'] ?? [], $y);
        $e = self::resolve($row['end'] ?? [], $y);
        if ($s === null || $e === null) {
            return null;
        }
        if ($e < $s) {
            $e = self::resolve($row['end'], $y + 1);
        }
        return [$s, $e];
    }

    /**
     * The row active on a date: any row whose instance beginning this year
     * or last year contains it; ties broken by the narrowest range. Mirrors
     * ambient.js exactly.
     */
    public static function active(array $rows, string $date): ?array {
        $y    = (int) substr($date, 0, 4);
        $best = null;
        $bestSpan = PHP_INT_MAX;
        foreach ($rows as $row) {
            foreach ([$y - 1, $y] as $yy) {
                $r = self::resolve_row($row, $yy);
                if (!$r || $date < $r[0] || $date > $r[1]) {
                    continue;
                }
                $span = (int) (new \DateTimeImmutable($r[0]))->diff(new \DateTimeImmutable($r[1]))->days;
                if ($span < $bestSpan) {
                    $bestSpan = $span;
                    $best     = $row;
                }
            }
        }
        return $best;
    }

    /** Shorthand rule builders for the defaults. */
    private static function fx(int $m, int $d, int $off = 0): array {
        return ['on' => 'fixed', 'm' => $m, 'd' => $d, 'off' => $off];
    }
    private static function at(string $anchor, int $off = 0): array {
        return ['on' => $anchor, 'off' => $off];
    }
    private static function row(array $start, array $end, string $theme, string $label): array {
        return ['start' => $start, 'end' => $end, 'theme' => $theme, 'label' => $label, 'year' => 0];
    }

    /**
     * The recurring default: every day of the year covered, seasons as long
     * base ranges with the holidays as narrower rows inside them.
     */
    public static function defaults(): array {
        return [
            // Winter → spring
            self::row(self::fx(12, 26),          self::fx(1, 3),                 'new_years',    __('New Year\'s', 'dcc-seasons')),
            self::row(self::fx(1, 4),            self::fx(1, 31),                'snowbird',     __('Snowbird Season', 'dcc-seasons')),
            self::row(self::at('mlk'),           self::at('mlk'),                'mlk',          __('MLK Day', 'dcc-seasons')),
            self::row(self::fx(2, 1),            self::fx(3, 1),                 'strawberry',   __('Strawberry Season', 'dcc-seasons')),
            self::row(self::at('mardi_gras', -8), self::at('mardi_gras'),        'mardi_gras',   __('Mardi Gras', 'dcc-seasons')),
            self::row(self::fx(2, 10),           self::at('valentines'),         'valentines',   __('Valentine\'s', 'dcc-seasons')),
            self::row(self::at('presidents'),    self::at('presidents'),         'presidents',   __('Presidents Day', 'dcc-seasons')),
            self::row(self::fx(3, 2),            self::at('st_patricks'),        'st_patricks',  __('St. Patrick\'s', 'dcc-seasons')),
            self::row(self::fx(3, 18),           self::at('memorial_day', -3),   'spring_canal', __('Spring on the Canal', 'dcc-seasons')),
            self::row(self::at('easter', -10),   self::at('easter', 1),          'easter',       __('Easter', 'dcc-seasons')),
            self::row(self::at('april_fools'),   self::at('april_fools'),        'april_fools',  __('April Fool\'s', 'dcc-seasons')),
            self::row(self::at('four_twenty'),   self::at('four_twenty'),        'four_twenty',  __('4/20', 'dcc-seasons')),
            self::row(self::fx(4, 21),           self::at('earth_day'),          'earth_day',    __('Earth Day', 'dcc-seasons')),
            self::row(self::at('mothers_day', -2), self::at('mothers_day'),      'mothers_day',  __('Mother\'s Day', 'dcc-seasons')),
            // Summer
            self::row(self::at('memorial_day', -2), self::at('memorial_day'),    'memorial_day', __('Memorial Day', 'dcc-seasons')),
            self::row(self::at('memorial_day', 1), self::at('labor_day', -3),    'summer_canal', __('Summer on the Canal', 'dcc-seasons')),
            self::row(self::at('fathers_day', -2), self::at('fathers_day'),      'fathers_day',  __('Father\'s Day', 'dcc-seasons')),
            self::row(self::fx(7, 1),            self::fx(7, 5),                 'july4',        __('Independence Day', 'dcc-seasons')),
            // Fall
            self::row(self::at('labor_day', -2), self::at('labor_day'),          'labor_day',    __('Labor Day', 'dcc-seasons')),
            self::row(self::at('labor_day', 1),  self::fx(9, 30),                'fall_fishing', __('Fall Fishing', 'dcc-seasons')),
            self::row(self::fx(9, 8),            self::at('patriot_day'),        'patriot_day',  __('Patriot Day', 'dcc-seasons')),
            self::row(self::fx(10, 1),           self::at('halloween'),          'halloween',    __('Halloween', 'dcc-seasons')),
            self::row(self::fx(11, 1),           self::at('thanksgiving'),       'thanksgiving', __('Thanksgiving', 'dcc-seasons')),
            self::row(self::fx(11, 10),          self::at('veterans_day'),       'veterans_day', __('Veterans Day', 'dcc-seasons')),
            self::row(self::at('thanksgiving', 1), self::at('christmas'),        'christmas',    __('Christmas', 'dcc-seasons')),
            // Year-round base, LAST on purpose. A full-year range is the
            // widest possible, and active() takes the narrowest containing
            // range, so this row loses to every other row and wins only on
            // the days nothing else claims. It also closes every gap, so
            // the settings page's "no row covers this day" warning cannot
            // fire on the default schedule.
            self::base_row(),
        ];
    }

    /**
     * The year-round base row (Jan 1 - Dec 31).
     */
    public static function base_row(): array {
        return self::row(self::fx(1, 1), self::fx(12, 31), self::BASE_THEME, __('Florida Keys', 'dcc-seasons'));
    }

    /**
     * Give an already-edited schedule the base row, once. Purely additive:
     * the widest possible range can never outrank anything the owner set,
     * so nothing that was showing before shows differently after. A
     * schedule that already spans a full year is left alone, which is what
     * makes a second upgrade a no-op and lets an owner who deletes the row
     * keep it deleted.
     *
     * @param array $rows
     * @return array
     */
    public static function ensure_base(array $rows): array {
        $y = (int) gmdate('Y');
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $r = self::resolve_row($row, $y);
            if (!$r) {
                continue;
            }
            $span = (int) (new \DateTimeImmutable($r[0]))->diff(new \DateTimeImmutable($r[1]))->days;
            if ($span >= 364) {
                return $rows;
            }
        }
        $rows[] = self::base_row();
        return $rows;
    }

    /** True when a row is in the pre-3.7.0 shape (start/end are Y-m-d strings). */
    public static function is_legacy_row($row): bool {
        return is_array($row) && isset($row['start']) && is_string($row['start']);
    }

    /**
     * Bring a stored schedule forward. An unmodified pre-3.7.0 default
     * becomes the new recurring default outright. Anything the owner edited
     * is kept: each dated row becomes a fixed month/day that repeats every
     * year — except rows for a theme that has a canonical moveable rule in
     * the defaults, which take that rule so MLK Day et al. stop drifting.
     */
    public static function migrate(array $rows, array $legacy_default): array {
        if (!$rows || !self::is_legacy_row($rows[0])) {
            return $rows; // already the new shape
        }
        if (self::same_legacy($rows, $legacy_default)) {
            return self::defaults();
        }
        // Only themes whose default rule hangs on a MOVEABLE holiday (nth
        // weekday or Easter-relative) get the canonical rule; a fixed-date
        // holiday like Halloween keeps whatever dates the owner set.
        $anchors = self::anchors();
        $moves   = static function (array $rule) use ($anchors): bool {
            $on = $rule['on'] ?? 'fixed';
            return $on !== 'fixed' && isset($anchors[$on]) && $anchors[$on]['type'] !== 'fixed';
        };
        $canon = [];
        foreach (self::defaults() as $d) {
            if (!isset($canon[$d['theme']]) && ($moves($d['start']) || $moves($d['end']))) {
                $canon[$d['theme']] = $d;
            }
        }
        $out = [];
        foreach ($rows as $row) {
            if (!self::is_legacy_row($row) || !isset($row['end'], $row['theme'])) {
                continue;
            }
            if (isset($canon[$row['theme']])) {
                $c          = $canon[$row['theme']];
                $c['label'] = (string) ($row['label'] ?? $c['label']);
                $out[]      = $c;
                continue;
            }
            $s = explode('-', (string) $row['start']);
            $e = explode('-', (string) $row['end']);
            if (count($s) !== 3 || count($e) !== 3) {
                continue;
            }
            $out[] = self::row(
                self::fx((int) $s[1], (int) $s[2]),
                self::fx((int) $e[1], (int) $e[2]),
                (string) $row['theme'],
                (string) ($row['label'] ?? '')
            );
        }
        return $out;
    }

    private static function same_legacy(array $a, array $b): bool {
        if (count($a) !== count($b)) {
            return false;
        }
        foreach ($a as $i => $row) {
            foreach (['start', 'end', 'theme'] as $k) {
                if (($row[$k] ?? null) !== ($b[$i][$k] ?? null)) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Sanitize one posted row into the stored shape; null if unusable.
     *
     * @param mixed    $in
     * @param string[] $theme_keys
     */
    public static function sanitize_row($in, array $theme_keys): ?array {
        if (!is_array($in)) {
            return null;
        }
        $theme = sanitize_key((string) ($in['theme'] ?? ''));
        if (!in_array($theme, $theme_keys, true)) {
            return null;
        }
        $start = self::sanitize_rule($in['start'] ?? null);
        $end   = self::sanitize_rule($in['end'] ?? null);
        if (!$start || !$end) {
            return null;
        }
        $year = (int) ($in['year'] ?? 0);
        if ($year && ($year < 2000 || $year > 2100)) {
            $year = 0;
        }
        return [
            'start' => $start,
            'end'   => $end,
            'theme' => $theme,
            'label' => sanitize_text_field((string) ($in['label'] ?? '')),
            'year'  => $year,
        ];
    }

    private static function sanitize_rule($in): ?array {
        if (!is_array($in)) {
            return null;
        }
        $on  = sanitize_key((string) ($in['on'] ?? 'fixed'));
        $off = max(-60, min(60, (int) ($in['off'] ?? 0)));
        if ($on === 'fixed') {
            $m = (int) ($in['m'] ?? 0);
            $d = (int) ($in['d'] ?? 0);
            if ($m < 1 || $m > 12 || $d < 1 || $d > 31) {
                return null;
            }
            return ['on' => 'fixed', 'm' => $m, 'd' => $d, 'off' => $off];
        }
        if (!isset(self::anchors()[$on])) {
            return null;
        }
        return ['on' => $on, 'off' => $off];
    }

    /** Human-readable form of a rule for the settings page. */
    public static function describe(array $rule): string {
        $off = (int) ($rule['off'] ?? 0);
        if (($rule['on'] ?? 'fixed') === 'fixed') {
            $base = date_i18n('M j', mktime(12, 0, 0, (int) $rule['m'], (int) $rule['d'], 2001));
        } else {
            $a    = self::anchors()[$rule['on']] ?? null;
            $base = $a ? preg_replace('/\s*\(.*\)$/', '', $a['label']) : (string) $rule['on'];
        }
        if ($off === 0) {
            return $base;
        }
        /* translators: 1: base date or holiday name, 2: signed number of days */
        return sprintf(__('%1$s %2$+d days', 'dcc-seasons'), $base, $off);
    }
}
