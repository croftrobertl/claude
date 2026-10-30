<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Custom tables. Created with dbDelta on activation and on version upgrade
 * only — never on a normal page load.
 *
 * The table definitions are data, not SQL strings, and the SQL is composed
 * from them. That is deliberate: dbDelta reads a CREATE TABLE statement line
 * by line, so a `--` comment inside one is taken for a column definition and
 * the column diff it builds goes wrong. An upgrade then silently fails to add
 * a column, while a fresh install works — because MySQL itself is perfectly
 * happy with the comment. Keeping the definitions as arrays means a comment
 * can never get into the SQL in the first place, and it lets the health check
 * and the upgrade test read the expected columns from the same source the
 * tables are built from.
 */
final class Schema
{
    public const DB_VERSION     = '7';
    public const VERSION_OPTION = 'dccl_db_version';

    public static function table(string $name): string
    {
        global $wpdb;
        return $wpdb->prefix . 'dcc_ledger_' . $name;
    }

    public static function stays(): string
    {
        return self::table('stays');
    }

    public static function lines(): string
    {
        return self::table('lines');
    }

    public static function links(): string
    {
        return self::table('links');
    }

    public static function batches(): string
    {
        return self::table('batches');
    }

    public static function reviews(): string
    {
        return self::table('reviews');
    }

    public static function pace(): string
    {
        return self::table('pace');
    }

    public static function stay_rulings(): string
    {
        return self::table('stay_rulings');
    }

    public static function money_backup(): string
    {
        return self::table('money_backup');
    }

    public static function booking_taxes(): string
    {
        return self::table('booking_taxes');
    }

    public static function originals(): string
    {
        return self::table('originals');
    }

    public static function adjustments(): string
    {
        return self::table('adjustments');
    }

    /** @return string[] */
    public static function table_names(): array
    {
        return array_keys(self::definitions());
    }

    /**
     * Every table, as column name => column definition, plus its keys.
     *
     * @return array<string,array{columns:array<string,string>,primary:string,keys:array<int,string>}>
     */
    public static function definitions(): array
    {
        return [
            // One row per channel reservation. `channel` is wide enough for a
            // later 'direct' or 'clover' value; `meta` carries parser extras
            // as JSON so a phase-2 importer needs no migration. `guest_keys`
            // holds salted hashes of the guest's surname and nothing else
            // about them — see Names.
            'stays' => [
                'columns' => [
                    'id'           => 'bigint(20) unsigned NOT NULL AUTO_INCREMENT',
                    'channel'      => 'varchar(20) NOT NULL',
                    'code'         => 'varchar(64) NOT NULL',
                    'cottage'      => 'varchar(8) NOT NULL',
                    'check_in'     => 'date DEFAULT NULL',
                    'check_out'    => 'date DEFAULT NULL',
                    'nights'       => 'smallint(5) DEFAULT NULL',
                    'booked_on'    => 'datetime DEFAULT NULL',
                    'status'       => "varchar(12) NOT NULL DEFAULT 'ok'",
                    'persons'      => 'smallint(5) DEFAULT NULL',
                    'source_batch' => 'bigint(20) unsigned DEFAULT NULL',
                    'guest_keys'   => 'longtext DEFAULT NULL',
                    'meta'         => 'longtext DEFAULT NULL',
                    'created_at'   => 'datetime NOT NULL',
                    'updated_at'   => 'datetime NOT NULL',
                ],
                'primary' => 'id',
                'keys'    => [
                    'UNIQUE KEY channel_code (channel,code)',
                    'KEY cottage_checkin (cottage,check_in)',
                    'KEY stay_status (status)',
                    'KEY stay_batch (source_batch)',
                ],
            ],

            'lines' => [
                'columns' => [
                    'id'           => 'bigint(20) unsigned NOT NULL AUTO_INCREMENT',
                    'stay_id'      => 'bigint(20) unsigned DEFAULT NULL',
                    'channel'      => 'varchar(20) NOT NULL',
                    'type'         => 'varchar(32) NOT NULL',
                    'amount'       => 'decimal(12,2) NOT NULL DEFAULT 0.00',
                    'amount_cents' => 'bigint(20) NOT NULL DEFAULT 0',
                    'event_date'   => 'date DEFAULT NULL',
                    'payout_ref'   => 'varchar(64) DEFAULT NULL',
                    'ref_code'     => 'varchar(64) DEFAULT NULL',
                    'source_batch' => 'bigint(20) unsigned DEFAULT NULL',
                    'meta'         => 'longtext DEFAULT NULL',
                    'hash'         => 'char(40) NOT NULL',
                    'created_at'   => 'datetime NOT NULL',
                ],
                'primary' => 'id',
                'keys'    => [
                    'UNIQUE KEY line_hash (hash)',
                    'KEY line_stay (stay_id)',
                    'KEY line_event_date (event_date)',
                    'KEY line_type (type)',
                    'KEY line_channel_type (channel,type)',
                    'KEY line_batch (source_batch)',
                ],
            ],

            'links' => [
                'columns' => [
                    'id'              => 'bigint(20) unsigned NOT NULL AUTO_INCREMENT',
                    'stay_id'         => 'bigint(20) unsigned NOT NULL',
                    'mphb_booking_id' => 'bigint(20) unsigned NOT NULL',
                    'method'          => 'varchar(10) NOT NULL',
                    'linked_at'       => 'datetime NOT NULL',
                    'linked_by'       => 'bigint(20) unsigned DEFAULT NULL',
                ],
                'primary' => 'id',
                'keys'    => [
                    'UNIQUE KEY stay_booking (stay_id,mphb_booking_id)',
                    'KEY link_stay (stay_id)',
                    'KEY link_booking (mphb_booking_id)',
                    'KEY link_method (method)',
                ],
            ],

            'batches' => [
                'columns' => [
                    'id'             => 'bigint(20) unsigned NOT NULL AUTO_INCREMENT',
                    'kind'           => 'varchar(40) NOT NULL',
                    'label'          => 'varchar(190) NOT NULL',
                    'rows_read'      => 'int(11) NOT NULL DEFAULT 0',
                    'rows_inserted'  => 'int(11) NOT NULL DEFAULT 0',
                    'rows_unchanged' => 'int(11) NOT NULL DEFAULT 0',
                    'rows_skipped'   => 'int(11) NOT NULL DEFAULT 0',
                    'rows_excluded'  => 'int(11) NOT NULL DEFAULT 0',
                    'user_id'        => 'bigint(20) unsigned DEFAULT NULL',
                    'undo_data'      => 'longtext DEFAULT NULL',
                    'created_at'     => 'datetime NOT NULL',
                ],
                'primary' => 'id',
                'keys'    => ['KEY batch_kind (kind)'],
            ],

            // What was on the books, as at a date. Written once a night and
            // never recomputed: a pace curve reconstructed after the fact
            // shows what SURVIVED to today, not what stood on the day.
            'pace' => [
                'columns' => [
                    'id'          => 'bigint(20) unsigned NOT NULL AUTO_INCREMENT',
                    'recorded_on' => 'date NOT NULL',
                    'stay_month'  => 'varchar(7) NOT NULL',
                    'room_nights' => 'int(11) NOT NULL DEFAULT 0',
                    'stays'       => 'int(11) NOT NULL DEFAULT 0',
                    'created_at'  => 'datetime NOT NULL',
                ],
                'primary' => 'id',
                'keys'    => [
                    'UNIQUE KEY pace_point (recorded_on,stay_month)',
                    'KEY pace_month (stay_month)',
                ],
            ],

            // Rob's answer to "did this one really happen?", for a cancelled
            // platform stay somebody attached a hand-typed copy to. Its
            // nights belong somewhere; until he rules, they belong nowhere.
            'stay_rulings' => [
                'columns' => [
                    'id'         => 'bigint(20) unsigned NOT NULL AUTO_INCREMENT',
                    'stay_id'    => 'bigint(20) unsigned NOT NULL',
                    'evidence'   => 'varchar(16) NOT NULL',
                    'note'       => 'text DEFAULT NULL',
                    'created_at' => 'datetime NOT NULL',
                    'created_by' => 'bigint(20) unsigned DEFAULT NULL',
                    'revoked_at' => 'datetime DEFAULT NULL',
                    'revoked_by' => 'bigint(20) unsigned DEFAULT NULL',
                ],
                'primary' => 'id',
                'keys'    => [
                    'KEY ruling_stay (stay_id)',
                    'KEY ruling_live (stay_id,revoked_at)',
                ],
            ],

            // The decimal money columns exactly as they stood before 0.2.0
            // converted them to whole cents. Written once, read only by the
            // rollback, and never deleted: it is the thing that makes the
            // conversion reversible.
            'money_backup' => [
                'columns' => [
                    'id'          => 'bigint(20) unsigned NOT NULL AUTO_INCREMENT',
                    'table_name'  => 'varchar(32) NOT NULL',
                    'row_id'      => 'bigint(20) unsigned NOT NULL',
                    'column_name' => 'varchar(32) NOT NULL',
                    'old_value'   => 'varchar(32) DEFAULT NULL',
                    'new_cents'   => 'bigint(20) DEFAULT NULL',
                    'created_at'  => 'datetime NOT NULL',
                ],
                'primary' => 'id',
                'keys'    => [
                    'UNIQUE KEY backup_cell (table_name,row_id,column_name)',
                    'KEY backup_table (table_name)',
                ],
            ],

            // Cleanup items are computed on the fly; only the admin's
            // "Reviewed" marks and decisions are stored, keyed by the item.
            'reviews' => [
                'columns' => [
                    'id'          => 'bigint(20) unsigned NOT NULL AUTO_INCREMENT',
                    'issue_key'   => 'varchar(190) NOT NULL',
                    'note'        => 'text DEFAULT NULL',
                    'reviewed_at' => 'datetime NOT NULL',
                    'reviewed_by' => 'bigint(20) unsigned DEFAULT NULL',
                ],
                'primary' => 'id',
                'keys'    => ['UNIQUE KEY issue_key (issue_key)'],
            ],

            // The ledger's own copy of what MotoPress held when it was taken.
            // These rows are frozen: a change in MotoPress is recorded as a
            // NEW version beside the old one, never written over it.
            // The tax inside a direct booking's total, frozen beside the
            // Original rather than inside it. MotoPress states it in the
            // price breakdown; room revenue excludes it. It is kept in its
            // own table so adding it re-versions no Original — a snapshot
            // that reported 428 bookings as "changed" would be saying
            // MotoPress changed when only the ledger did.
            'booking_taxes' => [
                'columns' => [
                    'id'              => 'bigint(20) unsigned NOT NULL AUTO_INCREMENT',
                    'mphb_booking_id' => 'bigint(20) unsigned NOT NULL',
                    'version'         => 'smallint(5) NOT NULL DEFAULT 1',
                    'is_current'      => 'tinyint(1) NOT NULL DEFAULT 1',
                    'total_cents'     => 'bigint(20) DEFAULT NULL',
                    'tax_cents'       => 'bigint(20) NOT NULL DEFAULT 0',
                    'is_known'        => 'tinyint(1) NOT NULL DEFAULT 0',
                    'has_tax_line'    => 'tinyint(1) NOT NULL DEFAULT 0',
                    'reason'          => 'varchar(64) NOT NULL',
                    'content_hash'    => 'char(40) NOT NULL',
                    'source_batch'    => 'bigint(20) unsigned DEFAULT NULL',
                    'captured_at'     => 'datetime NOT NULL',
                    'superseded_at'   => 'datetime DEFAULT NULL',
                ],
                'primary' => 'id',
                'keys'    => [
                    'UNIQUE KEY tax_version (mphb_booking_id,content_hash)',
                    'KEY tax_current (mphb_booking_id,is_current)',
                    'KEY tax_batch (source_batch)',
                ],
            ],

            'originals' => [
                'columns' => [
                    'id'              => 'bigint(20) unsigned NOT NULL AUTO_INCREMENT',
                    'kind'            => 'varchar(16) NOT NULL',
                    'mphb_id'         => 'bigint(20) unsigned NOT NULL',
                    'mphb_booking_id' => 'bigint(20) unsigned DEFAULT NULL',
                    'version'         => 'smallint(5) NOT NULL DEFAULT 1',
                    'is_current'      => 'tinyint(1) NOT NULL DEFAULT 1',
                    'channel'         => "varchar(20) NOT NULL DEFAULT 'direct'",
                    'cottage'         => 'varchar(8) DEFAULT NULL',
                    'check_in'        => 'date DEFAULT NULL',
                    'check_out'       => 'date DEFAULT NULL',
                    'booking_status'  => 'varchar(32) DEFAULT NULL',
                    'payment_status'  => 'varchar(32) DEFAULT NULL',
                    'total'           => 'decimal(12,2) DEFAULT NULL',
                    'total_cents'     => 'bigint(20) DEFAULT NULL',
                    'amount'          => 'decimal(12,2) DEFAULT NULL',
                    'amount_cents'    => 'bigint(20) DEFAULT NULL',
                    'event_date'      => 'date DEFAULT NULL',
                    'codes'           => 'longtext DEFAULT NULL',
                    'guest_keys'      => 'longtext DEFAULT NULL',
                    'content_hash'    => 'char(40) NOT NULL',
                    'source_batch'    => 'bigint(20) unsigned DEFAULT NULL',
                    'captured_at'     => 'datetime NOT NULL',
                    'superseded_at'   => 'datetime DEFAULT NULL',
                ],
                'primary' => 'id',
                'keys'    => [
                    'UNIQUE KEY original_version (kind,mphb_id,content_hash)',
                    'KEY original_current (kind,is_current)',
                    'KEY original_booking (mphb_booking_id)',
                    'KEY original_cottage_checkin (cottage,check_in)',
                    'KEY original_batch (source_batch)',
                ],
            ],

            // Corrections, each one labelled and sitting ON TOP of an
            // Original. Nothing here ever edits an Original, and a refresh
            // never touches one of these.
            'adjustments' => [
                'columns' => [
                    'id'              => 'bigint(20) unsigned NOT NULL AUTO_INCREMENT',
                    'type'            => 'varchar(32) NOT NULL',
                    'channel'         => "varchar(20) NOT NULL DEFAULT 'direct'",
                    'mphb_booking_id' => 'bigint(20) unsigned DEFAULT NULL',
                    'stay_id'         => 'bigint(20) unsigned DEFAULT NULL',
                    'cottage'         => 'varchar(8) DEFAULT NULL',
                    'amount'          => 'decimal(12,2) NOT NULL DEFAULT 0.00',
                    'amount_cents'    => 'bigint(20) NOT NULL DEFAULT 0',
                    'event_date'      => 'date DEFAULT NULL',
                    'label'           => 'varchar(190) NOT NULL',
                    'note'            => 'text DEFAULT NULL',
                    'hash'            => 'char(40) NOT NULL',
                    'source_batch'    => 'bigint(20) unsigned DEFAULT NULL',
                    'created_at'      => 'datetime NOT NULL',
                    'created_by'      => 'bigint(20) unsigned DEFAULT NULL',
                ],
                'primary' => 'id',
                'keys'    => [
                    'UNIQUE KEY adjustment_hash (hash)',
                    'KEY adjustment_booking (mphb_booking_id)',
                    'KEY adjustment_type (type)',
                    'KEY adjustment_event_date (event_date)',
                    'KEY adjustment_batch (source_batch)',
                ],
            ],
        ];
    }

    /**
     * The columns each table must have, for the health check and the upgrade
     * test. Read from the same definitions the tables are built from, so the
     * two can never drift.
     *
     * @return array<string,array<int,string>>
     */
    public static function expected_columns(): array
    {
        $out = [];
        foreach (self::definitions() as $name => $definition) {
            $out[$name] = array_keys($definition['columns']);
        }
        return $out;
    }

    /**
     * The CREATE TABLE statement for one table. No comments: see the class
     * comment for why that matters.
     */
    public static function create_statement(string $name): string
    {
        global $wpdb;

        $definition = self::definitions()[$name] ?? null;
        if ($definition === null) {
            return '';
        }

        $lines = [];
        foreach ($definition['columns'] as $column => $type) {
            $lines[] = $column . ' ' . $type;
        }
        $lines[] = 'PRIMARY KEY  (' . $definition['primary'] . ')';
        foreach ($definition['keys'] as $key) {
            $lines[] = $key;
        }

        return sprintf(
            "CREATE TABLE %s (\n\t%s\n) %s;",
            self::table($name),
            implode(",\n\t", $lines),
            $wpdb->get_charset_collate()
        );
    }

    public static function on_activate(): void
    {
        self::install();
    }

    /**
     * Runs on activation, and on admin_init when the stored DB version is
     * behind.
     */
    public static function maybe_upgrade(): void
    {
        if (get_option(self::VERSION_OPTION) === self::DB_VERSION) {
            return;
        }
        self::install();
    }

    public static function install(): void
    {
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        foreach (self::table_names() as $name) {
            dbDelta(self::create_statement($name));
        }

        update_option(self::VERSION_OPTION, self::DB_VERSION, false);
    }

    /**
     * Only ever called from uninstall.php, and only when the admin ticked
     * "Delete all ledger data". This is years of history.
     */
    public static function drop_all(): void
    {
        global $wpdb;
        foreach (['reviews', 'adjustments', 'originals', 'links', 'lines', 'stays', 'batches'] as $name) {
            $table = self::table($name);
            // Table names cannot be parameterised; they are built from $wpdb->prefix.
            $wpdb->query("DROP TABLE IF EXISTS {$table}");
        }
        delete_option(self::VERSION_OPTION);
    }
}
