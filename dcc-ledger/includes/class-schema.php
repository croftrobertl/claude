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
    public const DB_VERSION     = '2';
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

    public static function originals(): string
    {
        return self::table('originals');
    }

    public static function adjustments(): string
    {
        return self::table('adjustments');
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

        // The ledger's own copy of what MotoPress held when it was taken.
        // These rows are frozen: a change in MotoPress is recorded as a NEW
        // version beside the old one, never written over it. Rob's original
        // stays intact whatever the ledger goes on to say.
        $originals = self::originals();
        $sql[] = "CREATE TABLE {$originals} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            kind varchar(16) NOT NULL,
            mphb_id bigint(20) unsigned NOT NULL,
            mphb_booking_id bigint(20) unsigned DEFAULT NULL,
            version smallint(5) NOT NULL DEFAULT 1,
            is_current tinyint(1) NOT NULL DEFAULT 1,
            channel varchar(20) NOT NULL DEFAULT 'direct',
            cottage varchar(8) DEFAULT NULL,
            check_in date DEFAULT NULL,
            check_out date DEFAULT NULL,
            booking_status varchar(32) DEFAULT NULL,
            payment_status varchar(32) DEFAULT NULL,
            total decimal(12,2) DEFAULT NULL,
            amount decimal(12,2) DEFAULT NULL,
            event_date date DEFAULT NULL,
            codes longtext DEFAULT NULL,
            content_hash char(40) NOT NULL,
            source_batch bigint(20) unsigned DEFAULT NULL,
            captured_at datetime NOT NULL,
            superseded_at datetime DEFAULT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY original_version (kind,mphb_id,content_hash),
            KEY original_current (kind,is_current),
            KEY original_booking (mphb_booking_id),
            KEY original_cottage_checkin (cottage,check_in),
            KEY original_batch (source_batch)
        ) {$charset};";

        // Corrections, each one labelled and sitting ON TOP of an Original.
        // Nothing here ever edits an Original, and a refresh never touches one
        // of these.
        $adjustments = self::adjustments();
        $sql[] = "CREATE TABLE {$adjustments} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            type varchar(32) NOT NULL,
            channel varchar(20) NOT NULL DEFAULT 'direct',
            mphb_booking_id bigint(20) unsigned DEFAULT NULL,
            stay_id bigint(20) unsigned DEFAULT NULL,
            cottage varchar(8) DEFAULT NULL,
            amount decimal(12,2) NOT NULL DEFAULT 0.00,
            event_date date DEFAULT NULL,
            label varchar(190) NOT NULL,
            note text DEFAULT NULL,
            hash char(40) NOT NULL,
            source_batch bigint(20) unsigned DEFAULT NULL,
            created_at datetime NOT NULL,
            created_by bigint(20) unsigned DEFAULT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY adjustment_hash (hash),
            KEY adjustment_booking (mphb_booking_id),
            KEY adjustment_type (type),
            KEY adjustment_event_date (event_date),
            KEY adjustment_batch (source_batch)
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
        foreach (['reviews', 'adjustments', 'originals', 'links', 'lines', 'stays', 'batches'] as $name) {
            $table = self::table($name);
            // Table names cannot be parameterised; they are built from $wpdb->prefix.
            $wpdb->query("DROP TABLE IF EXISTS {$table}");
        }
        delete_option(self::VERSION_OPTION);
    }
}
