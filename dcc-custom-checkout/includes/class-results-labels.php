<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Add New Booking, step 2 (search results): clearer column labels (v0.30.1,
 * owner's picks 2026-10-07; headings revised in v0.30.2, Rob's words).
 *
 * Rob searched for 2 adults and read "Capacity: Adults: 4 Children: 0" as a
 * wrong guest count; it is the cottage's maximum. And "Base price" is the
 * WHOLE STAY's total before fees and taxes (live: $700 for 4 nights), not a
 * per-night rate. So:
 *   "Capacity" column: heading LEFT AS MOTOPRESS PRINTS IT (0.30.1 said
 *                  "Sleeps up to"; Rob asked for "Capacity" back), cell =
 *                  RoomType::calcTotalCapacity() (+ " · up to N children" only
 *                  when children capacity > 0);
 *   "Base price" → "Total (minus taxes/fees)". Amount unchanged.
 *
 * Because the Capacity heading is MotoPress's own again, the HEADINGS no
 * longer tell a relabelled table from one left as drawn — the CELLS do: a
 * recognised table has no "Adults:" left in that column, and its price
 * heading is ours. The tests assert on the cells for that reason.
 *
 * SCOPE, deliberately narrow: NO global gettext filter — 'Capacity' is also
 * MotoPress's word in Google Hotels data, the room-type editor and the
 * accommodation list. The table is MotoPress's template
 * templates/create-booking/results/reserve-rooms.php (read verbatim from live
 * 6.3.0 by the Director); its own hooks mphb_cb_reserve_rooms_form_before_start
 * and mphb_cb_reserve_rooms_form_after_end bracket it. Between them, on
 * page=mphb_add_new_booking&step=2 only, the output is buffered and rewritten.
 *
 * ALL OR NOTHING: unless every table and every row is recognised exactly —
 * the four headings, the checkbox naming its room type, the "Adults:&nbsp;N
 * Children:&nbsp;M" cell agreeing with that room type's own capacities — the
 * form is printed EXACTLY as MotoPress drew it.
 */
final class Results_Labels
{
    private const PAGE = 'mphb_add_new_booking';

    /** Output-buffer level this opened, or 0. */
    private int $level = 0;

    public function register(): void
    {
        add_action('mphb_cb_reserve_rooms_form_before_start', [$this, 'start'], 0, 0);
        add_action('mphb_cb_reserve_rooms_form_after_end', [$this, 'finish'], PHP_INT_MAX, 0);
    }

    /** The results step of Add New Booking, and nothing else. */
    public static function on_results_step(): bool
    {
        // phpcs:disable WordPress.Security.NonceVerification -- read-only routing of a GET page
        return is_admin()
            && isset($_GET['page'], $_GET['step'])
            && sanitize_key(wp_unslash($_GET['page'])) === self::PAGE
            && (string) wp_unslash($_GET['step']) === '2';
        // phpcs:enable
    }

    public function start(): void
    {
        if ($this->level !== 0 || !self::on_results_step()) {
            return;
        }
        ob_start();
        $this->level = ob_get_level();
    }

    public function finish(): void
    {
        if ($this->level === 0) {
            return;
        }
        if (ob_get_level() !== $this->level) {
            // Someone else's buffer is on top: leave every buffer alone. Ours
            // is flushed unchanged by WordPress at shutdown.
            $this->level = 0;
            return;
        }
        $this->level = 0;
        $html = (string) ob_get_clean();
        $out  = self::transform($html, [self::class, 'capacity_of']);
        echo $out ?? $html; // phpcs:ignore WordPress.Security.EscapeOutput -- MotoPress's own escaped markup, or ours built escaped
    }

    /**
     * MotoPress's capacities for a room type (verified 6.3.0 RoomType API),
     * or null when they cannot be read.
     *
     * @return array{adults:int,children:int,total:int}|null
     */
    public static function capacity_of(int $type_id): ?array
    {
        if ($type_id <= 0 || !function_exists('MPHB')) {
            return null;
        }
        try {
            $rt = MPHB()->getRoomTypeRepository()->findById($type_id);
            if (!$rt || !method_exists($rt, 'calcTotalCapacity')
                || !method_exists($rt, 'getAdultsCapacity') || !method_exists($rt, 'getChildrenCapacity')) {
                return null;
            }
            return [
                'adults'   => (int) $rt->getAdultsCapacity(),
                'children' => (int) $rt->getChildrenCapacity(),
                'total'    => (int) $rt->calcTotalCapacity(),
            ];
        } catch (\Throwable $e) {
            return null;
        }
    }

    /** MotoPress's own string, translated and escaped as it printed it. */
    private static function mp(string $text): string
    {
        return esc_html(__($text, 'motopress-hotel-booking')); // phpcs:ignore WordPress.WP.I18n
    }

    /**
     * Rewrite the reserve-rooms form, or return null if it is not exactly the
     * form expected. Pure: tested directly.
     *
     * @param callable(int):?array $capacity
     */
    public static function transform(string $html, callable $capacity): ?string
    {
        $q = static function (string $s): string {
            return preg_quote($s, '#');
        };
        $head = '#<thead>\s*<tr>\s*<th class="check-column">&nbsp;</th>\s*'
            . '<th class="row-title">' . $q(self::mp('Title')) . '</th>\s*'
            . '<th class="row-title">' . $q(self::mp('Capacity')) . '</th>\s*'
            . '<th class="row-title">(' . $q(self::mp('Base price')) . ')</th>\s*</tr>\s*</thead>#';
        $row = '#<tr>\s*<td>\s*<input type="checkbox" name="mphb_rooms\[(\d+)\]\[\]" value="\d+" id="mphb_room-\d+"\s*/>\s*</td>\s*'
            . '<td>\s*<label for="mphb_room-\d+">[^<]*</label>\s*</td>\s*'
            . '<td>(\s*' . $q(self::mp('Adults:')) . '&nbsp;(\d+) ' . $q(self::mp('Children:')) . '&nbsp;(\d+)\s*)</td>#';

        $tables = preg_split('#(<table class="widefat striped fixed">.*?</table>)#s', $html, -1, PREG_SPLIT_DELIM_CAPTURE);
        if (!is_array($tables) || count($tables) < 3) {
            return null; // no results table at all
        }
        foreach ($tables as $i => $part) {
            if ($i % 2 === 0) {
                if (strpos($part, '<table') !== false) {
                    return null; // a table that is not MotoPress's shape
                }
                continue;
            }
            if (preg_match_all($head, $part) !== 1) {
                return null;
            }
            $rows_total = preg_match_all('#<tr>#', $part) - 1; // minus the thead row
            $rows_found = 0;
            $bad = false;
            $part = preg_replace_callback($row, static function (array $m) use ($capacity, &$rows_found, &$bad): string {
                $cap = $capacity((int) $m[1]);
                if ($cap === null || $cap['adults'] !== (int) $m[3] || $cap['children'] !== (int) $m[4] || $cap['total'] < 1) {
                    $bad = true;
                    return $m[0];
                }
                $rows_found++;
                $cell = (string) $cap['total'];
                if ($cap['children'] > 0) {
                    /* translators: %d: how many children the cottage can take. */
                    $cell .= ' · ' . sprintf(_n('up to %d child', 'up to %d children', $cap['children'], 'dcc-checkout'), $cap['children']);
                }
                return substr($m[0], 0, -strlen($m[2] . '</td>')) . esc_html($cell) . '</td>';
            }, $part);
            if ($bad || $part === null || $rows_found < 1 || $rows_found !== $rows_total) {
                return null;
            }
            // Only the price heading changes; the Capacity heading stays MotoPress's.
            $part = preg_replace_callback($head, static function (array $m): string {
                return str_replace(
                    '<th class="row-title">' . $m[1] . '</th>',
                    '<th class="row-title">' . esc_html__('Total (minus taxes/fees)', 'dcc-checkout') . '</th>',
                    $m[0]
                );
            }, $part);
            $tables[$i] = $part;
        }
        return implode('', $tables);
    }
}
