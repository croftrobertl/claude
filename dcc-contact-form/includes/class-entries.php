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
     * Values stored in the spam_result column.
     *
     * Spam rows use a "spam:<layer>" prefix. Everything else is a real
     * submission and starts "ham", with colon-separated flags appended:
     *
     *   ham                               received and emailed
     *   ham:unverified                    received, emailed, reCAPTCHA gave no verdict
     *   ham:mail-failed                   received, the notification could not be sent
     *   ham:unverified:mail-failed        both of the above
     *   …:seen                            an owner has opened the entry, so the
     *                                     "email failed" admin notice stands down
     *
     * Flags live in this column ON PURPOSE rather than in new columns: adding a
     * column would mean an ALTER TABLE on upgrade, and this plugin deliberately
     * writes nothing on install, activation or upgrade. The longest string here
     * is 31 characters, inside the column's 40.
     */
    public const STATUS_OK = 'ham';
    public const STATUS_MAIL_FAILED = 'ham:mail-failed';
    public const STATUS_UNVERIFIED = 'ham:unverified';
    public const STATUS_UNVERIFIED_MAIL_FAILED = 'ham:unverified:mail-failed';

    /**
     * Spam rows whose CONTENT is stored per day. Past this, a spam submission
     * is counted but its fields are not written at all — a script hammering
     * the form must not be able to fill the disk. Real and unverified
     * submissions are never capped.
     */
    public const MAX_SPAM_ROWS_PER_DAY = 200;

    /** Per-day spam tally: ['day' => 'Y-m-d', 'stored' => int, 'suppressed' => int]. */
    private const SPAM_DAY_OPTION = 'dcc_contact_spam_day';

    /**
     * Cached counts of entries awaiting the owner's attention, neither of them
     * yet opened: submissions stored but never emailed, and submissions the
     * honeypot trapped that read as human.
     *
     * PUBLIC CONTRACT — the site Watchdog reads these option names, and the
     * matching filters of the same names. Keep both.
     */
    public const MAIL_FAILED_OPTION = 'dcc_contact_mail_failed_count';
    public const MAYBE_REAL_OPTION  = 'dcc_contact_trapped_review_count';

    /** Bumped when the schema changes; drives dbDelta on upgrades. */
    private const DB_VERSION = '1';
    private const DB_VERSION_OPTION = 'dcc_contact_db_version';

    /* ------------------------------------------------------------------ */
    /* Status vocabulary                                                   */
    /* ------------------------------------------------------------------ */

    public static function is_spam(string $status): bool
    {
        return strncmp($status, 'spam:', 5) === 0;
    }

    public static function is_unverified(string $status): bool
    {
        return strncmp($status, 'ham:unverified', 14) === 0;
    }

    public static function is_mail_failed(string $status): bool
    {
        return strpos($status, ':mail-failed') !== false;
    }

    /**
     * True when a trapped submission was flagged as possibly a real message
     * (see Triage). Still spam, still unemailed — only surfaced for review.
     */
    public static function is_maybe_real(string $status): bool
    {
        return strpos($status, ':maybe-real') !== false;
    }

    /** True once an owner has opened the entry. */
    public static function is_seen(string $status): bool
    {
        return substr($status, -5) === ':seen';
    }

    /** The mail-failed counterpart of a freshly inserted real submission. */
    public static function mail_failed_status(string $base): string
    {
        return $base === self::STATUS_UNVERIFIED
            ? self::STATUS_UNVERIFIED_MAIL_FAILED
            : self::STATUS_MAIL_FAILED;
    }

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

    /**
     * Insert a spam row, subject to the daily content cap.
     *
     * Under the cap the row is stored in full, so a false positive (an iOS
     * autofill tripping the honeypot, say) can still be read and recovered.
     * Over it, nothing is written and the submission is only tallied: the
     * alternative — an unbounded stream of rows, even empty ones — is the disk
     * exhaustion this guards against.
     *
     * @return int Row id, or 0 when the content was suppressed.
     */
    public static function insert_spam(array $fields, string $subject, string $form_id, string $spam_result): int
    {
        $tally = self::spam_tally();

        if ($tally['stored'] >= self::MAX_SPAM_ROWS_PER_DAY) {
            $tally['suppressed']++;
            self::save_spam_tally($tally);
            return 0;
        }

        $id = self::insert($fields, $subject, $form_id, $spam_result);
        if ($id > 0) {
            $tally['stored']++;
            self::save_spam_tally($tally);

            // A flagged trap catch has to reach the admin notice immediately;
            // ordinary spam never touches the counts.
            if (self::is_maybe_real($spam_result)) {
                self::refresh_attention_counts();
            }
        }
        return $id;
    }

    /**
     * Today's spam tally, resetting when the day rolls over.
     *
     * @return array{day:string,stored:int,suppressed:int}
     */
    public static function spam_tally(): array
    {
        $today = (string) current_time('Y-m-d');
        $tally = get_option(self::SPAM_DAY_OPTION, []);

        if (!is_array($tally) || ($tally['day'] ?? '') !== $today) {
            return ['day' => $today, 'stored' => 0, 'suppressed' => 0];
        }

        return [
            'day'        => $today,
            'stored'     => max(0, (int) ($tally['stored'] ?? 0)),
            'suppressed' => max(0, (int) ($tally['suppressed'] ?? 0)),
        ];
    }

    private static function save_spam_tally(array $tally): void
    {
        update_option(self::SPAM_DAY_OPTION, $tally, false);
    }

    /* ------------------------------------------------------------------ */
    /* Listing                                                             */
    /* ------------------------------------------------------------------ */

    /**
     * SQL predicate for one Submissions tab.
     *
     * "received" deliberately uses NOT LIKE so that legacy rows written before
     * the status vocabulary existed (spam_result '') are listed as received
     * rather than vanishing from every tab.
     */
    private static function bucket_where(string $bucket): string
    {
        switch ($bucket) {
            case 'spam':
                return "spam_result LIKE 'spam:%'";
            case 'unverified':
                return "spam_result LIKE 'ham:unverified%'";
            case 'received':
            default:
                return "spam_result NOT LIKE 'spam:%' AND spam_result NOT LIKE 'ham:unverified%'";
        }
    }

    /** @return array<int,object> Rows in one bucket, newest first. */
    public static function get_page(int $per_page, int $offset, string $bucket = ''): array
    {
        global $wpdb;
        $table = self::table();
        // $per_page/$offset are ints; the table name and the predicate are
        // trusted constants, never request data.
        $where = $bucket === '' ? '1=1' : self::bucket_where($bucket);

        return (array) $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE {$where} ORDER BY id DESC LIMIT %d OFFSET %d",
                max(1, $per_page),
                max(0, $offset)
            )
        );
    }

    public static function count(string $bucket = ''): int
    {
        global $wpdb;
        $table = self::table();
        $where = $bucket === '' ? '1=1' : self::bucket_where($bucket);
        return (int) $wpdb->get_var("SELECT COUNT(*) FROM {$table} WHERE {$where}");
    }

    /* ------------------------------------------------------------------ */
    /* Failed-notification accounting                                      */
    /* ------------------------------------------------------------------ */

    /**
     * Submissions that were stored but never emailed and have not been opened.
     *
     * Read from the cached option so this costs nothing on an ordinary admin
     * page load. refresh_mail_failed_count() keeps it true.
     */
    public static function mail_failed_count(): int
    {
        $count = max(0, (int) get_option(self::MAIL_FAILED_OPTION, 0));

        /**
         * Filters the number of stored-but-unemailed submissions awaiting
         * attention. Exposed for the site Watchdog.
         */
        return (int) apply_filters('dcc_contact_mail_failed_count', $count);
    }

    /**
     * Trapped submissions that read as human and have not been opened.
     */
    public static function maybe_real_count(): int
    {
        $count = max(0, (int) get_option(self::MAYBE_REAL_OPTION, 0));

        /**
         * Filters the number of honeypot catches flagged as possibly real and
         * awaiting review. Exposed for the site Watchdog.
         */
        return (int) apply_filters('dcc_contact_trapped_review_count', $count);
    }

    /** Recount from the table and cache the result. */
    public static function refresh_mail_failed_count(): int
    {
        return self::refresh_attention_counts()['mail_failed'];
    }

    /**
     * Recount both attention counts and cache them.
     *
     * The "not yet opened" part is carried by the absence of a ":seen" suffix,
     * which is why both predicates anchor to the END of the column.
     *
     * @return array{mail_failed:int,maybe_real:int}
     */
    public static function refresh_attention_counts(): array
    {
        global $wpdb;
        $table = self::table();

        $mail_failed = (int) $wpdb->get_var(
            "SELECT COUNT(*) FROM {$table} WHERE spam_result LIKE '%:mail-failed'"
        );
        $maybe_real = (int) $wpdb->get_var(
            "SELECT COUNT(*) FROM {$table} WHERE spam_result LIKE '%:maybe-real'"
        );

        update_option(self::MAIL_FAILED_OPTION, $mail_failed, false);
        update_option(self::MAYBE_REAL_OPTION, $maybe_real, false);

        return ['mail_failed' => $mail_failed, 'maybe_real' => $maybe_real];
    }

    /**
     * Mark an entry as opened, so a failed notification stops nagging.
     *
     * Appending ":seen" keeps the failure itself in the row's history — the
     * Submissions badge still reports it — while removing it from the count the
     * notice is built from. Only mail-failed rows are touched.
     */
    public static function mark_seen(int $id): void
    {
        $row = self::get($id);
        if (!$row) {
            return;
        }

        $status = (string) $row->spam_result;
        if (self::is_seen($status)) {
            return;
        }
        if (!self::is_mail_failed($status) && !self::is_maybe_real($status)) {
            return;
        }

        self::set_status($id, $status . ':seen');
        self::refresh_attention_counts();
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
        $ok = (bool) $wpdb->delete(self::table(), ['id' => $id], ['%d']);
        // A deleted entry can no longer be opened, so it must leave the
        // outstanding-failure count or the notice would never clear.
        self::refresh_attention_counts();
        return $ok;
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
        $n = (int) $wpdb->query(
            $wpdb->prepare("DELETE FROM {$table} WHERE id IN ({$placeholders})", $ids)
        );
        self::refresh_attention_counts();
        return $n;
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
