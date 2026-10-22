<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/** The two tables: the event ring buffer and the journal. */
final class Schema
{
    public const DB_VERSION = 2;
    public const OPTION     = 'dcc_ragusa_db_version';

    public static function events(): string
    {
        global $wpdb;
        return $wpdb->prefix . 'dcc_ragusa_events';
    }

    public static function journal(): string
    {
        global $wpdb;
        return $wpdb->prefix . 'dcc_ragusa_journal';
    }

    /** @return array<string,string> table name => CREATE statement (no comments inside: dbDelta reads line by line) */
    public static function definitions(): array
    {
        global $wpdb;
        $charset = $wpdb->get_charset_collate();
        return [
            self::events() => "CREATE TABLE " . self::events() . " (
id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
ts int(10) unsigned NOT NULL,
fortress varchar(20) NOT NULL,
severity varchar(12) NOT NULL,
kind varchar(40) NOT NULL,
target varchar(255) NOT NULL DEFAULT '',
fingerprint char(40) NOT NULL DEFAULT '',
message text NOT NULL,
data text NOT NULL,
journal_id bigint(20) unsigned NULL,
tag varchar(16) NOT NULL DEFAULT '',
PRIMARY KEY  (id),
KEY ts (ts),
KEY fingerprint (fingerprint)
) $charset;",
            self::journal() => "CREATE TABLE " . self::journal() . " (
id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
action varchar(24) NOT NULL,
target varchar(255) NOT NULL DEFAULT '',
state varchar(24) NOT NULL,
run_token char(16) NOT NULL DEFAULT '',
created_at int(10) unsigned NOT NULL,
updated_at int(10) unsigned NOT NULL,
before_json text NOT NULL,
after_json text NOT NULL,
verify_json text NOT NULL,
reversible tinyint(1) NOT NULL DEFAULT 0,
reversed_by bigint(20) unsigned NULL,
note text NOT NULL,
tag varchar(16) NOT NULL DEFAULT '',
PRIMARY KEY  (id),
KEY state (state),
KEY created_at (created_at)
) $charset;",
        ];
    }

    public static function ensure(): void
    {
        if ((int) get_option(self::OPTION, 0) === self::DB_VERSION && self::tables_exist()) {
            return;
        }
        if (!function_exists('dbDelta')) {
            require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        }
        foreach (self::definitions() as $sql) {
            dbDelta($sql);
        }
        if (get_option(self::OPTION, null) === null) {
            add_option(self::OPTION, self::DB_VERSION, '', 'no');
        } else {
            update_option(self::OPTION, self::DB_VERSION, 'no');
        }
    }

    public static function tables_exist(): bool
    {
        global $wpdb;
        foreach ([self::events(), self::journal()] as $table) {
            $found = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table));
            if ($found !== $table) {
                return false;
            }
        }
        return true;
    }

    public static function drop(): void
    {
        global $wpdb;
        foreach ([self::events(), self::journal()] as $table) {
            $wpdb->query("DROP TABLE IF EXISTS {$table}");
        }
        delete_option(self::OPTION);
    }
}
