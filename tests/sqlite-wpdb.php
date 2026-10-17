<?php
/**
 * A $wpdb THAT RUNS THE PLUGIN'S REAL SQL (0.47.3).
 *
 * The other harnesses answer queries with canned rows, which can only ever
 * check what they were told. The availability rules — whose blocks close a
 * night, which rooms a room-0 block covers — live IN the SQL, so this runs
 * that SQL against a real database: SQLite in memory (PDO), the only engine
 * this container has. MySQL-only syntax the plugin uses is translated, and
 * nothing else:
 *   CAST(x AS UNSIGNED)      -> CAST(x AS INTEGER)
 *   SHOW TABLES LIKE '<n>'   -> a sqlite_master lookup of <n> (LIKE escapes
 *                               undone, as MySQL would match it)
 * prepare() is as strict as the canned stub's: a placeholder/argument count
 * mismatch throws. Any statement can be made to fail like a real wpdb does —
 * last_error set, an empty result, never an exception — with fail_on (a
 * regex matched against the SQL). Every statement is logged in $log.
 */
final class T_SQLite_WPDB
{
    public $prefix   = 'portal_';
    public $posts    = 'portal_posts';
    public $postmeta = 'portal_postmeta';
    public $options  = 'portal_options';
    public $last_error = '';
    /** @var string|null regex: statements matching it fail */
    public $fail_on = null;
    /** @var string[] */
    public $log = [];
    public PDO $pdo;

    public function __construct()
    {
        $this->pdo = new PDO('sqlite::memory:');
        $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->pdo->exec("CREATE TABLE portal_posts (ID INTEGER PRIMARY KEY, post_type TEXT, post_status TEXT, post_parent INTEGER DEFAULT 0, post_title TEXT DEFAULT '', post_date TEXT DEFAULT '', post_password TEXT DEFAULT '')");
        $this->pdo->exec("CREATE TABLE portal_postmeta (meta_id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER, meta_key TEXT, meta_value TEXT)");
        $this->pdo->exec("CREATE TABLE portal_options (option_id INTEGER PRIMARY KEY AUTOINCREMENT, option_name TEXT UNIQUE, option_value TEXT, autoload TEXT)");
    }

    /** MotoPress 6.0.0+'s own blocks table, column for column (BlocksRepository::createTable). */
    public function create_blocks_table(): void
    {
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS portal_mphb_blocks (block_id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_type_id INTEGER NOT NULL, room_id INTEGER NOT NULL, date_from DATE NOT NULL, date_to DATE NOT NULL,
            not_check_in INTEGER NOT NULL DEFAULT 0, not_check_out INTEGER NOT NULL DEFAULT 0, not_stay_in INTEGER NOT NULL DEFAULT 0,
            comment TEXT NOT NULL DEFAULT '')");
    }
    public function drop_blocks_table(): void { $this->pdo->exec('DROP TABLE IF EXISTS portal_mphb_blocks'); }
    public function block(int $type, int $room, string $from, string $to, int $stay = 1, int $in = 0, int $out = 0): void
    {
        $st = $this->pdo->prepare('INSERT INTO portal_mphb_blocks (room_type_id, room_id, date_from, date_to, not_check_in, not_check_out, not_stay_in) VALUES (?,?,?,?,?,?,?)');
        $st->execute([$type, $room, $from, $to, $in, $out, $stay]);
    }
    public function clear_blocks(): void { $this->pdo->exec('DELETE FROM portal_mphb_blocks'); }

    public function post(int $id, string $type, string $status = 'publish', int $parent = 0, array $meta = []): void
    {
        $this->pdo->prepare('INSERT INTO portal_posts (ID, post_type, post_status, post_parent) VALUES (?,?,?,?)')->execute([$id, $type, $status, $parent]);
        foreach ($meta as $k => $v) {
            $this->pdo->prepare('INSERT INTO portal_postmeta (post_id, meta_key, meta_value) VALUES (?,?,?)')->execute([$id, $k, (string) $v]);
        }
    }

    public function prepare($sql, $args = null, ...$rest)
    {
        $args = is_array($args) ? $args : array_merge($args === null ? [] : [$args], $rest);
        $n = preg_match_all('/%[sdf]/', $sql);
        if ($n !== count($args)) {
            throw new \RuntimeException("wpdb::prepare placeholder/arg mismatch: $n vs " . count($args));
        }
        $i = 0;
        return preg_replace_callback('/%[sdf]/', function ($m) use (&$i, $args) {
            $v = $args[$i++];
            return $m[0] === '%s' ? $this->pdo->quote((string) $v) : (string) (0 + $v);
        }, $sql);
    }

    public function esc_like($t) { return addcslashes((string) $t, '_%\\'); }

    private function run(string $sql): ?array
    {
        $this->log[] = $sql;
        $this->last_error = '';
        if ($this->fail_on !== null && preg_match($this->fail_on, $sql)) {
            $this->last_error = 'simulated failure';
            return null;
        }
        if (preg_match("/^\\s*SHOW TABLES LIKE '(.*)'\\s*$/s", $sql, $m)) {
            $name = stripcslashes(str_replace(['\\_', '\\%'], ['_', '%'], $m[1]));
            $sql = 'SELECT name FROM sqlite_master WHERE type = \'table\' AND name = ' . $this->pdo->quote($name);
        }
        $sql = preg_replace('/CAST\(([^()]+?) AS UNSIGNED\)/i', 'CAST($1 AS INTEGER)', $sql);
        try {
            $st = $this->pdo->query($sql);
            return $st ? $st->fetchAll(PDO::FETCH_OBJ) : [];
        } catch (\PDOException $e) {
            $this->last_error = $e->getMessage();
            return null;
        }
    }

    public function get_results($sql, $out = null) { $r = $this->run((string) $sql); return $r ?? []; }
    public function get_var($sql)
    {
        $r = $this->run((string) $sql);
        if (!$r) { return null; }
        $row = (array) $r[0];
        return reset($row);
    }
    public function get_col($sql) { $r = $this->run((string) $sql) ?? []; return array_map(static fn($o) => reset($o), array_map('get_object_vars', $r)); }
    public function query($sql) { $r = $this->run((string) $sql); return $r === null ? false : count($r); }
}
