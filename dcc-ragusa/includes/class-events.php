<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/** The event log: a ring buffer of the last 2,000 entries. */
final class Events
{
    public const RING = 2000;

    public const BREACHED   = 'breached';
    public const NEEDS_LOOK = 'needs-look';
    public const INFO       = 'info';

    public static function fingerprint(string $fortress, string $kind, string $target): string
    {
        return sha1($fortress . '|' . $kind . '|' . $target);
    }

    public static function record(string $fortress, string $severity, string $kind, string $target, string $message, array $data = [], ?int $journal_id = null): int
    {
        global $wpdb;
        $message = Text::scrub($message);
        $json    = (string) wp_json_encode(self::scrub_data($data));
        if (strlen($json) > 4000) {
            $json = (string) wp_json_encode(['truncated' => true]);
        }
        $ok = $wpdb->insert(Schema::events(), [
            'ts'          => time(),
            'fortress'    => substr($fortress, 0, 20),
            'severity'    => substr($severity, 0, 12),
            'kind'        => substr($kind, 0, 40),
            'target'      => substr($target, 0, 255),
            'fingerprint' => self::fingerprint($fortress, $kind, $target),
            'message'     => $message,
            'data'        => $json,
            'journal_id'  => $journal_id,
        ], ['%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%d']);
        $id = $ok ? (int) $wpdb->insert_id : 0;
        self::trim();
        return $id;
    }

    private static function scrub_data(array $data): array
    {
        foreach ($data as $k => $v) {
            if (is_string($v)) {
                $data[$k] = Text::scrub($v);
            } elseif (is_array($v)) {
                $data[$k] = self::scrub_data($v);
            }
        }
        return $data;
    }

    private static function trim(): void
    {
        global $wpdb;
        $table = Schema::events();
        $count = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$table}");
        if ($count <= self::RING) {
            return;
        }
        $cut = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM {$table} ORDER BY id DESC LIMIT 1 OFFSET %d",
            self::RING - 1
        ));
        if ($cut > 0) {
            $wpdb->query($wpdb->prepare("DELETE FROM {$table} WHERE id < %d", $cut));
        }
    }

    /** @return array<int,array<string,mixed>> newest first */
    public static function recent(int $limit = 20, int $offset = 0): array
    {
        global $wpdb;
        $table = Schema::events();
        $rows  = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$table} ORDER BY id DESC LIMIT %d OFFSET %d",
            $limit,
            $offset
        ), ARRAY_A) ?: [];
        foreach ($rows as &$row) {
            $row['data'] = json_decode((string) $row['data'], true) ?: [];
        }
        return $rows;
    }

    public static function count(): int
    {
        global $wpdb;
        $table = Schema::events();
        return (int) $wpdb->get_var("SELECT COUNT(*) FROM {$table}");
    }

    public static function count_since(string $fortress, int $since, ?string $severity = null): int
    {
        global $wpdb;
        $table = Schema::events();
        if ($severity === null) {
            return (int) $wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM {$table} WHERE fortress = %s AND ts >= %d",
                $fortress,
                $since
            ));
        }
        return (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$table} WHERE fortress = %s AND ts >= %d AND severity = %s",
            $fortress,
            $since,
            $severity
        ));
    }
}
