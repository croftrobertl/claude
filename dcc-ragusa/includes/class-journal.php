<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The write-ahead journal: every autonomous action is a row that moves
 * Planned → Before-State Recorded → Acting → Verifying → Committed, or
 * Reversed. Each state is written BEFORE the step it describes. A run that
 * dies leaves a row the next run finishes or reverses (Actions::recover).
 */
final class Journal
{
    public const RING = 500;

    public const PLANNED   = 'planned';
    public const BEFORE    = 'before-recorded';
    public const ACTING    = 'acting';
    public const VERIFYING = 'verifying';
    public const COMMITTED = 'committed';
    public const REVERSED  = 'reversed';
    public const ABANDONED = 'abandoned';
    public const FAILED    = 'failed';

    public const TERMINAL = [self::COMMITTED, self::REVERSED, self::ABANDONED, self::FAILED];

    private static ?string $token = null;

    public static function run_token(): string
    {
        if (self::$token === null) {
            self::$token = substr(bin2hex(random_bytes(8)), 0, 16);
        }
        return self::$token;
    }

    public static function create(string $action, string $target, array $before = [], string $note = '', bool $reversible = true): int
    {
        global $wpdb;
        $now = time();
        $wpdb->insert(Schema::journal(), [
            'action'      => substr($action, 0, 24),
            'target'      => substr($target, 0, 255),
            'state'       => self::PLANNED,
            'run_token'   => self::run_token(),
            'created_at'  => $now,
            'updated_at'  => $now,
            'before_json' => (string) wp_json_encode($before),
            'after_json'  => '[]',
            'verify_json' => '[]',
            'reversible'  => $reversible ? 1 : 0,
            'reversed_by' => null,
            'note'        => Text::scrub($note),
        ], ['%s', '%s', '%s', '%s', '%d', '%d', '%s', '%s', '%s', '%d', '%d', '%s']);
        $id = (int) $wpdb->insert_id;
        self::trim();
        return $id;
    }

    /**
     * Move a row to a state, merging data into before/after/verify.
     *
     * @param array{before?:array,after?:array,verify?:array,note?:string,reversible?:bool,reversed_by?:int} $patch
     */
    public static function set_state(int $id, string $state, array $patch = []): void
    {
        global $wpdb;
        $row = self::get($id);
        if ($row === null) {
            return;
        }
        $fields = [
            'state'      => $state,
            'updated_at' => time(),
            'run_token'  => self::run_token(),
        ];
        $formats = ['%s', '%d', '%s'];
        foreach (['before', 'after', 'verify'] as $part) {
            if (isset($patch[$part]) && is_array($patch[$part])) {
                $fields[$part . '_json'] = (string) wp_json_encode(array_merge($row[$part], $patch[$part]));
                $formats[]               = '%s';
            }
        }
        if (isset($patch['note'])) {
            $fields['note'] = Text::scrub((string) $patch['note']);
            $formats[]      = '%s';
        }
        if (isset($patch['reversible'])) {
            $fields['reversible'] = $patch['reversible'] ? 1 : 0;
            $formats[]            = '%d';
        }
        if (isset($patch['reversed_by'])) {
            $fields['reversed_by'] = (int) $patch['reversed_by'];
            $formats[]             = '%d';
        }
        $wpdb->update(Schema::journal(), $fields, ['id' => $id], $formats, ['%d']);
    }

    public static function get(int $id): ?array
    {
        global $wpdb;
        $table = Schema::journal();
        $row   = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE id = %d", $id), ARRAY_A);
        return is_array($row) ? self::hydrate($row) : null;
    }

    private static function hydrate(array $row): array
    {
        $row['id']          = (int) $row['id'];
        $row['created_at']  = (int) $row['created_at'];
        $row['updated_at']  = (int) $row['updated_at'];
        $row['reversible']  = (bool) $row['reversible'];
        $row['reversed_by'] = $row['reversed_by'] === null ? null : (int) $row['reversed_by'];
        $row['before']      = json_decode((string) $row['before_json'], true) ?: [];
        $row['after']       = json_decode((string) $row['after_json'], true) ?: [];
        $row['verify']      = json_decode((string) $row['verify_json'], true) ?: [];
        unset($row['before_json'], $row['after_json'], $row['verify_json']);
        return $row;
    }

    /** Rows not in a terminal state, older than $older_than seconds, not this run's. */
    public static function unfinished(int $older_than = 120): array
    {
        global $wpdb;
        $table = Schema::journal();
        $rows  = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$table} WHERE state NOT IN ('committed','reversed','abandoned','failed') AND updated_at < %d AND run_token <> %s ORDER BY id ASC LIMIT 20",
            time() - $older_than,
            self::run_token()
        ), ARRAY_A) ?: [];
        return array_map([self::class, 'hydrate'], $rows);
    }

    /** @return array<int,array<string,mixed>> newest first */
    public static function recent(int $limit = 20, ?string $state = null, ?string $action = null): array
    {
        global $wpdb;
        $table = Schema::journal();
        $where = '1=1';
        $args  = [];
        if ($state !== null) {
            $where .= ' AND state = %s';
            $args[] = $state;
        }
        if ($action !== null) {
            $where .= ' AND action = %s';
            $args[] = $action;
        }
        $args[] = $limit;
        $rows   = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$table} WHERE {$where} ORDER BY id DESC LIMIT %d", ...$args), ARRAY_A) ?: [];
        return array_map([self::class, 'hydrate'], $rows);
    }

    /** The newest row for an action and target, any state. */
    public static function latest(string $action, string $target): ?array
    {
        global $wpdb;
        $table = Schema::journal();
        $row   = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$table} WHERE action = %s AND target = %s ORDER BY id DESC LIMIT 1",
            $action,
            $target
        ), ARRAY_A);
        return is_array($row) ? self::hydrate($row) : null;
    }

    public static function count_since(string $action, string $target, int $since, array $states = []): int
    {
        global $wpdb;
        $table = Schema::journal();
        $sql   = "SELECT COUNT(*) FROM {$table} WHERE action = %s AND target = %s AND created_at >= %d";
        $args  = [$action, $target, $since];
        if ($states !== []) {
            $sql .= ' AND state IN (' . implode(',', array_fill(0, count($states), '%s')) . ')';
            $args = array_merge($args, $states);
        }
        return (int) $wpdb->get_var($wpdb->prepare($sql, ...$args));
    }

    private static function trim(): void
    {
        global $wpdb;
        $table = Schema::journal();
        $count = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$table}");
        if ($count <= self::RING) {
            return;
        }
        // Only terminal rows are ever trimmed, oldest first.
        $ids = $wpdb->get_col($wpdb->prepare(
            "SELECT id FROM {$table} WHERE state IN ('committed','reversed','abandoned','failed') ORDER BY id ASC LIMIT %d",
            $count - self::RING
        )) ?: [];
        if ($ids !== []) {
            $list = implode(',', array_map('intval', $ids));
            $wpdb->query("DELETE FROM {$table} WHERE id IN ({$list})");
        }
    }

    public static function state_label(string $state): string
    {
        return match ($state) {
            self::PLANNED   => __('Planned', 'dcc-ragusa'),
            self::BEFORE    => __('Before-State Recorded', 'dcc-ragusa'),
            self::ACTING    => __('Acting', 'dcc-ragusa'),
            self::VERIFYING => __('Verifying', 'dcc-ragusa'),
            self::COMMITTED => __('Committed', 'dcc-ragusa'),
            self::REVERSED  => __('Reversed', 'dcc-ragusa'),
            self::ABANDONED => __('Abandoned', 'dcc-ragusa'),
            self::FAILED    => __('Failed', 'dcc-ragusa'),
            default         => $state,
        };
    }
}
