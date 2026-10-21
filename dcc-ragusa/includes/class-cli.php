<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * wp ragusa status | scan | seal <path> | vault list | restore <id> |
 *    heartbeat test | mail test | journal | check --after=<id> |
 *    markers [set <path> <markers>|reset|remove <path>] |
 *    zelenci install | drill <action> (staging only)
 */
final class Cli
{
    private function printer(): void
    {
        Fortress\Sveti_Ivan::$printer = static function (string $line): void {
            \WP_CLI::log($line);
        };
    }

    /** One line per fortress, the top sentence, the heartbeat state (masked). */
    public function status(array $args = [], array $assoc = []): void
    {
        Schema::ensure();
        \WP_CLI::log(Fortress::overall());
        foreach (Fortress::all() as $slug) {
            $s    = Fortress::status($slug);
            $line = $slug === Fortress::SVETI_IVAN ? Fortress\Sveti_Ivan::status_line() : $s['line'];
            \WP_CLI::log(sprintf('  %-11s %-13s %s (%s)', Fortress::name($slug), Fortress::state_label($s['state']), $line, Site::ago($s['checked_at'])));
        }
        \WP_CLI::log('  tick: ' . (Cron::is_scheduled() ? 'scheduled, next ' . Site::ago((int) wp_next_scheduled(Plugin::TICK_HOOK)) . ' (negative = future)' : 'NOT SCHEDULED') . ', last ran ' . Site::ago((int) State::get('last_tick', 0)));
        $snap = Fortress\Bokar::snapshot();
        \WP_CLI::log(sprintf('  bokar: %d privileged of %d users, roles read from %s', count($snap['users']), $snap['total'], Fortress\Bokar::$roles_source ?: 'nothing'));
        \WP_CLI::log(sprintf('  %-11s %s', 'Zelenci', Admin::zelenci_installed() ? 'installed' : 'not installed (wp ragusa zelenci install)'));
        $hb = Heartbeat::last();
        \WP_CLI::log('  heartbeat: ' . (Heartbeat::configured() ? 'set' : 'not set') . (($hb['ts'] ?? 0) > 0 ? sprintf(', last %s %s', (string) ($hb['result'] ?? ''), Site::ago((int) $hb['ts'])) : ''));
        \WP_CLI::log('  feed key: ' . (Settings::secret('feed_key') !== '' ? 'set' : 'not set'));
        \WP_CLI::log('  site: ' . Site::role() . ' (' . Site::id() . '), vault ' . Vault::dir() . (Vault::in_web_root() ? ' [inside web root]' : '') . ', ' . Text::bytes(Vault::usage()) . ' of ' . Text::bytes(Vault::CAP));
        \WP_CLI::log('  loopbacks: ' . (Loopback::available() ? 'work' : 'do not work on this host'));
        \WP_CLI::log('  active findings: ' . count(Alerts::active()));
        State::flush();
    }

    /**
     * Run a tick now; with --full, a full rehash. Loops ticks until the walk completes.
     *
     * [--full]
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

    /** <path> : accept the current file as the good copy. */
    public function seal(array $args = [], array $assoc = []): void
    {
        if (empty($args[0])) {
            \WP_CLI::error('Usage: wp ragusa seal <path>');
        }
        Schema::ensure();
        [$ok, $msg] = Fortress\Revelin::seal((string) $args[0]);
        State::flush();
        $ok ? \WP_CLI::success($msg) : \WP_CLI::error($msg);
    }

    /** list : every sealed copy. */
    public function vault(array $args = [], array $assoc = []): void
    {
        $sub = $args[0] ?? 'list';
        if ($sub !== 'list') {
            \WP_CLI::error('Usage: wp ragusa vault list');
        }
        \WP_CLI::log(sprintf('Vault %s (%s), %s of %s, manifest %s', Vault::dir(), Vault::key_source(), Text::bytes(Vault::usage()), Text::bytes(Vault::CAP), Vault::verify_manifest() ? 'verifies' : 'DOES NOT VERIFY'));
        $rows = [];
        foreach (Fortress\Revelin::listing() as $id => $e) {
            $rows[] = ['id' => $id, 'kind' => $e['kind'], 'label' => $e['label'], 'version' => $e['version'], 'size' => Text::bytes((int) $e['size']), 'sealed' => gmdate('Y-m-d H:i', (int) $e['sealed_at']), 'intact' => Vault::entry_intact($e) ? 'yes' : 'NO'];
        }
        if ($rows === []) {
            \WP_CLI::log('Nothing sealed yet.');
            return;
        }
        \WP_CLI\Utils\format_items('table', $rows, ['id', 'kind', 'label', 'version', 'size', 'sealed', 'intact']);
    }

    /** <id> : undo a journal entry, or put a sealed copy back. */
    public function restore(array $args = [], array $assoc = []): void
    {
        if (empty($args[0])) {
            \WP_CLI::error('Usage: wp ragusa restore <journal id | vault entry id>');
        }
        Schema::ensure();
        $this->printer();
        [$ok, $msg] = Admin::restore((string) $args[0]);
        State::flush();
        $ok ? \WP_CLI::success($msg) : \WP_CLI::error($msg);
    }

    /** test : send one success ping (allowed on staging; explicit). */
    public function heartbeat(array $args = [], array $assoc = []): void
    {
        if (($args[0] ?? '') !== 'test') {
            \WP_CLI::error('Usage: wp ragusa heartbeat test');
        }
        if (!Heartbeat::configured()) {
            \WP_CLI::error('No heartbeat URL is set.');
        }
        Heartbeat::force(true);
        $r = Heartbeat::ping(true);
        $hb = Heartbeat::last();
        State::flush();
        $r === 'sent' ? \WP_CLI::success('Ping sent, HTTP ' . (int) ($hb['code'] ?? 0)) : \WP_CLI::error('Ping ' . $r . ', HTTP ' . (int) ($hb['code'] ?? 0));
    }

    /** test : send one email to the alert address (allowed on staging; explicit). */
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
            . 'Ragusa: ' . Site::admin_page_url());
        State::flush();
        $ok ? \WP_CLI::success('Sent to ' . Settings::alert_email() . ' with subject "' . Alerts::subject(Fortress::MINCETA, 'Test Message') . '"') : \WP_CLI::error('wp_mail reported a failure.');
    }

    /**
     * The journal, newest first.
     *
     * [--state=<state>] [--limit=<n>]
     */
    public function journal(array $args = [], array $assoc = []): void
    {
        Schema::ensure();
        $rows = [];
        $limit = (int) ($assoc['limit'] ?? 30);
        foreach (Journal::recent(max(1, $limit), $assoc['state'] ?? null) as $r) {
            $rows[] = ['id' => $r['id'], 'when' => gmdate('Y-m-d H:i', (int) $r['created_at']), 'action' => $r['action'], 'target' => $r['target'], 'state' => $r['state'], 'reversible' => $r['reversible'] ? 'yes' : 'no', 'note' => mb_substr((string) $r['note'], 0, 60)];
        }
        if ($rows === []) {
            \WP_CLI::log('The journal is empty.');
            return;
        }
        \WP_CLI\Utils\format_items('table', $rows, ['id', 'when', 'action', 'target', 'state', 'reversible', 'note']);
    }

    /**
     * Run the post-update checks for a journal row (what the subprocess runs).
     *
     * --after=<id>
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

    /** [set <path> <marker[,marker]> | remove <path> | reset] */
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

    /** install | status : the sentinel mu-plugin. */
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

    /** <quarantine|restore-guard|htaccess|rollback> : staging only. */
    public function drill(array $args = [], array $assoc = []): void
    {
        if (empty($args[0])) {
            \WP_CLI::error('Usage: wp ragusa drill <quarantine|restore-guard|htaccess|rollback>');
        }
        if (Site::is_live()) {
            \WP_CLI::error('Drills run on staging only. This is the live site (' . Site::id() . ').');
        }
        Schema::ensure();
        $this->printer();
        foreach (Drill::run((string) $args[0]) as $line) {
            \WP_CLI::log($line);
        }
        State::flush();
        \WP_CLI::success('Drill finished.');
    }

    /** Run one cron tick now (what WP-Cron runs). */
    public function tick(array $args = [], array $assoc = []): void
    {
        $this->printer();
        foreach (Cron::tick(new Budget(20.0)) as $line) {
            \WP_CLI::log($line);
        }
    }

    /**
     * The zero-weight proof: load WordPress as a visitor request in a
     * fresh PHP process, with Ragusa active and with it skipped, and print
     * the included-file and query counts side by side.
     */
    public function proof(array $args = [], array $assoc = []): void
    {
        $with    = Proof::run(false);
        $without = Proof::run(true);
        if ($with === null || $without === null) {
            \WP_CLI::error('Could not run the front-end subprocess (no php binary through proc_open?).');
        }
        $rows = [];
        foreach (['files' => 'PHP files included', 'queries' => 'database queries', 'ragusa_files' => 'files from dcc-ragusa', 'ragusa_classes' => 'DCCR classes loaded', 'hooks' => 'hooks registered by dcc-ragusa', 'enqueued' => 'dccr assets enqueued'] as $k => $label) {
            $rows[] = ['measure' => $label, 'with ragusa' => (string) ($with[$k] ?? '?'), 'without' => (string) ($without[$k] ?? '?')];
        }
        \WP_CLI\Utils\format_items('table', $rows, ['measure', 'with ragusa', 'without']);
        $ok = ((int) $with['queries'] === (int) $without['queries']) && ((int) $with['files'] - (int) $without['files'] === 1) && (int) $with['ragusa_classes'] === 0 && (int) $with['hooks'] === 0;
        $ok ? \WP_CLI::success('Zero weight: one file included, no query, no hook, no class.') : \WP_CLI::warning('The front end carries something of Ragusa; see the table.');
    }
}
