<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The walls of doracanalcourt.com: status, scans, seals, the vault, the journal and the drills.
 *
 * ## EXAMPLES
 *
 *     wp ragusa status
 *     wp ragusa seal wp-content/mu-plugins/dcc-postpass-guard.php
 *     wp ragusa restore 142
 *     wp ragusa drill rollback
 */
final class Cli
{
    private function printer(): void
    {
        Fortress\Sveti_Ivan::$printer = static function (string $line): void {
            \WP_CLI::log($line);
        };
    }

    /**
     * One line per fortress, the headline, the tick, the heartbeat (masked) and Bokar's source.
     *
     * ## EXAMPLES
     *
     *     wp ragusa status
     */
    public function status(array $args = [], array $assoc = []): void
    {
        Schema::ensure();
        \WP_CLI::log(Fortress::overall());
        foreach (Fortress::all() as $slug) {
            $s    = Fortress::status($slug);
            $line = $slug === Fortress::SVETI_IVAN ? Fortress\Sveti_Ivan::status_line() : $s['line'];
            \WP_CLI::log(sprintf('  %-11s %-13s %s (checked %s)', Fortress::name($slug), Fortress::state_label($s['state']), $line, Site::both((int) $s['checked_at'])));
        }
        \WP_CLI::log(sprintf('  %-11s %s', 'Zelenci', Admin::zelenci_installed() ? 'installed' : 'not installed (wp ragusa zelenci install)'));
        \WP_CLI::log('  tick: ' . self::tick_line());
        $snap = Fortress\Bokar::snapshot();
        \WP_CLI::log(sprintf('  bokar: %d privileged of %d users, roles read from %s', count($snap['users']), $snap['total'], Fortress\Bokar::$roles_source ?: 'nothing'));
        $hb = Heartbeat::last();
        \WP_CLI::log('  heartbeat: ' . (Heartbeat::configured() ? 'set' : 'not set') . (($hb['ts'] ?? 0) > 0 ? sprintf(', last %s %s', (string) ($hb['result'] ?? ''), Site::both((int) $hb['ts'])) : ''));
        \WP_CLI::log('  feed key: ' . (Settings::secret('feed_key') !== '' ? 'set' : 'not set'));
        \WP_CLI::log('  site: ' . Site::role() . ' (' . Site::id() . '), vault ' . Vault::dir() . (Vault::in_web_root() ? ' [inside web root]' : '') . ', ' . Text::bytes(Vault::usage()) . ' of ' . Text::bytes(Vault::CAP));
        \WP_CLI::log('  loopbacks: ' . (Loopback::available() ? 'work' : 'do not work on this host'));
        $un   = Alerts::unresolved();
        $seen = count(array_filter($un, static fn($a) => Alerts::state($a) === 'seen'));
        \WP_CLI::log('  active findings: ' . count($un) . ($seen > 0 ? sprintf(' (%d seen)', $seen) : '') . ', resolved in the last 30 days: ' . count(Alerts::history()));
        State::flush();
    }

    /** "scheduled, next in 4 minutes", "Overdue By 5 Hours", "WP-Cron Is Off Here". */
    public static function tick_line(): string
    {
        $parts = [];
        if (!Cron::is_scheduled()) {
            $parts[] = 'NOT SCHEDULED';
        } else {
            $next = (int) wp_next_scheduled(Plugin::TICK_HOOK);
            $diff = $next - time();
            if ($diff >= 0) {
                $parts[] = sprintf('scheduled, next in %d min', (int) ceil($diff / 60));
            } else {
                $parts[] = 'scheduled, Overdue By ' . self::span(-$diff);
            }
        }
        if (defined('DISABLE_WP_CRON') && DISABLE_WP_CRON) {
            $parts[] = 'WP-Cron Is Off Here (DISABLE_WP_CRON): a system cron or wp ragusa tick must run it';
        }
        $last = (int) State::get('last_tick', 0);
        $parts[] = 'last ran ' . Site::both($last);
        return implode('; ', $parts);
    }

    private static function span(int $seconds): string
    {
        if ($seconds < 3600) {
            $n = max(1, (int) round($seconds / 60));
            return sprintf(_n('%d Minute', '%d Minutes', $n, 'dcc-ragusa'), $n);
        }
        if ($seconds < 86400) {
            $n = (int) round($seconds / 3600);
            return sprintf(_n('%d Hour', '%d Hours', $n, 'dcc-ragusa'), $n);
        }
        $n = (int) round($seconds / 86400);
        return sprintf(_n('%d Day', '%d Days', $n, 'dcc-ragusa'), $n);
    }

    /**
     * Runs ticks until the file walk completes.
     *
     * ## OPTIONS
     *
     * [--full]
     * : Rehash every file instead of trusting unchanged sizes and times.
     *
     * ## EXAMPLES
     *
     *     wp ragusa scan
     *     wp ragusa scan --full
     */
    public function scan(array $args = [], array $assoc = []): void
    {
        $this->printer();
        if (!empty($assoc['full'])) {
            State::set('last_rehash', 0);
        }
        State::set('last_full_pass', 0);
        for ($i = 0; $i < 60; $i++) {
            $report = Cron::tick(new Budget(20.0), true);
            foreach ($report as $line) {
                \WP_CLI::log($line);
            }
            State::reset();
            $pass = (array) State::get('minceta.pass', []);
            if (($pass['phase'] ?? 'idle') === 'idle') {
                break;
            }
        }
        \WP_CLI::success('Scan complete.');
    }

    /**
     * Accepts the current file as the good copy (a guard, the .htaccess block, or a watched file), or removes a deleted file from the baseline.
     *
     * ## OPTIONS
     *
     * <path>
     * : The file, relative to the WordPress root or absolute. A path with no file at it is dropped from Minčeta's baseline, so a deliberate deletion is never reported as missing.
     *
     * ## EXAMPLES
     *
     *     wp ragusa seal wp-content/mu-plugins/dcc-ical-privacy.php
     *     wp ragusa seal .htaccess
     *     wp ragusa seal wp-content/mu-plugins/dcc-retired-helper.php   # deleted on purpose
     */
    public function seal(array $args = [], array $assoc = []): void
    {
        Schema::ensure();
        [$ok, $msg] = Fortress\Revelin::seal((string) $args[0]);
        State::flush();
        $ok ? \WP_CLI::success($msg) : \WP_CLI::error($msg);
    }

    /**
     * Lists every sealed copy in the vault.
     *
     * ## OPTIONS
     *
     * [<subcommand>]
     * : Only "list" exists.
     *
     * ## EXAMPLES
     *
     *     wp ragusa vault list
     */
    public function vault(array $args = [], array $assoc = []): void
    {
        $sub = $args[0] ?? 'list';
        if ($sub !== 'list') {
            \WP_CLI::error('Usage: wp ragusa vault list');
        }
        \WP_CLI::log(sprintf('Vault %s (%s), %s of %s, manifest %s', Vault::dir(), Vault::key_source(), Text::bytes(Vault::usage()), Text::bytes(Vault::CAP), Vault::verify_manifest() ? 'verifies' : 'DOES NOT VERIFY'));
        $rows = [];
        foreach (Fortress\Revelin::listing() as $id => $e) {
            $rows[] = ['id' => $id, 'kind' => $e['kind'], 'label' => $e['label'], 'version' => $e['version'], 'size' => Text::bytes((int) $e['size']), 'sealed' => Site::stamp((int) $e['sealed_at']), 'intact' => Vault::entry_intact($e) ? 'yes' : 'NO'];
        }
        if ($rows === []) {
            \WP_CLI::log('Nothing sealed yet.');
            return;
        }
        \WP_CLI\Utils\format_items('table', $rows, ['id', 'kind', 'label', 'version', 'size', 'sealed', 'intact']);
    }

    /**
     * Undoes a journal entry, or puts a sealed copy back.
     *
     * ## OPTIONS
     *
     * <id>
     * : A journal number (from the email, the page or `wp ragusa journal`) or a vault entry id (from `wp ragusa vault list`).
     *
     * ## EXAMPLES
     *
     *     wp ragusa restore 142
     *     wp ragusa restore plugin-wporg-plugin-20261021-120000-ab12
     */
    public function restore(array $args = [], array $assoc = []): void
    {
        Schema::ensure();
        $this->printer();
        [$ok, $msg] = Admin::restore((string) $args[0]);
        State::flush();
        $ok ? \WP_CLI::success($msg) : \WP_CLI::error($msg);
    }

    /**
     * Sends one success ping to the heartbeat (allowed on staging; explicit).
     *
     * ## OPTIONS
     *
     * <test>
     * : The word "test".
     *
     * ## EXAMPLES
     *
     *     wp ragusa heartbeat test
     */
    public function heartbeat(array $args = [], array $assoc = []): void
    {
        if (($args[0] ?? '') !== 'test') {
            \WP_CLI::error('Usage: wp ragusa heartbeat test');
        }
        if (!Heartbeat::configured()) {
            \WP_CLI::error('No heartbeat URL is set.');
        }
        Heartbeat::force(true);
        $r  = Heartbeat::ping(true);
        $hb = Heartbeat::last();
        State::flush();
        $r === 'sent' ? \WP_CLI::success('Ping sent, HTTP ' . (int) ($hb['code'] ?? 0)) : \WP_CLI::error('Ping ' . $r . ', HTTP ' . (int) ($hb['code'] ?? 0));
    }

    /**
     * Sends one test email to the alert address (allowed on staging; explicit).
     *
     * ## OPTIONS
     *
     * <test>
     * : The word "test".
     *
     * ## EXAMPLES
     *
     *     wp ragusa mail test
     */
    public function mail(array $args = [], array $assoc = []): void
    {
        if (($args[0] ?? '') !== 'test') {
            \WP_CLI::error('Usage: wp ragusa mail test');
        }
        Alerts::force(true);
        $ok = Alerts::send(Fortress::MINCETA, __('Test Message', 'dcc-ragusa'),
            __('This is a test from Ragusa, sent by wp ragusa mail test.', 'dcc-ragusa') . "\n\n"
            . __('Ragusa did nothing else.', 'dcc-ragusa') . "\n\n"
            . __('Nothing to do, except check that the č in Minčeta survived the subject line.', 'dcc-ragusa') . "\n\n"
            . Alerts::footer());
        State::flush();
        $ok ? \WP_CLI::success('Sent to ' . Settings::alert_email() . ' with subject "' . Alerts::subject(Fortress::MINCETA, 'Test Message') . '"') : \WP_CLI::error('wp_mail reported a failure.');
    }

    /**
     * Shows the journal of autonomous actions and update checks, newest first.
     *
     * ## OPTIONS
     *
     * [--state=<state>]
     * : Only rows in this state (planned, before-recorded, acting, verifying, committed, reversed, abandoned, failed).
     *
     * [--limit=<n>]
     * : How many rows. Default 30.
     *
     * ## EXAMPLES
     *
     *     wp ragusa journal
     *     wp ragusa journal --state=verifying
     */
    public function journal(array $args = [], array $assoc = []): void
    {
        Schema::ensure();
        $rows  = [];
        $limit = (int) ($assoc['limit'] ?? 30);
        foreach (Journal::recent(max(1, $limit), $assoc['state'] ?? null) as $r) {
            $rows[] = ['id' => $r['id'], 'when' => Site::stamp((int) $r['created_at']), 'action' => $r['action'], 'target' => $r['target'], 'state' => $r['state'], 'reversible' => $r['reversible'] ? 'yes' : 'no', 'note' => mb_substr((string) $r['note'], 0, 60)];
        }
        if ($rows === []) {
            \WP_CLI::log('The journal is empty.');
            return;
        }
        \WP_CLI\Utils\format_items('table', $rows, ['id', 'when', 'action', 'target', 'state', 'reversible', 'note']);
    }

    /**
     * Lists the findings: unresolved by default (open and seen), with a short id to use with `wp ragusa resolve`.
     *
     * ## OPTIONS
     *
     * [--all]
     * : Also the resolved history (30 days) and practice findings.
     *
     * [--format=<format>]
     * : table (default), json, csv, yaml, count.
     *
     * ## EXAMPLES
     *
     *     wp ragusa findings
     *     wp ragusa findings --all --format=json
     */
    public function findings(array $args = [], array $assoc = []): void
    {
        Schema::ensure();
        $all  = isset($assoc['all']);
        $rows = [];
        $set  = $all ? Alerts::active() + Alerts::history() : Alerts::unresolved();
        uasort($set, static fn($a, $b) => ($b['first_seen'] ?? 0) <=> ($a['first_seen'] ?? 0));
        foreach ($set as $fp => $a) {
            $rows[] = self::finding_row((string) $fp, $a);
        }
        $format = (string) ($assoc['format'] ?? 'table');
        if ($rows === [] && $format === 'table') {
            \WP_CLI::log($all ? 'No findings at all.' : 'No unresolved findings.');
            return;
        }
        \WP_CLI\Utils\format_items($format, $rows, ['id', 'fortress', 'severity', 'state', 'title', 'target', 'first_seen']);
    }

    /** The short id is the first eight characters of the fingerprint. */
    public static function finding_row(string $fp, array $a): array
    {
        return [
            'id'         => substr($fp, 0, 8),
            'fortress'   => Fortress::name((string) ($a['fortress'] ?? '')),
            'severity'   => (string) ($a['severity'] ?? ''),
            'state'      => Alerts::state($a),
            'title'      => (string) ($a['title'] ?? ''),
            'target'     => (string) ($a['target'] ?? ''),
            'first_seen' => Site::stamp((int) ($a['first_seen'] ?? 0)),
        ];
    }

    /**
     * Resolves a finding by hand (or marks it seen), recording who did it.
     *
     * ## OPTIONS
     *
     * <id>
     * : The short id from `wp ragusa findings`.
     *
     * [--seen]
     * : Mark it seen instead of resolved (it stays counted as unresolved).
     *
     * ## EXAMPLES
     *
     *     wp ragusa resolve 3f2a9c1e
     *     wp ragusa resolve 3f2a9c1e --seen
     */
    public function resolve(array $args = [], array $assoc = []): void
    {
        Schema::ensure();
        $id    = strtolower(trim((string) ($args[0] ?? '')));
        $match = [];
        foreach (Alerts::unresolved() as $fp => $a) {
            if (str_starts_with((string) $fp, $id) && $id !== '') {
                $match[(string) $fp] = $a;
            }
        }
        if (count($match) !== 1) {
            \WP_CLI::error($match === [] ? 'No unresolved finding with that id (wp ragusa findings lists them).' : 'That id matches more than one finding; give more characters.');
        }
        $fp = (string) array_key_first($match);
        $a  = $match[$fp];
        if (Alerts::state($a) !== 'open') {
            \WP_CLI::error('That finding is already ' . Alerts::state($a) . '.');
        }
        $ok = Alerts::resolve_by_hand($fp, self::operator(), isset($assoc['seen']));
        State::flush();
        if (!$ok) {
            \WP_CLI::error('Could not change that finding.');
        }
        \WP_CLI::success(sprintf('%s "%s" (%s), by %s.', isset($assoc['seen']) ? 'Marked seen' : 'Resolved', (string) $a['title'], Fortress::name((string) $a['fortress']), self::operator()));
    }

    /** Who runs the command: the WordPress user when --user is given, else the shell account. */
    public static function operator(): string
    {
        $u = function_exists('wp_get_current_user') ? wp_get_current_user() : null;
        if (is_object($u) && (int) ($u->ID ?? 0) > 0 && (string) ($u->display_name ?? '') !== '') {
            return (string) $u->display_name;
        }
        return (function_exists('get_current_user') ? get_current_user() : 'shell') . ' (shell)';
    }

    /**
     * The Walls Report: the weekly email, printed or sent now.
     *
     * ## OPTIONS
     *
     * [--dry-run]
     * : Print the subject and body instead of sending.
     *
     * ## EXAMPLES
     *
     *     wp ragusa report --dry-run
     *     wp ragusa report
     */
    public function report(array $args = [], array $assoc = []): void
    {
        Schema::ensure();
        $r = Report::build();
        if (isset($assoc['dry-run'])) {
            \WP_CLI::log('Subject: ' . $r['subject']);
            \WP_CLI::log('');
            \WP_CLI::log($r['body']);
            return;
        }
        $sent = Report::send(true);
        State::flush();
        $sent ? \WP_CLI::success('Sent "' . $r['subject'] . '" to ' . Settings::alert_email() . '.') : \WP_CLI::error(Site::is_live() ? 'wp_mail reported a failure.' : 'Not sent: this is ' . Site::role() . ', which sends no email. Use --dry-run to read it.');
    }

    /**
     * Runs the post-update checks for a journal row now (what the follow-up subprocess runs).
     *
     * ## OPTIONS
     *
     * --after=<id>
     * : The update-check journal number.
     *
     * ## EXAMPLES
     *
     *     wp ragusa check --after=17
     */
    public function check(array $args = [], array $assoc = []): void
    {
        $id = (int) ($assoc['after'] ?? 0);
        if ($id <= 0) {
            \WP_CLI::error('Usage: wp ragusa check --after=<journal id>');
        }
        Schema::ensure();
        $this->printer();
        Fortress\Sveti_Ivan::scheduled_check($id);
        $row = Journal::get($id);
        \WP_CLI::log(sprintf('Journal %d is now %s.', $id, $row['state'] ?? 'missing'));
    }

    /**
     * Lists, sets, removes or resets the page markers Sveti Ivan looks for after an update.
     *
     * ## OPTIONS
     *
     * [<subcommand>]
     * : list (default), set, remove or reset.
     *
     * [<path>]
     * : The page path for set or remove, e.g. /explore/.
     *
     * [<markers>]
     * : For set: one or more marker strings, comma-separated, all of which must be present.
     *
     * ## EXAMPLES
     *
     *     wp ragusa markers
     *     wp ragusa markers set /explore/ 'data-dccwl-viewtrigger'
     *     wp ragusa markers reset
     */
    public function markers(array $args = [], array $assoc = []): void
    {
        $sub = $args[0] ?? 'list';
        if ($sub === 'set') {
            if (empty($args[1]) || empty($args[2])) {
                \WP_CLI::error('Usage: wp ragusa markers set <path> <marker[,marker]>');
            }
            $markers = array_map('trim', explode(',', (string) $args[2]));
            Markers::set((string) $args[1], $markers) ? \WP_CLI::success('Marker set.') : \WP_CLI::error('Could not set the marker (empty, or more than 20 pages).');
        } elseif ($sub === 'remove') {
            if (empty($args[1])) {
                \WP_CLI::error('Usage: wp ragusa markers remove <path>');
            }
            Markers::remove((string) $args[1]) ? \WP_CLI::success('Removed.') : \WP_CLI::error('No such page.');
        } elseif ($sub === 'reset') {
            Markers::reset();
            \WP_CLI::success('Markers reset to the baked defaults.');
        }
        $rows = [];
        foreach (Markers::all() as $path => $m) {
            $rows[] = ['page' => $path, 'markers' => implode(' AND ', $m)];
        }
        \WP_CLI\Utils\format_items('table', $rows, ['page', 'markers']);
    }

    /**
     * Installs or reports the Zelenci sentinel mu-plugin.
     *
     * ## OPTIONS
     *
     * [<subcommand>]
     * : install, or status (default).
     *
     * ## EXAMPLES
     *
     *     wp ragusa zelenci install
     */
    public function zelenci(array $args = [], array $assoc = []): void
    {
        $sub = $args[0] ?? 'status';
        $dst = Site::mu_dir() . '/dcc-ragusa-zelenci.php';
        if ($sub === 'install') {
            $src = DCCR_DIR . 'mu/dcc-ragusa-zelenci.php';
            if (!is_dir(Site::mu_dir()) && !@mkdir(Site::mu_dir(), 0755, true)) {
                \WP_CLI::error('Cannot create the mu-plugins folder.');
            }
            if (!@copy($src, $dst)) {
                \WP_CLI::error('Could not copy the sentinel into mu-plugins.');
            }
            Schema::ensure();
            [$ok, $msg] = Fortress\Revelin::seal($dst);
            State::flush();
            \WP_CLI::success('Zelenci installed at ' . Site::rel($dst) . '. ' . $msg);
            return;
        }
        \WP_CLI::log(is_file($dst) ? 'Zelenci is installed.' : 'Zelenci is not installed: wp ragusa zelenci install');
    }

    /**
     * Stages a harmless case, runs the real action and its reverse, and reports every step. Staging only.
     *
     * ## OPTIONS
     *
     * <action>
     * : quarantine, restore-guard, htaccess or rollback.
     *
     * ## EXAMPLES
     *
     *     wp ragusa drill quarantine
     *     wp ragusa drill rollback
     */
    public function drill(array $args = [], array $assoc = []): void
    {
        if (Site::is_live()) {
            \WP_CLI::error('Drills run on staging only. This is the live site (' . Site::id() . ').');
        }
        Schema::ensure();
        $this->printer();
        $lines = Drill::run((string) $args[0]);
        foreach ($lines as $line) {
            \WP_CLI::log($line);
        }
        State::flush();
        Drill::failed($lines) ? \WP_CLI::error('Drill FAILED: a step above did not match.') : \WP_CLI::success('Drill finished.');
    }

    /**
     * Runs one cron tick now (what WP-Cron runs every 10 minutes).
     *
     * ## EXAMPLES
     *
     *     wp ragusa tick
     */
    public function tick(array $args = [], array $assoc = []): void
    {
        $this->printer();
        foreach (Cron::tick(new Budget(20.0)) as $line) {
            \WP_CLI::log($line);
        }
    }

    /**
     * The zero-weight proof: loads WordPress as a visitor request in a fresh PHP process, with Ragusa and with it skipped.
     *
     * On staging, WP Staging is set aside in both columns, because its login gate exits inside wp-load.
     *
     * ## EXAMPLES
     *
     *     wp ragusa proof
     */
    public function proof(array $args = [], array $assoc = []): void
    {
        $with    = Proof::run(false);
        $without = Proof::run(true);
        if (!$with['ok'] || !$without['ok']) {
            \WP_CLI::error('Could not measure: ' . ($with['ok'] ? $without['error'] : $with['error']));
        }
        $aside = Proof::set_aside();
        if ($aside !== []) {
            \WP_CLI::log('Set aside in both columns: ' . implode(', ', $aside));
        }
        $rows = [];
        foreach (['files' => 'PHP files included', 'queries' => 'database queries', 'ragusa_files' => 'files from dcc-ragusa', 'ragusa_classes' => 'DCCR classes loaded', 'hooks' => 'hooks registered by dcc-ragusa', 'enqueued' => 'dccr assets enqueued'] as $k => $label) {
            $rows[] = ['measure' => $label, 'with ragusa' => (string) ($with['data'][$k] ?? '?'), 'without' => (string) ($without['data'][$k] ?? '?')];
        }
        \WP_CLI\Utils\format_items('table', $rows, ['measure', 'with ragusa', 'without']);
        $w  = $with['data'];
        $wo = $without['data'];
        $ok = ((int) $w['queries'] === (int) $wo['queries']) && ((int) $w['files'] - (int) $wo['files'] === 1) && (int) $w['ragusa_classes'] === 0 && (int) $w['hooks'] === 0 && (int) $w['enqueued'] === 0;
        $ok ? \WP_CLI::success('Zero weight: one file included, no query, no hook, no class.') : \WP_CLI::warning('The front end carries something of Ragusa; see the table.');
    }
}
