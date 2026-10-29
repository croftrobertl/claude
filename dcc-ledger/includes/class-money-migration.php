<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Converting the stored money from decimals to whole cents.
 *
 * Runs once, on the upgrade to 0.2.0, over a live ledger holding two years
 * of Rob's history. So it works the way a careful person would:
 *
 *   1. Copy every decimal money cell into its own backup table, first.
 *   2. Convert, cell by cell, through Money::to_cents() — parsing the stored
 *      string rather than multiplying a float, because (int) (19.99 * 100)
 *      is 1998.
 *   3. Prove it. Every table's total, and every month and channel within it,
 *      must agree to the cent before and after. If one does not, the
 *      conversion is rolled back in the same request and the plugin goes on
 *      reading decimals.
 *
 * Reversible at any time afterwards with one command:
 *
 *     wp dcc-ledger money-rollback
 */
final class Money_Migration
{
    /** Set once the cents columns are filled and proven. */
    public const DONE_OPTION = 'dccl_money_in_cents';

    /** table => [decimal column => cents column] */
    public const COLUMNS = [
        'lines'       => ['amount' => 'amount_cents'],
        'originals'   => ['total' => 'total_cents', 'amount' => 'amount_cents'],
        'adjustments' => ['amount' => 'amount_cents'],
    ];

    /** Is the ledger reading cents? */
    public static function done(): bool
    {
        return get_option(self::DONE_OPTION) === '1';
    }

    /**
     * Convert, verify, and only then switch over.
     *
     * @return array{ok:bool,converted:array<string,int>,checks:array<int,array{what:string,ok:bool,detail:string}>,message:string}
     */
    public static function run(bool $dry_run = false): array
    {
        global $wpdb;

        $before    = self::totals();
        $converted = [];
        $checks    = [];

        if (self::done()) {
            return [
                'ok'        => true,
                'converted' => [],
                'checks'    => self::verify($before),
                'message'   => __('Money is already held in whole cents.', 'dcc-ledger'),
            ];
        }

        foreach (self::COLUMNS as $table => $map) {
            $name = Schema::table($table);
            foreach ($map as $decimal => $cents) {
                $rows = $wpdb->get_results(
                    "SELECT id, {$decimal} AS old_value FROM {$name}",
                    ARRAY_A
                ) ?: [];

                $count = 0;
                foreach ($rows as $row) {
                    $value = $row['old_value'];
                    $to    = $value === null ? null : Money::to_cents($value);

                    if (!$dry_run) {
                        // The backup goes in BEFORE the cell is touched, and
                        // is never overwritten: a second run must not bury
                        // the original value under its own output.
                        $already = (int) $wpdb->get_var(
                            $wpdb->prepare(
                                "SELECT COUNT(*) FROM " . Schema::money_backup() .
                                " WHERE table_name = %s AND row_id = %d AND column_name = %s",
                                $table,
                                (int) $row['id'],
                                $decimal
                            )
                        );
                        if ($already === 0) {
                            // Inserted rather than prepared, so a cell that
                            // held NULL is backed up as NULL. $wpdb->prepare
                            // turns a null into an empty string, and the
                            // rollback would then write '' where nothing was.
                            $wpdb->insert(Schema::money_backup(), [
                                'table_name'  => $table,
                                'row_id'      => (int) $row['id'],
                                'column_name' => $decimal,
                                'old_value'   => $value === null ? null : (string) $value,
                                'new_cents'   => $to,
                                'created_at'  => Dates::now(),
                            ]);
                        }
                        $wpdb->query(
                            $wpdb->prepare(
                                "UPDATE {$name} SET {$cents} = %d WHERE id = %d",
                                $to,
                                (int) $row['id']
                            )
                        );
                    }
                    $count++;
                }
                $converted[$table . '.' . $decimal] = $count;
            }
        }

        $checks = $dry_run ? self::verify($before, true) : self::verify($before);
        $ok     = true;
        foreach ($checks as $check) {
            $ok = $ok && $check['ok'];
        }

        if ($dry_run) {
            return [
                'ok'        => $ok,
                'converted' => $converted,
                'checks'    => $checks,
                'message'   => __('Dry run complete. Nothing was written.', 'dcc-ledger'),
            ];
        }

        if (!$ok) {
            // Proof failed, so the conversion does not happen. The decimals
            // are put back from the backup and the plugin goes on reading
            // them, rather than showing a figure nobody has checked.
            self::rollback();

            return [
                'ok'        => false,
                'converted' => $converted,
                'checks'    => $checks,
                'message'   => __('The converted totals did not match the originals, so nothing was changed. The decimal values are exactly as they were.', 'dcc-ledger'),
            ];
        }

        update_option(self::DONE_OPTION, '1', false);
        Reports::flush_cache();

        return [
            'ok'        => true,
            'converted' => $converted,
            'checks'    => $checks,
            'message'   => __('Money is now held in whole cents.', 'dcc-ledger'),
        ];
    }

    /**
     * Put the decimal columns back exactly as they were, clear the cents,
     * and go back to reading decimals.
     *
     * @return array{restored:int,message:string}
     */
    public static function rollback(): array
    {
        global $wpdb;

        $backup   = Schema::money_backup();
        $restored = 0;

        foreach (self::COLUMNS as $table => $map) {
            $name = Schema::table($table);
            foreach ($map as $decimal => $cents) {
                $rows = $wpdb->get_results(
                    $wpdb->prepare(
                        "SELECT row_id, old_value FROM {$backup}
                          WHERE table_name = %s AND column_name = %s",
                        $table,
                        $decimal
                    ),
                    ARRAY_A
                ) ?: [];

                foreach ($rows as $row) {
                    // A cell that held nothing is put back as nothing. Writing
                    // an empty string in place of NULL would leave the column
                    // looking like a figure of zero.
                    if ($row['old_value'] === null) {
                        $wpdb->query(
                            $wpdb->prepare(
                                "UPDATE {$name} SET {$decimal} = NULL WHERE id = %d",
                                (int) $row['row_id']
                            )
                        );
                    } else {
                        $wpdb->query(
                            $wpdb->prepare(
                                "UPDATE {$name} SET {$decimal} = %s WHERE id = %d",
                                $row['old_value'],
                                (int) $row['row_id']
                            )
                        );
                    }
                    $restored++;
                }

                // Zero rather than NULL: some of these columns are NOT NULL,
                // and Health::money_not_in_cents() reads a zero beside a
                // non-zero decimal as exactly what it is — unconverted.
                $wpdb->query("UPDATE {$name} SET {$cents} = 0");
            }
        }

        update_option(self::DONE_OPTION, '0', false);
        Reports::flush_cache();

        return [
            'restored' => $restored,
            'message'  => __('The decimal values are back exactly as they were, and the ledger is reading them again.', 'dcc-ledger'),
        ];
    }

    /**
     * Totals as they stand, in decimals, for comparing before with after.
     *
     * Taken per table, per month and per channel, because a total that ties
     * while its months do not is a total that is wrong twice.
     *
     * @return array<string,array<string,string>>
     */
    public static function totals(): array
    {
        global $wpdb;

        $out = [];

        $lines = Schema::lines();
        $out['lines'] = self::rows_to_map($wpdb->get_results(
            "SELECT CONCAT(COALESCE(SUBSTR(event_date, 1, 7), 'no-date'), '|', channel) AS k,
                    SUM(amount) AS total
               FROM {$lines} GROUP BY k",
            ARRAY_A
        ) ?: []);

        $adjustments = Schema::adjustments();
        $out['adjustments'] = self::rows_to_map($wpdb->get_results(
            "SELECT CONCAT(COALESCE(SUBSTR(event_date, 1, 7), 'no-date'), '|', channel, '|', type) AS k,
                    SUM(amount) AS total
               FROM {$adjustments} GROUP BY k",
            ARRAY_A
        ) ?: []);

        $originals = Schema::originals();
        $out['originals.total'] = self::rows_to_map($wpdb->get_results(
            "SELECT CONCAT(kind, '|', COALESCE(SUBSTR(check_in, 1, 7), 'no-date')) AS k,
                    SUM(total) AS total
               FROM {$originals} GROUP BY k",
            ARRAY_A
        ) ?: []);

        $out['originals.amount'] = self::rows_to_map($wpdb->get_results(
            "SELECT CONCAT(kind, '|', COALESCE(payment_status, 'none')) AS k,
                    SUM(amount) AS total
               FROM {$originals} GROUP BY k",
            ARRAY_A
        ) ?: []);

        return $out;
    }

    /**
     * The same totals read from the cents columns, compared with the ones
     * taken before the conversion.
     *
     * @param array<string,array<string,string>> $before
     * @return array<int,array{what:string,ok:bool,detail:string}>
     */
    public static function verify(array $before, bool $dry_run = false): array
    {
        global $wpdb;

        $after = [];

        $lines = Schema::lines();
        $after['lines'] = self::rows_to_map($wpdb->get_results(
            "SELECT CONCAT(COALESCE(SUBSTR(event_date, 1, 7), 'no-date'), '|', channel) AS k,
                    SUM(amount_cents) AS total
               FROM {$lines} GROUP BY k",
            ARRAY_A
        ) ?: []);

        $adjustments = Schema::adjustments();
        $after['adjustments'] = self::rows_to_map($wpdb->get_results(
            "SELECT CONCAT(COALESCE(SUBSTR(event_date, 1, 7), 'no-date'), '|', channel, '|', type) AS k,
                    SUM(amount_cents) AS total
               FROM {$adjustments} GROUP BY k",
            ARRAY_A
        ) ?: []);

        $originals = Schema::originals();
        $after['originals.total'] = self::rows_to_map($wpdb->get_results(
            "SELECT CONCAT(kind, '|', COALESCE(SUBSTR(check_in, 1, 7), 'no-date')) AS k,
                    SUM(total_cents) AS total
               FROM {$originals} GROUP BY k",
            ARRAY_A
        ) ?: []);

        $after['originals.amount'] = self::rows_to_map($wpdb->get_results(
            "SELECT CONCAT(kind, '|', COALESCE(payment_status, 'none')) AS k,
                    SUM(amount_cents) AS total
               FROM {$originals} GROUP BY k",
            ARRAY_A
        ) ?: []);

        $checks = [];
        foreach ($before as $what => $groups) {
            $mismatch = [];
            $keys     = array_unique(array_merge(array_keys($groups), array_keys($after[$what] ?? [])));
            foreach ($keys as $key) {
                $want = Money::to_cents($groups[$key] ?? '0');
                $got  = (int) ($after[$what][$key] ?? 0);
                if ($dry_run) {
                    continue;
                }
                if ($want !== $got) {
                    $mismatch[] = sprintf('%s: %d ≠ %d', $key, $want, $got);
                }
            }

            $checks[] = [
                'what'   => $what,
                'ok'     => $mismatch === [],
                'detail' => $dry_run
                    ? sprintf(
                        /* translators: %d: number of groups that will be compared */
                        __('%d groups will be compared', 'dcc-ledger'),
                        count($keys)
                    )
                    : ($mismatch === []
                        ? sprintf(
                            /* translators: %d: number of groups compared */
                            __('%d groups tie to the cent', 'dcc-ledger'),
                            count($keys)
                        )
                        : implode('; ', array_slice($mismatch, 0, 5))),
            ];
        }

        return $checks;
    }

    /**
     * @param array<int,array<string,mixed>> $rows
     * @return array<string,string>
     */
    private static function rows_to_map(array $rows): array
    {
        $out = [];
        foreach ($rows as $row) {
            $out[(string) $row['k']] = (string) ($row['total'] ?? '0');
        }

        return $out;
    }
}
