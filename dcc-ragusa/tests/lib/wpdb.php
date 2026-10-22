<?php
/**
 * A $wpdb good enough to run Ragusa's real SQL, backed by SQLite in memory.
 * dbDelta is translated just enough for the two tables Ragusa creates.
 */
final class Test_WPDB
{
    public string $prefix = 'wpstg0_';
    public string $usermeta = 'wpstg0_usermeta';
    public int $insert_id = 0;
    public string $last_error = '';
    public array $queries = [];

    private \PDO $pdo;

    public function __construct(string $prefix = 'wpstg0_')
    {
        $this->prefix   = $prefix;
        $this->usermeta = $prefix . 'usermeta';
        $this->pdo      = new \PDO('sqlite::memory:');
        $this->pdo->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);
    }

    public function esc_like(string $s): string
    {
        return addcslashes($s, '_%\\');
    }

    public function get_charset_collate(): string
    {
        return 'DEFAULT CHARACTER SET utf8mb4';
    }

    public function prepare(string $sql, ...$args): string
    {
        if ($args === []) {
            return $sql;
        }
        if (count($args) === 1 && is_array($args[0])) {
            $args = $args[0];
        }
        $i = 0;
        return (string) preg_replace_callback('/%[sdfF]/', function ($m) use ($args, &$i) {
            $value = $args[$i] ?? '';
            $i++;
            if ($m[0] === '%d') {
                return (string) (int) $value;
            }
            if ($m[0] === '%f' || $m[0] === '%F') {
                return (string) (float) $value;
            }
            return $this->pdo->quote((string) $value);
        }, $sql);
    }

    private function translate(string $sql): string
    {
        if (preg_match('/^\s*SHOW TABLES LIKE (\'[^\']+\')/i', $sql, $m)) {
            return "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE {$m[1]}";
        }
        return $sql;
    }

    public function query(string $sql): int
    {
        $sql = $this->translate($sql);
        $this->queries[] = $sql;
        try {
            $st = $this->pdo->query($sql);
            return $st === false ? 0 : $st->rowCount();
        } catch (\PDOException $e) {
            $this->last_error = $e->getMessage() . ' — SQL: ' . $sql;
            throw $e;
        }
    }

    public function get_var(string $sql)
    {
        $sql = $this->translate($sql);
        $this->queries[] = $sql;
        $row = $this->pdo->query($sql)->fetch(\PDO::FETCH_NUM);
        return $row === false ? null : $row[0];
    }

    public function get_row(string $sql, string $output = 'OBJECT')
    {
        $sql = $this->translate($sql);
        $this->queries[] = $sql;
        $row = $this->pdo->query($sql)->fetch(\PDO::FETCH_ASSOC);
        if ($row === false) {
            return null;
        }
        return $output === 'ARRAY_A' ? $row : (object) $row;
    }

    public function get_results(string $sql, string $output = 'OBJECT'): array
    {
        $sql = $this->translate($sql);
        $this->queries[] = $sql;
        $rows = $this->pdo->query($sql)->fetchAll(\PDO::FETCH_ASSOC);
        return $output === 'ARRAY_A' ? $rows : array_map(static fn($r) => (object) $r, $rows);
    }

    public function get_col(string $sql): array
    {
        $sql = $this->translate($sql);
        $this->queries[] = $sql;
        return $this->pdo->query($sql)->fetchAll(\PDO::FETCH_COLUMN, 0);
    }

    public function insert(string $table, array $data, $format = null): int
    {
        $cols = array_keys($data);
        $sql  = sprintf('INSERT INTO %s (%s) VALUES (%s)', $table, implode(',', $cols), implode(',', array_map(fn($v) => $v === null ? 'NULL' : $this->pdo->quote((string) $v), array_values($data))));
        $this->queries[] = $sql;
        $this->pdo->exec($sql);
        $this->insert_id = (int) $this->pdo->lastInsertId();
        return 1;
    }

    public function update(string $table, array $data, array $where, $format = null, $where_format = null): int
    {
        $set = [];
        foreach ($data as $k => $v) {
            $set[] = $k . '=' . ($v === null ? 'NULL' : $this->pdo->quote((string) $v));
        }
        $cond = [];
        foreach ($where as $k => $v) {
            $cond[] = $k . '=' . $this->pdo->quote((string) $v);
        }
        $sql = sprintf('UPDATE %s SET %s WHERE %s', $table, implode(',', $set), implode(' AND ', $cond));
        $this->queries[] = $sql;
        return $this->pdo->exec($sql);
    }

    /** dbDelta, translated: MySQL types to SQLite, keys dropped. */
    public function db_delta(string $sql): void
    {
        if (!preg_match('/CREATE TABLE\s+(\S+)\s*\((.*)\)\s*[^)]*;?\s*$/is', $sql, $m)) {
            throw new RuntimeException('Cannot read CREATE TABLE: ' . $sql);
        }
        $table = $m[1];
        $lines = array_map('trim', explode("\n", trim($m[2])));
        $cols  = [];
        foreach ($lines as $line) {
            $line = rtrim($line, ',');
            if ($line === '' || preg_match('/^(PRIMARY KEY|KEY|UNIQUE KEY|INDEX)/i', $line)) {
                continue;
            }
            $line = preg_replace('/bigint\(\d+\)\s+unsigned\s+NOT NULL\s+AUTO_INCREMENT/i', 'INTEGER PRIMARY KEY AUTOINCREMENT', $line);
            $line = preg_replace('/\b(bigint|int|tinyint)\(\d+\)(\s+unsigned)?/i', 'INTEGER', $line);
            $line = preg_replace('/\b(varchar|char)\(\d+\)/i', 'TEXT', $line);
            $cols[] = $line;
        }
        $exists = $this->get_var("SELECT name FROM sqlite_master WHERE type='table' AND name = " . $this->pdo->quote($table));
        if ($exists !== $table) {
            $this->query(sprintf('CREATE TABLE %s (%s)', $table, implode(', ', $cols)));
            return;
        }
        // An existing table: add the columns it lacks, as the real dbDelta does.
        $have = [];
        foreach ($this->pdo->query("PRAGMA table_info({$table})")->fetchAll(\PDO::FETCH_ASSOC) as $c) {
            $have[] = $c['name'];
        }
        foreach ($cols as $col) {
            $name = preg_split('/\s+/', $col)[0] ?? '';
            if ($name !== '' && !in_array($name, $have, true)) {
                $this->query(sprintf('ALTER TABLE %s ADD COLUMN %s', $table, $col));
            }
        }
    }
}
