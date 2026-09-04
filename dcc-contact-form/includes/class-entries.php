<?php
namespace DCC_Contact;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Custom-table storage for submissions. GDPR posture matches the site's
 * WPForms config: NO IP address, NO user-agent, NO UUID, NO cookies stored.
 */
final class Entries
{
    /**
     * Values stored in the spam_result column. Spam rows use a "spam:<layer>"
     * prefix; these two are the non-spam states.
     */
    public const STATUS_OK = 'ham';
    public const STATUS_MAIL_FAILED = 'ham:mail-failed';

    /** Bumped when the schema changes; drives dbDelta on upgrades. */
    private const DB_VERSION = '1';
    private const DB_VERSION_OPTION = 'dcc_contact_db_version';

    public static function table(): string
    {
        global $wpdb;
        return $wpdb->prefix . 'dcc_contact_entries';
    }

    public static function on_activate(): void
    {
        self::maybe_install();
    }

    /** Create/upgrade the table. Safe to call repeatedly (dbDelta is idempotent). */
    public static function maybe_install(): void
    {
        if (get_option(self::DB_VERSION_OPTION) === self::DB_VERSION) {
            return;
        }

        global $wpdb;
        $table   = self::table();
        $charset = $wpdb->get_charset_collate();

        $sql = "CREATE TABLE {$table} (
            id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            created_at DATETIME NOT NULL,
            form_id VARCHAR(64) NOT NULL DEFAULT '',
            subject VARCHAR(255) NOT NULL DEFAULT '',
            fields LONGTEXT NOT NULL,
            spam_result VARCHAR(40) NOT NULL DEFAULT 'ham',
            PRIMARY KEY  (id),
            KEY created_at (created_at),
            KEY spam_result (spam_result)
        ) {$charset};";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta($sql);

        update_option(self::DB_VERSION_OPTION, self::DB_VERSION, false);
    }

    /**
     * Insert an entry.
     *
     * @param array<int,array{label:string,value:string}> $fields Ordered field rows.
     */
    public static function insert(array $fields, string $subject, string $form_id, string $spam_result): int
    {
        global $wpdb;
        self::maybe_install();

        $ok = $wpdb->insert(
            self::table(),
            [
                'created_at'  => current_time('mysql'),
                'form_id'     => substr($form_id, 0, 64),
                'subject'     => substr($subject, 0, 255),
                'fields'      => wp_json_encode(array_values($fields)),
                'spam_result' => substr($spam_result, 0, 40),
            ],
            ['%s', '%s', '%s', '%s', '%s']
        );

        return $ok ? (int) $wpdb->insert_id : 0;
    }

    /** @return array<int,object> Rows, newest first. */
    public static function get_page(int $per_page, int $offset): array
    {
        global $wpdb;
        $table = self::table();
        // $per_page/$offset are ints; table name is a trusted constant.
        return (array) $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$table} ORDER BY id DESC LIMIT %d OFFSET %d",
                max(1, $per_page),
                max(0, $offset)
            )
        );
    }

    public static function count(): int
    {
        global $wpdb;
        $table = self::table();
        return (int) $wpdb->get_var("SELECT COUNT(*) FROM {$table}");
    }

    public static function get(int $id): ?object
    {
        global $wpdb;
        $table = self::table();
        $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE id = %d", $id));
        return $row ?: null;
    }

    /** Update an existing entry's status (e.g. to flag a failed notification). */
    public static function set_status(int $id, string $status): bool
    {
        global $wpdb;
        return (bool) $wpdb->update(
            self::table(),
            ['spam_result' => substr($status, 0, 40)],
            ['id' => $id],
            ['%s'],
            ['%d']
        );
    }

    public static function delete(int $id): bool
    {
        global $wpdb;
        return (bool) $wpdb->delete(self::table(), ['id' => $id], ['%d']);
    }

    /** @param int[] $ids */
    public static function delete_many(array $ids): int
    {
        $ids = array_values(array_filter(array_map('intval', $ids)));
        if (empty($ids)) {
            return 0;
        }
        global $wpdb;
        $table = self::table();
        $placeholders = implode(',', array_fill(0, count($ids), '%d'));
        return (int) $wpdb->query(
            $wpdb->prepare("DELETE FROM {$table} WHERE id IN ({$placeholders})", $ids)
        );
    }

    /** Decode the stored fields JSON into an ordered array of rows. */
    public static function decode_fields($json): array
    {
        $data = json_decode((string) $json, true);
        if (!is_array($data)) {
            return [];
        }
        $out = [];
        foreach ($data as $row) {
            if (is_array($row) && isset($row['label'], $row['value'])) {
                $out[] = [
                    'label' => (string) $row['label'],
                    'value' => (string) $row['value'],
                ];
            }
        }
        return $out;
    }
}
