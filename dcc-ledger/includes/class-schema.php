<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Custom tables. Created with dbDelta on activation and on version upgrade only —
 * never on a normal page load.
 */
final class Schema
{
    public const DB_VERSION     = '1';
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

    public static function on_activate(): void
    {
        self::install();
    }

    /**
     * Runs on activation, and on admin_init when the stored DB version is behind.
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
        global $wpdb;

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $charset = $wpdb->get_charset_collate();
        $stays   = self::stays();
        $lines   = self::lines();
        $links   = self::links();
        $batches = self::batches();
        $reviews = self::reviews();

        // One row per channel reservation. `channel` is wide enough for a later
        // 'direct' or 'clover' value; `meta` carries parser extras as JSON so a
        // phase-2 importer needs no migration.
        $sql = [];

        $sql[] = "CREATE TABLE {$stays} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            channel varchar(20) NOT NULL,
            code varchar(64) NOT NULL,
            cottage varchar(8) NOT NULL,
            check_in date DEFAULT NULL,
            check_out date DEFAULT NULL,
            nights smallint(5) DEFAULT NULL,
            booked_on datetime DEFAULT NULL,
            status varchar(12) NOT NULL DEFAULT 'ok',
            persons smallint(5) DEFAULT NULL,
            source_batch bigint(20) unsigned DEFAULT NULL,
            meta longtext DEFAULT NULL,
            created_at datetime NOT NULL,
            updated_at datetime NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY channel_code (channel,code),
            KEY cottage_checkin (cottage,check_in),
            KEY stay_status (status),
            KEY stay_batch (source_batch)
        ) {$charset};";

        $sql[] = "CREATE TABLE {$lines} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            stay_id bigint(20) unsigned DEFAULT NULL,
            channel varchar(20) NOT NULL,
            type varchar(32) NOT NULL,
            amount decimal(12,2) NOT NULL DEFAULT 0.00,
            event_date date DEFAULT NULL,
            payout_ref varchar(64) DEFAULT NULL,
            ref_code varchar(64) DEFAULT NULL,
            source_batch bigint(20) unsigned DEFAULT NULL,
            meta longtext DEFAULT NULL,
            hash char(40) NOT NULL,
            created_at datetime NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY line_hash (hash),
            KEY line_stay (stay_id),
            KEY line_event_date (event_date),
            KEY line_type (type),
            KEY line_channel_type (channel,type),
            KEY line_batch (source_batch)
        ) {$charset};";

        $sql[] = "CREATE TABLE {$links} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            stay_id bigint(20) unsigned NOT NULL,
            mphb_booking_id bigint(20) unsigned NOT NULL,
            method varchar(10) NOT NULL,
            linked_at datetime NOT NULL,
            linked_by bigint(20) unsigned DEFAULT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY stay_booking (stay_id,mphb_booking_id),
            KEY link_stay (stay_id),
            KEY link_booking (mphb_booking_id),
            KEY link_method (method)
        ) {$charset};";

        $sql[] = "CREATE TABLE {$batches} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            kind varchar(40) NOT NULL,
            label varchar(190) NOT NULL,
            rows_read int(11) NOT NULL DEFAULT 0,
            rows_inserted int(11) NOT NULL DEFAULT 0,
            rows_unchanged int(11) NOT NULL DEFAULT 0,
            rows_skipped int(11) NOT NULL DEFAULT 0,
            rows_excluded int(11) NOT NULL DEFAULT 0,
            user_id bigint(20) unsigned DEFAULT NULL,
            undo_data longtext DEFAULT NULL,
            created_at datetime NOT NULL,
            PRIMARY KEY  (id),
            KEY batch_kind (kind)
        ) {$charset};";

        // Cleanup items are computed on the fly; only the admin's "Reviewed"
        // marks are stored, keyed by the item's stable key.
        $sql[] = "CREATE TABLE {$reviews} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            issue_key varchar(190) NOT NULL,
            note text DEFAULT NULL,
            reviewed_at datetime NOT NULL,
            reviewed_by bigint(20) unsigned DEFAULT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY issue_key (issue_key)
        ) {$charset};";

        foreach ($sql as $statement) {
            dbDelta($statement);
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
        foreach (['reviews', 'links', 'lines', 'stays', 'batches'] as $name) {
            $table = self::table($name);
            // Table names cannot be parameterised; they are built from $wpdb->prefix.
            $wpdb->query("DROP TABLE IF EXISTS {$table}");
        }
        delete_option(self::VERSION_OPTION);
    }
}
