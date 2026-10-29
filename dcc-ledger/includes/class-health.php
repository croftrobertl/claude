<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Does MotoPress still look the way this plugin expects?
 *
 * Every figure about direct bookings rests on a handful of meta keys and one
 * status spelling. Those spellings are easy to get wrong — `mphb_amount` and
 * `_mphb_amount` differ by one character, and `completed` and
 * `mphb-p-completed` differ by a prefix — and a wrong one returns no rows at
 * all. That reports $0, which looks like an answer.
 *
 * So the keys are checked: on activation, before every snapshot, and on every
 * report load. If one is missing, the screens show what is missing instead of
 * figures.
 */
final class Health
{
    /**
     * Each required MotoPress key, and what breaks without it.
     *
     * @return array<int,array{what:string,kind:string,value:string,why:string}>
     */
    public static function requirements(): array
    {
        return [
            [
                'what'  => Mphb_Reader::META_CHECK_IN,
                'kind'  => 'meta',
                'value' => Mphb_Reader::META_CHECK_IN,
                'why'   => __('Every booking\'s check-in date.', 'dcc-ledger'),
            ],
            [
                'what'  => Mphb_Reader::META_CHECK_OUT,
                'kind'  => 'meta',
                'value' => Mphb_Reader::META_CHECK_OUT,
                'why'   => __('Every booking\'s check-out date.', 'dcc-ledger'),
            ],
            [
                'what'  => Mphb_Reader::META_ROOM_ID,
                'kind'  => 'meta',
                'value' => Mphb_Reader::META_ROOM_ID,
                'why'   => __('Which cottage a booking is for.', 'dcc-ledger'),
            ],
            [
                'what'  => Mphb_Reader::META_TOTAL,
                'kind'  => 'meta',
                'value' => Mphb_Reader::META_TOTAL,
                'why'   => __('What a direct booking was due to pay.', 'dcc-ledger'),
            ],
            [
                'what'  => Mphb_Reader::META_PAYMENT_AMOUNT,
                'kind'  => 'meta',
                'value' => Mphb_Reader::META_PAYMENT_AMOUNT,
                'why'   => __('How much each payment was for.', 'dcc-ledger'),
            ],
            [
                'what'  => Mphb_Reader::META_PAYMENT_BOOKING,
                'kind'  => 'meta',
                'value' => Mphb_Reader::META_PAYMENT_BOOKING,
                'why'   => __('Which booking each payment belongs to.', 'dcc-ledger'),
            ],
            [
                'what'  => Mphb_Reader::PAYMENT_COMPLETED,
                'kind'  => 'payment_status',
                'value' => Mphb_Reader::PAYMENT_COMPLETED,
                'why'   => __('Which payments count as money received.', 'dcc-ledger'),
            ],
            [
                'what'  => Mphb_Reader::POST_TYPE_PAYMENT,
                'kind'  => 'post_type',
                'value' => Mphb_Reader::POST_TYPE_PAYMENT,
                'why'   => __('Where payments are stored.', 'dcc-ledger'),
            ],
        ];
    }

    /**
     * Is there anywhere to read a guest's surname from?
     *
     * This is a soft check. Without it the figures are still right; only the
     * move signal cannot run, and every probable move is reported as "no name
     * to compare" instead of being guessed at.
     */
    public static function name_source_present(): bool
    {
        global $wpdb;

        $keys = [
            Mphb_Reader::META_LAST_NAME,
            Mphb_Reader::META_FIRST_NAME,
            Mphb_Reader::META_GUEST_NAME,
        ];
        $placeholders = implode(',', array_fill(0, count($keys), '%s'));

        try {
            return (int) $wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->postmeta} WHERE meta_key IN ({$placeholders}) LIMIT 1",
                ...$keys
            )) > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * Columns the code needs that the tables do not have.
     *
     * An upgrade can leave a table behind — dbDelta is fussy about the shape
     * of a CREATE TABLE statement, and a column it fails to add is missed
     * silently, because a fresh install is perfectly fine. So the tables are
     * checked against the definitions they were built from, and a mismatch
     * is shown rather than left to surface as an empty figure.
     *
     * @return array<int,array{table:string,column:string}>
     */
    public static function missing_columns(): array
    {
        global $wpdb;

        $missing = [];

        foreach (Schema::expected_columns() as $name => $columns) {
            $table = Schema::table($name);

            try {
                $rows = $wpdb->get_results("SHOW COLUMNS FROM {$table}", ARRAY_A);
            } catch (\Throwable $e) {
                continue; // The table itself is missing; reported separately.
            }

            if (!is_array($rows) || $rows === []) {
                continue;
            }

            $have = [];
            foreach ($rows as $row) {
                $have[] = (string) ($row['Field'] ?? '');
            }

            foreach ($columns as $column) {
                if (!in_array($column, $have, true)) {
                    $missing[] = ['table' => $name, 'column' => $column];
                }
            }
        }

        return $missing;
    }

    /**
     * Money rows that hold a decimal but no cents figure.
     *
     * Since 0.2.0 every figure is read from the cents columns. A row with
     * money in its old decimal column and nothing in its cents column would
     * read as zero — the silent wrongness this plugin exists to prevent — so
     * it is counted here and shown as a banner instead of figures.
     *
     * It is zero on a fresh install, where every write fills both, and above
     * zero only after a rollback or a conversion that did not finish.
     */
    public static function money_not_in_cents(): int
    {
        global $wpdb;

        $count = 0;
        foreach (Money_Migration::COLUMNS as $table => $map) {
            $name = Schema::table($table);
            foreach ($map as $decimal => $cents) {
                try {
                    $count += (int) $wpdb->get_var(
                        "SELECT COUNT(*) FROM {$name}
                          WHERE {$decimal} IS NOT NULL AND {$decimal} <> '' AND {$decimal} <> 0
                            AND ({$cents} IS NULL OR {$cents} = 0)"
                    );
                } catch (\Throwable $e) {
                    continue; // The column is missing; reported separately.
                }
            }
        }

        return $count;
    }

    /**
     * @return array{ok:bool,missing:array<int,array{what:string,why:string}>}
     */
    public static function check(): array
    {
        global $wpdb;

        $missing = [];

        foreach (self::requirements() as $requirement) {
            $found = false;

            try {
                if ($requirement['kind'] === 'meta') {
                    $found = (int) $wpdb->get_var($wpdb->prepare(
                        "SELECT COUNT(*) FROM {$wpdb->postmeta} WHERE meta_key = %s LIMIT 1",
                        $requirement['value']
                    )) > 0;
                } elseif ($requirement['kind'] === 'payment_status') {
                    $found = (int) $wpdb->get_var($wpdb->prepare(
                        "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = %s AND post_status = %s LIMIT 1",
                        Mphb_Reader::POST_TYPE_PAYMENT,
                        $requirement['value']
                    )) > 0;
                } else {
                    $found = (int) $wpdb->get_var($wpdb->prepare(
                        "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = %s LIMIT 1",
                        $requirement['value']
                    )) > 0;
                }
            } catch (\Throwable $e) {
                $found = false;
            }

            if (!$found) {
                $missing[] = ['what' => $requirement['what'], 'why' => $requirement['why']];
            }
        }

        $unconverted = self::money_not_in_cents();
        if ($unconverted > 0) {
            $missing[] = [
                'what' => sprintf(
                    /* translators: %d: how many money rows have no cents figure */
                    __('%d money rows are not in cents', 'dcc-ledger'),
                    $unconverted
                ),
                'why'  => __('The ledger reads whole cents. These rows still hold only their old decimal value, so every figure built from them would read as zero. Deactivating and reactivating the plugin runs the conversion again.', 'dcc-ledger'),
            ];
        }

        foreach (self::missing_columns() as $gap) {
            $missing[] = [
                'what' => $gap['table'] . '.' . $gap['column'],
                'why'  => __('A column the ledger writes to is missing from its own table, so an upgrade did not finish.', 'dcc-ledger'),
            ];
        }

        return ['ok' => $missing === [], 'missing' => $missing];
    }

    /**
     * Links pointing at a stay that does not exist.
     *
     * Listed here because this is where someone looks when something seems
     * off, but reported separately from check(): a stale link does not make a
     * figure wrong — nothing joins to a stay that is not there — so it must
     * not replace the figures with a banner. It gets a notice and a button.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function bad_links(): array
    {
        return Repair::bad_links();
    }

    /**
     * The notice for those links: shown beside the figures, not instead of
     * them.
     */
    public static function bad_links_notice(): string
    {
        $bad = self::bad_links();
        if ($bad === []) {
            return '';
        }

        $ids = [];
        foreach ($bad as $link) {
            $ids[] = (int) $link['id'];
        }

        $html  = '<div class="dccl-notice dccl-health-warn">';
        $html .= '<p><strong>' . esc_html(sprintf(
            /* translators: %d: number of links */
            _n(
                '%d link points at a stay that no longer exists.',
                '%d links point at a stay that no longer exists.',
                count($bad),
                'dcc-ledger'
            ),
            count($bad)
        )) . '</strong></p>';
        $html .= '<p>' . esc_html(sprintf(
            /* translators: %s: comma-separated link ids */
            __('Link ids: %s. Version 0.1.3 could write these when it failed to find the stay for one of Rob\'s confirmed moves. They change no figure, because nothing joins to a stay that is not there, but they are not decisions anybody made.', 'dcc-ledger'),
            implode(', ', $ids)
        )) . '</p>';
        $html .= '<p>' . esc_html__('Removing them is recorded as a batch on the Imports tab, and can be undone there like any import.', 'dcc-ledger') . '</p>';
        $html .= '</div>';

        return $html;
    }

    /**
     * The banner shown in place of figures. Returns '' when everything is there.
     */
    public static function banner(): string
    {
        $check = self::check();
        if ($check['ok']) {
            return '';
        }

        $html  = '<div class="dccl-notice dccl-notice--error dccl-health">';
        $html .= '<p><strong>' . esc_html__('MotoPress does not look the way this plugin expects, so no figures are shown.', 'dcc-ledger') . '</strong></p>';
        $html .= '<p>' . esc_html__('Each of these is missing from this site. Until they are right, any figure here would read as zero rather than as an error:', 'dcc-ledger') . '</p>';
        $html .= '<ul>';
        foreach ($check['missing'] as $item) {
            $html .= '<li><code>' . esc_html($item['what']) . '</code> — ' . esc_html($item['why']) . '</li>';
        }
        $html .= '</ul>';
        $html .= '<p>' . esc_html__('MotoPress may have been updated, or this site may spell these differently. An entry of the form table.column means the ledger\'s own upgrade did not finish, and deactivating and reactivating the plugin will run it again. Send the list above to whoever maintains this plugin.', 'dcc-ledger') . '</p>';
        $html .= '</div>';

        return $html;
    }

    /** Checked on activation too, so a mismatch surfaces before any import. */
    public static function on_activate(): void
    {
        $check = self::check();
        if (!$check['ok']) {
            update_option('dccl_health_warning', $check['missing'], false);
            return;
        }
        delete_option('dccl_health_warning');
    }
}
