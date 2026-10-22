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

    public const TAG_DRILL     = 'drill';
    public const TAG_WITHDRAWN = 'withdrawn';

    public static function record(string $fortress, string $severity, string $kind, string $target, string $message, array $data = [], ?int $journal_id = null, ?string $tag = null): int
    {
        global $wpdb;
        $tag     = $tag ?? Drill::tag();
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
            'tag'         => substr($tag, 0, 16),
        ], ['%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%s']);
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

    /**
     * Newest first. For the page, practice events older than a day are
     * left out (they stay in the table).
     *
     * @return array<int,array<string,mixed>>
     */
    public static function recent(int $limit = 20, int $offset = 0, bool $for_page = false): array
    {
        global $wpdb;
        $table = Schema::events();
        $where = $for_page ? $wpdb->prepare("WHERE NOT (tag = %s AND ts < %d)", self::TAG_DRILL, time() - 86400) : '';
        $rows  = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$table} {$where} ORDER BY id DESC LIMIT %d OFFSET %d",
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

    /** Practice and withdrawn events never count. */
    public static function count_since(string $fortress, int $since, ?string $severity = null): int
    {
        global $wpdb;
        $table = Schema::events();
        if ($severity === null) {
            return (int) $wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM {$table} WHERE fortress = %s AND ts >= %d AND tag = ''",
                $fortress,
                $since
            ));
        }
        return (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$table} WHERE fortress = %s AND ts >= %d AND severity = %s AND tag = ''",
            $fortress,
            $since,
            $severity
        ));
    }

    /** Tag every event of these fingerprints (withdrawn, or practice re-tagged on upgrade). */
    public static function tag_fingerprints(array $fingerprints, string $tag): int
    {
        global $wpdb;
        $fps = array_values(array_filter(array_map('strval', $fingerprints), static fn($f) => preg_match('/^[a-f0-9]{40}$/', $f) === 1));
        if ($fps === []) {
            return 0;
        }
        $table = Schema::events();
        $list  = "'" . implode("','", $fps) . "'";
        return (int) $wpdb->query($wpdb->prepare("UPDATE {$table} SET tag = %s WHERE fingerprint IN ({$list})", $tag));
    }

    public static function tag_rows(array $ids, string $tag): int
    {
        global $wpdb;
        $ids = array_values(array_filter(array_map('intval', $ids), static fn($i) => $i > 0));
        if ($ids === []) {
            return 0;
        }
        $table = Schema::events();
        return (int) $wpdb->query($wpdb->prepare("UPDATE {$table} SET tag = %s WHERE id IN (" . implode(',', $ids) . ')', $tag));
    }

    public static function tag_where_target_like(string $needle, string $tag): int
    {
        global $wpdb;
        $table = Schema::events();
        return (int) $wpdb->query($wpdb->prepare("UPDATE {$table} SET tag = %s WHERE target LIKE %s AND tag = ''", $tag, '%' . $wpdb->esc_like($needle) . '%'));
    }

    public static function ids_for_journal(array $journal_ids): array
    {
        global $wpdb;
        $ids = array_values(array_filter(array_map('intval', $journal_ids), static fn($i) => $i > 0));
        if ($ids === []) {
            return [];
        }
        $table = Schema::events();
        return array_map('intval', $wpdb->get_col("SELECT id FROM {$table} WHERE journal_id IN (" . implode(',', $ids) . ')') ?: []);
    }
}
