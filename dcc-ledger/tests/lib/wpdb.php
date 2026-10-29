<?php
/**
 * A $wpdb good enough to run this plugin's real SQL, backed by SQLite.
 *
 * The point is that the tests exercise the plugin's own queries rather than a
 * mock of them. Every write this class performs is also recorded, so a test
 * can assert that nothing was ever written to posts or postmeta.
 */
final class Test_WPDB
{
    public string $prefix = 'portal_';
    public string $posts;
    public string $postmeta;
    public int $insert_id = 0;
    public string $last_error = '';

    /** @var array<int,array{sql:string}> every statement that changes data */
    public array $writes = [];

    private \PDO $pdo;

    public function __construct()
    {
        $this->posts    = $this->prefix . 'posts';
        $this->postmeta = $this->prefix . 'postmeta';
        $this->pdo      = new \PDO('sqlite::memory:');
        $this->pdo->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);
    }

    public function get_charset_collate(): string
    {
        return 'DEFAULT CHARACTER SET utf8mb4';
    }

    /**
     * @param array<int,mixed> $args
     */
    public function prepare(string $sql, ...$args): string
    {
        if ($args === []) {
            return $sql;
        }
        if (count($args) === 1 && is_array($args[0])) {
            $args = $args[0];
        }
        $i = 0;
        return (string) preg_replace_callback(
            '/%[sdfF]/',
            function ($m) use ($args, &$i) {
                $value = $args[$i] ?? '';
                $i++;
                if ($m[0] === '%d') {
                    return (string) (int) $value;
                }
                if ($m[0] === '%f' || $m[0] === '%F') {
                    return (string) (float) $value;
                }
                return $this->pdo->quote((string) $value);
            },
            $sql
        );
    }

    public function query(string $sql): int
    {
        $this->record($sql);
        try {
            $statement = $this->pdo->query($sql);
            return $statement === false ? 0 : $statement->rowCount();
        } catch (\PDOException $e) {
            $this->last_error = $e->getMessage() . ' — SQL: ' . $sql;
            throw $e;
        }
    }

    /** @return array<int,array<string,mixed>> */
    public function get_results(string $sql, string $output = 'OBJECT'): array
    {
        // The plugin asks MySQL for a table's columns with SHOW COLUMNS;
        // SQLite answers the same question with a pragma.
        if (preg_match('/^\s*SHOW COLUMNS FROM\s+(\S+)/i', $sql, $m) === 1) {
            $out = [];
            foreach ($this->select(sprintf('PRAGMA table_info(%s)', trim($m[1], '`;'))) as $row) {
                $out[] = ['Field' => (string) ($row['name'] ?? '')];
            }
            return $out;
        }

        return $this->select($sql);
    }

    /** @return array<string,mixed>|null */
    public function get_row(string $sql, string $output = 'OBJECT')
    {
        $rows = $this->select($sql);
        return $rows[0] ?? null;
    }

    public function get_var(string $sql)
    {
        $row = $this->get_row($sql);
        if ($row === null) {
            return null;
        }
        return array_values($row)[0] ?? null;
    }

    /** @return array<int,mixed> */
    public function get_col(string $sql): array
    {
        $out = [];
        foreach ($this->select($sql) as $row) {
            $out[] = array_values($row)[0] ?? null;
        }
        return $out;
    }

    /**
     * @param array<string,mixed> $data
     */
    public function insert(string $table, array $data): int
    {
        $columns = array_keys($data);
        $values  = array_map(fn ($v) => $this->literal($v), array_values($data));
        $sql     = sprintf(
            'INSERT INTO %s (%s) VALUES (%s)',
            $table,
            implode(',', $columns),
            implode(',', $values)
        );
        $this->record($sql);
        $this->pdo->exec($sql);
        $this->insert_id = (int) $this->pdo->lastInsertId();
        return 1;
    }

    /**
     * @param array<string,mixed> $data
     * @param array<string,mixed> $where
     */
    public function update(string $table, array $data, array $where): int
    {
        $set = [];
        foreach ($data as $column => $value) {
            $set[] = $column . ' = ' . $this->literal($value);
        }
        $conditions = [];
        foreach ($where as $column => $value) {
            $conditions[] = $column . ' = ' . $this->literal($value);
        }
        $sql = sprintf('UPDATE %s SET %s WHERE %s', $table, implode(',', $set), implode(' AND ', $conditions));
        $this->record($sql);
        return $this->query($sql);
    }

    /**
     * @param array<string,mixed> $where
     */
    public function delete(string $table, array $where): int
    {
        $conditions = [];
        foreach ($where as $column => $value) {
            $conditions[] = $column . ' = ' . $this->literal($value);
        }
        $sql = sprintf('DELETE FROM %s WHERE %s', $table, implode(' AND ', $conditions));
        $this->record($sql);
        return $this->query($sql);
    }

    public function exec_raw(string $sql): void
    {
        $this->pdo->exec($sql);
    }

    /** Statements that touched posts or postmeta and were not plain SELECTs. */
    public function mphb_writes(): array
    {
        $out = [];
        foreach ($this->writes as $sql) {
            if (preg_match('/\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP)\b/i', $sql) !== 1) {
                continue;
            }
            if (preg_match('/\b' . preg_quote($this->posts, '/') . '\b|\b' . preg_quote($this->postmeta, '/') . '\b/i', $sql) === 1) {
                $out[] = $sql;
            }
        }
        return $out;
    }

    /** @return array<int,array<string,mixed>> */
    private function select(string $sql): array
    {
        try {
            $statement = $this->pdo->query($sql);
            if ($statement === false) {
                return [];
            }
            return $statement->fetchAll(\PDO::FETCH_ASSOC) ?: [];
        } catch (\PDOException $e) {
            $this->last_error = $e->getMessage() . ' — SQL: ' . $sql;
            throw $e;
        }
    }

    private function record(string $sql): void
    {
        $this->writes[] = $sql;
    }

    private function literal($value): string
    {
        if ($value === null) {
            return 'NULL';
        }
        if (is_int($value) || is_float($value)) {
            return (string) $value;
        }
        if (is_bool($value)) {
            return $value ? '1' : '0';
        }
        return $this->pdo->quote((string) $value);
    }
}

/**
 * dbDelta, for SQLite.
 *
 * It models the two things about the real one that matter here:
 *
 *  - It UPGRADES. Given a table that already exists, it compares the columns
 *    in the statement against the columns in the table and adds the missing
 *    ones. The first version of this helper only ever created tables, which
 *    is why an upgrade bug could not be caught by any test.
 *
 *  - It reads the statement line by line, as the real dbDelta does. A line
 *    that is not a column or key definition — an SQL comment, say — is not
 *    something it can diff against, so it gives up on that table rather than
 *    guessing. That is the failure 0.1.3 shipped: a `--` comment inside a
 *    CREATE TABLE left the column diff broken, so an existing table never
 *    gained its new column, while a fresh install worked perfectly.
 */
function dbDelta(string $sql): void
{
    global $wpdb;

    if (preg_match('/CREATE TABLE\s+(\S+)\s*\((.*)\)\s*DEFAULT/si', $sql, $m) !== 1) {
        return;
    }
    $table = $m[1];
    $body  = $m[2];

    $wanted  = [];   // column name => definition
    $indexes = [];
    $broken  = false;

    foreach (explode("\n", $body) as $line) {
        $line = trim($line);
        $line = rtrim($line, ',');
        if ($line === '') {
            continue;
        }

        if (str_starts_with($line, '--') || str_starts_with($line, '#')) {
            // The real dbDelta takes this for a field definition and the
            // diff it builds is wrong from here on.
            $broken = true;
            continue;
        }

        if (preg_match('/^PRIMARY KEY\s+\((.+)\)$/i', $line) === 1) {
            continue; // handled on the AUTO_INCREMENT column
        }

        if (preg_match('/^(UNIQUE\s+)?KEY\s+(\S+)\s+\((.+)\)$/i', $line, $k) === 1) {
            $indexes[] = sprintf(
                'CREATE %sINDEX IF NOT EXISTS %s_%s ON %s (%s)',
                strtoupper(trim($k[1])) === 'UNIQUE' ? 'UNIQUE ' : '',
                $table,
                $k[2],
                $table,
                $k[3]
            );
            continue;
        }

        $name = strtok($line, ' ');
        if ($name === false || preg_match('/^[a-z_][a-z0-9_]*$/i', $name) !== 1) {
            $broken = true;
            continue;
        }
        $wanted[$name] = $line;
    }

    $existing = table_columns($table);

    if ($existing === []) {
        $definitions = [];
        foreach ($wanted as $line) {
            $definitions[] = translate_column($line);
        }
        if ($definitions === []) {
            return;
        }
        $wpdb->exec_raw(sprintf('CREATE TABLE IF NOT EXISTS %s (%s)', $table, implode(', ', $definitions)));
        foreach ($indexes as $index) {
            $wpdb->exec_raw($index);
        }
        return;
    }

    if ($broken) {
        // The statement could not be read as a set of columns, so the diff
        // cannot be trusted. Nothing is altered — exactly the silent failure
        // this models.
        return;
    }

    foreach ($wanted as $name => $line) {
        if (in_array($name, $existing, true)) {
            continue;
        }
        $wpdb->exec_raw(sprintf('ALTER TABLE %s ADD COLUMN %s', $table, translate_column($line)));
    }

    foreach ($indexes as $index) {
        $wpdb->exec_raw($index);
    }
}

/** Does this table exist at all? */
function table_exists(string $table): bool
{
    return table_columns($table) !== [];
}

/**
 * The columns a table has now, or [] when it does not exist.
 *
 * @return array<int,string>
 */
function table_columns(string $table): array
{
    global $wpdb;

    try {
        $rows = $wpdb->get_results(sprintf('PRAGMA table_info(%s)', $table));
    } catch (\Throwable $e) {
        return [];
    }

    $out = [];
    foreach ($rows as $row) {
        if (isset($row['name'])) {
            $out[] = (string) $row['name'];
        }
    }
    return $out;
}

function translate_column(string $definition): string
{
    if (stripos($definition, 'AUTO_INCREMENT') !== false) {
        $name = strtok(trim($definition), ' ');
        return $name . ' INTEGER PRIMARY KEY AUTOINCREMENT';
    }

    $definition = preg_replace('/\bbigint\(\d+\)\s*unsigned\b/i', 'INTEGER', $definition) ?? $definition;
    $definition = preg_replace('/\b(bigint|int|smallint|tinyint)\(\d+\)\b/i', 'INTEGER', $definition) ?? $definition;
    $definition = preg_replace('/\bdecimal\(\d+,\d+\)/i', 'REAL', $definition) ?? $definition;
    $definition = preg_replace('/\b(varchar|char)\(\d+\)/i', 'TEXT', $definition) ?? $definition;
    $definition = preg_replace('/\b(longtext|text|datetime|date)\b/i', 'TEXT', $definition) ?? $definition;
    $definition = preg_replace('/\bunsigned\b/i', '', $definition) ?? $definition;

    return trim($definition);
}
