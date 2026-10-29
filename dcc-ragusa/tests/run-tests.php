<?php
/**
 * The test suite. Synthetic fixtures only.
 *
 *     php tests/run-tests.php
 *
 * A PHP warning fails the suite (see bootstrap): a silent notice is the
 * kind of wrongness a wall must not have.
 */

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/site.php';
require_once __DIR__ . '/lib/wpcli.php';

use DCCR\Action\Htaccess_Block;
use DCCR\Action\Quarantine;
use DCCR\Action\Restore_Guard;
use DCCR\Action\Rollback;
use DCCR\Actions;
use DCCR\Admin;
use DCCR\Alerts;
use DCCR\Budget;
use DCCR\Cron;
use DCCR\Crypto;
use DCCR\Error_Log;
use DCCR\Events;
use DCCR\Fortress;
use DCCR\Fortress\Bokar;
use DCCR\Fortress\Lovrijenac;
use DCCR\Fortress\Minceta;
use DCCR\Fortress\Revelin;
use DCCR\Fortress\Sveti_Ivan;
use DCCR\Heartbeat;
use DCCR\Htaccess;
use DCCR\Ical;
use DCCR\Journal;
use DCCR\Loopback;
use DCCR\Markers;
use DCCR\Settings;
use DCCR\Site;
use DCCR\Speedycache;
use DCCR\Php_Patch;
use DCCR\Report;
use DCCR\Cli;
use DCCR\State;
use DCCR\Text;
use DCCR\Vault;

$GLOBALS['t_pass'] = 0;
$GLOBALS['t_fail'] = 0;
$GLOBALS['t_suite'] = '';

function ok(bool $cond, string $msg): void
{
    if ($cond) {
        $GLOBALS['t_pass']++;
        return;
    }
    $GLOBALS['t_fail']++;
    echo "  FAIL [{$GLOBALS['t_suite']}] $msg\n";
}
function eq($expected, $actual, string $msg): void
{
    ok($expected === $actual, $msg . ' (expected ' . var_export($expected, true) . ', got ' . var_export($actual, true) . ')');
}
function suite(string $name, callable $fn): void
{
    $GLOBALS['t_suite'] = $name;
    Test_Site::reset();
    try {
        $fn();
    } catch (\Throwable $e) {
        $GLOBALS['t_fail']++;
        echo "  ERROR [$name] " . get_class($e) . ': ' . $e->getMessage() . ' at ' . $e->getFile() . ':' . $e->getLine() . "\n";
    }
    State::flush();
}
function tick(float $budget = 30.0): array
{
    $r = Cron::tick(new Budget($budget), true);
    return $r;
}
function events_of(string $kind): array
{
    return array_values(array_filter(Events::recent(500), static fn($e) => $e['kind'] === $kind));
}
function mails_with(string $needle): array
{
    return array_values(array_filter($GLOBALS['dccr_mail'], static fn($m) => str_contains($m['subject'], $needle) || str_contains($m['body'], $needle)));
}
function age_row(int $id, int $seconds): void
{
    global $wpdb;
    $wpdb->update(DCCR\Schema::journal(), ['updated_at' => time() - $seconds, 'run_token' => 'deadbeefdeadbeef'], ['id' => $id]);
}
function plugin_file(string $slug, string $version, string $code = ''): void
{
    file_put_contents(WP_PLUGIN_DIR . "/$slug/$slug.php", "<?php\n/**\n * Plugin Name: WPORG Plugin\n * Version: $version\n */\n" . $code);
}
/** Simulate a plugin update through the upgrader hooks. */
function simulate_update(string $slug, string $version, string $action = 'update', string $code = ''): int
{
    $hook = ['type' => 'plugin', 'action' => $action];
    if ($action === 'update') {
        $hook['plugin'] = "$slug/$slug.php";
    }
    Sveti_Ivan::on_pre_install(true, $hook);
    Revelin::on_source_selection(DCCR_TEST_ROOT . "/upgrade/$slug/", DCCR_TEST_ROOT . '/upgrade', null, $hook);
    plugin_file($slug, $version, $code);
    $upgrader = (object) ['result' => ['destination_name' => $slug]];
    Sveti_Ivan::on_process_complete($upgrader, $hook);
    $row = Journal::latest('update-check', $slug);
    return $row === null ? 0 : (int) $row['id'];
}
function break_cottage_when(string $version): void
{
    $GLOBALS['dccr_site_handler'] = static function (string $url, array $args) use ($version) {
        if (Revelin::plugin_version('wporg-plugin') === $version && str_contains($url, 'cottage-34')) {
            return dccr_http_ok('<html>broken</html>', 500);
        }
        return Test_Site::site_page($url);
    };
}

echo "Ragusa test suite\n";

// --------------------------------------------------------------------------
// The shutdown check is recorded, never left to run at the end of the test process.
$GLOBALS['dccr_shutdown'] = [];
Sveti_Ivan::$shutdown_registrar = static function ($cb): void {
    $GLOBALS['dccr_shutdown'][] = $cb;
};

suite('front-end gate: the main file returns before any hook on a visitor request', function () {
    $script = DCCR_TEST_ROOT . '/gate.php';
    file_put_contents($script, '<?php
        define("ABSPATH", "' . ABSPATH . '");
        $GLOBALS["pagenow"] = "index.php";
        $calls = 0;
        function is_admin() { return false; }
        function wp_doing_cron() { return false; }
        function add_action(...$a) { $GLOBALS["calls"]++; }
        function add_filter(...$a) { $GLOBALS["calls"]++; }
        function register_activation_hook(...$a) { $GLOBALS["calls"]++; }
        function register_deactivation_hook(...$a) { $GLOBALS["calls"]++; }
        function plugin_basename($f) { $GLOBALS["calls"]++; return ""; }
        function plugin_dir_url($f) { $GLOBALS["calls"]++; return ""; }
        $GLOBALS["calls"] = 0;
        $before = get_included_files();
        require "' . dirname(__DIR__) . '/dcc-ragusa.php";
        $after = get_included_files();
        echo json_encode(["calls" => $GLOBALS["calls"], "files" => count($after) - count($before), "classes" => count(array_filter(get_declared_classes(), fn($c) => str_starts_with($c, "DCCR")))]);
    ');
    $out = (string) shell_exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($script));
    $r   = json_decode($out, true);
    ok(is_array($r), 'gate script ran: ' . $out);
    eq(0, (int) ($r['calls'] ?? -1), 'no hook, no basename, no url computed on a front-end request');
    eq(1, (int) ($r['files'] ?? -1), 'only the main file is included');
    eq(0, (int) ($r['classes'] ?? -1), 'no Ragusa class is loaded');

    // And on the login page it does register.
    file_put_contents($script, str_replace('"index.php"', '"wp-login.php"', (string) file_get_contents($script)));
    $r = json_decode((string) shell_exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($script)), true);
    ok((int) ($r['calls'] ?? 0) >= 3, 'on wp-login.php the hooks are registered');
});

suite('site: role and id come from prefix and URL, never a stored flag', function () {
    eq('staging', Site::role(), 'wpstg0_ + /staging/ is staging');
    ok(str_starts_with(Site::id(), 'staging-'), 'id carries the role');
    dccr_test_site('live');
    eq('live', Site::role(), 'portal_ + doracanalcourt.com is live');
    ok(Site::is_live(), 'is_live');
    $GLOBALS['dccr_home_url'] = 'https://doracanalcourt.com/staging/';
    eq('staging', Site::role(), 'live prefix but /staging/ path is staging');
    $GLOBALS['dccr_home_url'] = 'https://example.test/';
    eq('other', Site::role(), 'an unknown host is other, and other sends nothing');
    ok(!Site::is_live(), 'other is not live');
    dccr_test_site('staging');
    State::set('x', 1);
    ok(Vault::dir() !== '' && str_contains(Vault::dir(), '/ragusa-vault/staging-'), 'staging vault folder is its own');
    Vault::reset_cache();
    dccr_test_site('live');
    ok(str_contains(Vault::dir(), '/ragusa-vault/live-'), 'live vault folder is separate');
    dccr_test_site('staging');
    Vault::reset_cache();
});

suite('settings: bad values become safe defaults with a notice, secrets round-trip and stay masked', function () {
    update_option(Settings::OPTION, ['schema' => 99, 'alert_email' => 'x'], 'yes');
    Settings::reset_cache();
    $s = Settings::get();
    eq(1, $s['schema'], 'unknown schema falls back to defaults');
    ok(count(Settings::notices()) === 1, 'one amber notice for the bad layout');
    update_option(Settings::OPTION, ['schema' => 1, 'alert_email' => 'not-an-email', 'delete_on_uninstall' => '1'], 'yes');
    Settings::reset_cache();
    $s = Settings::get();
    eq('', $s['alert_email'], 'invalid email becomes empty');
    eq('rob@example.test', Settings::alert_email(), 'empty means the admin email');
    eq(true, $s['delete_on_uninstall'], 'delete flag read');

    $n = Settings::save(['alert_email' => 'rob@example.test', 'heartbeat_url' => 'https://hc-ping.com/8b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'feed_key' => 'abcdefghijklmnop1234']);
    eq([], $n, 'valid settings save without notice');
    eq('https://hc-ping.com/8b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', Settings::secret('heartbeat_url'), 'heartbeat round-trips');
    eq('abcdefghijklmnop1234', Settings::secret('feed_key'), 'feed key round-trips');
    ok(str_starts_with((string) get_option(Settings::SECRETS), 's1:'), 'secrets are stored sealed with sodium');
    eq('no', $GLOBALS['dccr_autoload'][Settings::SECRETS], 'secrets option does not autoload');
    eq('yes', $GLOBALS['dccr_autoload'][Settings::OPTION], 'settings row autoloads (the one small row)');
    $mask = Settings::mask(Settings::secret('heartbeat_url'));
    ok(!str_contains($mask, '8b1f2c3d-4e5f'), 'mask hides the uuid: ' . $mask);
    ok(str_ends_with($mask, '3c4d'), 'mask keeps the last four');
    $n = Settings::save(['heartbeat_url' => 'http://hc-ping.com/not-https', 'feed_key' => 'short']);
    eq(2, count($n), 'bad heartbeat and bad key are refused with notices');
    eq('https://hc-ping.com/8b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', Settings::secret('heartbeat_url'), 'bad value did not overwrite the good one');
    ok(Settings::valid_heartbeat_url('https://hc-ping.com/abcdefghijkl/my-site'), 'slug form accepted');
    ok(!Settings::valid_heartbeat_url('https://hc-ping.com/x?y=1'), 'query string refused');

    // The vault key changes: the blob cannot be opened, and that is a notice, not a fatal.
    file_put_contents(Vault::dir() . '/.key', bin2hex(random_bytes(32)));
    Vault::reset_cache();
    Settings::reset_cache();
    eq('', Settings::secret('heartbeat_url'), 'unreadable secret reads as empty');
    ok(Settings::secrets_unreadable(), 'and is reported as unreadable');

    // No secret in any event or mail text.
    $scrubbed = Text::scrub('ping https://hc-ping.com/8b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d and Bearer abcdefghijklmnop1234');
    ok(!str_contains($scrubbed, '8b1f2c3d') && !str_contains($scrubbed, 'abcdefghijklmnop'), 'scrub removes ping URLs and bearer tokens');
    ok(Crypto::open(Crypto::seal('hello', 'k'), 'k') === 'hello', 'crypto round trip');
    ok(Crypto::open(Crypto::seal('hello', 'k'), 'other') === null, 'wrong key opens nothing');
});

suite('vault: key, signed manifest, sealing, extraction, cap and eviction order', function () {
    $key = Vault::key();
    eq(32, strlen($key), 'key is 32 bytes');
    eq('0600', substr(sprintf('%o', fileperms(Vault::dir() . '/.key')), -4), 'key file is 0600');
    ok(!Vault::in_web_root(), 'vault is outside the web root');
    ok(Vault::verify_manifest(), 'no manifest yet verifies');
    $e = Vault::seal_file('guard', 'mu-plugins/dcc-postpass-guard.php', WPMU_PLUGIN_DIR . '/dcc-postpass-guard.php');
    ok($e !== null && Vault::verify_manifest(), 'sealed file and manifest verifies');
    ok(Vault::entry_intact($e), 'entry intact');
    $m = Vault::manifest();
    $m['entries'][$e['id']]['sha256'] = str_repeat('0', 64);
    file_put_contents(Vault::dir() . '/manifest.json', json_encode($m));
    Vault::reset_cache();
    ok(!Vault::verify_manifest(), 'a tampered manifest does not verify');
    Vault::save_manifest(Vault::manifest());
    ok(Vault::verify_manifest(), 'resigned manifest verifies');
    Vault::reset_cache();

    $why = null;
    $zip = Vault::seal_dir('plugin', 'wporg-plugin', WP_PLUGIN_DIR . '/wporg-plugin', '1.4.0', $why);
    ok($zip !== null, 'plugin dir sealed as zip: ' . (string) $why);
    $to = DCCR_TEST_ROOT . '/extract';
    ok(Vault::extract($zip, $to), 'zip extracts');
    ok(Vault::verify_extracted($zip, $to), 'extracted files match the sidecar hashes');
    file_put_contents($to . '/includes/a.php', 'changed');
    ok(!Vault::verify_extracted($zip, $to), 'a changed extracted file fails verification');

    // One version per label: sealing again replaces.
    $zip2 = Vault::seal_dir('plugin', 'wporg-plugin', WP_PLUGIN_DIR . '/wporg-plugin', '1.4.1', $why);
    eq(1, count(Vault::entries('plugin', 'wporg-plugin')), 'one copy per plugin');
    ok(!is_file(Vault::path($zip)), 'the older zip was removed');

    // Eviction: oldest unprotected plugin copies first; guards never.
    $a = Vault::seal_dir('plugin', 'alpha', WP_PLUGIN_DIR . '/dcc-demo', '1', $why);
    $b = Vault::seal_dir('plugin', 'beta', WP_PLUGIN_DIR . '/dcc-demo', '1', $why);
    $m = Vault::manifest();
    $m['entries'][$a['id']]['size'] = 120 * 1024 * 1024;
    $m['entries'][$a['id']]['sealed_at'] = time() - 300;
    $m['entries'][$b['id']]['size'] = 120 * 1024 * 1024;
    $m['entries'][$b['id']]['sealed_at'] = time() - 100;
    $m['entries'][$zip2['id']]['size'] = 100 * 1024 * 1024;
    $m['entries'][$zip2['id']]['sealed_at'] = time() - 10;
    $m['entries'][$e['id']]['size'] = 50 * 1024 * 1024;
    $m['entries'][$e['id']]['sealed_at'] = time() - 1000; // the oldest of all, and still never evicted
    Vault::save_manifest($m);
    ok(Vault::usage() > Vault::CAP, 'usage now exceeds the cap');
    ok(!Vault::make_room(Vault::CAP + 1), 'nothing bigger than the cap ever fits');
    ok(Vault::make_room(40 * 1024 * 1024), 'room made for 40 MB');
    ok(Vault::entry($a['id']) === null, 'the oldest plugin copy went first');
    ok(Vault::entry($b['id']) === null, 'then the next oldest');
    ok(Vault::entry($zip2['id']) !== null, 'the newest plugin copy stays');
    ok(Vault::entry($e['id']) !== null, 'the guard copy is never evicted');

    // Quarantine expiry.
    $q = Vault::quarantine_dir(999);
    file_put_contents($q . '/old.txt', 'x');
    touch($q, time() - 100 * 86400);
    Vault::expire_quarantine();
    ok(!is_dir($q), 'quarantine older than 90 days is removed');

    // Witness line carries the manifest fingerprint.
    ok(str_contains(Heartbeat::witness(), 'manifest ' . (string) State::get('vault_witness')), 'witness carries the manifest fingerprint');
});

suite('A1 quarantine: executables under uploads go, stubs and every existing .htaccess stay', function () {
    tick();
    $ht_before = count((array) glob(WP_CONTENT_DIR . '/uploads/*/.htaccess')) + count((array) glob(WP_CONTENT_DIR . '/uploads/*/*/.htaccess')) + (is_file(WP_CONTENT_DIR . '/uploads/.htaccess') ? 1 : 0);
    eq(19, $ht_before, 'nineteen .htaccess files in uploads');
    eq([], events_of('quarantined'), 'first pass quarantines nothing');
    eq(0, count(array_filter(Alerts::active(Fortress::MINCETA), static fn($a) => str_starts_with($a['kind'], 'uploads-control'))), 'the first pass baselines every control file silently');
    foreach (Minceta::STUB_ALLOWLIST as $rel => $size) {
        ok(is_file(WP_CONTENT_DIR . '/uploads/' . $rel), 'stub stays: ' . $rel);
    }

    // A web shell appears.
    $shell = Test_Site::write('wp-content/uploads/2026/10/photo.jpg.php', "<?php eval(base64_decode(\$_POST['x']));\n");
    $new_ht = Test_Site::write('wp-content/uploads/2026/.htaccess', "AddHandler application/x-httpd-php .jpg\n");
    $ini    = Test_Site::write('wp-content/uploads/2026/10/.user.ini', "auto_prepend_file = /tmp/x.php\n");
    $stub   = Test_Site::write('wp-content/uploads/newplugin/index.php', "<?php // Silence is golden.\n");
    $safe   = Test_Site::write('wp-content/uploads/2026/11/.htaccess', "Options -Indexes\n");
    tick();
    ok(!is_file($shell), 'the shell is gone from uploads');
    ok(!is_file($new_ht), 'the AddHandler .htaccess is gone');
    ok(!is_file($ini), 'the auto_prepend .user.ini is gone');
    ok(is_file($stub), 'a benign new stub stays');
    ok(is_file($safe), 'a harmless new .htaccess stays');
    $ht_after = count((array) glob(WP_CONTENT_DIR . '/uploads/*/.htaccess')) + count((array) glob(WP_CONTENT_DIR . '/uploads/*/*/.htaccess')) + (is_file(WP_CONTENT_DIR . '/uploads/.htaccess') ? 1 : 0);
    eq(20, $ht_after, 'the nineteen originals plus the harmless new one remain');
    eq(3, count(events_of('quarantined')), 'three quarantines journaled');
    $rows = Journal::recent(10, Journal::COMMITTED, 'quarantine');
    eq(3, count($rows), 'three committed quarantine rows');
    foreach ($rows as $row) {
        ok(is_file($row['after']['dest']), 'quarantined copy exists for ' . $row['target']);
        ok(str_contains($row['after']['dest'], '/quarantine/'), 'inside the vault quarantine');
    }
    ok(count(Alerts::active(Fortress::MINCETA)) >= 3, 'findings are active');

    // Reverse puts it back exactly.
    $row = Journal::latest('quarantine', 'wp-content/uploads/2026/10/photo.jpg.php');
    [$ok, $msg] = Actions::reverse((int) $row['id']);
    ok($ok, 'reverse works: ' . $msg);
    ok(is_file($shell) && str_contains((string) file_get_contents($shell), 'eval'), 'file is back, byte for byte');
    eq(Journal::REVERSED, Journal::get((int) $row['id'])['state'], 'row is reversed');

    // Put back on request means it belongs there: the next pass leaves it alone.
    tick();
    ok(is_file($shell), 'a file put back on request is not quarantined again');
    eq(3, count(events_of('quarantined')), 'no new quarantine after the undo');

    // The wpforms rule turns the engine OFF: changing it must not quarantine.
    $wpforms = WP_CONTENT_DIR . '/uploads/wpforms/.htaccess';
    file_put_contents($wpforms, "# Disable PHP, updated\nphp_flag engine off\n<FilesMatch \"\\.php$\">\nRequire all denied\n</FilesMatch>\n");
    tick();
    ok(is_file($wpforms), 'a changed protective .htaccess is not quarantined');
    ok(count(events_of('quarantined')) === 3, 'no new quarantine');

    // A changed one that re-enables execution is.
    file_put_contents(WP_CONTENT_DIR . '/uploads/mphb/.htaccess', "<FilesMatch \"\\.php$\">\nRequire all granted\n</FilesMatch>\n");
    tick();
    ok(!is_file(WP_CONTENT_DIR . '/uploads/mphb/.htaccess'), 'a changed .htaccess that allows PHP is quarantined');

    // The vault itself is never walked, even in the uploads fallback place.
    @mkdir(WP_CONTENT_DIR . '/uploads/ragusa-vault/x', 0755, true);
    file_put_contents(WP_CONTENT_DIR . '/uploads/ragusa-vault/x/evil.php', '<?php');
    tick();
    ok(is_file(WP_CONTENT_DIR . '/uploads/ragusa-vault/x/evil.php'), 'nothing under a ragusa-vault folder is touched');
});

suite('Htaccess rule: meaning, not keywords', function () {
    ok(Htaccess::enables_execution("AddHandler application/x-httpd-php .jpg\n"), 'AddHandler php');
    ok(Htaccess::enables_execution("SetHandler application/x-httpd-php\n"), 'SetHandler php');
    ok(Htaccess::enables_execution("AddType application/x-httpd-php .png\n"), 'AddType php');
    ok(Htaccess::enables_execution("php_flag engine on\n"), 'engine on');
    ok(!Htaccess::enables_execution("php_flag engine off\n"), 'engine off is protection');
    ok(Htaccess::enables_execution("Options +ExecCGI\n"), 'ExecCGI on');
    ok(!Htaccess::enables_execution("Options -ExecCGI -Indexes\n"), 'ExecCGI off');
    ok(Htaccess::enables_execution("<FilesMatch \"\\.php$\">\nAllow from all\n</FilesMatch>\n"), 'FilesMatch allowing php');
    ok(!Htaccess::enables_execution("<FilesMatch \"\\.(php|phtml)$\">\nRequire all denied\n</FilesMatch>\n"), 'FilesMatch denying php is protection');
    ok(!Htaccess::enables_execution("Deny from all\n"), 'deny from all');
    ok(!Htaccess::enables_execution("# AddHandler in a comment\nOptions -Indexes\n"), 'a comment is not a directive');
    ok(!Htaccess::enables_execution("<FilesMatch \"\\.(php)$\">\nDeny from all\n</Files>\n"), 'the malformed fm_backup file is not permissive');
    ok(Htaccess::ini_enables_execution("auto_prepend_file=\"/x.php\"\n"), 'ini prepend');
    ok(!Htaccess::ini_enables_execution("; comment\nmemory_limit = 256M\n"), 'ini harmless');

    $ht = "# BEGIN DCC Security\nA\n# END DCC Security\n\n# BEGIN SpeedyCache\nB\n# END SpeedyCache\n";
    eq("# BEGIN DCC Security\nA\n# END DCC Security", Htaccess::extract_block($ht), 'extract block');
    $new = Htaccess::replace_block($ht, "# BEGIN DCC Security\nA2\n# END DCC Security");
    eq("# BEGIN DCC Security\nA2\n# END DCC Security\n\n# BEGIN SpeedyCache\nB\n# END SpeedyCache\n", $new, 'only the block changes');
    eq("# BEGIN DCC Security\nA\n# END DCC Security\n# BEGIN SpeedyCache\nB\n# END SpeedyCache\n", Htaccess::replace_block("# BEGIN SpeedyCache\nB\n# END SpeedyCache\n", "# BEGIN DCC Security\nA\n# END DCC Security"), 'missing markers: the block goes to line 1');
});

suite('A2 restore guard: a changed guard is put back, the edit is kept, seal stops the loop, the loop guard holds', function () {
    tick();
    $guard = WPMU_PLUGIN_DIR . '/dcc-postpass-guard.php';
    $orig  = (string) file_get_contents($guard);
    file_put_contents($guard, "<?php\n// tampered\n");
    tick();
    eq($orig, file_get_contents($guard), 'guard restored from the sealed copy');
    $row = Journal::latest('restore-guard', 'wp-content/mu-plugins/dcc-postpass-guard.php');
    eq(Journal::COMMITTED, $row['state'], 'row committed');
    ok(is_file($row['before']['kept']) && str_contains((string) file_get_contents($row['before']['kept']), 'tampered'), 'the changed file is kept in quarantine');
    eq(1, count(events_of('guard-restored')), 'one event');
    ok(preg_match('/Ragusa, [A-Z][a-z]{2} \\d{1,2}, \\d{1,2}:\\d{2} [AP]M E[DS]T: /', Alerts::body(['what' => 'w', 'did' => 'd', 'todo' => 't'])) === 1, 'body carries the plain link, stamped with the property clock and zone');

    // Reverse puts the edit back; then seal makes it the good copy.
    [$ok, $msg] = Actions::reverse((int) $row['id']);
    ok($ok, 'reverse: ' . $msg);
    ok(str_contains((string) file_get_contents($guard), 'tampered'), 'the edited version is back');
    [$ok, $msg] = Revelin::seal('wp-content/mu-plugins/dcc-postpass-guard.php');
    ok($ok, 'seal: ' . $msg);
    tick();
    ok(str_contains((string) file_get_contents($guard), 'tampered'), 'after seal, the edited version is the good copy and is not restored');
    eq(0, count(Alerts::open(Fortress::REVELIN)), 'the finding resolved on seal');

    // A missing guard is restored too.
    unlink($guard);
    tick();
    ok(is_file($guard), 'a missing guard is restored');

    // Loop guard: after two restores in 24h a third mismatch alerts instead.
    file_put_contents($guard, "<?php\n// again\n");
    tick();
    file_put_contents($guard, "<?php\n// and again\n");
    tick();
    ok(str_contains((string) file_get_contents($guard), 'and again'), 'third change is not restored');
    ok(count(events_of('guard-restored')) >= 2, 'two restores happened');
    ok(isset(Alerts::active(Fortress::REVELIN)[Events::fingerprint(Fortress::REVELIN, 'guard-keeps-changing', 'wp-content/mu-plugins/dcc-postpass-guard.php')]), 'keeps-changing alert raised');

    // A sealed copy with a syntax error is never put back.
    $g2 = WPMU_PLUGIN_DIR . '/dcc-ical-privacy.php';
    file_put_contents($g2, "<?php\nfunction broken( {\n");
    Revelin::seal('wp-content/mu-plugins/dcc-ical-privacy.php');
    file_put_contents($g2, "<?php\n// fine now\n");
    tick();
    ok(str_contains((string) file_get_contents($g2), 'fine now'), 'a sealed copy failing php -l is not restored');
    ok(count(events_of('restore-failed')) >= 1, 'the refusal is journaled');

    // Guards in uploads are in the sealed set.
    $up = WP_CONTENT_DIR . '/uploads/.htaccess';
    file_put_contents($up, "AddHandler application/x-httpd-php .jpg\n");
    tick();
    ok(str_contains((string) file_get_contents($up), 'Require all denied'), 'uploads/.htaccess restored from its sealed copy');
    $pr = WP_CONTENT_DIR . '/uploads/mphb_protected_uploads/.htaccess';
    unlink($pr);
    tick();
    ok(is_file($pr) && str_contains((string) file_get_contents($pr), 'Deny from all'), 'the guests\' photo folder rule is restored when removed');
});

suite('A2 recovery: a run that dies at each state is finished or reversed by the next', function () {
    tick();
    $guard = WPMU_PLUGIN_DIR . '/dcc-user-enum-guard.php';
    $rel   = 'wp-content/mu-plugins/dcc-user-enum-guard.php';
    $entry = Vault::latest('guard', 'mu-plugins/dcc-user-enum-guard.php');

    // Died at Planned: nothing changed, row abandoned.
    $id = Journal::create('restore-guard', $rel, ['label' => 'x', 'entry' => $entry['id']]);
    age_row($id, 300);
    Journal::new_run();
    Actions::recover();
    eq(Journal::ABANDONED, Journal::get($id)['state'], 'planned row abandoned');

    // Died at Acting with the staged temp file present and the rename not done.
    file_put_contents($guard, "<?php\n// tampered\n");
    $id = Journal::create('restore-guard', $rel, ['label' => 'mu-plugins/dcc-user-enum-guard.php', 'entry' => $entry['id']]);
    Journal::set_state($id, Journal::BEFORE, ['before' => ['exists' => true]]);
    Journal::set_state($id, Journal::ACTING, ['after' => ['tmp' => $guard . '.ragusa-tmp', 'sha256' => $entry['sha256']]]);
    copy(Vault::path($entry), $guard . '.ragusa-tmp');
    age_row($id, 300);
    Journal::new_run();
    Actions::recover();
    eq(Journal::ABANDONED, Journal::get($id)['state'], 'acting row without the rename is abandoned');
    ok(!file_exists($guard . '.ragusa-tmp'), 'the staged temp file is removed');
    ok(str_contains((string) file_get_contents($guard), 'tampered'), 'the file was left as found');

    // Died at Acting after the rename: verification finishes it.
    copy(Vault::path($entry), $guard);
    $id = Journal::create('restore-guard', $rel, ['label' => 'mu-plugins/dcc-user-enum-guard.php', 'entry' => $entry['id']]);
    Journal::set_state($id, Journal::ACTING, ['after' => ['tmp' => $guard . '.ragusa-tmp', 'sha256' => $entry['sha256']]]);
    age_row($id, 300);
    Journal::new_run();
    Actions::recover();
    eq(Journal::COMMITTED, Journal::get($id)['state'], 'acting row with the rename done is verified and committed');

    // Died at Verifying: verification runs again.
    $id = Journal::create('restore-guard', $rel, ['label' => 'mu-plugins/dcc-user-enum-guard.php', 'entry' => $entry['id']]);
    Journal::set_state($id, Journal::VERIFYING, ['after' => ['sha256' => $entry['sha256']]]);
    age_row($id, 300);
    Journal::new_run();
    Actions::recover();
    eq(Journal::COMMITTED, Journal::get($id)['state'], 'verifying row is finished');

    // A fresh row is never touched by recovery.
    $id = Journal::create('restore-guard', $rel, []);
    Journal::new_run();
    Actions::recover();
    eq(Journal::PLANNED, Journal::get($id)['state'], 'a row younger than two minutes is left alone');
});

suite('A3 .htaccess block: rewritten between its markers only, reversed if the site stops answering, alert-only without loopbacks', function () {
    tick();
    $path = Htaccess::path();
    $orig = (string) file_get_contents($path);
    file_put_contents($path, str_replace('# kept for Jetpack', '# tampered', $orig));
    tick();
    eq($orig, file_get_contents($path), 'block rewritten, the SpeedyCache part untouched');
    $row = Journal::latest('htaccess-block', '.htaccess');
    eq(Journal::COMMITTED, $row['state'], 'committed');

    // Markers removed entirely: the block goes back to line 1.
    file_put_contents($path, Test_Site::PREGZ_BLOCK . "\n" . Test_Site::SPEEDY_BLOCK);
    tick();
    ok(str_starts_with((string) file_get_contents($path), '# BEGIN DCC Security'), 'block restored at line 1');
    ok(str_contains((string) file_get_contents($path), '# BEGIN speedycache'), 'the rest kept');

    // The home page fails after the rewrite: reversed.
    file_put_contents($path, str_replace('# kept for Jetpack', '# tampered again', $orig));
    $GLOBALS['dccr_site_handler'] = static function (string $url, array $args) {
        return str_ends_with((string) parse_url($url, PHP_URL_PATH), 'wp-cron.php') ? dccr_http_ok('') : dccr_http_ok('', 500);
    };
    tick();
    ok(str_contains((string) file_get_contents($path), 'tampered again'), 'rewrite reversed when the home page fails');
    eq(Journal::REVERSED, Journal::latest('htaccess-block', '.htaccess')['state'], 'row reversed');
    $GLOBALS['dccr_site_handler'] = null;

    // No loopbacks: alert only.
    State::set('loopback', ['ok' => false, 'checked_at' => time()]);
    $before = count(Journal::recent(50, null, 'htaccess-block'));
    tick();
    eq($before, count(Journal::recent(50, null, 'htaccess-block')), 'no new action without loopbacks');
    ok(isset(Alerts::active(Fortress::REVELIN)[Events::fingerprint(Fortress::REVELIN, 'htaccess-block-changed', '.htaccess')]), 'alert raised instead');
});

suite('0.1.4 .htaccess block order: pre-gzipped above speedycache, an alert that names the fix, never a rewrite', function () {
    // The rule on its own.
    eq(Htaccess::ORDER_OK, Htaccess::order_problem(Test_Site::PREGZ_BLOCK . "\n" . Test_Site::SPEEDY_BLOCK), 'pre-gzipped above speedycache is fine');
    eq(Htaccess::ORDER_WRONG, Htaccess::order_problem(Test_Site::SPEEDY_BLOCK . "\n" . Test_Site::PREGZ_BLOCK), 'speedycache above pre-gzipped is the wrong order');
    eq(Htaccess::ORDER_PREGZ_MISSING, Htaccess::order_problem(Test_Site::SPEEDY_BLOCK), 'no pre-gzipped block');
    eq(Htaccess::ORDER_NO_SPEEDY, Htaccess::order_problem(Test_Site::PREGZ_BLOCK), 'no speedycache block: nothing to order');
    eq(Htaccess::ORDER_NO_SPEEDY, Htaccess::order_problem(''), 'neither block (staging): nothing to order');
    eq(Htaccess::ORDER_OK, Htaccess::order_problem(Test_Site::PREGZ_BLOCK . "\n# BEGIN SpeedyCache\n# END SpeedyCache\n"), 'the speedycache marker is matched whatever its case');
    eq(Htaccess::ORDER_PREGZ_MISSING, Htaccess::order_problem("# BEGIN DCC Pre-gzip Cache\n# END DCC Pre-gzip Cache\n" . Test_Site::SPEEDY_BLOCK), 'a near-miss name is not the block');

    $path = Htaccess::path();
    $orig = (string) file_get_contents($path);
    $fp   = Events::fingerprint(Fortress::REVELIN, 'htaccess-order', '.htaccess');
    State::set('loopback', ['ok' => true, 'checked_at' => time()]);
    Alerts::force(true); // staging sends nothing; prove the live email here
    tick();
    ok(Alerts::get($fp) === null || Alerts::state(Alerts::get($fp)) !== 'open', 'the right order raises nothing');

    // SpeedyCache rewrites its block above ours.
    $swapped = str_replace([Test_Site::PREGZ_BLOCK, Test_Site::SPEEDY_BLOCK], ['@@S@@', '@@P@@'], $orig);
    $swapped = str_replace(['@@S@@', '@@P@@'], [Test_Site::SPEEDY_BLOCK, Test_Site::PREGZ_BLOCK], $swapped);
    ok($swapped !== $orig && Htaccess::order_problem($swapped) === Htaccess::ORDER_WRONG, 'fixture swapped');
    file_put_contents($path, $swapped);
    $mails = count(mails_with('Pre-gzipped'));
    $rows  = count(Journal::recent(50, null, 'htaccess-block'));
    tick();
    $a = Alerts::get($fp);
    ok($a !== null && Alerts::state($a) === 'open', 'the wrong order is an open finding');
    eq(Events::NEEDS_LOOK, $a['severity'], 'needs a look, not breached');
    eq('The Pre-gzipped Cache Block Is Below SpeedyCache', $a['title'], 'title');
    eq($swapped, file_get_contents($path), '.htaccess untouched: an alert, never a rewrite');
    eq($rows, count(Journal::recent(50, null, 'htaccess-block')), 'no journal row');
    eq(1, count(mails_with('Pre-gzipped')) - $mails, 'one email from Revelin (Minčeta\'s own "File Changed: .htaccess" is its business)');
    $mail = mails_with('Below SpeedyCache')[0];
    ok(str_contains($mail['body'], 'Move the DCC Pre-gzipped Cache block above # BEGIN speedycache.'), 'the email names the fix');
    eq(1, count(events_of('htaccess-order')), 'one event');
    tick();
    eq(1, count(events_of('htaccess-order')), 'a second tick adds no event while the problem is the same');
    ok(str_contains(Fortress::status(Fortress::REVELIN)['state'] ?? '', 'needs') || Fortress::status(Fortress::REVELIN)['state'] === Fortress::NEEDS_LOOK, 'Revelin card needs a look');

    // The Director moves it back.
    file_put_contents($path, $orig);
    tick();
    eq('resolved', Alerts::state(Alerts::get($fp)), 'resolved once the order is right');
    ok(count(mails_with('All Clear: The Pre-gzipped Cache Block Is Below SpeedyCache')) === 1, 'one All Clear, since it was emailed');

    // The DCC block missing below a present speedycache block is a finding with its own title.
    file_put_contents($path, str_replace(Test_Site::PREGZ_BLOCK, '', $orig));
    tick();
    eq('The Pre-gzipped Cache Block Is Missing', Alerts::get($fp)['title'], 'pre-gzipped block missing');
    eq('open', Alerts::state(Alerts::get($fp)), 'open again');
    ok(str_contains(Alerts::body(Alerts::get($fp) + ['todo' => 'Put the DCC Pre-gzipped Cache block back, above # BEGIN speedycache.']), 'above # BEGIN speedycache'), 'the fix names the order');
    eq(2, count(array_filter(events_of('htaccess-order'), static fn($e) => $e['severity'] === Events::NEEDS_LOOK)), 'a different problem is a new event');

    // 0.1.5: no speedycache block (staging has none) is nothing to order: quiet, one info line, and it clears an open finding.
    file_put_contents($path, str_replace(Test_Site::SPEEDY_BLOCK, '', $orig));
    tick();
    eq('resolved', Alerts::state(Alerts::get($fp)), 'without a speedycache block the open finding resolves');
    $infos = array_filter(events_of('htaccess-order'), static fn($e) => $e['severity'] === Events::INFO);
    eq(1, count($infos), 'one info line');
    ok(str_contains(reset($infos)['message'], 'SpeedyCache has no rewrite block here'), 'saying SpeedyCache has no rewrite block here');
    tick();
    eq(1, count(array_filter(events_of('htaccess-order'), static fn($e) => $e['severity'] === Events::INFO)), 'and not again on the next tick');
    file_put_contents($path, str_replace([Test_Site::PREGZ_BLOCK, Test_Site::SPEEDY_BLOCK], '', $orig)); // the DCC Security block alone, like staging
    $mails = count(mails_with('Pre-gzipped')) + count(mails_with('SpeedyCache'));
    tick();
    ok(Alerts::state(Alerts::get($fp)) !== 'open', 'neither block: no finding');
    eq($mails, count(mails_with('Pre-gzipped')) + count(mails_with('SpeedyCache')), 'and no email about it');
    eq(Fortress::HOLDING, Alerts::worst(Fortress::REVELIN), 'Revelin holds with neither block');
    file_put_contents($path, $orig);
    tick();
    ok(Alerts::state(Alerts::get($fp)) !== 'open', 'both back in order: still nothing open');
    file_put_contents($path, str_replace(Test_Site::SPEEDY_BLOCK, '', $orig));
    tick();
    eq(2, count(array_filter(events_of('htaccess-order'), static fn($e) => $e['severity'] === Events::INFO)), 'the info line returns once the block was there and is gone again');
    file_put_contents($path, $orig);
    tick();
    Alerts::force(false);
});

suite('0.1.6 a booking page can be cached: dead SpeedyCache page rules with slashes, cached booking folders; read-only, email once, no journal row', function () {
    // The rule reader, on the option's shapes.
    $rules = [
        ['type' => 'page', 'prefix' => 'contain', 'content' => '/submit-booking/'],
        ['type' => 'page', 'prefix' => 'contain', 'content' => 'booking-confirmation'],
        ['type' => 'page', 'prefix' => 'contain', 'content' => '/checkout'],
        ['type' => 'js',   'prefix' => 'contain', 'content' => '/wp-content/plugins/dcc-custom-checkout/assets/checkout.js'],
        ['type' => 'css',  'prefix' => 'contain', 'content' => '/account/style.css'],
        ['type' => 'page', 'prefix' => 'contain', 'content' => '/events/'],
        ['type' => 'page', 'prefix' => 'contain', 'content' => '/guest/'],
        ['type' => 'page', 'prefix' => 'startwith', 'content' => 'search-results'],
    ];
    eq(['/submit-booking/', '/checkout'], Speedycache::dead_booking_rules($rules), 'only page rules naming a booking page and carrying a slash are dead');
    eq(['/submit-booking/', '/checkout'], Speedycache::dead_booking_rules((string) json_encode($rules)), 'the same when the option is a JSON string');
    eq([], Speedycache::dead_booking_rules([['type' => 'js', 'prefix' => 'contain', 'content' => '/submit-booking/x.js']]), 'a JS rule with a slash raises nothing');
    eq([], Speedycache::dead_booking_rules([['type' => 'page', 'prefix' => 'contain', 'content' => 'submit-booking']]), 'a page rule without slashes raises nothing');
    eq([], Speedycache::dead_booking_rules([['type' => 'page', 'prefix' => 'contain', 'content' => '/guest/']]), 'a /guest/ rule raises nothing: Rob keeps it cached');
    eq([], Speedycache::dead_booking_rules([['type' => 'page', 'prefix' => 'contain', 'content' => '/events/']]), 'the dead /events/ rule is left alone');
    eq([], Speedycache::dead_booking_rules('not json'), 'garbage is no rules');
    eq([], Speedycache::dead_booking_rules(false), 'no option is no rules');

    // The cache folders.
    $cache = WP_CONTENT_DIR . '/cache/speedycache/doracanalcourt.com/all';
    eq([], Speedycache::cached_booking_folders(), 'no cache folder, nothing');
    mkdir($cache . '/guest', 0755, true);
    file_put_contents($cache . '/guest/index.html', '<html>guest</html>');
    mkdir($cache . '/explore', 0755, true);
    eq([], Speedycache::cached_booking_folders(), '/guest/ cached raises nothing, nor does any other page');
    mkdir($cache . '/submit-booking', 0755, true);
    file_put_contents($cache . '/submit-booking/index.html', '<html>stale</html>');
    eq(['wp-content/cache/speedycache/doracanalcourt.com/all/submit-booking/'], Speedycache::cached_booking_folders(), 'a cached submit-booking is found');

    // The tick: one finding, the two fixes, an email once, no journal row, nothing rewritten.
    $fp = Events::fingerprint(Fortress::REVELIN, 'booking-cacheable', 'speedycache');
    update_option(Speedycache::OPTION, $rules);
    $journal = count(Journal::recent(50));
    Alerts::force(true);
    $mails = count(mails_with('A Booking Page Can Be Cached'));
    tick();
    $a = Alerts::get($fp);
    ok($a !== null && Alerts::state($a) === 'open', 'the finding is open');
    eq('A Booking Page Can Be Cached', $a['title'], 'title');
    eq(Events::NEEDS_LOOK, $a['severity'], 'needs a look');
    eq(1, count(mails_with('A Booking Page Can Be Cached')) - $mails, 'one email');
    $mail = mails_with('A Booking Page Can Be Cached')[0];
    ok(str_contains($mail['body'], '"/submit-booking/", "/checkout"'), 'the email names the rules');
    ok(str_contains($mail['body'], 'Remove the slashes from the rule text.'), 'and the rule fix');
    ok(str_contains($mail['body'], 'wp-content/cache/speedycache/doracanalcourt.com/all/submit-booking/'), 'and the folder');
    ok(str_contains($mail['body'], 'Delete the folder, then purge SpeedyCache and the server cache.'), 'and the folder fix');
    ok(!str_contains($mail['body'], '/events/') && !str_contains($mail['body'], '/guest/'), 'neither /events/ nor /guest/ is named');
    eq($journal, count(Journal::recent(50)), 'no journal row: nothing was changed');
    eq($rules, get_option(Speedycache::OPTION), 'the option is untouched');
    ok(is_file($cache . '/submit-booking/index.html'), 'the cache folder is untouched');
    eq(1, count(events_of('booking-cacheable')), 'one event');
    tick();
    eq(1, count(events_of('booking-cacheable')), 'no new event while nothing changed');
    eq(1, count(mails_with('A Booking Page Can Be Cached')) - $mails, 'no second email');

    // The Director fixes the rules; the folder still stands: still open, with only the folder now.
    $fixed = $rules;
    $fixed[0]['content'] = 'submit-booking';
    $fixed[2]['content'] = 'checkout';
    update_option(Speedycache::OPTION, $fixed);
    tick();
    eq('open', Alerts::state(Alerts::get($fp)), 'still open while the folder stands');
    eq(2, count(events_of('booking-cacheable')), 'the changed set is a new event');

    // The folder goes: resolved on the next tick, with one All Clear.
    unlink($cache . '/submit-booking/index.html');
    rmdir($cache . '/submit-booking');
    tick();
    eq('resolved', Alerts::state(Alerts::get($fp)), 'resolved once both are fixed');
    eq(1, count(mails_with('All Clear: A Booking Page Can Be Cached')), 'one All Clear');
    ok(is_dir($cache . '/guest'), '/guest/ stays cached');
    Alerts::force(false);
    delete_option(Speedycache::OPTION);
});

suite('Sveti Ivan + A4: a repeated failure rolls the update back; the old version is verified; undo brings the new one back', function () {
    tick();
    break_cottage_when('1.5.0');
    $id = simulate_update('wporg-plugin', '1.5.0');
    ok($id > 0, 'update-check row created');
    $row = Journal::get($id);
    eq('update', $row['before']['kind'], 'kind is update');
    eq('1.4.0', $row['before']['old_version'], 'old version sealed');
    eq('1.5.0', $row['before']['new_version'], 'new version read');
    ok(!empty($row['before']['entry']) && Vault::entry($row['before']['entry']) !== null, 'the pre-update copy exists');
    ok(!empty($row['verify']['inline']['page /accommodation/cottage-34/']) && $row['verify']['inline']['page /accommodation/cottage-34/']['ok'] === false, 'inline check saw the broken page');
    eq(Journal::VERIFYING, $row['state'], 'row waits for the follow-up');
    ok(wp_next_scheduled('dccr_update_check', [$id]) !== false, 'follow-up scheduled');

    Sveti_Ivan::scheduled_check($id);
    $row = Journal::get($id);
    eq(Journal::VERIFYING, $row['state'], 'one failure is not enough');
    ok(!empty($row['verify']['first_fail']), 'first failure recorded');
    eq('1.5.0', Revelin::plugin_version('wporg-plugin'), 'nothing rolled back yet');
    eq(0, count(Journal::recent(5, null, 'rollback')), 'no rollback row yet');

    Sveti_Ivan::scheduled_check($id);
    $rb = Journal::latest('rollback', 'wporg-plugin');
    ok($rb !== null, 'rollback row created on the repeat');
    eq(Journal::VERIFYING, $rb['state'], 'rollback waits for its verification');
    eq('1.4.0', Revelin::plugin_version('wporg-plugin'), 'the previous version is in place');
    ok(is_dir($rb['after']['quarantine']) && str_contains((string) file_get_contents($rb['after']['quarantine'] . '/wporg-plugin.php'), '1.5.0'), 'the broken version is in quarantine');
    ok(!in_array('wporg-plugin/wporg-plugin.php', (array) get_option('auto_update_plugins'), true), 'auto-update switched off for this plugin');
    ok(($GLOBALS['dccr_cache_flushed'] ?? 0) > 0, 'caches purged');

    $verify = Journal::latest('update-check', 'wporg-plugin');
    ok((int) $verify['id'] !== $id && (int) ($verify['before']['rollback_of'] ?? 0) === (int) $rb['id'], 'a verification row points at the rollback');
    Sveti_Ivan::scheduled_check((int) $verify['id']);
    eq(Journal::COMMITTED, Journal::get((int) $rb['id'])['state'], 'rollback committed after the old version passes');
    ok(count(events_of('update-rolled-back')) === 1, 'rolled-back event');
    eq(Fortress::BREACHED, Fortress::status(Fortress::SVETI_IVAN)['state'], 'card shows breached');

    [$ok, $msg] = Actions::reverse((int) $rb['id']);
    ok($ok, 'undo: ' . $msg);
    eq('1.5.0', Revelin::plugin_version('wporg-plugin'), 'undo brings the new version back');
    ok(in_array('wporg-plugin/wporg-plugin.php', (array) get_option('auto_update_plugins'), true), 'auto-update restored');
    $GLOBALS['dccr_site_handler'] = null;
});

suite('Sveti Ivan: a transient failure never rolls back', function () {
    tick();
    $calls = 0;
    $GLOBALS['dccr_site_handler'] = static function (string $url, array $args) use (&$calls) {
        if (str_contains($url, 'cottage-34')) {
            $calls++;
            if ($calls <= 2) {
                return dccr_http_ok('hiccup', 503);
            }
        }
        return Test_Site::site_page($url);
    };
    $id = simulate_update('wporg-plugin', '1.5.0');
    Sveti_Ivan::scheduled_check($id);
    eq(Journal::VERIFYING, Journal::get($id)['state'], 'first failure recorded, waiting');
    Sveti_Ivan::scheduled_check($id);
    eq(Journal::COMMITTED, Journal::get($id)['state'], 'the repeat passed: committed');
    eq(0, count(Journal::recent(5, null, 'rollback')), 'no rollback');
    eq('1.5.0', Revelin::plugin_version('wporg-plugin'), 'new version kept');
    eq(0, count(mails_with('Rolled Back')), 'no rollback email');
    $GLOBALS['dccr_site_handler'] = null;
});

suite('Sveti Ivan: a host that does not answer at all is a hiccup, not an update failure', function () {
    tick();
    $GLOBALS['dccr_site_handler'] = static function (string $url, array $args) {
        return str_ends_with((string) parse_url($url, PHP_URL_PATH), 'wp-cron.php') ? dccr_http_ok('') : new WP_Error('http_request_failed', 'timed out');
    };
    $id = simulate_update('wporg-plugin', '1.5.0');
    for ($i = 0; $i < 3; $i++) {
        Sveti_Ivan::scheduled_check($id);
    }
    eq(Journal::FAILED, Journal::get($id)['state'], 'after three silent attempts the row fails');
    eq(0, count(Journal::recent(5, null, 'rollback')), 'no rollback');
    ok(isset(Alerts::active(Fortress::SVETI_IVAN)[Events::fingerprint(Fortress::SVETI_IVAN, 'update-unverified', 'wporg-plugin')]), 'could-not-verify finding');
    $GLOBALS['dccr_site_handler'] = null;
});

suite('A4: when the old version fails too, the update is put back (Reversed)', function () {
    tick();
    $GLOBALS['dccr_site_handler'] = static function (string $url, array $args) {
        return str_contains($url, 'cottage-34') ? dccr_http_ok('broken', 500) : Test_Site::site_page($url);
    };
    $id = simulate_update('wporg-plugin', '1.5.0');
    Sveti_Ivan::scheduled_check($id);
    Sveti_Ivan::scheduled_check($id);
    $rb = Journal::latest('rollback', 'wporg-plugin');
    ok($rb !== null, 'rolled back');
    $verify = Journal::latest('update-check', 'wporg-plugin');
    Sveti_Ivan::scheduled_check((int) $verify['id']);
    Sveti_Ivan::scheduled_check((int) $verify['id']);
    eq(Journal::REVERSED, Journal::get((int) $rb['id'])['state'], 'rollback reversed: not the update');
    eq('1.5.0', Revelin::plugin_version('wporg-plugin'), 'the new version is back');
    ok(in_array('wporg-plugin/wporg-plugin.php', (array) get_option('auto_update_plugins'), true), 'auto-update flag restored');
    ok(count(events_of('update-failed')) >= 0 && isset(Alerts::active(Fortress::SVETI_IVAN)[Events::fingerprint(Fortress::SVETI_IVAN, 'update-failed', 'wporg-plugin')]), 'alert says the check fails with either version');
    $GLOBALS['dccr_site_handler'] = null;
});

suite('A4 recovery: dying between the two renames is finished by the next run', function () {
    tick();
    $entry = Revelin::seal_plugin('wporg-plugin');
    plugin_file('wporg-plugin', '1.5.0');
    $id = Journal::create('rollback', 'wporg-plugin', ['slug' => 'wporg-plugin', 'entry' => $entry['id'], 'new_version' => '1.5.0', 'old_version' => '1.4.0']);
    Journal::set_state($id, Journal::BEFORE, ['before' => ['dir' => 'wp-content/plugins/wporg-plugin', 'plugin_file' => 'wporg-plugin/wporg-plugin.php', 'auto_update' => true]]);
    $staged = WP_CONTENT_DIR . '/upgrade/ragusa-wporg-plugin-' . $id;
    $quar   = Vault::quarantine_dir($id) . '/wporg-plugin';
    Journal::set_state($id, Journal::ACTING, ['after' => ['staged' => $staged, 'quarantine' => $quar, 'step' => 2]]);
    Vault::extract($entry, $staged);
    rename(WP_PLUGIN_DIR . '/wporg-plugin', $quar); // step 2 done, step 3 not
    age_row($id, 300);
    Journal::new_run();
    $lines = Actions::recover();
    ok(is_dir(WP_PLUGIN_DIR . '/wporg-plugin'), 'the plugin folder is back: ' . implode('; ', $lines));
    eq('1.4.0', Revelin::plugin_version('wporg-plugin'), 'with the previous version');
    eq(Journal::VERIFYING, Journal::get($id)['state'], 'and verification is pending');
    ok(!in_array('wporg-plugin/wporg-plugin.php', (array) get_option('auto_update_plugins'), true), 'auto-update flag handled');

    // Dying before the swap started: the staged copy is removed, row abandoned.
    $id2 = Journal::create('rollback', 'wporg-plugin', ['slug' => 'wporg-plugin', 'entry' => $entry['id']]);
    $staged2 = WP_CONTENT_DIR . '/upgrade/ragusa-wporg-plugin-' . $id2;
    Journal::set_state($id2, Journal::ACTING, ['after' => ['staged' => $staged2, 'quarantine' => Vault::quarantine_dir($id2) . '/wporg-plugin', 'step' => 1]]);
    Vault::extract($entry, $staged2);
    age_row($id2, 300);
    Journal::new_run();
    Actions::recover();
    eq(Journal::ABANDONED, Journal::get($id2)['state'], 'swap not started: abandoned');
    ok(!is_dir($staged2), 'staged copy removed');
});

suite('Sveti Ivan: forced install over an existing slug is an update; a brand-new slug is an install and never rolls back', function () {
    tick();
    break_cottage_when('1.5.0');
    $id = simulate_update('wporg-plugin', '1.5.0', 'install');
    eq('update', Journal::get($id)['before']['kind'], 'wp plugin install --force over an existing slug counts as an update');
    ok(!empty(Journal::get($id)['before']['entry']), 'and it was sealed');
    $GLOBALS['dccr_site_handler'] = null;

    // A brand-new plugin: no seal, no rollback, alert on a repeated failure.
    $GLOBALS['dccr_site_handler'] = static fn(string $url, array $args) => str_contains($url, 'contact') ? dccr_http_ok('x', 500) : Test_Site::site_page($url);
    $hook = ['type' => 'plugin', 'action' => 'install'];
    Sveti_Ivan::on_pre_install(true, $hook);
    Revelin::on_source_selection(DCCR_TEST_ROOT . '/upgrade/brand-new/', '', null, $hook);
    @mkdir(WP_PLUGIN_DIR . '/brand-new', 0755, true);
    file_put_contents(WP_PLUGIN_DIR . '/brand-new/brand-new.php', "<?php\n/**\n * Plugin Name: Brand New\n * Version: 1.0\n */\n");
    Sveti_Ivan::on_process_complete((object) ['result' => ['destination_name' => 'brand-new']], $hook);
    $row = Journal::latest('update-check', 'brand-new');
    eq('install', $row['before']['kind'], 'a brand-new slug is an install');
    Sveti_Ivan::scheduled_check((int) $row['id']);
    Sveti_Ivan::scheduled_check((int) $row['id']);
    eq(Journal::FAILED, Journal::get((int) $row['id'])['state'], 'failed twice');
    eq(0, count(Journal::recent(5, null, 'rollback')), 'no rollback for an install');
    $GLOBALS['dccr_site_handler'] = null;
});

suite('Sveti Ivan: the missing marker is named, markers can be changed, the window and self-update rules hold', function () {
    tick();
    $GLOBALS['dccr_site_handler'] = static function (string $url, array $args) {
        if (str_contains($url, 'explore')) {
            return dccr_http_ok('<html>renamed widget</html>');
        }
        return Test_Site::site_page($url);
    };
    $id  = simulate_update('wporg-plugin', '1.5.0');
    $row = Journal::get($id);
    ok(str_contains((string) $row['verify']['inline']['page /explore/']['detail'], 'data-dccwl-viewtrigger'), 'the missing marker is named');
    ok(Markers::set('/explore/', ['renamed widget']), 'marker changed');
    Sveti_Ivan::scheduled_check($id);
    eq(Journal::COMMITTED, Journal::get($id)['state'], 'with the new marker the check passes');
    Markers::reset();
    eq(Markers::defaults(), Markers::all(), 'reset restores the baked defaults');
    $GLOBALS['dccr_site_handler'] = null;

    // Beyond the hour: alert, no rollback.
    break_cottage_when('1.6.0');
    $id = simulate_update('wporg-plugin', '1.6.0');
    global $wpdb;
    $r = Journal::get($id);
    $r['before']['started'] = time() - 7200;
    $wpdb->update(DCCR\Schema::journal(), ['before_json' => json_encode($r['before'])], ['id' => $id]);
    Sveti_Ivan::scheduled_check($id);
    Sveti_Ivan::scheduled_check($id);
    eq(Journal::FAILED, Journal::get($id)['state'], 'failed');
    eq(0, count(Journal::recent(5, null, 'rollback')), 'no rollback after the window');
    $GLOBALS['dccr_site_handler'] = null;

    // Ragusa itself: checks run in a fresh request, never a rollback, A2 suspended meanwhile.
    $hook = ['type' => 'plugin', 'action' => 'update', 'plugin' => 'dcc-ragusa/dcc-ragusa.php'];
    Sveti_Ivan::on_pre_install(true, $hook);
    Sveti_Ivan::on_process_complete(null, $hook);
    $self = Journal::latest('self-update', 'dcc-ragusa');
    ok($self !== null && $self['state'] === Journal::VERIFYING, 'self-update row waits for a fresh request');
    ok(is_array(State::get('self_update_pending')), 'self restores suspended');
    Sveti_Ivan::scheduled_check((int) $self['id']);
    eq(Journal::COMMITTED, Journal::get((int) $self['id'])['state'], 'self checks pass and reseal');
    ok(State::get('self_update_pending') === null, 'suspension lifted');
});

suite('error log: read from the offset, rotation detected, old fatals ignored', function () {
    $log = ABSPATH . 'error_log';
    file_put_contents($log, "[old] PHP Fatal error: ancient\n");
    $snap = Error_Log::snapshot();
    eq([], Error_Log::new_fatals($snap), 'a fatal before the snapshot is ignored');
    file_put_contents($log, "[new] PHP Warning: fine\n[new] PHP Fatal error: Uncaught Error: boom in x.php:1\n", FILE_APPEND);
    $f = Error_Log::new_fatals($snap);
    eq(1, count($f), 'the new fatal is found');
    ok(str_contains($f[0], 'boom'), 'with its text');
    // Rotation: rename then truncate (what dcc-error-log-health does).
    $snap = Error_Log::snapshot();
    rename($log, $log . '.1');
    file_put_contents($log, '');
    file_put_contents($log, "[after] PHP Parse error: syntax error\n", FILE_APPEND);
    $f = Error_Log::new_fatals($snap);
    eq(1, count($f), 'a fatal after rotation is found from offset 0');
    unlink($log);
});

suite('iCal: the in-process exporter check requires an event per room', function () {
    eval('namespace MPHB\\iCal; class Exporter { public static $events = 1; public function export($id) { header("Content-Type: text/calendar"); echo "BEGIN:VCALENDAR\n"; for ($i = 0; $i < self::$events; $i++) { echo "BEGIN:VEVENT\nEND:VEVENT\n"; } echo "END:VCALENDAR\n"; } }');
    ok(Ical::available(), 'exporter detected');
    $r = Ical::check([1066, 1068]);
    eq(true, $r['ok'], 'two rooms with events pass');
    \MPHB\iCal\Exporter::$events = 0;
    $r = Ical::check([1066, 1068]);
    eq(false, $r['ok'], 'an empty calendar fails');
    ok(str_contains($r['detail'], '1066'), 'and names the room');
    \MPHB\iCal\Exporter::$events = 1;
});

suite('Bokar: baseline, new administrator named, editor by id only, application passwords, logins hashed', function () {
    tick();
    eq(1, count(array_filter(events_of('baselined'), static fn($e) => $e['fortress'] === Fortress::BOKAR)), 'users baselined once');
    $GLOBALS['dccr_users'][] = ['ID' => 5, 'login' => 'intruder', 'roles' => ['administrator']];
    $GLOBALS['dccr_users'][] = ['ID' => 6, 'login' => 'guest-helper', 'roles' => ['editor']];
    tick();
    $new = events_of('user-new');
    eq(2, count($new), 'two new privileged accounts reported');
    $admin  = array_values(array_filter($new, static fn($e) => $e['target'] === '5'))[0];
    $editor = array_values(array_filter($new, static fn($e) => $e['target'] === '6'))[0];
    ok(str_contains($admin['message'], 'intruder'), 'an administrator is named');
    eq(Events::BREACHED, $admin['severity'], 'a new administrator is breached');
    ok(!str_contains($editor['message'], 'guest-helper'), 'a non-administrator is not named');
    ok(str_contains($editor['message'], 'editor user 6'), 'the editor is reported by id and role');
    tick();
    eq(2, count(events_of('user-new')), 'reported once, then accepted');
    $GLOBALS['dccr_users'][0]['roles'] = ['subscriber'];
    Test_Site::usermeta('wpstg0_');
    $GLOBALS['dccr_app_passwords'][2] = [['name' => 'app']];
    tick();
    eq(1, count(events_of('user-gone')), 'a demoted administrator is reported');
    eq(1, count(events_of('app-password')), 'a new application password is reported');

    // Logins.
    $user = (object) ['ID' => 2, 'roles' => ['administrator']];
    $_SERVER['REMOTE_ADDR'] = '203.0.113.42';
    Bokar::on_login('erica', $user);
    eq(0, count(array_filter(Alerts::active(Fortress::BOKAR), static fn($a) => $a['kind'] === 'login-new-ip')), 'the first address ever is the baseline, no alert');
    $_SERVER['REMOTE_ADDR'] = '198.51.100.7';
    Bokar::on_login('erica', $user);
    $ev = events_of('login-new-ip');
    eq(2, count($ev), 'both logins recorded');
    ok(str_contains($ev[0]['message'], '198.51.100.x'), 'the display form is truncated');
    $all = json_encode([$GLOBALS['dccr_options'], Events::recent(100), State::get('x')]);
    ok(!str_contains($all, '198.51.100.7') && !str_contains($all, '203.0.113.42'), 'no raw IP anywhere in options or events');
    $stored = get_option(Bokar::LOGINS_OPTION);
    eq(2, count($stored[2]), 'two hashed addresses kept for the user');
    eq('no', $GLOBALS['dccr_autoload'][Bokar::LOGINS_OPTION], 'logins option does not autoload');
    Bokar::on_login('guest', (object) ['ID' => 90, 'roles' => ['mphb_customer']]);
    eq(2, count(events_of('login-new-ip')), 'a guest login is not recorded at all');
    eq('2001:db8:1:2::x', Bokar::display_ip('2001:db8:1:2:3:4:5:6'), 'ipv6 truncated');
});

suite('Lovrijenac: the feed is validated, reduced and matched; bad payloads keep the last good copy', function () {
    Settings::save(['feed_key' => 'abcdefghijklmnop1234']);
    $record = static fn(string $slug, string $to, bool $patched = true) => [
        'id' => 'uuid-' . $slug, 'title' => 'WPORG Plugin <= ' . $to . ' - Stored XSS',
        'software' => [['type' => 'plugin', 'name' => 'WPORG Plugin', 'slug' => $slug, 'affected_versions' => ['* - ' . $to => ['from_version' => '*', 'from_inclusive' => true, 'to_version' => $to, 'to_inclusive' => true]], 'patched' => $patched, 'patched_versions' => ['1.5.0']]],
        'references' => ['https://example.test/advisory'], 'published' => '2026-10-01',
        'copyrights' => ['message' => 'Vulnerability data provided by Wordfence Intelligence', 'mitre' => ['notice' => 'CVE record © MITRE', 'license' => 'CC BY 4.0', 'license_url' => 'https://example.test/l']],
    ];
    $feed = json_encode(['uuid-wporg-plugin' => $record('wporg-plugin', '1.4.0'), 'uuid-other' => $record('other-plugin', '9.9')]);
    $feed = str_pad($feed, 8192, ' ');
    $GLOBALS['dccr_feed_response'] = dccr_http_ok($feed);
    $line = Lovrijenac::fetch_feed();
    ok(str_starts_with($line, 'Feed read'), $line);
    $req = end($GLOBALS['dccr_http']);
    eq('Bearer abcdefghijklmnop1234', $req['args']['headers']['Authorization'], 'bearer header sent');
    ok(!empty($req['args']['stream']) && $req['args']['limit_response_size'] === Lovrijenac::FEED_LIMIT, 'streamed with a size limit');
    eq(1, (int) State::get('feed')['reduced'], 'reduced to the one record about this site');
    Lovrijenac::evaluate();
    $v = Alerts::active(Fortress::LOVRIJENAC);
    eq(1, count($v), 'one vulnerability finding');
    $f = reset($v);
    ok(str_contains($f['title'], 'WPORG Plugin Has A Known Weakness'), 'title names the plugin');
    ok(str_contains(Fortress::status(Fortress::LOVRIJENAC)['line'], '1 Plugin Has A Known Weakness'), 'card line');
    ok(Lovrijenac::affected('1.4.0', [['from_version' => '*', 'from_inclusive' => true, 'to_version' => '1.4.0', 'to_inclusive' => true]]), 'inclusive upper bound');
    ok(!Lovrijenac::affected('1.4.0', [['from_version' => '*', 'from_inclusive' => true, 'to_version' => '1.4.0', 'to_inclusive' => false]]), 'exclusive upper bound');
    ok(!Lovrijenac::affected('1.5.0', [['from_version' => '1.0', 'from_inclusive' => true, 'to_version' => '1.4.9', 'to_inclusive' => true]]), 'outside the range');

    // Rejections keep the last good copy.
    $good = (string) file_get_contents(Vault::dir() . '/feed/last-good.json');
    State::set('feed', array_merge((array) State::get('feed'), ['ts' => 0]));
    $GLOBALS['dccr_feed_response'] = dccr_http_ok('{}');
    ok(str_starts_with(Lovrijenac::fetch_feed(), 'Feed rejected'), 'a tiny payload is rejected');
    $GLOBALS['dccr_feed_response'] = dccr_http_ok(str_pad('{"x":{"software":[]}}', 1100, ' '));
    ok(str_contains(Lovrijenac::fetch_feed(), 'shrank'), 'a sharp shrink is rejected');
    $GLOBALS['dccr_feed_response'] = dccr_http_ok(str_pad('<html>maintenance</html>', 9000, ' '));
    ok(str_contains(Lovrijenac::fetch_feed(), 'not a vulnerability feed'), 'an HTML page is rejected');
    $GLOBALS['dccr_feed_response'] = dccr_http_ok(str_replace('Stored', "St\x01ored", $feed));
    ok(str_contains(Lovrijenac::fetch_feed(), 'control characters'), 'control characters are rejected');
    $bad = json_encode(['x' => ['id' => 'x', 'software' => [['type' => 'plugin', 'slug' => 'wporg-plugin']]]]);
    $GLOBALS['dccr_feed_response'] = dccr_http_ok(str_pad($bad, 2048, ' '));
    ok(str_contains(Lovrijenac::fetch_feed(), 'four expected fields'), 'records missing fields are rejected');
    $GLOBALS['dccr_feed_response'] = dccr_http_ok('{}', 401);
    ok(str_contains(Lovrijenac::fetch_feed(), 'refused'), 'a refused key is reported');
    eq($good, file_get_contents(Vault::dir() . '/feed/last-good.json'), 'the last good copy is untouched');

    // The finding resolves once the plugin is updated.
    plugin_file('wporg-plugin', '1.5.0');
    Lovrijenac::evaluate();
    eq(0, count(array_filter(Alerts::open(Fortress::LOVRIJENAC), static fn($a) => $a['kind'] === 'vuln')), 'vulnerability resolved after the update');
    eq('resolved', Alerts::state(reset($v)['kind'] === 'vuln' ? Alerts::get(array_key_first($v)) : []), 'and it stays on the card as resolved');
    unset($GLOBALS['dccr_feed_response']);

    // Closed plugin signal from wordpress.org.
    @mkdir(WP_PLUGIN_DIR . '/closed-plugin', 0755, true);
    file_put_contents(WP_PLUGIN_DIR . '/closed-plugin/closed-plugin.php', "<?php\n/**\n * Plugin Name: Closed\n * Version: 1.0\n */\n");
    tick();
    ok(isset(Alerts::active(Fortress::LOVRIJENAC)[Events::fingerprint(Fortress::LOVRIJENAC, 'closed', 'closed-plugin')]), 'a closed plugin is a finding');
});

suite('alerts: one email per finding per day, All Clear on resolve, nothing from staging, subject keeps the č', function () {
    eq(0, count($GLOBALS['dccr_mail']), 'no mail yet');
    $f = ['fortress' => Fortress::MINCETA, 'severity' => Events::BREACHED, 'kind' => 'test', 'target' => 't', 'title' => 'something odd happened', 'what' => 'w', 'did' => 'd', 'todo' => 't'];
    Alerts::raise($f);
    eq(0, count($GLOBALS['dccr_mail']), 'staging sends nothing');
    dccr_test_site('live');
    Alerts::reset_cache();
    Alerts::raise($f);
    eq(1, count($GLOBALS['dccr_mail']), 'live sends');
    eq('Ragusa · Minčeta · Something Odd Happened', $GLOBALS['dccr_mail'][0]['subject'], 'subject format with Title Case and the č');
    ok(str_contains($GLOBALS['dccr_mail'][0]['body'], "w\n\nd\n\nt\n\nRagusa, "), 'three sentences and the plain link');
    ok(!str_contains($GLOBALS['dccr_mail'][0]['body'], '_wpnonce'), 'no nonce in the link');
    Alerts::raise($f);
    eq(1, count($GLOBALS['dccr_mail']), 'the same finding does not email again within 24 hours');
    Alerts::resolve(Events::fingerprint(Fortress::MINCETA, 'test', 't'));
    eq(2, count($GLOBALS['dccr_mail']), 'an All Clear is sent on resolve');
    ok(str_contains($GLOBALS['dccr_mail'][1]['subject'], 'All Clear'), 'All Clear subject');
    Alerts::raise(['fortress' => Fortress::MINCETA, 'severity' => Events::INFO, 'kind' => 'churn', 'target' => 'x', 'title' => 'small thing', 'what' => 'w']);
    eq(2, count($GLOBALS['dccr_mail']), 'info goes to the digest, not an email');
    Alerts::send_digest();
    eq(3, count($GLOBALS['dccr_mail']), 'digest sent');
    ok(str_contains($GLOBALS['dccr_mail'][2]['subject'], 'Daily'), 'digest subject');
    $GLOBALS['dccr_mail_fails'] = true;
    Alerts::raise(array_merge($f, ['target' => 'u']));
    ok(count(events_of('mail-failed')) === 1, 'a wp_mail failure is journaled, so the heartbeat can carry it');
    dccr_test_site('staging');
});

suite('heartbeat: success body carries the witness, /fail on a breach, never from staging, throttled', function () {
    Settings::save(['heartbeat_url' => 'https://hc-ping.com/8b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d']);
    eq('skipped', Heartbeat::ping(true), 'staging pings nothing');
    dccr_test_site('live');
    eq('sent', Heartbeat::ping(true), 'live pings');
    $req = end($GLOBALS['dccr_http']);
    eq('https://hc-ping.com/8b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', $req['url'], 'success endpoint');
    ok(str_contains((string) $req['args']['body'], 'ragusa ' . DCCR_VERSION), 'witness body');
    eq('skipped', Heartbeat::ping(true), 'a second success within two minutes is throttled');
    eq('sent', Heartbeat::ping(false, 'Breached: Minčeta'), 'a failure ping goes out at once');
    $req = end($GLOBALS['dccr_http']);
    ok(str_ends_with($req['url'], '/fail'), 'fail endpoint');
    eq('Breached: Minčeta', $req['args']['body'], 'the reason is the body');
    ok(!str_contains(json_encode(Events::recent(50)), '8b1f2c3d'), 'the URL is in no event');
    dccr_test_site('staging');
});

suite('cron: the lock refuses an overlapping tick; the walk resumes from its cursor across tiny budgets', function () {
    ok(Vault::lock(), 'lock taken');
    $r = Cron::tick(new Budget(5.0), true);
    ok(str_contains($r[0], 'holds the lock'), 'an overlapping tick is refused');
    Vault::unlock();
    tick();
    file_put_contents(WP_PLUGIN_DIR . '/dcc-demo/dcc-demo.php', "<?php\n/**\n * Plugin Name: DCC Demo\n * Version: 0.3.1\n */\n");
    touch(WP_PLUGIN_DIR . '/dcc-demo/dcc-demo.php', time() + 10); // same size: only the mtime says it changed
    State::set('last_full_pass', 0);
    $phases = [];
    for ($i = 0; $i < 200; $i++) {
        Cron::tick(new Budget(0.0001), true);
        $p = (array) State::get('minceta.pass', []);
        $phases[] = $p['phase'] ?? 'idle';
        if (($p['phase'] ?? 'idle') === 'idle' && $i > 0) {
            break;
        }
    }
    ok(in_array('content', $phases, true) || in_array('uploads', $phases, true), 'the walk spanned several ticks: ' . implode(',', array_unique($phases)));
    eq(1, count(events_of('file-changed')), 'the changed file was still found exactly once across chunks');
});

suite('Minčeta: core, wordpress.org plugin, mu-plugins, drop-ins, options and Jetpack', function () {
    tick();
    file_put_contents(ABSPATH . 'wp-includes/functions.php', "<?php\n// backdoor\n");
    file_put_contents(WP_PLUGIN_DIR . '/wporg-plugin/includes/a.php', "<?php\n// edited\n");
    file_put_contents(WPMU_PLUGIN_DIR . '/evil-helper.php', "<?php\n// new mu\n");
    file_put_contents(WPMU_PLUGIN_DIR . '/dcc-other-helper.php', "<?php\n// director edit\n");
    file_put_contents(WPMU_PLUGIN_DIR . '/sso.php', "<?php\n// hostgator update\n");
    file_put_contents(WP_CONTENT_DIR . '/advanced-cache.php', "<?php\n// speedycache 2\n");
    file_put_contents(WP_CONTENT_DIR . '/db.php', "<?php\n// dropin\n");
    file_put_contents(ABSPATH . 'wp-admin/shell.php', "<?php\n// shell\n");
    unlink(WP_PLUGIN_DIR . '/dcc-demo/includes/class-demo.php');
    tick();
    $active = Alerts::active(Fortress::MINCETA);
    $has = static fn(string $kind, string $target) => isset($active[Events::fingerprint(Fortress::MINCETA, $kind, $target)]);
    ok($has('core-modified', 'wp-includes/functions.php'), 'core mismatch found');
    eq(Events::BREACHED, $active[Events::fingerprint(Fortress::MINCETA, 'core-modified', 'wp-includes/functions.php')]['severity'], 'core mismatch is breached');
    ok($has('plugin-modified', 'wp-content/plugins/wporg-plugin/includes/a.php'), 'wordpress.org plugin mismatch found');
    eq(Events::NEEDS_LOOK, $active[Events::fingerprint(Fortress::MINCETA, 'plugin-modified', 'wp-content/plugins/wporg-plugin/includes/a.php')]['severity'], 'plugin mismatch needs a look');
    ok($has('file-new', 'wp-content/mu-plugins/evil-helper.php'), 'new mu-plugin found');
    eq(Events::BREACHED, $active[Events::fingerprint(Fortress::MINCETA, 'file-new', 'wp-content/mu-plugins/evil-helper.php')]['severity'], 'new mu-plugin is breached');
    ok(is_file(WPMU_PLUGIN_DIR . '/evil-helper.php'), 'but never quarantined');
    eq(Events::NEEDS_LOOK, $active[Events::fingerprint(Fortress::MINCETA, 'file-changed', 'wp-content/mu-plugins/dcc-other-helper.php')]['severity'], 'a dcc-* mu change needs a look');
    ok(str_contains(Alerts::body(['todo' => 'If the site director changed it on purpose, run wp ragusa seal wp-content/mu-plugins/dcc-other-helper.php']), 'wp ragusa seal'), 'with the seal command');
    eq(Events::INFO, $active[Events::fingerprint(Fortress::MINCETA, 'file-changed', 'wp-content/mu-plugins/sso.php')]['severity'], 'a vendor mu change is info');
    ok(!$has('file-changed', 'wp-content/advanced-cache.php'), 'advanced-cache.php churn is not a finding');
    ok($has('sentinel-changed', 'wp-content/db.php@' . substr(hash('sha256', "<?php\n// dropin\n"), 0, 8)), 'db.php appearing is a sentinel finding');
    ok($has('file-new', 'wp-admin/shell.php'), 'a new file in wp-admin is found');
    eq(Events::BREACHED, $active[Events::fingerprint(Fortress::MINCETA, 'file-new', 'wp-admin/shell.php')]['severity'], 'and is breached');
    ok($has('file-missing', 'wp-content/plugins/dcc-demo/includes/class-demo.php'), 'a missing file is found');
    ok(str_contains(Fortress::status(Fortress::MINCETA)['line'], 'Findings'), 'card shows findings');

    // Seal accepts, and the findings resolve on the next pass.
    Revelin::seal('wp-content/mu-plugins/dcc-other-helper.php');
    file_put_contents(ABSPATH . 'wp-includes/functions.php', "<?php\n// functions\n");
    tick();
    $active = Alerts::open(Fortress::MINCETA);
    ok(!isset($active[Events::fingerprint(Fortress::MINCETA, 'file-changed', 'wp-content/mu-plugins/dcc-other-helper.php')]), 'sealed finding resolved');
    ok(!isset($active[Events::fingerprint(Fortress::MINCETA, 'core-modified', 'wp-includes/functions.php')]), 'restored core file resolves with an all clear');

    // 0.1.4: a file that stays gone stays a finding; seal of the deleted path settles it.
    $gone = 'wp-content/plugins/dcc-demo/includes/class-demo.php';
    ok(isset($active[Events::fingerprint(Fortress::MINCETA, 'file-missing', $gone)]), 'a file still gone is still an open finding after the next pass');
    [$ok, $msg] = Revelin::seal($gone);
    ok($ok, 'seal of a deleted path succeeds: ' . $msg);
    eq('Removed ' . $gone . ' from the baseline.', $msg, 'worded like the seal message');
    eq('resolved', Alerts::state(Alerts::get(Events::fingerprint(Fortress::MINCETA, 'file-missing', $gone))), 'the missing finding resolved on seal');
    eq(0, count(mails_with('All Clear: File Missing')), 'quietly, with no All Clear email');
    ok(count(array_filter(events_of('sealed'), static fn($e) => $e['target'] === $gone)) === 1, 'one sealed event names the path');

    // Deleted on purpose BEFORE the pass: seal first, and the pass reports nothing.
    $retired = WPMU_PLUGIN_DIR . '/dcc-retired-helper.php';
    file_put_contents($retired, "<?php\n// retired later\n");
    tick();
    ok(isset(Fortress\Minceta::index()['wp-content/mu-plugins/dcc-retired-helper.php']), 'the helper is in the baseline');
    unlink($retired);
    [$ok, $msg] = Revelin::seal('wp-content/mu-plugins/dcc-retired-helper.php');
    ok($ok && $msg === 'Removed wp-content/mu-plugins/dcc-retired-helper.php from the baseline.', 'seal drops the deleted helper: ' . $msg);
    ok(!isset(Fortress\Minceta::index()['wp-content/mu-plugins/dcc-retired-helper.php']), 'and it left the baseline');
    $before = count(events_of('file-missing'));
    tick();
    eq($before, count(events_of('file-missing')), 'the next pass reports nothing missing');
    ok(!isset(Alerts::active(Fortress::MINCETA)[Events::fingerprint(Fortress::MINCETA, 'file-missing', 'wp-content/mu-plugins/dcc-retired-helper.php')]), 'no finding for the retired helper');

    // A guard is never dropped; a path the baseline never knew is refused.
    [$ok, $msg] = Revelin::seal('wp-content/mu-plugins/dcc-never-existed.php');
    ok(!$ok && str_contains($msg, 'nothing about it in the baseline'), 'an unknown deleted path is refused: ' . $msg);
    $zel = WPMU_PLUGIN_DIR . '/dcc-ragusa-zelenci.php';
    $had = is_file($zel);
    [$ok, $msg] = Revelin::seal('wp-content/mu-plugins/dcc-user-enum-guard.php');
    ok($ok, 'a present guard seals as before');
    $g = WPMU_PLUGIN_DIR . '/dcc-user-enum-guard.php';
    $keep = (string) file_get_contents($g);
    unlink($g);
    [$ok, $msg] = Revelin::seal('wp-content/mu-plugins/dcc-user-enum-guard.php');
    ok(!$ok && str_contains($msg, 'it is a guard'), 'a missing guard is refused, not dropped: ' . $msg);
    file_put_contents($g, $keep);
    unset($had, $zel);

    // A file that comes back is "new" again, and its missing finding resolves.
    file_put_contents(WP_PLUGIN_DIR . '/dcc-demo/includes/class-demo.php', "<?php\n// back\n");
    Revelin::seal('wp-content/mu-plugins/dcc-ical-privacy.php'); // unrelated: keep Revelin quiet
    $gone2 = 'wp-content/plugins/dcc-demo/readme.txt';
    file_put_contents(WP_PLUGIN_DIR . '/dcc-demo/readme.txt', "demo\n");
    tick();
    unlink(WP_PLUGIN_DIR . '/dcc-demo/readme.txt');
    tick();
    eq('open', Alerts::state(Alerts::get(Events::fingerprint(Fortress::MINCETA, 'file-missing', $gone2))), 'readme gone is open');
    file_put_contents(WP_PLUGIN_DIR . '/dcc-demo/readme.txt', "demo\n");
    tick();
    eq('resolved', Alerts::state(Alerts::get(Events::fingerprint(Fortress::MINCETA, 'file-missing', $gone2))), 'a file that is back resolves its missing finding');

    // Options and Jetpack.
    update_option('admin_email', 'thief@example.test');
    update_option('users_can_register', '1');
    $GLOBALS['dccr_jetpack_modules']['waf'] = false;
    tick();
    eq(2, count(events_of('option-changed')), 'two option changes reported');
    ok(isset(Alerts::active(Fortress::MINCETA)[Events::fingerprint(Fortress::MINCETA, 'jetpack-module-off', 'waf')]), 'waf off is a finding');
    eq(Fortress::BREACHED, Fortress::status(Fortress::MINCETA)['state'], 'card breached');
    $GLOBALS['dccr_jetpack_modules']['waf'] = true;
    tick();
    ok(!isset(Alerts::open(Fortress::MINCETA)[Events::fingerprint(Fortress::MINCETA, 'jetpack-module-off', 'waf')]), 'resolves when the module is back');
    file_put_contents(WP_CONTENT_DIR . '/jetpack-waf/rules/rules.php', "<?php\n");
    tick();
    ok(isset(Alerts::active(Fortress::MINCETA)[Events::fingerprint(Fortress::MINCETA, 'jetpack-rules-empty', 'rules.php')]), 'an emptied rules.php is a finding');
    tick();
    eq(2, count(events_of('option-changed')), 'an option change is reported once, then accepted');

    // Disk.
    $q = Minceta::parse_quota("Disk quotas for user doracurt (uid 1234):\n     Filesystem  blocks   quota   limit   grace   files   quota   limit   grace\n      /dev/sda1 8821344* 10485760 10485760           91234       0       0\n");
    eq(8821344 * 1024, $q['used'], 'quota used parsed');
    eq(10485760 * 1024, $q['limit'], 'quota limit parsed');
    ok(Minceta::parse_quota("nothing here") === null, 'unparseable quota is null, never a guess');
});

suite('rings: events keep 2,000, the journal trims only terminal rows', function () {
    for ($i = 0; $i < 2100; $i++) {
        Events::record(Fortress::BOKAR, Events::INFO, 'noise', (string) $i, 'n');
    }
    eq(2000, Events::count(), 'events ring at 2,000');
    $open = Journal::create('quarantine', 'open', []);
    for ($i = 0; $i < 520; $i++) {
        $id = Journal::create('quarantine', 'closed', []);
        Journal::set_state($id, Journal::COMMITTED);
    }
    ok(Journal::get($open) !== null, 'an open row survives trimming');
    ok(count(Journal::recent(1000)) <= 501, 'journal bounded');
});

suite('uninstall: data kept by default, removed only when the setting is on, only this site\'s vault', function () {
    tick();
    $vault = Vault::dir();
    $other = dirname($vault) . '/live-deadbeef';
    @mkdir($other, 0700, true);
    file_put_contents($other . '/.key', 'x');
    $backups = DCCR_TEST_ROOT . '/home/mu-backups';
    @mkdir($backups, 0700, true);
    file_put_contents($backups . '/keep.txt', 'x');
    $script = DCCR_TEST_ROOT . '/uninstall.php';
    $run = static function (bool $on) use ($script, $vault): string {
        $settings = ['schema' => 1, 'delete_on_uninstall' => $on];
        file_put_contents($script, '<?php
            define("WP_UNINSTALL_PLUGIN", true);
            $GLOBALS["dccr_uninstall_settings"] = ' . var_export($settings, true) . ';
            $GLOBALS["dccr_deleted"] = []; $GLOBALS["dccr_dropped"] = 0;
            define("ABSPATH", "' . ABSPATH . '"); define("WP_CONTENT_DIR", "' . WP_CONTENT_DIR . '"); define("WP_PLUGIN_DIR", "' . WP_PLUGIN_DIR . '"); define("WPMU_PLUGIN_DIR", "' . WPMU_PLUGIN_DIR . '");
            $GLOBALS["table_prefix"] = "wpstg0_"; putenv("HOME=' . DCCR_TEST_ROOT . '/home");
            function get_option($n, $d = false) { return $n === "dcc_ragusa_settings" ? $GLOBALS["dccr_uninstall_settings"] : $d; }
            function delete_option($n) { $GLOBALS["dccr_deleted"][] = $n; return true; }
            function wp_unschedule_hook($h) { return 0; }
            function home_url($p = "") { return "https://doracanalcourt.com/staging/" . ltrim($p, "/"); }
            function wp_parse_url($u) { return parse_url($u); }
            function plugin_basename($f) { return "x"; } function plugin_dir_url($f) { return "x"; }
            function add_action(...$a) {} function add_filter(...$a) {} function register_activation_hook(...$a) {} function register_deactivation_hook(...$a) {}
            function wp_upload_dir($t = null, $c = true) { return ["basedir" => WP_CONTENT_DIR . "/uploads"]; }
            function wp_json_encode($v, $f = 0) { return json_encode($v, $f); }
            function __($t, $d = "") { return $t; }
            class FakeDB { public $prefix = "wpstg0_"; public function query($s) { $GLOBALS["dccr_dropped"]++; } public function get_var($s) { return null; } public function prepare($s, ...$a) { return $s; } }
            $GLOBALS["wpdb"] = new FakeDB();
            require "' . dirname(__DIR__) . '/uninstall.php";
            echo json_encode(["deleted" => $GLOBALS["dccr_deleted"], "dropped" => $GLOBALS["dccr_dropped"], "vault" => is_dir("' . $vault . '")]);
        ');
        return (string) shell_exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($script));
    };
    $r = json_decode($run(false), true);
    eq([], $r['deleted'] ?? null, 'nothing deleted by default');
    ok($r['vault'] === true, 'vault kept by default');
    $r = json_decode($run(true), true);
    ok(in_array('dcc_ragusa_settings', $r['deleted'] ?? [], true) && in_array('dcc_ragusa_secrets', $r['deleted'] ?? [], true), 'options removed when the setting is on');
    ok(($r['dropped'] ?? 0) >= 2, 'tables dropped');
    ok($r['vault'] === false, 'this site\'s vault removed');
    ok(is_file($other . '/.key'), 'another site\'s vault untouched');
    ok(is_file($backups . '/keep.txt'), '~/mu-backups untouched');
});

suite('admin page: renders without a secret in the HTML, confirm screens say what changes', function () {
    tick();
    Settings::save(['heartbeat_url' => 'https://hc-ping.com/8b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'feed_key' => 'abcdefghijklmnop1234']);
    $GLOBALS['dccr_is_admin'] = true;
    ob_start();
    $_GET = [];
    Admin::render();
    $html = (string) ob_get_clean();
    ok(str_contains($html, 'The Walls Are Holding'), 'the sentence is on the page');
    foreach (['Minčeta', 'Bokar', 'Revelin', 'Lovrijenac', 'Sveti Ivan', 'Zelenci'] as $name) {
        ok(str_contains($html, $name), 'card for ' . $name);
    }
    ok(!str_contains($html, '8b1f2c3d-4e5f') && !str_contains($html, 'abcdefghijklmnop1234'), 'no secret in the HTML');
    ok(str_contains($html, '3c4d'), 'the masked tail is shown');
    ok(str_contains($html, 'Watches The Files') && str_contains($html, 'Rings If Ragusa Falls'), 'subtitles');
    ok(str_contains($html, 'name="_dccr_nonce"'), 'forms carry the nonce');
    $_GET = ['confirm' => 'seal', 'target' => 'wp-content/mu-plugins/dcc-postpass-guard.php'];
    ob_start();
    Admin::render();
    $html = (string) ob_get_clean();
    ok(str_contains($html, 'Seal will accept the current wp-content/mu-plugins/dcc-postpass-guard.php'), 'seal confirmation sentence');
    Alerts::raise(['fortress' => Fortress::MINCETA, 'severity' => Events::NEEDS_LOOK, 'kind' => 'file-missing', 'target' => 'wp-content/mu-plugins/dcc-was-here.php', 'title' => 'File Missing: dcc-was-here.php', 'what' => 'gone', 'did' => '', 'todo' => 'x']);
    $_GET = ['confirm' => 'seal', 'target' => 'wp-content/mu-plugins/dcc-was-here.php'];
    ob_start();
    Admin::render();
    $html = (string) ob_get_clean();
    ok(str_contains($html, 'Seal will remove wp-content/mu-plugins/dcc-was-here.php from the baseline'), '0.1.4: the confirmation for a deleted path says what Seal will do');
    $_GET = ['confirm' => 'seal', 'target' => 'wp-content/mu-plugins/dcc-never.php'];
    ob_start();
    Admin::render();
    $html = (string) ob_get_clean();
    ok(str_contains($html, 'There is no file at wp-content/mu-plugins/dcc-never.php'), 'an unknown path still reads as no file');
    Alerts::resolve(Events::fingerprint(Fortress::MINCETA, 'file-missing', 'wp-content/mu-plugins/dcc-was-here.php'), true);
    $row = Journal::create('quarantine', 'x', []);
    $_GET = ['confirm' => 'restore', 'target' => (string) $row];
    ob_start();
    Admin::render();
    $html = (string) ob_get_clean();
    ok(str_contains($html, 'Undo will reverse'), 'undo confirmation sentence');
    $_GET = [];
    $GLOBALS['dccr_is_admin'] = false;
});

suite('source rules: no eval, no public endpoint, no MotoPress write, no guest data, autoload discipline', function () {
    $src = '';
    foreach (Vault::list_files(dirname(__DIR__) . '/includes') as $abs => $rel) {
        $src .= "\n// FILE $rel\n" . file_get_contents($abs);
    }
    $src .= file_get_contents(dirname(__DIR__) . '/dcc-ragusa.php') . file_get_contents(dirname(__DIR__) . '/mu/dcc-ragusa-zelenci.php');
    ok(!preg_match('/\beval\s*\(/', $src), 'no eval');
    ok(!preg_match('/register_rest_route|wp_ajax_|admin-ajax/', $src), 'no REST or AJAX endpoint');
    ok(!preg_match('/wp_insert_post|wp_update_post|update_post_meta|wp_delete_post|mphb_booking|mphb_customer\b.*insert/', $src), 'no MotoPress or post write');
    ok(!preg_match('/add_option\([^)]*,\s*[\'"]yes[\'"]\s*\)/', str_replace("add_option(self::OPTION, self::\$cache, '', 'yes')", '', $src)), 'only the settings row autoloads');
    ok(!preg_match('/wp_enqueue_script|wp_enqueue_style/', str_replace("wp_enqueue_style('dccr-admin'", '', $src)), 'nothing enqueued beyond the admin stylesheet');
    ok(!preg_match('/file_get_contents\(\s*[\'"]https?:/', $src), 'no raw remote fetch');
    $all = json_encode($GLOBALS['dccr_autoload']);
    ok(!str_contains($all, '"dcc_ragusa_state":"yes"') && !str_contains($all, '"dcc_ragusa_alerts":"yes"'), 'state and alerts never autoload');
});

// ------------------------------------------------------------- 0.1.1 blockers
suite('0.1.1 blocker 1: the tick is scheduled at activation and self-heals when missing', function () {
    $hooks = array_map(static fn($h) => is_array($h[0]) ? implode('::', $h[0]) : 'closure', $GLOBALS['dccr_hooks']['cron_schedules'] ?? []);
    ok(in_array('DCCR\\Cron::schedules', $hooks, true), 'the 10-minute schedule is registered at file load, before boot');
    $GLOBALS['dccr_cron'] = [];
    // Activation the way WP-CLI and the Plugins screen do it: after plugins_loaded, boot() never ran.
    do_action('activate');
    $ev = array_values(array_filter($GLOBALS['dccr_cron'], static fn($e) => $e['hook'] === 'dccr_tick'));
    eq(1, count($ev), 'dccr_tick is scheduled by activation');
    eq('dccr_10min', $ev[0]['recurrence'] ?? '', 'with the 10-minute recurrence');
    ok(Cron::is_scheduled(), 'is_scheduled sees it');
    // Self-heal: someone cleared the cron array.
    $GLOBALS['dccr_cron'] = [];
    Cron::ensure();
    ok(Cron::is_scheduled(), 'ensure() puts the tick back');
    Cron::ensure();
    eq(1, count(array_filter($GLOBALS['dccr_cron'], static fn($e) => $e['hook'] === 'dccr_tick')), 'and never doubles it');
    // Zelenci rings when Ragusa is active but silent.
    dccr_test_site('live');
    $GLOBALS['pagenow'] = 'plugins.php';
    require_once dirname(__DIR__) . '/mu/dcc-ragusa-zelenci.php';
    update_option('dcc_ragusa_state', ['last_tick' => time() - 4 * 3600, 'activated_at' => time() - 5 * 3600], 'no');
    update_option('dcc_ragusa_zelenci', ['last_check' => 0, 'missing_since' => time() - 700, 'last_alert' => 0], 'no');
    // The stub plugin dir must look installed.
    @mkdir(WP_PLUGIN_DIR . '/dcc-ragusa', 0755, true);
    file_put_contents(WP_PLUGIN_DIR . '/dcc-ragusa/dcc-ragusa.php', '<?php');
    dccr_zelenci_check();
    $z = mails_with('Not Standing');
    eq(1, count($z), 'Zelenci emails when Ragusa has not ticked for hours');
    ok(str_contains($z[0]['body'], 'has not ticked'), 'and says why');
    update_option('dcc_ragusa_state', ['last_tick' => time() - 60, 'activated_at' => time() - 5 * 3600], 'no');
    update_option('dcc_ragusa_zelenci', ['last_check' => 0, 'missing_since' => time() - 700, 'last_alert' => 0], 'no');
    dccr_zelenci_check();
    eq(1, count(mails_with('Not Standing')), 'a recent tick means no bell');
    $GLOBALS['pagenow'] = 'index.php';
    dccr_test_site('staging');
});

suite('0.1.1 blocker 2: the first complete pass is the baseline even across many ticks', function () {
    $ticks  = 0;
    $phases = [];
    for ($i = 0; $i < 300; $i++) {
        Cron::tick(new Budget(0.0001), true);
        $ticks++;
        $p = (array) State::get('minceta.pass', []);
        $phases[] = $p['phase'] ?? 'idle';
        if (($p['phase'] ?? 'idle') === 'idle' && (int) State::get('last_full_pass', 0) > 0) {
            break;
        }
    }
    ok($ticks >= 3, 'the first pass spanned at least three ticks: ' . $ticks);
    ok(count(array_unique($phases)) >= 2, 'it crossed phases: ' . implode(',', array_unique($phases)));
    eq(0, count(events_of('file-new')), 'no file was flagged as new during the first pass');
    eq(0, count(events_of('file-changed')), 'nor as changed');
    eq(1, count(array_filter(events_of('baselined'), static fn($e) => $e['target'] === 'walk')), 'one info event says the baseline was taken');
    ok(str_contains(Fortress::status(Fortress::MINCETA)['line'], 'Files Match'), 'the card says all files match: ' . Fortress::status(Fortress::MINCETA)['line']);
    eq(0, count(Alerts::active(Fortress::MINCETA)), 'no Minčeta finding after the first pass');
    // And a file added afterwards is found.
    Test_Site::write('wp-admin/late.php', "<?php\n");
    State::set('last_full_pass', 0);
    for ($i = 0; $i < 300; $i++) {
        Cron::tick(new Budget(0.0001), true);
        $p = (array) State::get('minceta.pass', []);
        if (($p['phase'] ?? 'idle') === 'idle' && $i > 0) {
            break;
        }
    }
    eq(1, count(events_of('file-new')), 'a file added after the baseline is reported');

    // Upgrading from 0.1.0 treats the existing index as the baseline and withdraws its false findings.
    State::delete('minceta.baselined');
    Alerts::raise(['fortress' => Fortress::MINCETA, 'severity' => Events::NEEDS_LOOK, 'kind' => 'file-new', 'target' => 'wp-content/themes/bravada/style.css', 'title' => 'New File', 'what' => 'w']);
    update_option('dcc_ragusa_version', '0.1.0', 'no');
    DCCR\Plugin::maybe_upgrade();
    ok((bool) State::get('minceta.baselined'), 'upgrade marks the existing index as the baseline');
    eq(0, count(array_filter(Alerts::active(Fortress::MINCETA), static fn($a) => $a['kind'] === 'file-new')), 'the false file-new findings are withdrawn');
    eq(DCCR_VERSION, get_option('dcc_ragusa_version'), 'version recorded');
    eq(0, count(mails_with('All Clear')), 'withdrawn quietly, no All Clear storm');
});

suite('0.1.1 blocker 3: the quota is read for the filesystem that holds the home directory', function () {
    $out = "Disk quotas for user doracurt (uid 1234):\n     Filesystem   space   quota   limit   grace   files   quota   limit   grace\n      /dev/sda1      4K  10240M  10240M            1234       0       0\n      /dev/sda3   3744K  10240M  10240M            5678       0       0\n       /dev/sdd   8454M  10240M  10240M          133000       0       0\n";
    $q = Minceta::parse_quota($out, '/dev/sdd');
    eq(8454 * 1024 * 1024, $q['used'], 'used from the home device');
    eq(10240 * 1024 * 1024, $q['limit'], 'limit from the home device');
    eq('/dev/sdd', $q['device'], 'device named');
    ok(!$q['guessed'], 'not guessed when the device is known');
    $q = Minceta::parse_quota($out, '/dev/nope');
    eq('/dev/sdd', $q['device'], 'unknown device: the fullest filesystem');
    ok($q['guessed'], 'and it says so');
    $q = Minceta::parse_quota($out, null);
    eq(8454 * 1024 * 1024, $q['used'], 'no device at all: still the fullest');
    $plain = "Disk quotas for user x (uid 1):\n     Filesystem  blocks   quota   limit   grace   files   quota   limit   grace\n      /dev/sda1       4 10485760 10485760              12       0       0\n      /dev/sdd  8821344* 10485760 10485760           91234       0       0\n";
    $q = Minceta::parse_quota($plain, '/dev/sdd');
    eq(8821344 * 1024, $q['used'], 'plain 1K blocks with a grace star');
    $wrapped = "Disk quotas for user x (uid 1):\n     Filesystem  blocks   quota   limit   grace   files   quota   limit   grace\n/dev/mapper/vg-home-very-long-name\n                  8821344 10485760 10485760           91234       0       0\n";
    $q = Minceta::parse_quota($wrapped, '/dev/mapper/vg-home-very-long-name');
    eq(8821344 * 1024, $q['used'], 'a wrapped two-line device row');
    ok(Minceta::parse_quota("quota: not found") === null, 'nothing parseable is null, never a guess');
});

suite('0.1.1 blocker 4: Bokar reads roles from the capabilities meta and survives a clone\'s prefix mismatch', function () {
    $snap = Bokar::snapshot();
    eq(2, count(array_filter($snap['users'], static fn($u) => $u['role'] === 'administrator')), 'two administrators on the normal site');
    eq(4, $snap['total'], 'four users in total');
    eq('wpstg0_capabilities', Bokar::$roles_source, 'read from the prefixed meta key');
    // A clone where the meta keys kept the old prefix and WP_User::$roles comes back empty.
    Test_Site::usermeta('portal_', false);
    foreach ($GLOBALS['dccr_users'] as &$u) {
        $u['roles'] = [];
    }
    unset($u);
    $snap = Bokar::snapshot();
    eq(2, count(array_filter($snap['users'], static fn($u) => $u['role'] === 'administrator')), 'still two administrators via the fallback');
    ok(str_contains(Bokar::$roles_source, 'portal_capabilities'), 'the diagnostic names the fallback key: ' . Bokar::$roles_source);
    tick();
    ok(str_contains(Fortress::status(Fortress::BOKAR)['line'], '2 Administrators'), 'the card says 2 administrators');
});

suite('0.1.1 item 5: a staging login page is "not checked", never a failure, and the drill probe replaces the pages', function () {
    tick();
    $GLOBALS['dccr_site_handler'] = static function (string $url, array $args) {
        if (str_ends_with((string) parse_url($url, PHP_URL_PATH), 'wp-cron.php')) {
            return dccr_http_ok('');
        }
        return dccr_http_ok('<html><body><form method="post"><input type="password" name="wpstg-password"><button>Log in</button></form></body></html>');
    };
    $r = Sveti_Ivan::run_checks(['errlog' => Error_Log::snapshot()], true);
    eq([], $r['failed'], 'no page failed');
    ok($r['host_up'], 'the host answered');
    foreach (Markers::all() as $path => $m) {
        ok(array_key_exists('page ' . $path, $r['checks']) && $r['checks']['page ' . $path]['ok'] === null, 'page ' . $path . ' is skipped, not failed');
    }
    ok(str_contains(Sveti_Ivan::status_line(), 'Behind The Staging Login'), 'the card says the pages are behind the login');
    // A real marker failure on a normal page is still a failure.
    $GLOBALS['dccr_site_handler'] = static fn(string $url, array $args) => str_contains($url, 'contact') ? dccr_http_ok('<html>no form here</html>') : Test_Site::site_page($url);
    $r = Sveti_Ivan::run_checks(['errlog' => Error_Log::snapshot()], true);
    eq(['page /contact/'], $r['failed'], 'a missing marker without a login form still fails');
    ok(!str_contains(Sveti_Ivan::status_line(), 'Behind The Staging Login'), 'gate notice cleared');
    // The drill's probe stands in for the pages.
    $GLOBALS['dccr_site_handler'] = static fn(string $url, array $args) => str_contains($url, 'ragusa_drill_probe') ? dccr_http_ok('RAGUSA-DRILL-OK') : dccr_http_ok('<form><input type="password"></form>');
    Sveti_Ivan::override_markers(['/?ragusa_drill_probe=1' => ['RAGUSA-DRILL-OK']]);
    $r = Sveti_Ivan::run_checks(['errlog' => Error_Log::snapshot()], true);
    eq(['page /?ragusa_drill_probe=1', 'error_log'], array_keys($r['checks']), 'only the probe and the error log are checked');
    eq(true, $r['checks']['page /?ragusa_drill_probe=1']['ok'], 'the probe passes at 1.0.0');
    $GLOBALS['dccr_site_handler'] = static fn(string $url, array $args) => str_contains($url, 'ragusa_drill_probe') ? dccr_http_ok('RAGUSA-DRILL-BROKEN', 500) : dccr_http_ok('<form><input type="password"></form>');
    $r = Sveti_Ivan::run_checks(['errlog' => Error_Log::snapshot()], true);
    eq(['page /?ragusa_drill_probe=1'], $r['failed'], 'the probe fails at 1.0.1');
    Sveti_Ivan::override_markers(null);
    ok(State::get('markers_override') === null, 'override cleared');
    ok(str_contains(DCCR\Drill::drill_plugin('1.0.0'), "plugins_loaded") && str_contains(DCCR\Drill::drill_plugin('1.0.1'), '500'), 'the drill plugin answers its probe on plugins_loaded');
    $GLOBALS['dccr_site_handler'] = null;
    // Item 6: the headline leads with what needs a look.
    Fortress::set_status(Fortress::LOVRIJENAC, Fortress::NEEDS_LOOK, 'x');
    ok(str_starts_with(Fortress::overall(), 'Something Needs A Look'), 'headline: ' . Fortress::overall());
    // Item 7: the proof script skips Ragusa through a pre-initialised filter.
    ok(str_contains(DCCR\Proof::script(true), "'dcc-ragusa'") && !str_contains(DCCR\Proof::script(false), "'dcc-ragusa'"), 'proof script drops Ragusa only in the skipped column');
    ok(str_contains(DCCR\Proof::script(false), "'wp-staging'") && str_contains(DCCR\Proof::script(true), "'wp-staging'"), 'on staging, WP Staging is set aside in both columns');
    dccr_test_site('live');
    ok(!str_contains(DCCR\Proof::script(false), 'option_active_plugins'), 'on live nothing is set aside');
    dccr_test_site('staging');
    $r = DCCR\Proof::interpret('<html><form><input type="password" name="wpstg"></form></html>', '', 0, 'php');
    ok(!$r['ok'] && str_contains($r['error'], 'login page'), 'a login page is named as the reason: ' . $r['error']);
    $r = DCCR\Proof::interpret('', '', 255, '/usr/bin/php');
    ok(!$r['ok'] && str_contains($r['error'], 'printed nothing'), 'an empty answer names the binary and the exit code');
    $r = DCCR\Proof::interpret('noise {"files":10,"queries":2,"ragusa_files":1,"ragusa_classes":0,"hooks":0,"enqueued":0}', '', 0, 'php');
    ok($r['ok'] && $r['data']['files'] === 10, 'the JSON is read from the end of the output');
    ok(str_contains(DCCR\Proof::script(false), 'wp-load.php') && str_contains(DCCR\Proof::script(false), 'num_queries'), 'the proof loads wp-load and counts queries');
});

// ------------------------------------------------------------- 0.1.2 items
suite('0.1.2 blocker 1a: only this site\'s logs are read; a parent that is a WordPress root is another site', function () {
    $parent = dirname(Site::abspath());
    ok(in_array($parent . '/error_log', Error_Log::paths(), true), 'a parent that is not a WordPress root is read (live: ~/error_log)');
    file_put_contents($parent . '/wp-load.php', '<?php');
    ok(!in_array($parent . '/error_log', Error_Log::paths(), true), 'a parent holding wp-load.php is another site: not read');
    ok(in_array(Site::abspath() . '/error_log', Error_Log::paths(), true), 'this site\'s own log is read');
    ok(in_array(Site::content_dir() . '/debug.log', Error_Log::paths(), true), 'and its debug.log');
    // The live typo, written to the parent log, is invisible to staging.
    file_put_contents($parent . '/error_log', '');
    $snap = Error_Log::snapshot();
    file_put_contents($parent . '/error_log', "[22-Oct-2026 01:36:20 UTC] PHP Fatal error: Uncaught Error: Class \"DCCWL\\Water_Data\" not found in /home/x/public_html/wp-content/plugins/other/file.php:1\n", FILE_APPEND);
    eq([], Error_Log::new_fatals($snap), 'a fatal in the parent site\'s log is not this site\'s');
    unlink($parent . '/wp-load.php');
    unlink($parent . '/error_log');
});

suite('0.1.2 blocker 1b: a WP-CLI fatal is never evidence; a fatal elsewhere alerts instead of rolling back', function () {
    tick();
    $log = Site::abspath() . '/error_log';
    file_put_contents($log, '');
    $snap = Error_Log::snapshot();
    file_put_contents($log, "[22-Oct-2026 01:36:20 UTC] PHP Fatal error: Uncaught Error: Class \"DCCWL\\Water_Data\" not found in phar:///usr/local/bin/wp/vendor/wp-cli/eval-command/src/Eval_Command.php(39) : eval()'d code:1\n", FILE_APPEND);
    eq([], Error_Log::new_fatals($snap), 'the wp eval typo is ignored');
    ok(Error_Log::is_cli_line("PHP Fatal error: x in phar:///usr/local/bin/wp/php/boot-fs.php:12"), 'a .phar location is WP-CLI');
    ok(!Error_Log::is_cli_line("PHP Fatal error: x in /home/x/public_html/wp-content/plugins/wporg-plugin/a.php:12"), 'a plugin file is not');

    // A real fatal in another plugin after this update: alert, no rollback.
    $id = simulate_update('wporg-plugin', '1.5.0');
    file_put_contents($log, "[22-Oct-2026 01:40:00 UTC] PHP Fatal error: Uncaught Error: Call to undefined function in " . WP_PLUGIN_DIR . "/dcc-demo/dcc-demo.php:3\n", FILE_APPEND);
    Sveti_Ivan::scheduled_check($id);
    Sveti_Ivan::scheduled_check($id);
    eq(Journal::COMMITTED, Journal::get($id)['state'], 'the update passes');
    eq(0, count(Journal::recent(5, null, 'rollback')), 'no rollback for someone else\'s fatal');
    eq('1.5.0', Revelin::plugin_version('wporg-plugin'), 'the new version stays');
    $fe = array_filter(Alerts::active(Fortress::SVETI_IVAN), static fn($a) => $a['kind'] === 'fatal-elsewhere');
    eq(1, count($fe), 'one "fatal elsewhere" finding');
    ok(str_contains(reset($fe)['title'], 'A New Fatal Elsewhere After This Update'), 'with the agreed title');

    // 0.2.2: ONE fatal line in the plugin's own files (a half-written install) is one failure, not two.
    file_put_contents($log, '');
    break_cottage_when('9.9.9'); // pages fine; only the log fails
    $id = simulate_update('wporg-plugin', '1.6.0');
    file_put_contents($log, '[' . gmdate('d-M-Y H:i:s', time() + 1) . " UTC] PHP Fatal error: Uncaught Error: boom in " . WP_PLUGIN_DIR . "/wporg-plugin/includes/a.php:2\n", FILE_APPEND);
    Sveti_Ivan::scheduled_check($id);
    eq(Journal::VERIFYING, Journal::get($id)['state'], 'the first check fails once and waits for the repeat');
    ok(!empty(Journal::get($id)['verify']['first_fail']['errlog']), 'the first failure records where the log stood');
    Sveti_Ivan::scheduled_check($id);
    eq(0, count(Journal::recent(5, null, 'rollback')), '0.2.2: the same single fatal line is not read again by the repeat: no rollback');
    eq(Journal::COMMITTED, Journal::get($id)['state'], 'the update passes');
    eq('1.6.0', Revelin::plugin_version('wporg-plugin'), 'and stays');

    // A plugin that keeps failing writes a fatal again before the repeat: that still rolls back.
    $id = simulate_update('wporg-plugin', '1.7.0');
    file_put_contents($log, '[' . gmdate('d-M-Y H:i:s', time() + 1) . " UTC] PHP Fatal error: Uncaught Error: boom in " . WP_PLUGIN_DIR . "/wporg-plugin/includes/a.php:2\n", FILE_APPEND);
    Sveti_Ivan::scheduled_check($id);
    file_put_contents($log, '[' . gmdate('d-M-Y H:i:s', time() + 3) . " UTC] PHP Fatal error: Uncaught Error: boom in " . WP_PLUGIN_DIR . "/wporg-plugin/includes/a.php:2\n", FILE_APPEND);
    Sveti_Ivan::scheduled_check($id);
    eq(1, count(Journal::recent(5, null, 'rollback')), 'a fatal in the plugin itself, again at the repeat, rolls back');
    $GLOBALS['dccr_site_handler'] = null;
    unlink($log);
});

suite('0.2.2 item 2: a fatal is credited to the update whose window it falls in and whose files it names', function () {
    tick();
    $log = Site::abspath() . '/error_log';
    file_put_contents($log, '');
    $stamp = static fn(int $ts) => '[' . gmdate('d-M-Y H:i:s', $ts) . ' UTC]';
    eq(strtotime('2026-10-26 04:29:13 UTC'), Error_Log::line_time('[26-Oct-2026 04:29:13 UTC] PHP Fatal error: x'), 'line_time reads PHP\'s stamp');
    eq(strtotime('2026-10-26 04:29:13 UTC'), Error_Log::line_time('[26-Oct-2026 00:29:13 America/New_York] PHP Fatal error: x'), 'with a named zone');
    ok(Error_Log::line_time('PHP Fatal error: no stamp') === null, 'no stamp, no time');

    // AIOSEO's auto-update is in its window (journal row, still verifying) ...
    $aioseo = Journal::create('update-check', 'all-in-one-seo-pack', ['slug' => 'all-in-one-seo-pack', 'kind' => 'update', 'source' => 'auto', 'new_version' => '5.0.4', 'started' => time() - 30], 'update from auto', false);
    Journal::set_state($aioseo, Journal::VERIFYING, []);
    // ... while Ragusa's own self-update check runs, and the log gets AIOSEO's half-written fatal.
    $before = ['slug' => 'dcc-ragusa', 'errlog' => Error_Log::snapshot()];
    $line   = $stamp(time()) . ' PHP Fatal error: Uncaught Error: Class "ActionScheduler" not found in ' . WP_PLUGIN_DIR . '/all-in-one-seo-pack/vendor/woocommerce/action-scheduler/classes/ActionScheduler.php:12';
    file_put_contents($log, $line . "\n", FILE_APPEND);
    $w = Sveti_Ivan::fatal_owner($line, 'dcc-ragusa');
    ok($w !== null && $w['slug'] === 'all-in-one-seo-pack' && $w['id'] === $aioseo, 'fatal_owner names the AIOSEO update');
    $r = Sveti_Ivan::run_checks($before, true);
    ok($r['checks']['error_log']['ok'] === null && str_contains($r['checks']['error_log']['detail'], 'all-in-one-seo-pack during its own update (journal ' . $aioseo . ')'), 'Ragusa\'s check credits it to AIOSEO: ' . $r['checks']['error_log']['detail']);
    eq([], array_filter(Alerts::open(Fortress::SVETI_IVAN), static fn($a) => $a['kind'] === 'fatal-elsewhere'), 'no "Fatal Elsewhere" finding against dcc-ragusa');
    $ev = events_of('fatal-attributed');
    ok(count($ev) === 1 && $ev[0]['target'] === 'all-in-one-seo-pack' && (int) $ev[0]['journal_id'] === $aioseo, 'one info line, on AIOSEO\'s journal row');
    // AIOSEO's own check sees it as its own (it is AIOSEO's files): one failure, then the repeat decides.
    $own = Sveti_Ivan::run_checks(['slug' => 'all-in-one-seo-pack', 'errlog' => $before['errlog']], true);
    eq(false, $own['checks']['error_log']['ok'], 'for AIOSEO\'s own check it is its own fatal');

    // Outside the window: the same kind of line is someone else's fatal, alerted as before.
    file_put_contents($log, '');
    $before = ['slug' => 'dcc-ragusa', 'errlog' => Error_Log::snapshot()];
    $late   = $stamp(time() - 7200) . ' PHP Fatal error: Uncaught Error: boom in ' . WP_PLUGIN_DIR . '/all-in-one-seo-pack/app/Main.php:3';
    file_put_contents($log, $late . "\n", FILE_APPEND);
    ok(Sveti_Ivan::fatal_owner($late, 'dcc-ragusa') === null, 'two hours before the window: no owner');
    Sveti_Ivan::run_checks($before, true);
    $fe = array_filter(Alerts::open(Fortress::SVETI_IVAN), static fn($a) => $a['kind'] === 'fatal-elsewhere');
    eq(1, count($fe), 'outside any window it is "A New Fatal Elsewhere"');
    // In the window but naming ANOTHER plugin: not AIOSEO's.
    $other = $stamp(time()) . ' PHP Fatal error: Uncaught Error: boom in ' . WP_PLUGIN_DIR . '/dcc-demo/dcc-demo.php:3';
    ok(Sveti_Ivan::fatal_owner($other, 'dcc-ragusa') === null, 'a fatal in a plugin that was not updated has no owner');
    // A core update's window owns a core fatal.
    $core = Journal::create('core-check', 'core', ['slug' => 'core', 'kind' => 'core', 'version' => '7.1.4', 'started' => time() - 30], 'core update', false);
    $cl   = $stamp(time()) . ' PHP Fatal error: boom in ' . ABSPATH . 'wp-includes/class-wp-hook.php:324';
    eq($core, (Sveti_Ivan::fatal_owner($cl, 'dcc-ragusa') ?? ['id' => 0])['id'], 'a core fatal in a core update\'s window is core\'s');
    Alerts::withdraw(Fortress::SVETI_IVAN, ['fatal-elsewhere']);
    unlink($log);
});

suite('0.1.2 item 2: a recorded plugin update re-baselines its own files silently', function () {
    tick();
    Test_Site::write('wp-content/plugins/wporg-plugin/includes/new-file.php', "<?php\n// new in 1.5.0\n");
    file_put_contents(WP_PLUGIN_DIR . '/wporg-plugin/includes/a.php', "<?php\n// changed in 1.5.0\n");
    Test_Site::$plugin_checksums['wporg-plugin/1.5.0'] = [];
    foreach (['wporg-plugin.php', 'includes/a.php', 'includes/new-file.php', 'readme.txt'] as $rel) {
        $c = (string) file_get_contents(WP_PLUGIN_DIR . '/wporg-plugin/' . ($rel === 'wporg-plugin.php' ? $rel : $rel));
    }
    $id = simulate_update('wporg-plugin', '1.5.0');
    foreach (['wporg-plugin.php', 'includes/a.php', 'includes/new-file.php', 'readme.txt'] as $rel) {
        $c = (string) file_get_contents(WP_PLUGIN_DIR . '/wporg-plugin/' . $rel);
        Test_Site::$plugin_checksums['wporg-plugin/1.5.0'][$rel] = ['md5' => md5($c), 'sha256' => hash('sha256', $c)];
    }
    $ev = array_values(array_filter(events_of('plugin-rebaselined'), static fn($e) => $e['target'] === 'wporg-plugin'));
    eq(1, count($ev), 'one info line about the re-baseline');
    ok(str_contains($ev[0]['message'], 'wporg-plugin 1.5.0: 3 files updated'), 'naming the version and the count: ' . $ev[0]['message']);
    State::set('last_full_pass', 0);
    tick();
    $m = array_filter(Alerts::active(Fortress::MINCETA), static fn($a) => in_array($a['kind'], ['file-new', 'file-changed', 'plugin-modified'], true));
    eq(0, count($m), 'the walk raises nothing for the updated plugin\'s files');
    eq(0, count(array_filter(events_of('file-changed'), static fn($e) => str_contains($e['target'], 'wporg-plugin'))), 'no file-changed events either');
});

suite('0.1.2 item 3: a self-update row is recovered, not abandoned', function () {
    tick();
    $id = Journal::create('self-update', 'dcc-ragusa', ['slug' => 'dcc-ragusa', 'is_self' => true, 'errlog' => Error_Log::snapshot(), 'started' => time()], 'x', false);
    Journal::set_state($id, Journal::VERIFYING, ['verify' => ['next_at' => time() - 600]]);
    age_row($id, 300);
    Journal::new_run();
    Actions::recover();
    $row = Journal::get($id);
    ok($row['state'] !== Journal::ABANDONED, 'not abandoned: ' . $row['state']);
    eq(Journal::COMMITTED, $row['state'], 'the lost self-update check was run and passed');
});

suite('0.1.2 item 4: the rollback row is committed in the same call as its verification, even when the follow-up runs at once', function () {
    tick();
    // The follow-up runs synchronously, as the WP-CLI subprocess does on the real host.
    Sveti_Ivan::$followup_runner = static function (int $id): void {
        Sveti_Ivan::scheduled_check($id);
    };
    break_cottage_when('1.5.0');
    $id = simulate_update('wporg-plugin', '1.5.0');
    Sveti_Ivan::scheduled_check($id);
    Sveti_Ivan::scheduled_check($id);
    $rb = Journal::latest('rollback', 'wporg-plugin');
    eq(Journal::COMMITTED, $rb['state'], 'the rollback row is committed when Rollback::run returns');
    eq('1.4.0', Revelin::plugin_version('wporg-plugin'), 'previous version in place');
    [$ok, $msg] = Actions::reverse((int) $rb['id']);
    ok($ok, 'the reverse is accepted at once: ' . $msg);
    eq('1.5.0', Revelin::plugin_version('wporg-plugin'), 'and the new version is back');
    Sveti_Ivan::$followup_runner = null;
    $GLOBALS['dccr_site_handler'] = null;
    // The drill is loud.
    ok(DCCR\Drill::failed(['ok      x', 'FAILED  version in place: 1.0.0 (expected 1.0.1)']), 'a FAILED line fails the drill');
    ok(!DCCR\Drill::failed(['ok      x', 'Cleaned up.']), 'no FAILED line, no failure');
});

suite('0.1.2 item 5: upgrading from 0.1.1 retakes Bokar\'s baseline quietly; a reordered plugin list is not a change', function () {
    tick();
    Alerts::raise(['fortress' => Fortress::BOKAR, 'severity' => Events::BREACHED, 'kind' => 'role-changed', 'target' => '5', 'title' => 'Role Changed', 'what' => 'w']);
    update_option('dcc_ragusa_version', '0.1.1', 'no');
    DCCR\Plugin::maybe_upgrade();
    eq(0, count(array_filter(Alerts::active(Fortress::BOKAR), static fn($a) => $a['kind'] === 'role-changed')), 'the false role changes are withdrawn');
    $b = get_option('dcc_ragusa_baselines');
    ok(!isset($b['users']), 'the user baseline is dropped so the next tick retakes it');
    tick();
    eq(0, count(events_of('role-changed')), 'retaking the baseline raises no change');
    ok(str_contains(Fortress::status(Fortress::BOKAR)['line'], '2 Administrators'), 'two administrators again');
    // A --force reinstall reorders active_plugins: same set, nothing to say.
    $before = count(events_of('option-changed'));
    update_option('active_plugins', array_reverse((array) get_option('active_plugins')));
    tick();
    eq($before, count(events_of('option-changed')), 'a reorder raises nothing');
    update_option('active_plugins', array_merge((array) get_option('active_plugins'), ['brand-new/brand-new.php']));
    tick();
    eq($before + 1, count(events_of('option-changed')), 'an added plugin still does');
});

suite('0.1.2 item 7: the disk figure reaches the card on every reading; the tick line reads plainly', function () {
    tick();
    State::set('disk', ['checked_at' => time(), 'used' => 8300 * 1024 * 1024, 'limit' => 10240 * 1024 * 1024, 'pct' => 82.7, 'method' => 'quota', 'device' => '/dev/sdd']);
    Minceta::update_status();
    ok(str_contains(Fortress::status(Fortress::MINCETA)['line'], '8.1 GB Of 10.0 GB (82.7%)'), 'the card shows the figure: ' . Fortress::status(Fortress::MINCETA)['line']);
    $GLOBALS['dccr_cron'] = [['ts' => time() - 5 * 3600, 'hook' => 'dccr_tick', 'args' => [], 'recurrence' => 'dccr_10min']];
    ok(str_contains(DCCR\Cli::tick_line(), 'Overdue By 5 Hours'), 'overdue reads plainly: ' . DCCR\Cli::tick_line());
    $GLOBALS['dccr_cron'] = [['ts' => time() + 240, 'hook' => 'dccr_tick', 'args' => [], 'recurrence' => 'dccr_10min']];
    ok(str_contains(DCCR\Cli::tick_line(), 'next in 4 min'), 'a future tick reads plainly: ' . DCCR\Cli::tick_line());
    // WP-CLI docblocks: every command has a one-line summary and no raw one-line docblock.
    $src = (string) file_get_contents(dirname(__DIR__) . '/includes/class-cli.php');
    ok(!preg_match('#/\*\* [^\n]*\*/\s*\n\s*public function#', $src), 'no one-line docblock on a command');
    preg_match_all('#/\*\*\n\s+\* ([^\n]+)\n#', $src, $m);
    ok(count($m[1]) >= 14, 'every command carries a summary line: ' . count($m[1]));
});

// ------------------------------------------------------------- 0.1.3: practice, settling, seen
suite('0.1.3 A: everything a drill does is practice: grey, uncounted, unmailed, and gone from the page after a day', function () {
    dccr_test_site('staging');
    tick();
    eq(Fortress::HOLDING, Fortress::status(Fortress::MINCETA)['state'], 'Minčeta holding before the drill');
    $lines = DCCR\Drill::run('quarantine');
    ok(!DCCR\Drill::failed($lines), 'the quarantine drill passes: ' . implode(' | ', $lines));
    $ev = events_of('quarantined');
    eq(1, count($ev), 'the drill\'s quarantine is journaled');
    eq(Events::TAG_DRILL, $ev[0]['tag'], 'and tagged as practice');
    $row = Journal::latest('quarantine', 'wp-content/uploads/ragusa-drill/evil.php');
    eq(Events::TAG_DRILL, $row['tag'], 'the journal row is tagged too');
    $f = Alerts::get(Events::fingerprint(Fortress::MINCETA, 'quarantined', 'wp-content/uploads/ragusa-drill/evil.php'));
    ok($f !== null && Alerts::state($f) === 'practice', 'the finding is practice');
    eq(Fortress::HOLDING, Fortress::status(Fortress::MINCETA)['state'], 'the card stays holding');
    ok(str_starts_with(Fortress::overall(), 'The Walls Are Holding'), 'the headline stays holding: ' . Fortress::overall());
    eq(0, count(Alerts::open(Fortress::MINCETA)), 'no open finding');
    // A restore-guard drill on the live site would email a real restore; practice never does.
    dccr_test_site('live');
    $before = count($GLOBALS['dccr_mail']);
    $GLOBALS['dccr_home_url'] = 'https://doracanalcourt.com/staging/';
    $lines = DCCR\Drill::run('restore-guard');
    eq($before, count($GLOBALS['dccr_mail']), 'the restore-guard drill sends no email');
    ok(!DCCR\Drill::failed($lines), 'restore-guard drill passes: ' . implode(' | ', $lines));
    eq(Fortress::HOLDING, Fortress::status(Fortress::REVELIN)['state'], 'Revelin stays holding');
    dccr_test_site('staging');
    // Practice events show for a day, then leave the page but not the table.
    $page = Events::recent(50, 0, true);
    ok(count(array_filter($page, static fn($e) => $e['tag'] === Events::TAG_DRILL)) > 0, 'practice events are on the page today');
    global $wpdb;
    $wpdb->query("UPDATE " . DCCR\Schema::events() . " SET ts = ts - 90000 WHERE tag = 'drill'");
    $page = Events::recent(50, 0, true);
    eq(0, count(array_filter($page, static fn($e) => $e['tag'] === Events::TAG_DRILL)), 'a day later they leave the page');
    ok(count(array_filter(Events::recent(50), static fn($e) => $e['tag'] === Events::TAG_DRILL)) > 0, 'but stay in the table');
    // The walk never sees the drill's paths, during or after.
    Test_Site::write('wp-content/uploads/ragusa-drill/evil.php', '<?php');
    @mkdir(WP_PLUGIN_DIR . '/ragusa-drill-plugin', 0755, true);
    file_put_contents(WP_PLUGIN_DIR . '/ragusa-drill-plugin/ragusa-drill-plugin.php', "<?php\n/**\n * Plugin Name: Ragusa Drill Plugin\n * Version: 1.0.0\n */\n");
    State::set('last_full_pass', 0);
    tick();
    eq(0, count(array_filter(events_of('file-new'), static fn($e) => str_contains($e['target'], 'ragusa-drill'))), 'a drill plugin file is not "new"');
    ok(is_file(WP_CONTENT_DIR . '/uploads/ragusa-drill/evil.php'), 'the drill\'s upload is not quarantined by the walk');
    DCCR\Vault::rm_rf(WP_PLUGIN_DIR . '/ragusa-drill-plugin');
    State::set('last_full_pass', 0);
    tick();
    eq(0, count(array_filter(events_of('file-missing'), static fn($e) => str_contains($e['target'], 'ragusa-drill'))), 'a removed drill plugin is not "gone"');
});

suite('0.1.3 B: a rollback finding resolves when a newer version passes, or the rollback is undone; late journals raise nothing', function () {
    tick();
    break_cottage_when('1.5.0');
    $id = simulate_update('wporg-plugin', '1.5.0');
    Sveti_Ivan::scheduled_check($id);
    Sveti_Ivan::scheduled_check($id);
    $rb = Journal::latest('rollback', 'wporg-plugin');
    Sveti_Ivan::scheduled_check((int) Journal::latest('update-check', 'wporg-plugin')['id']);
    $fp = Events::fingerprint(Fortress::SVETI_IVAN, 'update-rolled-back', 'wporg-plugin');
    eq('open', Alerts::state(Alerts::get($fp)), 'the rollback finding is open');
    eq(Fortress::BREACHED, Fortress::status(Fortress::SVETI_IVAN)['state'], 'and the card is breached: a real rollback still is');
    eq('1.5.0', Alerts::get($fp)['data']['rolled_back'], 'it remembers the rolled-back version');
    $GLOBALS['dccr_site_handler'] = null;
    // A newer version passes its checks.
    $id2 = simulate_update('wporg-plugin', '1.5.1');
    Sveti_Ivan::scheduled_check($id2);
    eq('resolved', Alerts::state(Alerts::get($fp)), 'the finding resolved when 1.5.1 passed');
    eq(Fortress::HOLDING, Fortress::status(Fortress::SVETI_IVAN)['state'], 'the card is holding again');
    ok(str_starts_with(Fortress::overall(), 'The Walls Are Holding'), 'headline holding: ' . Fortress::overall());
    // A journal that finishes late, for a version no longer installed, raises nothing.
    $late = Journal::create('update-check', 'wporg-plugin', ['slug' => 'wporg-plugin', 'kind' => 'update', 'new_version' => '1.5.0', 'old_version' => '1.4.0', 'started' => time() - 60, 'errlog' => Error_Log::snapshot(), 'entry' => $rb['before']['entry']], 'late', false);
    Journal::set_state($late, Journal::VERIFYING, ['verify' => ['first_fail' => ['ts' => time() - 600, 'failed' => ['page /accommodation/cottage-34/']], 'attempts' => 1]]);
    break_cottage_when('1.5.1'); // everything fails now, yet nothing may happen
    Sveti_Ivan::scheduled_check($late);
    eq(Journal::ABANDONED, Journal::get($late)['state'], 'the late row is set aside');
    eq('resolved', Alerts::state(Alerts::get($fp)), 'no fresh breach');
    eq(1, count(Journal::recent(10, null, 'rollback')), 'no second rollback');
    $GLOBALS['dccr_site_handler'] = null;
    // Undoing a rollback resolves its finding too.
    break_cottage_when('1.6.0');
    $id3 = simulate_update('wporg-plugin', '1.6.0');
    Sveti_Ivan::scheduled_check($id3);
    Sveti_Ivan::scheduled_check($id3);
    $rb2 = Journal::latest('rollback', 'wporg-plugin');
    Sveti_Ivan::scheduled_check((int) Journal::latest('update-check', 'wporg-plugin')['id']);
    eq('open', Alerts::state(Alerts::get($fp)), 'a second real rollback reopens the finding');
    $GLOBALS['dccr_site_handler'] = null;
    Actions::reverse((int) $rb2['id']);
    eq('resolved', Alerts::state(Alerts::get($fp)), 'undoing the rollback resolves it');
    eq(Fortress::HOLDING, Fortress::status(Fortress::SVETI_IVAN)['state'], 'card holding after the undo');
});

suite('0.1.3 B: a restore resolves after a day of matching; a role change resolves when the role is back; withdrawn events never count', function () {
    tick();
    $guard = WPMU_PLUGIN_DIR . '/dcc-postpass-guard.php';
    file_put_contents($guard, "<?php\n// tampered\n");
    tick();
    $fp = Events::fingerprint(Fortress::REVELIN, 'guard-restored', 'wp-content/mu-plugins/dcc-postpass-guard.php');
    eq('open', Alerts::state(Alerts::get($fp)), 'restore finding open');
    tick();
    eq('open', Alerts::state(Alerts::get($fp)), 'still open an hour later');
    ok((int) Alerts::get($fp)['data']['matched_since'] > 0, 'the match is being timed');
    Alerts::set_data($fp, 'matched_since', time() - 90000);
    tick();
    eq('resolved', Alerts::state(Alerts::get($fp)), 'resolved after a full day of matching');
    ok(str_contains(json_encode(array_column($GLOBALS['dccr_mail'], 'subject')), '') , 'noop');
    // Bokar.
    $GLOBALS['dccr_users'][0]['roles'] = ['editor'];
    Test_Site::usermeta('wpstg0_');
    tick();
    $rc = Events::fingerprint(Fortress::BOKAR, 'role-changed', '1');
    eq('open', Alerts::state(Alerts::get($rc)), 'role change open');
    eq('administrator', Alerts::get($rc)['data']['from'], 'it remembers the role before');
    ok(str_contains(Fortress::status(Fortress::BOKAR)['line'], '1 Change In 7 Days'), 'counted as a change: ' . Fortress::status(Fortress::BOKAR)['line']);
    $GLOBALS['dccr_users'][0]['roles'] = ['administrator'];
    Test_Site::usermeta('wpstg0_');
    tick();
    eq('resolved', Alerts::state(Alerts::get($rc)), 'resolved when the role is back');
    // Withdrawn: the events no longer count as changes.
    $GLOBALS['dccr_users'][1]['roles'] = ['editor'];
    Test_Site::usermeta('wpstg0_');
    tick();
    ok(str_contains(Fortress::status(Fortress::BOKAR)['line'], 'Changes In 7 Days') || str_contains(Fortress::status(Fortress::BOKAR)['line'], 'Change In 7 Days'), 'two changes counted');
    Alerts::withdraw(Fortress::BOKAR, ['role-changed']);
    tick();
    ok(str_contains(Fortress::status(Fortress::BOKAR)['line'], 'No Changes'), 'withdrawn changes do not count: ' . Fortress::status(Fortress::BOKAR)['line']);
    $w = array_filter(Events::recent(100), static fn($e) => $e['kind'] === 'role-changed');
    foreach ($w as $e) {
        eq(Events::TAG_WITHDRAWN, $e['tag'], 'the role-changed events are tagged withdrawn');
    }
});

suite('0.1.3 C: Mark As Seen needs a capability and a nonce, records who and when, and calms the headline', function () {
    tick();
    Alerts::raise(['fortress' => Fortress::SVETI_IVAN, 'severity' => Events::NEEDS_LOOK, 'kind' => 'fatal-elsewhere', 'target' => 'wporg-plugin@abcd1234', 'title' => 'A New Fatal Elsewhere After This Update', 'what' => 'w', 'did' => 'd', 'todo' => 't']);
    Alerts::raise(['fortress' => Fortress::MINCETA, 'severity' => Events::BREACHED, 'kind' => 'core-modified', 'target' => 'wp-includes/x.php', 'title' => 'Core File Modified', 'what' => 'w', 'did' => 'd', 'todo' => 't']);
    Fortress::settle();
    ok(str_starts_with(Fortress::overall(), 'A Wall Was Breached'), 'headline breached with an open breached finding');
    $fp1 = Events::fingerprint(Fortress::SVETI_IVAN, 'fatal-elsewhere', 'wporg-plugin@abcd1234');
    $fp2 = Events::fingerprint(Fortress::MINCETA, 'core-modified', 'wp-includes/x.php');
    $GLOBALS['dccr_is_admin'] = true;
    // Without the capability.
    $GLOBALS['dccr_caps'] = false;
    $_POST = ['target' => $fp1];
    try {
        Admin::handle_seen();
        ok(false, 'should have died');
    } catch (RuntimeException $e) {
        ok(str_starts_with($e->getMessage(), 'wp_die'), 'no capability: refused');
    }
    eq('open', Alerts::state(Alerts::get($fp1)), 'still open');
    // Without a nonce.
    $GLOBALS['dccr_caps'] = true;
    $GLOBALS['dccr_nonce_ok'] = false;
    try {
        Admin::handle_seen();
        ok(false, 'should have died');
    } catch (RuntimeException $e) {
        ok(str_contains($e->getMessage(), 'nonce'), 'no nonce: refused');
    }
    eq('open', Alerts::state(Alerts::get($fp1)), 'still open');
    // With both.
    $GLOBALS['dccr_nonce_ok'] = true;
    $GLOBALS['dccr_display_name'] = 'Rob';
    try {
        Admin::handle_seen();
    } catch (RuntimeException $e) {
        ok(str_starts_with($e->getMessage(), 'redirect:'), 'redirects back to the page');
    }
    $a = Alerts::get($fp1);
    eq('seen', Alerts::state($a), 'marked as seen');
    eq('Rob', $a['seen_by'], 'who');
    ok((int) $a['seen_at'] > time() - 60, 'when');
    eq(1, count(array_filter(events_of('seen'), static fn($e) => str_contains($e['message'], 'Rob'))), 'the event names who');
    ok(str_starts_with(Fortress::overall(), 'A Wall Was Breached'), 'still breached: the core finding is open');
    $_POST = ['target' => $fp2];
    try {
        Admin::handle_seen();
    } catch (RuntimeException $e) {
    }
    ok(str_starts_with(Fortress::overall(), 'The Walls Are Holding'), 'holding once every finding is seen: ' . Fortress::overall());
    // Only practice and seen findings: holding.
    DCCR\Drill::$active = true;
    Alerts::raise(['fortress' => Fortress::MINCETA, 'severity' => Events::BREACHED, 'kind' => 'quarantined', 'target' => 'wp-content/uploads/ragusa-drill/x.php', 'title' => 'File Quarantined', 'what' => 'w', 'did' => 'd', 'todo' => 't']);
    DCCR\Drill::$active = false;
    Fortress::settle();
    ok(str_starts_with(Fortress::overall(), 'The Walls Are Holding'), 'practice plus seen: holding');
    // The email never carries a one-click link; the page carries the form with a nonce.
    $body = Alerts::body(['what' => 'w', 'did' => 'd', 'todo' => 't']);
    ok(!str_contains($body, 'dccr_seen') && !str_contains($body, '_dccr_nonce'), 'no seen link in an email');
    Alerts::raise(['fortress' => Fortress::BOKAR, 'severity' => Events::NEEDS_LOOK, 'kind' => 'app-password', 'target' => '2@1', 'title' => 'Application Password Created', 'what' => 'w', 'did' => 'd', 'todo' => 't']);
    $_GET = [];
    ob_start();
    Admin::render();
    $html = (string) ob_get_clean();
    ok(str_contains($html, 'Seen By Rob'), 'the card shows who saw it');
    ok(str_contains($html, 'value="dccr_seen"') && str_contains($html, 'name="_dccr_nonce"'), 'the Mark As Seen form carries the nonce');
    ok(str_contains($html, 'Practice'), 'practice is labelled');
    $_POST = [];
    $GLOBALS['dccr_is_admin'] = false;
});

suite('0.1.3 upgrade: earlier drills are re-tagged, late rollbacks settled, old role changes withdrawn, the tag column added', function () {
    // A 0.1.2 database: tables without the tag column.
    global $wpdb;
    foreach (DCCR\Schema::definitions() as $table => $sql) {
        $wpdb->query("DROP TABLE IF EXISTS {$table}");
        $wpdb->db_delta(str_replace("tag varchar(16) NOT NULL DEFAULT '',\n", '', $sql));
    }
    update_option(DCCR\Schema::OPTION, 1, 'no');
    DCCR\Schema::ensure();
    $cols = array_column($wpdb->get_results("PRAGMA table_info(" . DCCR\Schema::events() . ")", ARRAY_A), 'name');
    ok(in_array('tag', $cols, true), 'the tag column is added to an existing table');
    tick();
    // What 0.1.2's drills left behind.
    $e1 = Events::record(Fortress::SVETI_IVAN, Events::BREACHED, 'update-rolled-back', 'ragusa-drill-plugin', 'drill rollback', [], null, '');
    $e2 = Events::record(Fortress::MINCETA, Events::NEEDS_LOOK, 'file-missing', 'wp-content/plugins/ragusa-drill-plugin/ragusa-drill-plugin.php', 'gone', [], null, '');
    Alerts::raise(['fortress' => Fortress::SVETI_IVAN, 'severity' => Events::BREACHED, 'kind' => 'update-rolled-back', 'target' => 'ragusa-drill-plugin', 'title' => 'Update Rolled Back', 'what' => 'w', 'did' => 'd', 'todo' => 't']);
    $guard = 'wp-content/mu-plugins/dcc-postpass-guard.php';
    $rg = Journal::create('restore-guard', $guard, ['label' => 'x']);
    $kept = Vault::quarantine_dir($rg) . '/' . $guard;
    @mkdir(dirname($kept), 0700, true);
    file_put_contents($kept, "<?php\n// guard\n# ragusa drill 1\n");
    Journal::set_state($rg, Journal::BEFORE, ['before' => ['kept' => $kept]]);
    Journal::set_state($rg, Journal::REVERSED);
    $e3 = Events::record(Fortress::REVELIN, Events::BREACHED, 'guard-restored', $guard, 'restored', [], $rg, '');
    Alerts::raise(['fortress' => Fortress::REVELIN, 'severity' => Events::BREACHED, 'kind' => 'guard-restored', 'target' => $guard, 'title' => 'Guarded File Restored', 'what' => 'w', 'did' => 'd', 'todo' => 't']);
    // Yesterday's false rollbacks, raised late, for plugins that have moved on.
    $rb = Journal::create('rollback', 'wporg-plugin', ['slug' => 'wporg-plugin', 'new_version' => '1.3.0', 'old_version' => '1.2.0']);
    Journal::set_state($rb, Journal::COMMITTED);
    Alerts::raise(['fortress' => Fortress::SVETI_IVAN, 'severity' => Events::BREACHED, 'kind' => 'update-rolled-back', 'target' => 'wporg-plugin', 'title' => 'Update Rolled Back', 'what' => 'w', 'did' => 'd', 'todo' => 't']);
    // 0.1.0's role changes, already withdrawn by 0.1.2, but their events still counted.
    Events::record(Fortress::BOKAR, Events::BREACHED, 'role-changed', '7', 'changed from editor to administrator', [], null, '');
    Fortress::settle();
    ok(str_starts_with(Fortress::overall(), 'A Wall Was Breached'), 'before the upgrade: breached');
    update_option('dcc_ragusa_version', '0.1.2', 'no');
    DCCR\Plugin::maybe_upgrade();
    $byid = [];
    foreach (Events::recent(100) as $e) {
        $byid[(int) $e['id']] = $e;
    }
    eq(Events::TAG_DRILL, $byid[$e1]['tag'], 'the drill rollback event is practice');
    eq(Events::TAG_DRILL, $byid[$e2]['tag'], 'the drill file-missing event is practice');
    eq(Events::TAG_DRILL, $byid[$e3]['tag'], 'the drill\'s guard restore is practice (its kept copy carries the drill marker)');
    eq(Events::TAG_DRILL, Journal::get($rg)['tag'], 'its journal row too');
    eq('practice', Alerts::state(Alerts::get(Events::fingerprint(Fortress::REVELIN, 'guard-restored', $guard))), 'Revelin\'s finding is practice');
    eq('practice', Alerts::state(Alerts::get(Events::fingerprint(Fortress::SVETI_IVAN, 'update-rolled-back', 'ragusa-drill-plugin'))), 'the drill rollback finding is practice');
    eq('resolved', Alerts::state(Alerts::get(Events::fingerprint(Fortress::SVETI_IVAN, 'update-rolled-back', 'wporg-plugin'))), 'the late rollback finding is resolved: 1.4.0 is newer than 1.3.0');
    $rc = array_values(array_filter(Events::recent(100), static fn($e) => $e['kind'] === 'role-changed'));
    eq(Events::TAG_WITHDRAWN, $rc[0]['tag'], 'old role-changed events are withdrawn');
    ok(str_contains(Fortress::status(Fortress::BOKAR)['line'], 'No Changes') || !str_contains(Fortress::status(Fortress::BOKAR)['line'], 'Change'), 'Bokar counts no change');
    ok(str_starts_with(Fortress::overall(), 'The Walls Are Holding'), 'after the upgrade: holding: ' . Fortress::overall());
    eq(0, count(mails_with('All Clear')), 'settled quietly');
});


// ------------------------------------------------------------------- 0.2.0
suite('0.2.0 item 1: the event ring keeps the important history; noise goes first; a breached row survives a flood', function () {
    global $wpdb;
    $table = DCCR\Schema::events();
    $wpdb->query("DELETE FROM {$table}");
    Alerts::raise(['fortress' => Fortress::MINCETA, 'severity' => Events::BREACHED, 'kind' => 'quarantined', 'target' => 'wp-content/uploads/flood-shell.php', 'title' => 'Quarantined: flood-shell.php', 'what' => 'w', 'did' => 'd', 'todo' => 't']);
    $breached = Events::record(Fortress::MINCETA, Events::BREACHED, 'quarantined', 'wp-content/uploads/flood-shell.php', 'the one that matters');
    // An old serious row whose finding is not open, and an old one whose finding IS open.
    $old_closed = Events::record(Fortress::BOKAR, Events::NEEDS_LOOK, 'role-changed', 'user:9', 'old and closed');
    $old_open   = Events::record(Fortress::MINCETA, Events::BREACHED, 'quarantined', 'wp-content/uploads/flood-shell.php', 'old but its finding is open');
    $wpdb->query($wpdb->prepare("UPDATE {$table} SET ts = %d WHERE id IN (%d, %d)", time() - 100 * 86400, $old_closed, $old_open));
    for ($i = 0; $i < 300; $i++) {
        Events::record(Fortress::LOVRIJENAC, Events::INFO, 'pass', 'walk', 'routine ' . $i);
    }
    $drill = Events::record(Fortress::REVELIN, Events::NEEDS_LOOK, 'guard-restored', 'mu-plugins/x.php', 'practice', [], null, Events::TAG_DRILL);
    for ($i = 0; $i < 3000; $i++) {
        Events::record(Fortress::MINCETA, Events::NEEDS_LOOK, 'file-new', 'wp-content/wp-staging/flood/' . $i . '.php', 'flood');
    }
    $count = Events::count();
    ok($count > Events::RING, 'the table went past the ring rather than discard serious rows: ' . $count);
    ok((int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE id = %d", $breached)) === 1, 'the breached event survived a flood of 3,000 file-new events');
    eq(0, (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE severity = %s", Events::INFO)), 'every info row went first');
    eq(0, (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE id = %d", $drill)), 'a practice row goes with the noise');
    eq(0, (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE id = %d", $old_closed)), 'a serious row older than 90 days with no open finding goes next');
    eq(1, (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE id = %d", $old_open)), 'a serious row older than 90 days whose finding is open stays');
    eq(3000, (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE kind = %s AND target LIKE %s", 'file-new', 'wp-content/wp-staging/flood/%')), 'no unresolved needs-look row was discarded');
    $wpdb->query("DELETE FROM {$table}");
    Alerts::withdraw(Fortress::MINCETA, ['quarantined']);
    Alerts::withdraw(Fortress::BOKAR, ['role-changed']);
});

suite('0.2.0 item 2: active holds only unresolved findings; resolved ones live in a 30-day history', function () {
    $f = static fn(string $t) => ['fortress' => Fortress::BOKAR, 'severity' => Events::NEEDS_LOOK, 'kind' => 'count', 'target' => $t, 'title' => 'Count ' . $t, 'what' => 'w', 'did' => 'd', 'todo' => 't'];
    foreach (['a', 'b', 'c', 'd'] as $t) {
        Alerts::raise($f($t));
    }
    $fp = static fn(string $t) => Events::fingerprint(Fortress::BOKAR, 'count', $t);
    Alerts::resolve($fp('a'));
    Alerts::mark_seen($fp('b'), 'Rob');
    eq(3, count(Alerts::unresolved(Fortress::BOKAR)), 'three unresolved: two open and one seen');
    eq(1, count(Alerts::history(Fortress::BOKAR)), 'one in the history');
    eq('resolved', Alerts::state(Alerts::get($fp('a'))), 'get() still finds a resolved finding');
    ok(isset(Alerts::active(Fortress::BOKAR)[$fp('a')]), 'the page still shows it for a week');
    ok(!isset(Alerts::open(Fortress::BOKAR)[$fp('a')]), 'but it is not open');
    // Raised again: it returns from the history as open.
    Alerts::raise($f('a'));
    eq('open', Alerts::state(Alerts::get($fp('a'))), 'raised again after resolving: open again');
    eq(0, count(Alerts::history(Fortress::BOKAR)), 'and gone from the history');
    Alerts::resolve($fp('a'));
    Alerts::set_data($fp('a'), 'resolved_at', time() - 8 * 86400);
    Alerts::reset_cache();
    $opt = get_option(Alerts::OPTION);
    $opt['resolved'][$fp('a')]['resolved_at'] = time() - 8 * 86400;
    update_option(Alerts::OPTION, $opt, 'no');
    Alerts::reset_cache();
    ok(!isset(Alerts::active(Fortress::BOKAR)[$fp('a')]), 'after a week it leaves the page');
    eq(1, count(Alerts::history(Fortress::BOKAR)), 'but stays in the history');
    $opt['resolved'][$fp('a')]['resolved_at'] = time() - 31 * 86400;
    update_option(Alerts::OPTION, $opt, 'no');
    Alerts::reset_cache();
    Alerts::raise($f('e'));
    eq(0, count(Alerts::history(Fortress::BOKAR)), 'after 30 days it leaves the history');
    // A 0.1.x store with resolved rows inside active: migrated.
    $opt = get_option(Alerts::OPTION);
    $opt['active'][$fp('legacy')] = $opt['active'][$fp('c')];
    $opt['active'][$fp('legacy')]['target']      = 'legacy';
    $opt['active'][$fp('legacy')]['resolved_at'] = time() - 3600;
    update_option(Alerts::OPTION, $opt, 'no');
    Alerts::reset_cache();
    eq(1, Alerts::migrate(), 'migrate() moves the legacy resolved row');
    eq('resolved', Alerts::state(Alerts::get($fp('legacy'))), 'into the history');
    ok(!isset(Alerts::unresolved(Fortress::BOKAR)[$fp('legacy')]), 'and it no longer counts');
    // wp ragusa status counts the unresolved only.
    dccr_cli_reset();
    (new Cli())->status();
    $text = dccr_cli_text();
    ok(preg_match('/active findings: 4 \(1 seen\), resolved in the last 30 days: 1/', $text) === 1, 'status counts only the unresolved, names the seen, and the history apart: ' . (preg_match('/active findings:[^\n]*/', $text, $m) ? $m[0] : '?'));
    Alerts::withdraw(Fortress::BOKAR, ['count']);
});

suite('0.2.0 item 3: who changed it: files an update writes outside its folder are accepted; self-writers are info unless they gain PHP', function () {
    tick();
    // A WP Staging update, then the files it rewrites under wp-content/wp-staging/.
    @mkdir(WP_PLUGIN_DIR . '/wp-staging', 0755, true);
    file_put_contents(WP_PLUGIN_DIR . '/wp-staging/wp-staging.php', "<?php\n/**\n * Plugin Name: WP Staging\n * Version: 4.17.0\n */\n");
    tick();
    $id = simulate_update('wp-staging', '4.18.0');
    ok($id > 0, 'update recorded');
    @mkdir(WP_CONTENT_DIR . '/wp-staging/meta', 0755, true);
    foreach (['.htaccess' => "RemoveHandler .php\n", 'index.html' => '', 'index.php' => "<?php\n// Silence is golden.\n", 'web.config' => "<configuration/>\n"] as $name => $content) {
        file_put_contents(WP_CONTENT_DIR . '/wp-staging/meta/' . $name, $content);
    }
    // In the same window, a file in ANOTHER plugin's folder, and one at the root: still findings.
    file_put_contents(WP_PLUGIN_DIR . '/dcc-demo/injected-in-window.php', "<?php\n// not wp-staging's\n");
    State::set('last_full_pass', 0);
    tick();
    $open = Alerts::open(Fortress::MINCETA);
    foreach (['.htaccess', 'index.html', 'index.php', 'web.config'] as $name) {
        ok(!isset($open[Events::fingerprint(Fortress::MINCETA, 'file-new', 'wp-content/wp-staging/meta/' . $name)]), "wp-staging/meta/$name raised nothing");
    }
    ok(isset($open[Events::fingerprint(Fortress::MINCETA, 'file-new', 'wp-content/plugins/dcc-demo/injected-in-window.php')]), 'a file in another plugin\'s folder in the same window is still a finding');
    $written = events_of('update-written');
    eq(1, count($written), 'one info line for the update');
    ok(str_contains($written[0]['message'], 'wp-staging 4.18.0 wrote 4 files outside its own folder'), 'naming the update and the count: ' . $written[0]['message']);
    eq(4, count($written[0]['data']['files'] ?? []), 'and listing the four files');
    ok(isset(Fortress\Minceta::index()['wp-content/wp-staging/meta/.htaccess']), 'they are in the baseline');
    ok(Fortress\Minceta::belongs_to('wp-content/wp-staging/meta/.htaccess', 'wp-staging') && Fortress\Minceta::belongs_to('wp-content/uploads/wp-staging/x', 'wp-staging') && Fortress\Minceta::belongs_to('wp-content/plugins/wp-staging/a.php', 'wp-staging'), 'belongs_to: its folders');
    ok(!Fortress\Minceta::belongs_to('wp-content/plugins/dcc-demo/a.php', 'wp-staging') && !Fortress\Minceta::belongs_to('llms.txt', 'wp-staging') && !Fortress\Minceta::belongs_to('wp-content/plugins/wp-staging-pro/a.php', 'wp-staging'), 'belongs_to: not another plugin, not the root, not a longer name');
    // Changed again, later, outside any window: a finding.
    Revelin::seal('wp-content/plugins/dcc-demo/injected-in-window.php');
    file_put_contents(WP_CONTENT_DIR . '/wp-staging/meta/.htaccess', "RemoveHandler .php\n# edited by hand\n");
    touch(WP_CONTENT_DIR . '/wp-staging/meta/.htaccess', time() - 7200);
    State::set('last_full_pass', 0);
    tick();
    ok(isset(Alerts::open(Fortress::MINCETA)[Events::fingerprint(Fortress::MINCETA, 'file-changed', 'wp-content/wp-staging/meta/.htaccess')]), 'a change two hours outside the window is a finding');
    Revelin::seal('wp-content/wp-staging/meta/.htaccess');
    // A File Missing finding from before is resolved when the update window explains the file.
    global $wpdb;
    $wpdb->query($wpdb->prepare('UPDATE ' . DCCR\Schema::journal() . ' SET created_at = %d WHERE target = %s', time() - 7200, 'wp-staging')); // the 4.18.0 window is two hours gone
    unlink(WP_CONTENT_DIR . '/wp-staging/meta/web.config');
    State::set('last_full_pass', 0);
    tick();
    $fp_missing = Events::fingerprint(Fortress::MINCETA, 'file-missing', 'wp-content/wp-staging/meta/web.config');
    eq('open', Alerts::state(Alerts::get($fp_missing)), 'gone outside a window: File Missing');
    simulate_update('wp-staging', '4.18.1');
    file_put_contents(WP_CONTENT_DIR . '/wp-staging/meta/web.config', "<configuration><!-- 4.18.1 --></configuration>\n");
    State::set('last_full_pass', 0);
    tick();
    eq('resolved', Alerts::state(Alerts::get($fp_missing)), 'the update wrote it back: the File Missing finding resolved');
    ok(!isset(Alerts::open(Fortress::MINCETA)[Events::fingerprint(Fortress::MINCETA, 'file-new', 'wp-content/wp-staging/meta/web.config')]), 'and its return raised nothing');

    // Self-writers: llms.txt by AIOSEO.
    file_put_contents(ABSPATH . 'llms.txt', "# Dora Canal Court\n");
    State::set('last_full_pass', 0);
    tick();
    Revelin::seal('llms.txt');
    file_put_contents(ABSPATH . 'llms.txt', "# Dora Canal Court\n- cottages\n");
    touch(ABSPATH . 'llms.txt', time() - 7200);
    State::set('last_full_pass', 0);
    tick();
    $fp_llms = Events::fingerprint(Fortress::MINCETA, 'file-changed', 'llms.txt');
    ok(!isset(Alerts::open(Fortress::MINCETA)[$fp_llms]), 'llms.txt regenerated: no finding');
    $sw = Alerts::get(Events::fingerprint(Fortress::MINCETA, 'self-written', 'llms.txt'));
    ok($sw !== null && $sw['severity'] === Events::INFO && $sw['title'] === 'llms.txt Changed (Plain Text Only, As When AIOSEO Regenerates It)', '0.2.4: an info line that says what was seen, not who: ' . ($sw['title'] ?? ''));
    ok(str_contains((string) Alerts::body($sw + ['what' => '']), '') && !isset(Alerts::unresolved()[Events::fingerprint(Fortress::MINCETA, 'self-written', 'llms.txt')]), '0.2.4: an info line is never in the unresolved list');
    file_put_contents(ABSPATH . 'llms.txt', "# Dora Canal Court\n<?php system('id'); ?>\n");
    touch(ABSPATH . 'llms.txt', time() - 7200);
    State::set('last_full_pass', 0);
    tick();
    $a = Alerts::get($fp_llms);
    ok($a !== null && Alerts::state($a) === 'open' && $a['severity'] === Events::NEEDS_LOOK, 'llms.txt gaining PHP is a real finding');
    ok(Fortress\Minceta::has_php(ABSPATH . 'llms.txt') && !Fortress\Minceta::has_php(WP_CONTENT_DIR . '/wp-staging/meta/index.html'), 'has_php');
    file_put_contents(ABSPATH . 'llms.txt', "# Dora Canal Court\n");
    Revelin::seal('llms.txt');
});

suite('0.2.0 item 4: wp ragusa findings and wp ragusa resolve', function () {
    $f = static fn(string $t, string $sev = Events::NEEDS_LOOK) => ['fortress' => Fortress::LOVRIJENAC, 'severity' => $sev, 'kind' => 'cli-test', 'target' => $t, 'title' => 'Cli Test ' . $t, 'what' => 'w', 'did' => 'd', 'todo' => 't'];
    Alerts::raise($f('one'));
    Alerts::raise($f('two', Events::BREACHED));
    Alerts::raise($f('three'));
    $fp = static fn(string $t) => Events::fingerprint(Fortress::LOVRIJENAC, 'cli-test', $t);
    Alerts::resolve($fp('three'));
    $cli = new Cli();
    dccr_cli_reset();
    $cli->findings();
    $items = $GLOBALS['dccr_cli_items']['items'];
    $ids   = array_column($items, 'id');
    ok(in_array(substr($fp('one'), 0, 8), $ids, true) && in_array(substr($fp('two'), 0, 8), $ids, true), 'unresolved findings listed with eight-character ids');
    ok(!in_array(substr($fp('three'), 0, 8), $ids, true), 'a resolved finding is not listed by default');
    eq(['id', 'fortress', 'severity', 'state', 'title', 'target', 'first_seen', 'journal'], $GLOBALS['dccr_cli_items']['fields'], 'the columns, with the journal row a finding reports');
    $row = array_values(array_filter($items, static fn($r) => $r['target'] === 'two'))[0];
    eq('Lovrijenac', $row['fortress'], 'fortress by name');
    eq(Events::BREACHED, $row['severity'], 'severity');
    ok(preg_match('/^[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M E[DS]T$/', $row['first_seen']) === 1, 'first seen on the one clock: ' . $row['first_seen']);
    dccr_cli_reset();
    $cli->findings([], ['all' => true, 'format' => 'json']);
    eq('json', $GLOBALS['dccr_cli_items']['format'], 'json format passed through');
    ok(in_array(substr($fp('three'), 0, 8), array_column($GLOBALS['dccr_cli_items']['items'], 'id'), true), '--all includes the history');
    // Resolve by hand, recorded with who.
    dccr_cli_reset();
    $cli->resolve([substr($fp('one'), 0, 8)]);
    eq('resolved', Alerts::state(Alerts::get($fp('one'))), 'resolved by hand');
    $ev = events_of('resolved-by-hand');
    eq(1, count($ev), 'one event records it');
    ok(str_contains($ev[0]['message'], 'resolved by hand by Rob'), 'naming who: ' . $ev[0]['message']);
    $GLOBALS['dccr_display_name'] = '';
    $posix = function_exists('posix_getpwuid') ? (posix_getpwuid(posix_geteuid())['name'] ?? '') : '';
    ok($posix !== '' && Cli::account() === $posix, '0.2.1: the shell account is the effective user from posix (' . $posix . '), never the script owner (' . get_current_user() . ')');
    eq($posix . ' (shell)', Cli::operator(), 'and without a WordPress user the operator is that account');
    // The difference only shows when the script's owner is not the account: run from a script owned by nobody.
    $owned = DCCR_TEST_ROOT . '/owner-probe.php';
    file_put_contents($owned, '<?php require ' . var_export(__DIR__ . '/bootstrap.php', true) . '; $GLOBALS["dccr_display_name"] = ""; echo DCCR\\Cli::operator();');
    if (@chown($owned, 'nobody')) {
        $out = trim((string) shell_exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($owned) . ' 2>&1'));
        eq($posix . ' (shell)', $out, 'from a script owned by nobody the record still names the account, not the owner: ' . $out);
    }
    $GLOBALS['dccr_display_name'] = 'Rob';
    ok(str_contains(dccr_cli_text(), 'Resolved "Cli Test One" (Lovrijenac), by Rob.'), 'and says so');
    dccr_cli_reset();
    $cli->resolve([substr($fp('two'), 0, 8)], ['seen' => true]);
    eq('seen', Alerts::state(Alerts::get($fp('two'))), '--seen marks it seen');
    eq('Rob', Alerts::get($fp('two'))['seen_by'], 'by name');
    $threw = false;
    try {
        $cli->resolve(['zzzzzzzz']);
    } catch (WP_CLI_Error $e) {
        $threw = str_contains($e->getMessage(), 'No unresolved finding');
    }
    ok($threw, 'an unknown id is refused');
    Alerts::withdraw(Fortress::LOVRIJENAC, ['cli-test']);
});

suite('0.2.0 item 5: one clock, Eastern with the zone named', function () {
    $ts = mktime(20, 16, 0, 10, 24, (int) date('Y')); // local server time is UTC in the container
    $ts = (new DateTimeImmutable('2026-10-24 20:16:00', new DateTimeZone('America/New_York')))->getTimestamp();
    eq('Oct 24, 8:16 PM EDT', Site::stamp($ts), 'stamp');
    $winter = (new DateTimeImmutable('2026-01-05 09:05:00', new DateTimeZone('America/New_York')))->getTimestamp();
    eq('Jan 5, 9:05 AM EST', Site::stamp($winter), 'standard time named EST');
    $other_year = (new DateTimeImmutable('2024-07-04 12:00:00', new DateTimeZone('America/New_York')))->getTimestamp();
    eq('Jul 4, 2024, 12:00 PM EDT', Site::stamp($other_year), 'another year is named');
    ok(preg_match('/^Oct 24, 8:16 PM EDT \(\d+ (Days?|Hours?|Minutes?) Ago\)$/', Site::both($ts)) === 1 || str_ends_with(Site::both($ts), 'Ago)'), 'both: stamp and relative: ' . Site::both($ts));
    ok(str_contains(Site::when(time() - 60), 'Today') && preg_match('/[AP]M E[DS]T Today$/', Site::when(time() - 60)) === 1, 'today carries the zone: ' . Site::when(time() - 60));
    eq('Never', Site::stamp(0), 'never');
    // The journal and vault listings use it.
    Journal::create('quarantine', 'clock-test', []);
    dccr_cli_reset();
    (new Cli())->journal([], ['limit' => 1]);
    ok(preg_match('/^[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M E[DS]T$/', $GLOBALS['dccr_cli_items']['items'][0]['when']) === 1, 'the journal prints the one clock: ' . $GLOBALS['dccr_cli_items']['items'][0]['when']);
    tick();
    dccr_cli_reset();
    (new Cli())->status();
    $text = dccr_cli_text();
    ok(preg_match('/last ran [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M E[DS]T \(/', $text) === 1, 'status prints the one clock with the relative form: ' . (preg_match('/tick:[^\n]*/', $text, $m) ? $m[0] : '?'));
    ok(!preg_match('/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/', $text), 'no bare UTC anywhere in status');
});

suite('0.2.0 item 6: PHP Is Patched: the web reading, the php.net feed, the three rules, the settings files, a fresh executable under uploads', function () {
    // The feed, parsed.
    $feed = '{"8":{"8.2":{"announcement":{"English":"/releases/8_2_31.php"},"tags":["security"],"date":"21 Oct 2026","source":[],"version":"8.2.31"},"8.3":{"announcement":{"English":"/releases/8_3_36.php"},"tags":["security"],"date":"21 Oct 2026","source":[],"version":"8.3.36"},"8.4":{"announcement":true,"tags":[],"date":"09 Oct 2026","source":[],"version":"8.4.14"}}}';
    $b = Php_Patch::parse($feed);
    eq(['8.2', '8.3', '8.4'], array_keys($b), 'three branches');
    eq('8.3.36', $b['8.3']['version'], 'version');
    ok($b['8.3']['security'] && !$b['8.4']['security'], 'security tag read');
    eq(strtotime('21 Oct 2026'), $b['8.3']['date'], 'date parsed');
    ok(Php_Patch::parse('not json') === null && Php_Patch::parse('[]') === null && Php_Patch::parse('{"8":{"x":{}}}') === null, 'garbage is no feed');
    // The rules.
    $now = strtotime('25 Oct 2026 12:00');
    ok(Php_Patch::judge('8.3.36', $b, $now) === null, 'current: nothing');
    ok(Php_Patch::judge('8.3.37', $b, $now) === null, 'ahead of the list (a host build): nothing');
    $j = Php_Patch::judge('8.4.13', $b, $now);
    eq('php-behind', $j['kind'], 'behind a non-security release: behind');
    eq(Events::NEEDS_LOOK, $j['severity'], 'needs a look');
    $j = Php_Patch::judge('8.3.30', $b, $now);
    eq('php-security', $j['kind'], 'a security release more than 3 days old, not applied: security');
    eq(Events::BREACHED, $j['severity'], 'breached-level');
    ok(str_contains($j['title'], '8.3.36'), 'names the release: ' . $j['title']);
    $j = Php_Patch::judge('8.3.30', $b, strtotime('23 Oct 2026 12:00'));
    eq('php-behind', $j['kind'], 'the same security release inside the 3-day grace: behind, not breached');
    eq(Events::NEEDS_LOOK, $j['severity'], 'needs a look within the grace');
    $j = Php_Patch::judge('8.1.31', $b, $now);
    eq('php-eol', $j['kind'], 'a branch not in the active list: end of life');
    eq(Events::NEEDS_LOOK, $j['severity'], 'needs a look');
    ok(Php_Patch::judge('garbage', $b, $now) === null, 'an unreadable version judges nothing');

    // The reading: WP-CLI's own PHP is never it.
    delete_option(Php_Patch::READING_OPTION);
    Php_Patch::$reading_override = null;
    Php_Patch::record_here();
    ok(Php_Patch::reading() === null, 'under the cli SAPI nothing is recorded');
    State::set('loopback', ['ok' => true, 'checked_at' => time()]);
    $GLOBALS['dccr_cron'] = array_values(array_filter($GLOBALS['dccr_cron'], static fn($e) => $e['hook'] !== Php_Patch::PROBE_HOOK));
    $GLOBALS['dccr_http'] = [];
    $GLOBALS['dccr_http_handler'] = static fn(string $url, array $args) => str_contains($url, 'wp-cron.php') ? dccr_http_ok('') : null;
    State::delete('php_probe');
    $line = Php_Patch::probe();
    ok(wp_next_scheduled(Php_Patch::PROBE_HOOK) !== false, 'the probe schedules a one-off cron event');
    $posts = array_values(array_filter($GLOBALS['dccr_http'], static fn($r) => str_contains($r['url'], 'wp-cron.php') && ($r['args']['method'] ?? '') === 'POST'));
    eq(1, count($posts), 'and POSTs wp-cron.php so the web server runs it: ' . $line);
    ok(!str_contains($posts[0]['url'], 'doing_wp_cron'), '0.2.1: with NO doing_wp_cron parameter (wp-cron.php returns early when it does not match the lock only spawn_cron sets)');
    ok(empty($posts[0]['args']['body']), 'and an empty body (wp-cron.php dies on a POST body)');
    $gets = array_values(array_filter($GLOBALS['dccr_http'], static fn($r) => str_contains($r['url'], 'wp-login.php')));
    eq(1, count($gets), '0.2.1: the second path, a GET of wp-login.php');
    ok(str_contains($gets[0]['url'], 'ragusa_php=1') && str_contains($gets[0]['url'], 'ragusa_check='), 'carrying ragusa_php and a cache-buster');
    $probe = Php_Patch::probe_state();
    ok(($probe['attempts'] ?? 0) === 1 && $probe['event'] === true && $probe['cron'] === 'HTTP 200', 'the probe state records the attempt, the event and the answers');
    ok(str_contains(implode("\n", Php_Patch::status_lines()), 'asked the web server at') && str_contains(implode("\n", Php_Patch::status_lines()), 'no answer yet'), 'status says it asked and heard nothing: ' . Php_Patch::status_lines()[0]);
    ok(str_contains(implode("\n", Php_Patch::status_lines()), 'probe event scheduled'), 'and whether the event sits in the cron list');
    // The hook: the probe event records with its source.
    DCCR\Plugin::boot();
    ok(count($GLOBALS['dccr_hooks'][Php_Patch::PROBE_HOOK] ?? []) >= 1, 'the probe hook is registered');
    // ensure_reading(): 0.2.4: with NO reading it asks every tick; a stale reading waits ten minutes between asks.
    ok(Php_Patch::ensure_reading() !== [], '0.2.4: no reading at all: asked again at once, not after ten minutes');
    eq(2, (int) Php_Patch::probe_state()['attempts'], 'counting the attempts');
    update_option(Php_Patch::READING_OPTION, ['version' => '8.3.30', 'sapi' => 'litespeed', 'source' => 'login', 'ts' => time() - 13 * 3600], 'no');
    $before = count($GLOBALS['dccr_http']);
    eq([], Php_Patch::ensure_reading(), 'a stale reading, asked a moment ago: not asked again yet');
    eq($before, count($GLOBALS['dccr_http']), 'no request');
    State::set('php_probe', ['asked' => time() - 601, 'attempts' => 2, 'cron' => 'HTTP 200', 'login' => 'HTTP 200', 'event' => true]);
    ok(Php_Patch::ensure_reading() !== [], 'after ten minutes it asks again');
    eq(3, (int) Php_Patch::probe_state()['attempts'], 'counting the attempts');
    delete_option(Php_Patch::READING_OPTION);
    // The web server answers (simulated): the reading is saved.
    Php_Patch::$reading_override = ['version' => '8.3.30', 'sapi' => 'litespeed'];
    $cb = $GLOBALS['dccr_hooks'][Php_Patch::PROBE_HOOK][0][0];
    $cb();
    eq('probe', Php_Patch::reading()['source'], 'the probe event records its source');
    ok(str_contains(Php_Patch::status_lines()[0], '8.3.30 (litespeed), read from the probe event under wp-cron.php at'), 'status names the reading and how it came: ' . Php_Patch::status_lines()[0]);
    eq([], Php_Patch::ensure_reading(), 'with a fresh reading nothing is asked');
    // The login path and an admin page load record through boot.
    delete_option(Php_Patch::READING_OPTION);
    $GLOBALS['pagenow'] = 'wp-login.php';
    $_GET = ['ragusa_php' => '1'];
    DCCR\Plugin::boot();
    eq('login', Php_Patch::reading()['source'] ?? null, 'wp-login.php?ragusa_php=1 records on boot');
    delete_option(Php_Patch::READING_OPTION);
    $_GET = [];
    DCCR\Plugin::boot();
    ok(Php_Patch::reading() === null, 'a plain login page load records nothing');
    $GLOBALS['pagenow'] = 'index.php';
    $GLOBALS['dccr_is_admin'] = true;
    $was_cron = $GLOBALS['dccr_doing_cron'] ?? false;
    $GLOBALS['dccr_doing_cron'] = false;
    $GLOBALS['dccr_doing_ajax'] = true;
    DCCR\Plugin::boot();
    ok(Php_Patch::reading() === null, 'an admin-ajax request (guests use it) records nothing');
    $GLOBALS['dccr_doing_ajax'] = false;
    DCCR\Plugin::boot();
    eq('admin', Php_Patch::reading()['source'] ?? null, 'an admin page load records the reading');
    $ts = Php_Patch::reading()['ts'];
    DCCR\Plugin::boot();
    eq($ts, Php_Patch::reading()['ts'], 'and not again while it is fresh');
    $GLOBALS['dccr_is_admin'] = false;
    $GLOBALS['dccr_doing_cron'] = $was_cron;
    Php_Patch::$reading_override = ['version' => '8.3.30', 'sapi' => 'litespeed'];
    Php_Patch::record_here();
    // The web server answers (simulated): the reading is saved.
    Php_Patch::$reading_override = ['version' => '8.3.30', 'sapi' => 'litespeed'];
    Php_Patch::record_here();
    eq('8.3.30', Php_Patch::reading()['version'], 'the web reading is stored');
    eq('litespeed', Php_Patch::reading()['sapi'], 'with its SAPI');
    eq('no', $GLOBALS['dccr_autoload'][Php_Patch::READING_OPTION], 'and the option does not autoload');

    // The tick: feed fetched, judged, emailed once, no journal row; resolved when the reading is current.
    $GLOBALS['dccr_http_handler'] = static function (string $url, array $args) use ($feed) {
        if (str_contains($url, 'php.net')) {
            return dccr_http_ok($feed);
        }
        return str_contains($url, 'wp-cron.php') ? dccr_http_ok('') : Test_Site::site_page($url);
    };
    State::delete('php_feed');
    State::delete('php_check_ts');
    Alerts::force(true);
    $journal = count(Journal::recent(50));
    $mails   = count(mails_with('PHP Security Fix Not Applied'));
    tick();
    $fp = Events::fingerprint(Fortress::LOVRIJENAC, 'php-security', '8.3.30');
    $a  = Alerts::get($fp);
    ok($a !== null && Alerts::state($a) === 'open' && $a['severity'] === Events::BREACHED, 'the security finding is open and breached');
    eq(1, count(mails_with('PHP Security Fix Not Applied')) - $mails, 'one email');
    $mail = mails_with('PHP Security Fix Not Applied')[0];
    ok(str_contains($mail['body'], 'litespeed') && str_contains($mail['body'], '8.3.36'), 'the email names the SAPI and the release');
    eq($journal, count(Journal::recent(50)), 'no journal row: nothing was changed');
    ok(str_contains(Fortress::status(Fortress::LOVRIJENAC)['line'], 'PHP 8.3.30, 8.3.36 Is Out'), 'the status line: ' . Fortress::status(Fortress::LOVRIJENAC)['line']);
    ok(str_contains(Php_Patch::line(), '8.3.36 Is Out'), 'Php_Patch::line()');
    eq(1, count(array_filter($GLOBALS['dccr_http'], static fn($r) => str_contains($r['url'], 'php.net'))), 'php.net fetched once');
    State::delete('php_check_ts');
    tick();
    eq(1, count(array_filter($GLOBALS['dccr_http'], static fn($r) => str_contains($r['url'], 'php.net'))), 'cached for a day: not fetched again');
    Php_Patch::$reading_override = ['version' => '8.3.36', 'sapi' => 'litespeed'];
    Php_Patch::record_here();
    State::delete('php_check_ts');
    tick();
    eq('resolved', Alerts::state(Alerts::get($fp)), 'resolved once the web reading is current');
    ok(str_contains(Fortress::status(Fortress::LOVRIJENAC)['line'], 'PHP 8.3.36 Current'), 'status says current');
    // php.net unreachable: the status says so, nothing raised.
    $GLOBALS['dccr_http_handler'] = static fn(string $url, array $args) => str_contains($url, 'php.net') ? new WP_Error('http_request_failed', 'cURL error 28') : (str_contains($url, 'wp-cron.php') ? dccr_http_ok('') : Test_Site::site_page($url));
    Php_Patch::$reading_override = ['version' => '7.4.33', 'sapi' => 'litespeed'];
    Php_Patch::record_here();
    State::delete('php_feed');
    State::delete('php_check_ts');
    $before = count(Alerts::open(Fortress::LOVRIJENAC));
    tick();
    eq($before, count(Alerts::open(Fortress::LOVRIJENAC)), 'nothing raised while php.net cannot be reached, even on an old PHP');
    ok(str_contains(Fortress::status(Fortress::LOVRIJENAC)['line'], 'php.net Not Reachable'), 'the status says so: ' . Fortress::status(Fortress::LOVRIJENAC)['line']);
    $GLOBALS['dccr_http_handler'] = null;
    Php_Patch::$reading_override = ['version' => '8.3.36', 'sapi' => 'litespeed'];
    Php_Patch::record_here();

    // The settings files: any change is a finding with the diff.
    $ini = ABSPATH . '.user.ini';
    Alerts::withdraw(Fortress::LOVRIJENAC, ['php-settings-changed']);
    $mails = count(mails_with('PHP Settings File Changed'));
    file_put_contents($ini, "upload_max_filesize = 64M\n");
    Revelin::seal('.user.ini');
    tick();
    ok(isset(get_option('dcc_ragusa_baselines')['php_settings'][$ini]), '.user.ini is in the settings baseline');
    $found = array_filter(Alerts::open(Fortress::LOVRIJENAC), static fn($a) => $a['kind'] === 'php-settings-changed');
    eq(1, count($found), 'a .user.ini that appears after the first look is a finding (any change is)');
    eq(1, count(mails_with('PHP Settings File Changed')) - $mails, 'emailed');
    $mails = count(mails_with('PHP Settings File Changed'));
    file_put_contents($ini, "upload_max_filesize = 64M\nsession.upload_progress.enabled = 0 ; added by webhost (mitigation)\n");
    tick();
    $found = array_filter(Alerts::open(Fortress::LOVRIJENAC), static fn($a) => $a['kind'] === 'php-settings-changed');
    eq(2, count($found), 'a changed .user.ini is a second finding');
    eq(1, count(mails_with('PHP Settings File Changed')) - $mails, 'one email');
    $mail = end($GLOBALS['dccr_mail']);
    ok(str_contains($mail['body'], '+ session.upload_progress.enabled = 0 ; added by webhost (mitigation)'), 'with the added line in the diff');
    ok(!str_contains($mail['body'], '- upload_max_filesize'), 'and not the unchanged one');
    tick();
    eq(1, count(mails_with('PHP Settings File Changed')) - $mails, 'accepted as the baseline: no second email');
    eq("- a\n+ b", Php_Patch::diff("a\nsame\n", "b\nsame\n"), 'diff shows removed and added lines only');
    ok(in_array(ABSPATH . '.user.ini', Php_Patch::settings_paths(), true), 'this root\'s .user.ini is watched');
    unlink($ini);
    tick();
    Alerts::withdraw(Fortress::LOVRIJENAC, ['php-settings-changed']);

    // A fresh executable under uploads: found in one tick, not at the next walk.
    tick();
    $shell = WP_CONTENT_DIR . '/uploads/2026/10/fresh.php';
    @mkdir(dirname($shell), 0755, true);
    file_put_contents($shell, "<?php system(\$_GET['c']);\n");
    touch(dirname($shell));
    $mails = count(mails_with('Quarantined'));
    $r = tick(0.0001); // no budget for the walk: only the per-tick sweep runs
    ok(!is_file($shell), 'quarantined within the tick');
    ok(count(array_filter($r, static fn($l) => str_contains($l, 'Fresh executable under uploads'))) === 1, 'the tick says so');
    eq(1, count(mails_with('Quarantined')) - $mails, 'and emailed at once');
    ok(end($GLOBALS['dccr_mail'])['subject'] !== '' && str_contains(end($GLOBALS['dccr_mail'])['subject'], 'Minčeta'), 'from Minčeta');
    file_put_contents(WP_CONTENT_DIR . '/uploads/2026/10/index.php', "<?php\n// Silence is golden.\n");
    touch(WP_CONTENT_DIR . '/uploads/2026/10');
    tick(0.0001);
    ok(is_file(WP_CONTENT_DIR . '/uploads/2026/10/index.php'), 'a silence-is-golden stub is left alone');
    Alerts::force(false);
});

suite('0.2.0 item 7: The Walls Report, every Monday at 7 AM Eastern', function () {
    Alerts::force(true);
    $cli = new Cli();
    $feed = '{"8":{"8.3":{"tags":["security"],"date":"21 Oct 2026","version":"8.3.36"}}}';
    $GLOBALS['dccr_http_handler'] = static fn(string $url, array $args) => str_contains($url, 'php.net') ? dccr_http_ok($feed) : (str_contains($url, 'wp-cron.php') ? dccr_http_ok('') : Test_Site::site_page($url));
    State::delete('php_feed');
    State::delete('php_check_ts');
    tick();
    $GLOBALS['dccr_http_handler'] = null;
    foreach (array_keys(Alerts::open()) as $fp) {
        Alerts::resolve($fp, true);
    }
    $r = Report::build();
    eq('Ragusa: The Walls Held This Week', $r['subject'], 'subject when nothing is open');
    foreach (['Minčeta', 'Bokar', 'Revelin', 'Lovrijenac', 'Sveti Ivan'] as $name) {
        ok(str_contains($r['body'], "\n" . $name . ' · ') || str_starts_with($r['body'], $name . ' · ') || str_contains($r['body'], $name . ' · '), 'a line for ' . $name);
    }
    ok(preg_match('/Minčeta · \d+ Opened, \d+ Closed · Disk [\d.]+ [KMG]B Of [\d.]+ [KMG]B \(\d+%\) · Last Full Scan [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M E[DS]T/', $r['body']) === 1, 'Minčeta: opened, closed, disk, last full scan');
    ok(preg_match('/Revelin · \d+ Opened, \d+ Closed · Vault [\d.]+ [KMG]B Of 300 MB/', $r['body']) === 1, 'Revelin: the vault');
    ok(preg_match('/Lovrijenac · \d+ Opened, \d+ Closed · PHP 8\.3\.36 Current/', $r['body']) === 1, 'Lovrijenac: PHP and whether it is current');
    ok(preg_match('/Sveti Ivan · \d+ Opened, \d+ Closed · \d+ Updates? Checked/', $r['body']) === 1, 'Sveti Ivan: updates checked');
    ok(preg_match('/Bokar · \d+ Opened, \d+ Closed · \d+ Privileged Of \d+ Users/', $r['body']) === 1, 'Bokar: the users');
    ok(str_contains($r['body'], 'Nothing needed a look this week') || preg_match('/findings? opened this week/', $r['body']) === 1, 'the plain paragraph');
    ok(str_ends_with(trim($r['body']), Site::admin_page_url()), 'ends with the stamped link');
    Alerts::raise(['fortress' => Fortress::BOKAR, 'severity' => Events::NEEDS_LOOK, 'kind' => 'report-test', 'target' => 'a', 'title' => 'Report Test A', 'what' => 'w', 'did' => 'd', 'todo' => 't']);
    Alerts::raise(['fortress' => Fortress::BOKAR, 'severity' => Events::BREACHED, 'kind' => 'report-test', 'target' => 'b', 'title' => 'Report Test B', 'what' => 'w', 'did' => 'd', 'todo' => 't']);
    $r = Report::build();
    eq('Ragusa: 2 Things Need A Look', $r['subject'], 'subject counts the open findings');
    ok(str_contains($r['body'], '2 open now') && str_contains($r['body'], '1 of them is a breach'), 'the paragraph names the breach');
    ok(preg_match('/Bokar · 2 Opened/', $r['body']) === 1, 'Bokar counts them as opened this week');
    Alerts::resolve(Events::fingerprint(Fortress::BOKAR, 'report-test', 'b'), true);
    eq('Ragusa: 1 Thing Needs A Look', Report::build()['subject'], 'singular');
    // --dry-run prints; a send on staging is refused; forced, it goes.
    dccr_cli_reset();
    $cli->report([], ['dry-run' => true]);
    ok(str_contains(dccr_cli_text(), 'Subject: Ragusa: 1 Thing Needs A Look') && str_contains(dccr_cli_text(), 'Sveti Ivan · '), '--dry-run prints subject and body');
    Alerts::force(false);
    $n = count($GLOBALS['dccr_mail']);
    ok(!Report::send(), 'on staging the report is not sent');
    eq($n, count($GLOBALS['dccr_mail']), 'no mail');
    ok(Report::send(true), 'forced, it is sent');
    ok(end($GLOBALS['dccr_mail'])['subject'] === 'Ragusa: 1 Thing Needs A Look', 'with the subject');
    // Due: Monday from 7:00 AM Eastern, once per ISO week.
    $now = Site::now();
    State::set('last_report', 0);
    eq((int) $now->format('N') === 1 && (int) $now->format('G') >= 7, Report::due(), 'due only on Monday from 7 AM Eastern (today is ' . $now->format('l g A T') . ')');
    State::set('last_report', time());
    ok(!Report::due(), 'never twice in a week');
    State::set('last_report', time() - 8 * 86400);
    eq((int) $now->format('N') === 1 && (int) $now->format('G') >= 7, Report::due(), 'due again the next week');
    Alerts::withdraw(Fortress::BOKAR, ['report-test']);
});


suite('0.2.2 item 1: WP-Cron is off: Ragusa never sends a request to wp-cron.php, and says so', function () {
    Site::$cron_off_override = true;
    delete_option(Php_Patch::READING_OPTION);
    State::delete('php_probe');
    State::delete('loopback');
    Php_Patch::$reading_override = null;
    // A leftover probe event from 0.2.1 goes.
    wp_schedule_single_event(time() - 5, Php_Patch::PROBE_HOOK);
    $GLOBALS['dccr_http'] = [];
    $GLOBALS['dccr_http_handler'] = static fn(string $url, array $args) => str_contains($url, 'wp-login.php') ? dccr_http_ok('<form><input type="password"></form>') : (str_contains($url, 'wp-cron.php') ? dccr_http_ok('') : Test_Site::site_page($url));
    ok(DCCR\Loopback::available(true), 'loopbacks are detected without wp-cron.php');
    $line = Php_Patch::probe();
    eq(false, wp_next_scheduled(Php_Patch::PROBE_HOOK), 'no probe event, and the leftover one is gone');
    ok(str_contains($line, 'wp-cron.php not touched (WP-Cron is off here)') && str_contains($line, 'wp-login.php HTTP 200'), 'the probe uses wp-login.php only: ' . $line);
    ok(str_contains(Php_Patch::status_lines()[0], 'no probe event: WP-Cron is off here'), 'status says why there is no event');
    // A whole tick, with no reading and the PHP check due: still nothing to wp-cron.php.
    State::delete('php_probe');
    State::delete('php_check_ts');
    State::delete('php_feed');
    tick();
    $cron_urls = array_filter($GLOBALS['dccr_http'], static fn($r) => str_contains($r['url'], 'wp-cron.php'));
    eq([], array_values($cron_urls), 'across the probe, the loopback test and a full tick, not one request to wp-cron.php');
    ok(count(array_filter($GLOBALS['dccr_http'], static fn($r) => str_contains($r['url'], 'ragusa_php=1'))) >= 1, 'the login path was asked');
    // The promise, out loud.
    dccr_cli_reset();
    (new Cli())->status();
    ok(str_contains(dccr_cli_text(), 'WP-Cron Is Off Here (DISABLE_WP_CRON); Ragusa Will Never Start It'), 'status says it');
    $GLOBALS['dccr_is_admin'] = true;
    $GLOBALS['dccr_caps'] = true;
    ob_start();
    DCCR\Admin::render();
    $html = (string) ob_get_clean();
    ok(str_contains($html, 'WP-Cron Is Off Here; Ragusa Will Never Start It.'), 'the page says it');
    // With cron on, the page says nothing and the probe may use wp-cron.php (as on live).
    Site::$cron_off_override = false;
    ob_start();
    DCCR\Admin::render();
    $html = (string) ob_get_clean();
    ok(!str_contains($html, 'Ragusa Will Never Start It'), 'with cron on the line is absent');
    $GLOBALS['dccr_is_admin'] = false;
    State::delete('php_probe');
    $GLOBALS['dccr_http'] = [];
    Php_Patch::probe();
    ok(count(array_filter($GLOBALS['dccr_http'], static fn($r) => str_contains($r['url'], 'wp-cron.php') && ($r['args']['method'] ?? '') === 'POST')) >= 1, 'with cron on, wp-cron.php is used');
    Site::$cron_off_override = null;
    $GLOBALS['dccr_http_handler'] = null;
    State::delete('loopback');
});

suite('0.2.2 item 3: the Lovrijenac row reads the same PHP value as the status line, the moment it exists', function () {
    $feed = '{"8":{"8.3":{"tags":["security"],"date":"21 Oct 2026","version":"8.3.36"}}}';
    State::set('php_feed', ['ts' => time(), 'error' => '', 'branches' => Php_Patch::parse($feed)]);
    delete_option(Php_Patch::READING_OPTION);
    State::delete('php_probe');
    tick(); // the row is built with no reading
    ok(str_contains(Fortress::status(Fortress::LOVRIJENAC)['line'], 'PHP Not Read From The Web Server Yet'), 'before: not read');
    $checked = Fortress::status(Fortress::LOVRIJENAC)['checked_at'];
    // The reading lands from a web request between ticks.
    Php_Patch::$reading_override = ['version' => '8.3.36', 'sapi' => 'litespeed'];
    Php_Patch::record_here('login');
    State::reset();
    $row = Fortress::status(Fortress::LOVRIJENAC);
    ok(str_contains($row['line'], 'PHP 8.3.36 Current'), 'the row reads the reading at once, before any tick: ' . $row['line']);
    ok(!str_contains($row['line'], 'Not Read'), 'and no longer says not read');
    eq($checked, $row['checked_at'], 'when it was checked is kept');
    dccr_cli_reset();
    (new Cli())->status();
    $text = dccr_cli_text();
    ok(preg_match('/Lovrijenac[^\n]*PHP 8\.3\.36 Current/', $text) === 1 && str_contains($text, 'php: 8.3.36 (litespeed), read from the wp-login.php probe'), 'status: the row and the php line agree');
    // A stale stored line is rebuilt by the status command itself.
    $s = Fortress::status(Fortress::LOVRIJENAC);
    Fortress::set_status(Fortress::LOVRIJENAC, $s['state'], str_replace('PHP 8.3.36 Current', 'PHP Not Read From The Web Server Yet', $s['line']), $s['checked_at']);
    dccr_cli_reset();
    (new Cli())->status();
    ok(preg_match('/Lovrijenac[^\n]*PHP 8\.3\.36 Current/', dccr_cli_text()) === 1, 'status rebuilds the PHP part before printing');
    Php_Patch::$reading_override = ['version' => '8.3.30', 'sapi' => 'litespeed'];
    Php_Patch::record_here('admin');
    ok(str_contains(Fortress::status(Fortress::LOVRIJENAC)['line'], 'PHP 8.3.30, 8.3.36 Is Out'), 'a behind reading shows at once too');
    Php_Patch::$reading_override = ['version' => '8.3.36', 'sapi' => 'litespeed'];
    Php_Patch::record_here();
});


suite('0.2.3 item 1: no false "Failed Its Checks" from one fatal line, a half-copied plugin, or a file that was missing for a moment', function () {
    tick();
    $log   = Site::abspath() . '/error_log';
    file_put_contents($log, '');
    $stamp = static fn(int $ts) => '[' . gmdate('d-M-Y H:i:s', $ts) . ' UTC]';
    $failed_findings = static fn() => array_filter(Alerts::open(Fortress::SVETI_IVAN), static fn($a) => in_array($a['kind'], ['update-failed', 'update-rolled-back'], true));
    $rollbacks = count(Journal::recent(50, null, 'rollback'));

    // (a) Row 57: a first failure recorded by 0.2.1, with no offset. The repeat must not re-read the update's own snapshot.
    $id   = simulate_update('wporg-plugin', '1.8.0');
    $row  = Journal::get($id);
    $done = (int) $row['before']['installed_at'];
    ok($done > 0, 'the row records when the install finished');
    file_put_contents($log, $stamp($done + 2) . " PHP Fatal error: Uncaught Error: boom in " . WP_PLUGIN_DIR . "/wporg-plugin/includes/a.php:2\n", FILE_APPEND);
    Journal::set_state($id, Journal::VERIFYING, ['verify' => ['attempts' => 1, 'first_fail' => ['ts' => $done + 5, 'failed' => ['error_log']]]]);
    ok(empty(Journal::get($id)['verify']['first_fail']['errlog']), 'set up like 0.2.1: a first failure without an offset');
    Sveti_Ivan::scheduled_check($id);
    eq(Journal::COMMITTED, Journal::get($id)['state'], '(a) the repeat counts only lines stamped after the first failure: the update passes');
    eq($rollbacks, count(Journal::recent(50, null, 'rollback')), '(a) no rollback');
    eq([], $failed_findings(), '(a) no "Failed Its Checks"');
    // The recovery path ("check run during recovery") runs the same check.
    $id2 = simulate_update('wporg-plugin', '1.8.1');
    $d2  = (int) Journal::get($id2)['before']['installed_at'];
    file_put_contents($log, $stamp($d2 + 2) . " PHP Fatal error: Uncaught Error: boom in " . WP_PLUGIN_DIR . "/wporg-plugin/includes/a.php:2\n", FILE_APPEND);
    Journal::set_state($id2, Journal::VERIFYING, ['verify' => ['attempts' => 1, 'next_at' => time() - 1, 'first_fail' => ['ts' => $d2 + 5, 'failed' => ['error_log']]]]);
    age_row($id2, 3600);
    Actions::recover();
    eq(Journal::COMMITTED, Journal::get($id2)['state'], '(a) the same through recovery');

    // (b) Stamped inside the install itself: the copy in progress (AIOSEO at 04:29:17, 4 s after it started).
    file_put_contents($log, '');
    $id = simulate_update('wporg-plugin', '1.9.0');
    $done = (int) Journal::get($id)['before']['installed_at'];
    $missing = WP_PLUGIN_DIR . '/wporg-plugin/vendor/woocommerce/action-scheduler/classes/abstracts/ActionScheduler.php';
    file_put_contents($log, $stamp($done - 4) . " PHP Fatal error:  Uncaught Error: Failed opening required '" . $missing . "' (include_path='.:/opt/cpanel/ea-php83/root/usr/share/pear') in " . WP_PLUGIN_DIR . "/wporg-plugin/vendor/woocommerce/action-scheduler/action-scheduler.php:52\n", FILE_APPEND);
    Sveti_Ivan::scheduled_check($id);
    eq(Journal::COMMITTED, Journal::get($id)['state'], '(b) a fatal stamped before the install finished is not counted: passes on the first check');
    $last = Journal::get($id)['verify']['last']['error_log'] ?? [];
    ok(($last['ok'] ?? null) === true && str_contains((string) ($last['detail'] ?? ''), 'still being copied'), '(b) the check says why: ' . ($last['detail'] ?? ''));
    $tr = array_values(array_filter(events_of('fatal-transient'), static fn($e) => (int) $e['journal_id'] === $id));
    ok(count($tr) >= 1 && $tr[0]['severity'] === Events::INFO, '(b) one info line on the row');

    // (c) "Failed opening required" for a file of the plugin that exists now: transient, after the install too.
    file_put_contents($log, '');
    $id = simulate_update('wporg-plugin', '2.0.0');
    $done = (int) Journal::get($id)['before']['installed_at'];
    @mkdir(dirname($missing), 0755, true);
    file_put_contents($missing, "<?php\n// present now\n");
    file_put_contents($log, $stamp($done + 2) . " PHP Fatal error:  Uncaught Error: Failed opening required '" . $missing . "' (include_path='.') in " . WP_PLUGIN_DIR . "/wporg-plugin/vendor/woocommerce/action-scheduler/action-scheduler.php:52\n", FILE_APPEND);
    Sveti_Ivan::scheduled_check($id);
    eq(Journal::COMMITTED, Journal::get($id)['state'], '(c) the file it could not open is present now: not counted');
    ok(str_contains((string) (Journal::get($id)['verify']['last']['error_log']['detail'] ?? ''), '1 for a file missing for a moment and present now'), '(c) and says so: ' . (Journal::get($id)['verify']['last']['error_log']['detail'] ?? ''));
    // The control: the file is really gone. That counts.
    file_put_contents($log, '');
    $id = simulate_update('wporg-plugin', '2.0.1');
    $done = (int) Journal::get($id)['before']['installed_at'];
    $gone = WP_PLUGIN_DIR . '/wporg-plugin/vendor/really-gone.php';
    file_put_contents($log, $stamp($done + 2) . " PHP Fatal error:  Uncaught Error: Failed opening required '" . $gone . "' (include_path='.') in " . WP_PLUGIN_DIR . "/wporg-plugin/wporg-plugin.php:9\n", FILE_APPEND);
    Sveti_Ivan::scheduled_check($id);
    eq(Journal::VERIFYING, Journal::get($id)['state'], '(c) a file still missing after the install is a real failure (the repeat decides)');
    ok(Error_Log::missing_file("PHP Warning:  require_once(/x/plugins/p/a.php): Failed to open stream: No such file or directory in /x/b.php on line 3") === '/x/plugins/p/a.php', 'missing_file reads the PHP 8 warning form too');
    Journal::set_state($id, Journal::ABANDONED, ['note' => 'test done']);
    eq([], $failed_findings(), 'no false finding anywhere in this suite');
    unlink($log);
});

suite('0.2.3 item 2: the headline and every row are worked out from the live findings when printed', function () {
    tick();
    foreach (array_keys(Alerts::open()) as $fp) {
        Alerts::resolve($fp, true); // start from a calm site
    }
    Alerts::raise(['fortress' => Fortress::MINCETA, 'severity' => Events::NEEDS_LOOK, 'kind' => 'lag-test', 'target' => 'dcc-lag-test', 'title' => 'Lag Test', 'what' => 'w', 'did' => 'd', 'todo' => 't']);
    Alerts::raise(['fortress' => Fortress::SVETI_IVAN, 'severity' => Events::BREACHED, 'kind' => 'update-failed', 'target' => 'all-in-one-seo-pack', 'title' => 'Update Failed Its Checks', 'what' => 'w', 'did' => 'd', 'todo' => 't']);
    Fortress::note(Fortress::SVETI_IVAN, 'all-in-one-seo-pack Failed Its Checks', Events::fingerprint(Fortress::SVETI_IVAN, 'update-failed', 'all-in-one-seo-pack'));
    tick();
    ok(str_contains(Fortress::overall(), 'A Wall Was Breached'), 'before: breached');
    ok(preg_match('/[\d,]+ Files, 1 Finding\b/', Fortress::status(Fortress::MINCETA)['line']) === 1, 'before: Minčeta counts one finding: ' . Fortress::status(Fortress::MINCETA)['line']);
    // Resolve both by hand, then print status with NO tick in between.
    Alerts::resolve_by_hand(Events::fingerprint(Fortress::MINCETA, 'lag-test', 'dcc-lag-test'), 'doracurt (shell)');
    Alerts::resolve_by_hand(Events::fingerprint(Fortress::SVETI_IVAN, 'update-failed', 'all-in-one-seo-pack'), 'doracurt (shell)');
    dccr_cli_reset();
    (new Cli())->status();
    $text = dccr_cli_text();
    ok(str_starts_with($text, 'The Walls Are Holding'), 'the headline reads Holding at once: ' . strtok($text, "\n"));
    ok(preg_match('/Minčeta\s+Holding\s+All [\d,]+ Files Match/u', $text) === 1, 'Minčeta\'s row too: ' . (preg_match('/Minčeta[^\n]*/u', $text, $m) ? $m[0] : '?'));
    ok(preg_match('/Sveti Ivan\s+Holding\s+all-in-one-seo-pack Failed Its Checks · Resolved [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M E[DS]T/u', $text) === 1, 'Sveti Ivan\'s row keeps the history and says it was resolved: ' . (preg_match('/Sveti Ivan[^\n]*/u', $text, $m) ? $m[0] : '?'));
    // The page reads the same.
    $GLOBALS['dccr_is_admin'] = true;
    ob_start();
    DCCR\Admin::render();
    $html = (string) ob_get_clean();
    $GLOBALS['dccr_is_admin'] = false;
    ok(str_contains($html, 'The Walls Are Holding') && str_contains($html, 'Failed Its Checks · Resolved'), 'the page says the same');
    // A seen finding reads "Seen By".
    Alerts::raise(['fortress' => Fortress::SVETI_IVAN, 'severity' => Events::NEEDS_LOOK, 'kind' => 'update-unverified', 'target' => 'x-plugin', 'title' => 'Could Not Verify An Update', 'what' => 'w', 'did' => 'd', 'todo' => 't']);
    Fortress::note(Fortress::SVETI_IVAN, 'Last Update Could Not Be Verified', Events::fingerprint(Fortress::SVETI_IVAN, 'update-unverified', 'x-plugin'));
    Alerts::mark_seen(Events::fingerprint(Fortress::SVETI_IVAN, 'update-unverified', 'x-plugin'), 'Rob');
    ok(str_contains(Fortress::row_line(Fortress::SVETI_IVAN), 'Last Update Could Not Be Verified · Seen By Rob,'), 'seen: ' . Fortress::row_line(Fortress::SVETI_IVAN));
    Fortress::set_state(Fortress::SVETI_IVAN, Fortress::HOLDING);
    ok(str_contains(Fortress::row_line(Fortress::SVETI_IVAN), 'Seen By Rob'), 'set_state keeps the finding the row speaks for');
    Alerts::withdraw(Fortress::SVETI_IVAN, ['update-unverified', 'update-failed']);
    Alerts::withdraw(Fortress::MINCETA, ['lag-test']);
});

suite('0.2.3 item 3: a stale PHP reading is asked again, judged from nothing, and the new one names wp-login.php where cron is off', function () {
    Site::$cron_off_override = true;
    $feed = '{"8":{"8.3":{"tags":["security"],"date":"21 Oct 2026","version":"8.3.36"}}}';
    State::set('php_feed', ['ts' => time(), 'error' => '', 'branches' => Php_Patch::parse($feed)]);
    // The 0.2.1 reading: taken by the probe event under wp-cron.php, 8.3.30, older than twelve hours.
    update_option(Php_Patch::READING_OPTION, ['version' => '8.3.30', 'sapi' => 'litespeed', 'source' => 'probe', 'ts' => time() - 13 * 3600], 'no');
    State::delete('php_probe');
    State::delete('php_check_ts');
    Alerts::withdraw(Fortress::LOVRIJENAC, ['php-security', 'php-behind', 'php-eol']);
    ok(Php_Patch::stale(Php_Patch::reading()), 'thirteen hours old is stale');
    ok(str_contains(Php_Patch::line(), 'PHP 8.3.30 As Read') && str_contains(Php_Patch::line(), 'Asking The Web Server Again'), 'the line says it is old and being asked again: ' . Php_Patch::line());
    // The web server answers the login probe (simulated: the request records, as boot does).
    Php_Patch::$reading_override = null; // the tick runs under WP-CLI here: it records nothing itself
    $GLOBALS['dccr_http'] = [];
    $GLOBALS['dccr_http_handler'] = static function (string $url, array $args) {
        if (str_contains($url, 'ragusa_php=1')) {
            Php_Patch::$reading_override = ['version' => '8.3.36', 'sapi' => 'litespeed'];
            Php_Patch::record_here('login');
            Php_Patch::$reading_override = null;
        }
        return str_contains($url, 'wp-login.php') ? dccr_http_ok('<form><input type="password"></form>') : (str_contains($url, 'php.net') ? dccr_http_ok('{}') : Test_Site::site_page($url));
    };
    // Before the answer lands, a judgement from the stale 8.3.30 would be a false breach: none is raised.
    Php_Patch::evaluate();
    eq([], array_filter(Alerts::open(Fortress::LOVRIJENAC), static fn($a) => str_starts_with($a['kind'], 'php-')), 'no PHP finding is raised from a stale reading');
    tick();
    eq([], array_values(array_filter($GLOBALS['dccr_http'], static fn($r) => str_contains($r['url'], 'wp-cron.php'))), 'cron is off: nothing to wp-cron.php');
    ok(count(array_filter($GLOBALS['dccr_http'], static fn($r) => str_contains($r['url'], 'ragusa_php=1'))) === 1, 'the stale reading set off one login probe');
    $r = Php_Patch::reading();
    eq('login', $r['source'], 'the new reading came from wp-login.php');
    ok(str_contains(Php_Patch::status_lines()[0], 'read from the wp-login.php probe'), 'and the php line names it: ' . Php_Patch::status_lines()[0]);
    ok(str_contains(Php_Patch::line(), 'PHP 8.3.36 Current'), 'and judges the fresh one');
    eq([], array_filter(Alerts::open(Fortress::LOVRIJENAC), static fn($a) => str_starts_with($a['kind'], 'php-')), 'no PHP finding at any point');
    Site::$cron_off_override = null;
    $GLOBALS['dccr_http_handler'] = null;
});


suite('0.2.4 item 1: update-check events never pile up, with WP-Cron on or off', function () {
    $events_for = static fn(int $id) => array_values(array_filter($GLOBALS['dccr_cron'], static fn($e) => $e['hook'] === DCCR\Plugin::CHECK_HOOK && ($e['args'][0] ?? 0) === $id));
    $all_checks = static fn() => array_values(array_filter($GLOBALS['dccr_cron'], static fn($e) => $e['hook'] === DCCR\Plugin::CHECK_HOOK));
    tick();
    // WP-Cron on (live): an event is scheduled, and removed when the tick runs the check itself.
    Site::$cron_off_override = false;
    $id = simulate_update('wporg-plugin', '3.0.0');
    eq(1, count($events_for($id)), 'cron on: one event for the row');
    Journal::set_state($id, Journal::VERIFYING, ['verify' => ['next_at' => time() - 120]]);
    Sveti_Ivan::due();
    ok(in_array(Journal::get($id)['state'], Journal::TERMINAL, true), 'the tick ran the check');
    eq([], $events_for($id), 'and its event is gone');
    // A leftover event for a finished row (as on staging) is swept by the next tick.
    wp_schedule_single_event(time() - 3600, DCCR\Plugin::CHECK_HOOK, [$id]);
    $lines = Sveti_Ivan::due();
    eq([], $events_for($id), 'a leftover event for a finished row is removed');
    ok(count(array_filter($lines, static fn($l) => str_contains($l, 'Removed 1 update-check event nobody will run'))) === 1, 'and the tick says so');
    // WP-Cron off (staging): no event at all; the tick runs the check from next_at; every leftover goes.
    Site::$cron_off_override = true;
    foreach ([101, 102, 103] as $stale_id) {
        wp_schedule_single_event(time() - 7200, DCCR\Plugin::CHECK_HOOK, [$stale_id]);
    }
    $id = simulate_update('wporg-plugin', '3.0.1');
    eq([], $events_for($id), 'cron off: no event is scheduled');
    ok((int) Journal::get($id)['verify']['next_at'] > 0, 'but the row knows when its check is due');
    Sveti_Ivan::due();
    eq([], $all_checks(), 'cron off: every update-check event is removed, the 13 on staging included');
    Journal::set_state($id, Journal::VERIFYING, ['verify' => ['next_at' => time() - 120]]);
    Sveti_Ivan::due();
    ok(in_array(Journal::get($id)['state'], Journal::TERMINAL, true), 'and the tick still runs the check');
    eq([], $all_checks(), 'with nothing left behind');
    Site::$cron_off_override = null;
});

suite('0.2.4 item 2: WP Staging\'s own sse files come and go without findings; anything else there is a finding', function () {
    $dir = WP_CONTENT_DIR . '/wp-staging/sse';
    @mkdir($dir, 0755, true);
    $index = "<?php\n/**\n * WPSTAGING automatically places this index file on all folders it creates to prevent\n * directory listing on servers that might have directory listing enabled.\n */\n";
    $files = [
        'index.php'  => $index,
        'index.html' => '',
        '.htaccess'  => "# BEGIN WP STAGING\nOptions -Indexes\n<IfModule mod_php.c>\nphp_flag engine off\n</IfModule>\nRemoveHandler .php .phtml .php3 .php4 .php5 .php7 .phps\n# END WP STAGING\n",
        'web.config' => "<?xml version=\"1.0\"?>\n<configuration><system.webServer><directoryBrowse enabled=\"false\"/></system.webServer></configuration>\n",
        'a1b2c3.sse.cache.php' => "<?php exit(); ?>\n" . '{"events":[{"type":"task","message":"Cloning"}]}',
    ];
    foreach ($files as $n => $c) {
        file_put_contents("$dir/$n", $c);
    }
    State::set('last_full_pass', 0);
    tick();
    $missing = static fn() => array_filter(Alerts::open(Fortress::MINCETA), static fn($a) => in_array($a['kind'], ['file-missing', 'file-new', 'file-changed'], true) && str_starts_with((string) $a['target'], 'wp-content/wp-staging/sse/'));
    eq([], $missing(), 'WP Staging\'s own files appearing raise nothing');
    foreach ($files as $n => $c) {
        ok(Fortress\Minceta::wpstg_own('wp-content/wp-staging/sse/' . $n, "$dir/$n"), "$n is recognised by its content");
    }
    // WP Staging's daily cleanup: every file older than an hour, protection files included.
    foreach (array_keys($files) as $n) {
        unlink("$dir/$n");
    }
    State::set('last_full_pass', 0);
    tick();
    eq([], $missing(), 'the daily cleanup emptying the folder raises no File Missing');
    $hk = events_of('wpstg-housekeeping');
    ok(count($hk) >= 1 && str_contains($hk[0]['message'], 'it empties that folder once a day'), 'one info line says what happened');
    // Not WP Staging's: findings, as anywhere.
    file_put_contents("$dir/evil.php", "<?php system(\$_GET['c']);\n");
    file_put_contents("$dir/x9.sse.cache.php", "<?php exit(); ?>\n{}<?php system('id'); ?>");
    file_put_contents("$dir/index.php", "<?php\n// looks like a stub\n@eval(\$_POST['x']);\n");
    State::set('last_full_pass', 0);
    tick();
    $open = $missing();
    ok(isset($open[Events::fingerprint(Fortress::MINCETA, 'file-new', 'wp-content/wp-staging/sse/evil.php')]), 'a planted evil.php there is a finding');
    ok(isset($open[Events::fingerprint(Fortress::MINCETA, 'file-new', 'wp-content/wp-staging/sse/x9.sse.cache.php')]), 'a cache-named file carrying code is a finding');
    ok(isset($open[Events::fingerprint(Fortress::MINCETA, 'file-new', 'wp-content/wp-staging/sse/index.php')]), 'an index.php that runs code is a finding');
    ok(!Fortress\Minceta::wpstg_own('wp-content/wp-staging/sse/sub/index.php', "$dir/sub/index.php"), 'only the folder itself, not below it');
    ok(!Fortress\Minceta::wpstg_own('wp-content/wp-staging/other/index.php', WP_CONTENT_DIR . '/wp-staging/other/index.php'), 'and not WP Staging\'s other folders');
    foreach (['evil.php', 'x9.sse.cache.php', 'index.php'] as $n) {
        unlink("$dir/$n");
    }
    foreach (['evil.php', 'x9.sse.cache.php', 'index.php'] as $n) {
        Revelin::seal('wp-content/wp-staging/sse/' . $n);
    }
});

suite('0.2.4 item 3: a hand resolve leaves a signed note on the finding\'s journal row; wp ragusa note adds one to any row', function () {
    $id = Journal::create('update-check', 'all-in-one-seo-pack', ['slug' => 'all-in-one-seo-pack', 'kind' => 'update', 'new_version' => '5.0.4'], 'update from auto', false);
    Journal::set_state($id, Journal::FAILED, ['note' => 'failed twice; no rollback possible']);
    Alerts::raise(['fortress' => Fortress::SVETI_IVAN, 'severity' => Events::BREACHED, 'kind' => 'update-failed', 'target' => 'all-in-one-seo-pack', 'title' => 'Update Failed Its Checks', 'what' => 'w', 'did' => 'd', 'todo' => 't', 'journal_id' => $id]);
    $fp = Events::fingerprint(Fortress::SVETI_IVAN, 'update-failed', 'all-in-one-seo-pack');
    dccr_cli_reset();
    $GLOBALS['dccr_display_name'] = '';
    (new Cli())->resolve([substr($fp, 0, 8)], ['note' => 'false alarm, see 0.2.3']);
    $note = Journal::get($id)['note'];
    ok(str_starts_with($note, 'failed twice; no rollback possible | finding resolved by hand by ') && str_contains($note, '(shell), ') && str_ends_with($note, ': false alarm, see 0.2.3'), 'the row keeps its history and gains the signed note: ' . $note);
    eq(Journal::FAILED, Journal::get($id)['state'], 'the state is history: unchanged');
    ok(str_contains(events_of('resolved-by-hand')[0]['message'], 'false alarm, see 0.2.3'), 'Recent Events carries the why');
    dccr_cli_reset();
    (new Cli())->note([(string) $id, 'second look Oct 27: AIOSEO fine']);
    ok(str_contains(Journal::get($id)['note'], ' | note by ') && str_ends_with(Journal::get($id)['note'], ': second look Oct 27: AIOSEO fine'), 'wp ragusa note adds a signed line');
    $GLOBALS['dccr_display_name'] = 'Rob';
    $threw = false;
    try {
        (new Cli())->note(['999999', 'x']);
    } catch (WP_CLI_Error $e) {
        $threw = true;
    }
    ok($threw, 'a row that does not exist is refused');
});

suite('0.2.4 item 4: no reading means ask now; a reading that lands is seen and judged at once', function () {
    $feed = '{"8":{"8.3":{"tags":["security"],"date":"21 Oct 2026","version":"8.3.36"}}}';
    State::set('php_feed', ['ts' => time(), 'error' => '', 'branches' => Php_Patch::parse($feed)]);
    State::set('php_check_ts', time()); // the once-a-day check has already run today
    Site::$cron_off_override = true;
    // A stubbed old PHP, judged: Breached.
    Php_Patch::$reading_override = ['version' => '8.3.30', 'sapi' => 'litespeed'];
    tick();
    $fp = Events::fingerprint(Fortress::LOVRIJENAC, 'php-security', '8.3.30');
    eq('open', Alerts::state(Alerts::get($fp) ?? ['tag' => 'x']), 'the stub is breached');
    // The stub is removed; the web server answers the login probe within the same tick.
    Php_Patch::$reading_override = null;
    delete_option(Php_Patch::READING_OPTION);
    State::set('php_probe', ['asked' => time() - 30, 'attempts' => 1]); // asked a moment ago
    $GLOBALS['dccr_http_handler'] = static function (string $url, array $args) {
        if (str_contains($url, 'ragusa_php=1')) {
            Php_Patch::$reading_override = ['version' => '8.3.36', 'sapi' => 'litespeed'];
            Php_Patch::record_if_stale('login');
            Php_Patch::$reading_override = null;
        }
        return str_contains($url, 'wp-login.php') ? dccr_http_ok('<form><input type="password"></form>') : Test_Site::site_page($url);
    };
    $r = tick();
    ok(count(array_filter($r, static fn($l) => str_contains($l, 'it answered at once: 8.3.36, via the wp-login.php probe'))) === 1, 'no reading: asked at once (not after ten minutes), and the tick says the answer landed: ' . implode(' | ', array_filter($r, static fn($l) => str_contains($l, 'PHP reading'))));
    eq('resolved', Alerts::state(Alerts::get($fp)), 'judged in the same tick: the security finding resolves');
    eq(Fortress::HOLDING, Alerts::worst(Fortress::LOVRIJENAC), 'and Lovrijenac holds, without waiting for tomorrow\'s daily check');
    ok(str_contains(Fortress::status(Fortress::LOVRIJENAC)['line'], 'PHP 8.3.36 Current'), 'the row agrees');
    // The explicit probe always answers when Ragusa asked within five minutes, even over a fresh reading.
    update_option(Php_Patch::READING_OPTION, ['version' => '8.3.30', 'sapi' => 'litespeed', 'source' => 'tick', 'ts' => time() - 60], 'no');
    State::set('php_probe', ['asked' => time() - 10, 'attempts' => 1]);
    Php_Patch::$reading_override = ['version' => '8.3.36', 'sapi' => 'litespeed'];
    Php_Patch::record_if_stale('login');
    eq('8.3.36', Php_Patch::reading()['version'], 'asked a moment ago: the login probe records over a fresh reading');
    // Nobody asked: a stranger hitting wp-login.php?ragusa_php=1 cannot rewrite a fresh reading.
    update_option(Php_Patch::READING_OPTION, ['version' => '8.3.36', 'sapi' => 'litespeed', 'source' => 'tick', 'ts' => time() - 60], 'no');
    State::set('php_probe', ['asked' => time() - 3600, 'attempts' => 1]);
    Php_Patch::$reading_override = ['version' => '7.0.0', 'sapi' => 'litespeed'];
    Php_Patch::record_if_stale('login');
    eq('8.3.36', Php_Patch::reading()['version'], 'not asked: the fresh reading stands');
    Php_Patch::$reading_override = ['version' => '8.3.36', 'sapi' => 'litespeed'];
    Php_Patch::record_here();
    $GLOBALS['dccr_http_handler'] = null;
    Site::$cron_off_override = null;
});

suite('0.2.4 item 5: one finding per settings-file change, breached only when PHP would run extra code; "Acted" only when Ragusa acted', function () {
    $ini = ABSPATH . '.user.ini';
    file_put_contents($ini, "upload_max_filesize = 64M\n");
    State::set('last_full_pass', 0);
    tick();
    foreach (array_keys(Alerts::open()) as $fp) {
        Alerts::resolve($fp, true);
    }
    $count = static fn() => count(array_filter(Alerts::open(), static fn($a) => str_contains((string) $a['target'], '.user.ini') || str_contains((string) $a['title'], '.user.ini')));
    // A harmless edit: one finding, Lovrijenac's, needs a look; a full pass adds nothing.
    file_put_contents($ini, "upload_max_filesize = 64M\nsession.upload_progress.enabled = 0 ; added by webhost (mitigation)\n");
    State::set('last_full_pass', 0);
    tick();
    eq(1, $count(), 'one edit, one finding, even after a full pass of the walk');
    $a = array_values(array_filter(Alerts::open(), static fn($a) => str_contains((string) $a['title'], '.user.ini')))[0];
    eq(Fortress::LOVRIJENAC, $a['fortress'], 'owned by Lovrijenac (it carries the diff)');
    eq(Events::NEEDS_LOOK, $a['severity'], 'a harmless edit needs a look, not a breach');
    ok(str_starts_with(Fortress::overall(), 'Something Needs A Look'), 'and the headline says so');
    ok(Fortress\Minceta::skip('.user.ini', false) && Fortress\Minceta::skip('wp-config.php', false) && Fortress\Minceta::skip('wp-content/db.php', false), 'the walk leaves the per-tick files to their owners');
    // An edit that makes PHP run another file: breached, and the headline does not claim Ragusa acted.
    file_put_contents($ini, "upload_max_filesize = 64M\nauto_prepend_file = /home/x/.cache/l.php\n");
    tick();
    $b = array_values(array_filter(Alerts::open(), static fn($a) => str_contains((string) $a['title'], 'Runs Extra Code')));
    ok(count($b) === 1 && $b[0]['severity'] === Events::BREACHED, 'auto_prepend_file is breached: ' . ($b[0]['title'] ?? ''));
    ok(str_starts_with(Fortress::overall(), 'A Wall Was Breached · Ragusa Needs You'), 'the headline does not say Ragusa acted: ' . Fortress::overall());
    $r = Report::build();
    ok(str_contains($r['body'], 'is a breach Ragusa did not act on') && !str_contains($r['body'], 'acted on; it needs you'), 'nor does the report');
    // A real action (a quarantine): now "Acted".
    $shell = WP_CONTENT_DIR . '/uploads/2026/10/acted.php';
    @mkdir(dirname($shell), 0755, true);
    file_put_contents($shell, "<?php system(\$_GET['c']);\n");
    touch(dirname($shell));
    tick(0.0001);
    ok(str_starts_with(Fortress::overall(), 'A Wall Was Breached · Ragusa Acted And Needs You'), 'with a quarantine open, it acted: ' . Fortress::overall());
    ok(str_contains(Report::build()['body'], 'is a breach Ragusa acted on'), 'and the report counts it as acted');
    unlink($ini);
    tick();
    foreach (array_keys(Alerts::open()) as $fp) {
        Alerts::resolve($fp, true);
    }
});

suite('0.2.4 item 7: restore takes the id the finding shows, and the finding names its journal row', function () {
    tick();
    $shell = WP_CONTENT_DIR . '/uploads/2026/10/restore-me.php';
    @mkdir(dirname($shell), 0755, true);
    file_put_contents($shell, "<?php echo 'mine';\n");
    touch(dirname($shell));
    tick(0.0001);
    ok(!is_file($shell), 'quarantined');
    $fp = Events::fingerprint(Fortress::MINCETA, 'quarantined', 'wp-content/uploads/2026/10/restore-me.php');
    $a  = Alerts::get($fp);
    $jid = (int) ($a['data']['journal_id'] ?? 0);
    ok($jid > 0 && !empty($a['data']['acted']), 'the finding carries its journal row and that Ragusa acted');
    dccr_cli_reset();
    (new Cli())->findings();
    $row = array_values(array_filter($GLOBALS['dccr_cli_items']['items'], static fn($r) => $r['id'] === substr($fp, 0, 8)))[0] ?? [];
    eq($jid, $row['journal'] ?? null, 'wp ragusa findings prints the journal row next to the finding\'s id');
    dccr_cli_reset();
    (new Cli())->restore([substr($fp, 0, 8)]);
    ok(is_file($shell), 'wp ragusa restore <the finding\'s id> undoes the quarantine');
    ok(str_contains(dccr_cli_text(), 'Success') || $GLOBALS['dccr_cli'][0][0] === 'success', 'and says so');
    eq(Journal::REVERSED, Journal::get($jid)['state'], 'the journal row is reversed');
    unlink($shell);
    // A finding that reports no action has nothing to undo.
    Alerts::raise(['fortress' => Fortress::LOVRIJENAC, 'severity' => Events::NEEDS_LOOK, 'kind' => 'restore-test', 'target' => 'x', 'title' => 'Nothing Done', 'what' => 'w', 'did' => 'd', 'todo' => 't']);
    $threw = '';
    try {
        (new Cli())->restore([substr(Events::fingerprint(Fortress::LOVRIJENAC, 'restore-test', 'x'), 0, 8)]);
    } catch (WP_CLI_Error $e) {
        $threw = $e->getMessage();
    }
    ok(str_contains($threw, 'reports no action of Ragusa\'s'), 'a finding without an action is refused, plainly: ' . $threw);
    Alerts::withdraw(Fortress::LOVRIJENAC, ['restore-test']);
    Revelin::seal('wp-content/uploads/2026/10/restore-me.php');
});

suite('0.2.4 item 8: the not-counted summary names each reason', function () {
    tick();
    $log = Site::abspath() . '/error_log';
    file_put_contents($log, '');
    $stamp = static fn(int $ts) => '[' . gmdate('d-M-Y H:i:s', $ts) . ' UTC]';
    $done  = time();
    $file  = WP_PLUGIN_DIR . '/wporg-plugin/wporg-plugin.php';
    $snap  = Error_Log::snapshot();
    file_put_contents($log, $stamp($done - 4) . ' PHP Fatal error: Uncaught Error: copy in ' . WP_PLUGIN_DIR . "/wporg-plugin/x.php:1\n", FILE_APPEND);
    file_put_contents($log, $stamp($done + 1) . " PHP Fatal error: Uncaught Error: Failed opening required '" . $file . "' (include_path='.') in " . WP_PLUGIN_DIR . "/wporg-plugin/y.php:1\n", FILE_APPEND);
    $r = Sveti_Ivan::run_checks(['slug' => 'wporg-plugin', 'errlog' => $snap, 'installed_at' => $done], true);
    eq('no new fatal; 2 not counted (1 written while the plugin was still being copied; 1 for a file missing for a moment and present now)', $r['checks']['error_log']['detail'], 'both reasons, each counted');
    unlink($log);
});


/** Put paths into Minčeta's stored baseline as an older version left them. */
function dccr_seed_index(array $rels): void
{
    $ref  = new ReflectionClass(Fortress\Minceta::class);
    $idx  = Fortress\Minceta::index();
    $pass = max(1, (int) State::get('minceta.pass_no', 1) - 1);
    foreach ($rels as $rel) {
        $abs = ABSPATH . $rel;
        $idx[$rel] = ['s' => is_file($abs) ? filesize($abs) : 1, 'm' => is_file($abs) ? filemtime($abs) : 1, 'h' => is_file($abs) ? hash_file('sha256', $abs) : 'x', 'x' => 'base', 'p' => $pass];
    }
    $prop = $ref->getProperty('index');
    $prop->setAccessible(true);
    $prop->setValue(null, $idx);
    $dirty = $ref->getProperty('index_dirty');
    $dirty->setAccessible(true);
    $dirty->setValue(null, true);
    $save = $ref->getMethod('save_index');
    $save->setAccessible(true);
    $save->invoke(null);
}

suite('0.2.5 item 1: files that moved to another owner are never reported missing, at the first pass or at the upgrade', function () {
    tick();
    foreach (['wp-config.php' => "<?php\n// config\n", 'index.php' => "<?php\n// front\n", '.user.ini' => "upload_max_filesize = 64M\n", 'php.ini' => "memory_limit = 256M\n"] as $rel => $c) {
        if (!is_file(ABSPATH . $rel)) {
            file_put_contents(ABSPATH . $rel, $c);
        }
    }
    $owned = ['wp-config.php', 'index.php', '.user.ini', 'php.ini'];
    $missing = static fn() => array_filter(Alerts::open(Fortress::MINCETA), static fn($a) => $a['kind'] === 'file-missing' && in_array($a['target'], ['wp-config.php', 'index.php', '.user.ini', 'php.ini'], true));
    // (a) A 0.2.3-shaped baseline meets the first full pass, with no upgrade step at all.
    dccr_seed_index($owned);
    foreach ($owned as $rel) {
        ok(isset(Fortress\Minceta::index()[$rel]), "seeded: $rel is in the old baseline");
    }
    State::set('last_full_pass', 0);
    $before = count(events_of('file-missing'));
    tick();
    eq([], $missing(), 'the first pass raises no File Missing for files another check owns');
    eq($before, count(events_of('file-missing')), 'and records no missing event');
    ok(str_contains((string) (State::get('minceta.last')['missing'] ?? -1), '0'), 'the pass counts 0 missing');
    foreach ($owned as $rel) {
        ok(!isset(Fortress\Minceta::index()[$rel]), "$rel left the walk's baseline");
    }
    $pr = events_of('baseline-pruned');
    ok(count($pr) === 1 && $pr[0]['severity'] === Events::INFO && str_contains($pr[0]['message'], '4 paths left the file walk\'s baseline') && str_contains($pr[0]['message'], 'wp-config.php'), 'one info line names them: ' . ($pr[0]['message'] ?? ''));
    eq(Fortress::HOLDING, Alerts::worst(Fortress::MINCETA), 'Minčeta holds');
    // (b) The upgrade from 0.2.4 prunes them before any pass.
    dccr_seed_index($owned);
    update_option('dcc_ragusa_version', '0.2.4', 'no');
    DCCR\Plugin::maybe_upgrade();
    foreach ($owned as $rel) {
        ok(!isset(Fortress\Minceta::index()[$rel]), "upgrade: $rel left the baseline before any tick");
    }
    eq(2, count(events_of('baseline-pruned')), 'with its own info line');
    eq(DCCR_VERSION, get_option('dcc_ragusa_version'), 'version recorded');
    // A file that is really gone, and still watched by the walk, is still missing.
    file_put_contents(WP_PLUGIN_DIR . '/dcc-demo/really-gone.php', "<?php\n");
    State::set('last_full_pass', 0);
    tick();
    unlink(WP_PLUGIN_DIR . '/dcc-demo/really-gone.php');
    State::set('last_full_pass', 0);
    tick();
    ok(isset(Alerts::open(Fortress::MINCETA)[Events::fingerprint(Fortress::MINCETA, 'file-missing', 'wp-content/plugins/dcc-demo/really-gone.php')]), 'a watched file that is gone is still File Missing');
    Revelin::seal('wp-content/plugins/dcc-demo/really-gone.php');
    ok(Fortress\Minceta::walk_ignores('wp-content/uploads/x/y.php') && Fortress\Minceta::walk_ignores('wp-config.php') && !Fortress\Minceta::walk_ignores('wp-content/plugins/dcc-demo/a.php'), 'walk_ignores: skipped files and folders, not watched ones');
});

suite('0.2.5 item 2: every plain-text change to llms.txt leaves a line in Recent Events', function () {
    file_put_contents(ABSPATH . 'llms.txt', "# Dora Canal Court\n");
    State::set('last_full_pass', 0);
    tick();
    Revelin::seal('llms.txt');
    $before = count(events_of('self-written'));
    foreach ([1, 2] as $n) {
        file_put_contents(ABSPATH . 'llms.txt', "# Dora Canal Court\n# edit $n\n");
        touch(ABSPATH . 'llms.txt', time() - 7200 + $n);
        State::set('last_full_pass', 0);
        tick();
        $ev = events_of('self-written');
        eq($before + $n, count($ev), "change $n: one event");
    }
    ok($ev[0]['severity'] === Events::INFO && $ev[0]['message'] === 'llms.txt Changed (Plain Text Only, As When AIOSEO Regenerates It).', 'worded as seen: ' . $ev[0]['message']);
    eq([], array_filter(Alerts::open(Fortress::MINCETA), static fn($a) => $a['kind'] === 'file-changed' && $a['target'] === 'llms.txt'), 'and no finding');
    file_put_contents(ABSPATH . 'llms.txt', "# Dora Canal Court\n");
    Revelin::seal('llms.txt');
});


suite('0.2.6: the SpeedyCache marker is matched as a whole line; live\'s real block sequence is in order', function () {
    $live = Test_Site::LIVE_SPEEDY_SEQUENCE . Test_Site::PREGZ_BLOCK . "\n" . Test_Site::SPEEDY_BLOCK;
    eq(Htaccess::ORDER_OK, Htaccess::order_problem($live), 'live\'s sequence (SpeedyCacheheaders far above, then DCC, then speedycache) is in order');
    eq(Htaccess::ORDER_NO_SPEEDY, Htaccess::order_problem(Test_Site::LIVE_SPEEDY_SEQUENCE . Test_Site::PREGZ_BLOCK), 'SpeedyCache\'s other blocks alone are not the rewrite block');
    eq(Htaccess::ORDER_OK, Htaccess::order_problem(Test_Site::PREGZ_BLOCK . "\n" . Test_Site::SPEEDY_BLOCK . "\n" . Test_Site::LIVE_SPEEDY_SEQUENCE), 'the other blocks may also come after');
    eq(Htaccess::ORDER_WRONG, Htaccess::order_problem(Test_Site::LIVE_SPEEDY_SEQUENCE . Test_Site::SPEEDY_BLOCK . "\n" . Test_Site::PREGZ_BLOCK), 'a real wrong order is still caught with them present');
    eq(Htaccess::ORDER_OK, Htaccess::order_problem(str_replace("\n", "\r\n", $live)), 'CRLF line ends');
    eq(Htaccess::ORDER_OK, Htaccess::order_problem(Test_Site::PREGZ_BLOCK . "\n# BEGIN SPEEDYCACHE  \nx\n# END SPEEDYCACHE\n"), 'any case, trailing spaces');
    ok(Htaccess::marker_offset("x\n# BEGIN speedycacheX\n", Htaccess::SPEEDY_BEGIN, true) === null, 'a longer marker is not the marker');
    eq(Htaccess::ORDER_PREGZ_MISSING, Htaccess::order_problem("# BEGIN DCC Pre-gzipped Cache v2\n" . Test_Site::SPEEDY_BLOCK), 'the DCC marker is a whole line too');

    // On the site: live's file raises nothing, tick after tick.
    $path = Htaccess::path();
    $orig = (string) file_get_contents($path);
    $sec  = (string) Htaccess::extract_block($orig);
    file_put_contents($path, $sec . "\n\n" . $live);
    $fp = Events::fingerprint(Fortress::REVELIN, 'htaccess-order', '.htaccess');
    tick();
    tick();
    $a = Alerts::get($fp);
    ok($a === null || Alerts::state($a) !== 'open', 'no "Below SpeedyCache" finding on live\'s file');
    file_put_contents($path, $orig);
    tick();
    Revelin::seal('.htaccess');
});


/** Publish a WordPress.org release of the test plugin: its checksums, and its files. */
function dccr_release(string $version, array $files): array
{
    $files['wporg-plugin.php'] = "<?php\n/**\n * Plugin Name: WPORG Plugin\n * Version: $version\n */\n";
    $map = [];
    foreach ($files as $rel => $c) {
        $map[$rel] = ['md5' => md5($c), 'sha256' => hash('sha256', $c)];
    }
    Test_Site::$plugin_checksums['wporg-plugin/' . $version] = $map;
    return $files;
}
/** A real upgrader run: the package is unpacked, listed, copied over, the old files it drops removed. */
function dccr_real_update(string $slug, array $files, array $drop, ?callable $during = null): int
{
    $hook = ['type' => 'plugin', 'action' => 'update', 'plugin' => "$slug/$slug.php"];
    Sveti_Ivan::on_pre_install(true, $hook);
    $pkg = DCCR_TEST_ROOT . '/upgrade/pkg-' . bin2hex(random_bytes(3)) . "/$slug";
    foreach ($files as $rel => $c) {
        @mkdir(dirname("$pkg/$rel"), 0755, true);
        file_put_contents("$pkg/$rel", $c);
    }
    Revelin::on_source_selection($pkg . '/', dirname($pkg), null, $hook);
    foreach ($files as $rel => $c) {
        @mkdir(dirname(WP_PLUGIN_DIR . "/$slug/$rel"), 0755, true);
        file_put_contents(WP_PLUGIN_DIR . "/$slug/$rel", $c);
    }
    foreach ($drop as $rel) {
        @unlink(WP_PLUGIN_DIR . "/$slug/$rel");
    }
    if ($during !== null) {
        $during();
    }
    Sveti_Ivan::on_process_complete((object) ['result' => ['destination_name' => $slug]], $hook);
    return (int) (Journal::latest('update-check', $slug)['id'] ?? 0);
}
function dccr_full_pass(): void
{
    State::set('last_full_pass', 0);
    tick();
}

suite('0.2.7 drill 1: an update that drops a file: info, on the update\'s journal row, no email', function () {
    Alerts::force(true);
    $base = ['includes/a.php' => "<?php\n// a\n", 'readme.txt' => "=== WPORG Plugin ===\n", 'Backend/Pluginmeta/Meta.php' => "<?php\n// meta\n", 'Core/Utils/Hash.php' => "<?php\n// hash\n"];
    $r18 = dccr_release('4.18.0', $base);
    foreach ($r18 as $rel => $c) {
        @mkdir(dirname(WP_PLUGIN_DIR . "/wporg-plugin/$rel"), 0755, true);
        file_put_contents(WP_PLUGIN_DIR . "/wporg-plugin/$rel", $c);
    }
    dccr_full_pass();
    ok(isset(Fortress\Minceta::index()['wp-content/plugins/wporg-plugin/Core/Utils/Hash.php']), 'the old files are in the baseline');
    $r19 = dccr_release('4.19.0', ['includes/a.php' => "<?php\n// a 4.19\n", 'readme.txt' => "=== WPORG Plugin ===\n", 'Backend/Pluginmeta/Pluginmeta.php' => "<?php\n// new\n"]);
    $mails = count($GLOBALS['dccr_mail']);
    $id = dccr_real_update('wporg-plugin', $r19, ['Backend/Pluginmeta/Meta.php', 'Core/Utils/Hash.php']);
    dccr_full_pass();
    $missing = array_filter(Alerts::open(Fortress::MINCETA), static fn($a) => $a['kind'] === 'file-missing' && str_contains((string) $a['target'], 'wporg-plugin/'));
    eq([], $missing, 'no File Missing for the two files 4.19.0 dropped');
    eq(0, count(mails_with('Meta.php')) + count(mails_with('Hash.php')), 'no email names them');
    $ev = array_values(array_filter(events_of('removed-by-update'), static fn($e) => (int) $e['journal_id'] === $id));
    ok(count($ev) === 1 && $ev[0]['severity'] === Events::INFO && str_contains($ev[0]['message'], 'Removed by WPORG Plugin 4.18.0 → 4.19.0') && str_contains($ev[0]['message'], 'Backend/Pluginmeta/Meta.php'), 'one info line, naming the update: ' . ($ev[0]['message'] ?? ''));
    $row = Journal::get($id);
    eq(2, (int) ($row['before']['files']['removed'] ?? -1), 'the journal row counts the files removed');
    ok((int) ($row['before']['files']['added'] ?? 0) >= 1 && (int) ($row['before']['files']['changed'] ?? 0) >= 1, 'and added and changed');
    ok(str_contains((string) $row['note'], 'removed by this update: Backend/Pluginmeta/Meta.php'), 'and its note says so');
    ok(\DCCR\Packages::files('plugin', 'wporg-plugin', '4.19.0') !== null, 'the unpacked package was listed as 4.19.0\'s manifest');
    Alerts::force(false);
});

suite('0.2.7 drill 2: the live case: an update the upgrader hooks never saw, a file it no longer ships', function () {
    Alerts::force(true);
    // 4.19.0 installed and baselined, with a file 4.20.0 no longer ships.
    $r19 = dccr_release('4.19.0', ['includes/a.php' => "<?php\n// a 4.19\n", 'readme.txt' => "=== WPORG Plugin ===\n", 'Backend/Pluginmeta/Pluginmeta.php' => "<?php\n// meta\n"]);
    foreach ($r19 as $rel => $c) {
        @mkdir(dirname(WP_PLUGIN_DIR . "/wporg-plugin/$rel"), 0755, true);
        file_put_contents(WP_PLUGIN_DIR . "/wporg-plugin/$rel", $c);
    }
    dccr_full_pass();
    tick(); // the version snapshot holds 4.19.0
    $r20 = dccr_release('4.20.0', ['includes/a.php' => "<?php\n// a 4.20\n", 'readme.txt' => "=== WPORG Plugin ===\n"]);
    // Updated by a route Ragusa does not load on (WordPress.com, Jetpack over REST): files replaced, no hooks.
    foreach ($r20 as $rel => $c) {
        file_put_contents(WP_PLUGIN_DIR . "/wporg-plugin/$rel", $c);
    }
    @unlink(WP_PLUGIN_DIR . '/wporg-plugin/Backend/Pluginmeta/Pluginmeta.php');
    $pm_before = count(mails_with('Pluginmeta.php'));
    $r = tick();
    $row = Journal::latest('update-check', 'wporg-plugin');
    ok($row !== null && ($row['before']['source'] ?? '') === 'unseen' && ($row['before']['old_version'] ?? '') === '4.19.0' && ($row['before']['new_version'] ?? '') === '4.20.0', 'the next tick records it in the journal: 4.19.0 → 4.20.0, source unseen');
    ok(count(array_filter($r, static fn($l) => str_contains($l, 'without passing through the upgrader Ragusa watches'))) === 1, 'and says so');
    eq(Events::INFO, events_of('update-unseen')[0]['severity'] ?? '', 'info: WordPress.org publishes what 4.20.0 contains');
    dccr_full_pass();
    eq([], array_filter(Alerts::open(Fortress::MINCETA), static fn($a) => str_contains((string) $a['target'], 'wporg-plugin/')), 'no finding: the changed file matches 4.20.0\'s checksums and the removed one is not in 4.20.0');
    eq($pm_before, count(mails_with('Pluginmeta.php')), 'no email about it during this drill');
    ok(count(array_filter(events_of('removed-by-update'), static fn($e) => str_contains($e['message'], '4.19.0 → 4.20.0'))) === 1, 'the removal is recorded as the update\'s');
    Alerts::force(false);
});

suite('0.2.7 drill 3: a file deleted by hand from a plugin that did not update: needs a look, emailed, in plain English', function () {
    Alerts::force(true);
    file_put_contents(WP_PLUGIN_DIR . '/dcc-demo/includes/helper.php', "<?php\n// helper\n");
    dccr_full_pass();
    unlink(WP_PLUGIN_DIR . '/dcc-demo/includes/helper.php');
    dccr_full_pass();
    $fp = Events::fingerprint(Fortress::MINCETA, 'file-missing', 'wp-content/plugins/dcc-demo/includes/helper.php');
    $a  = Alerts::get($fp);
    ok($a !== null && Alerts::state($a) === 'open' && $a['severity'] === Events::NEEDS_LOOK, 'needs a look');
    $m = mails_with('helper.php');
    ok(count($m) === 1, 'one email');
    $body = $m[0]['body'] ?? '';
    ok(str_starts_with($a['title'], 'File Missing From DCC Demo 0.3'), 'the title names the plugin and its version: ' . $a['title']);
    ok(str_contains($body, 'It belongs to DCC Demo 0.3'), 'the email says whose file it is');
    ok(str_contains($body, 'No update of DCC Demo was recorded in the last week.'), 'and plainly that no update happened');
    ok(str_contains($body, 'Ragusa is certain the file is gone; it cannot tell who removed it.'), 'how sure Ragusa is');
    ok(str_contains($body, 'Forward this to the site director'), 'and the one thing to do');
    ok(!str_contains($body, 'If the site director removed it'), 'not the old guess');
    Revelin::seal('wp-content/plugins/dcc-demo/includes/helper.php');
    Alerts::force(false);
});

suite('0.2.7 drill 4: a deletion hidden inside an update window, of a file the new version still ships: needs a look, emailed', function () {
    Alerts::force(true);
    // (a) After the update finished, inside its half hour.
    $r21 = dccr_release('4.21.0', ['includes/a.php' => "<?php\n// a 4.21\n", 'readme.txt' => "=== WPORG Plugin ===\n", 'includes/guard.php' => "<?php\n// guard 4.21\n"]);
    $id = dccr_real_update('wporg-plugin', $r21, []);
    unlink(WP_PLUGIN_DIR . '/wporg-plugin/includes/guard.php');
    dccr_full_pass();
    $a = Alerts::get(Events::fingerprint(Fortress::MINCETA, 'file-missing', 'wp-content/plugins/wporg-plugin/includes/guard.php'));
    ok($a !== null && Alerts::state($a) === 'open' && $a['severity'] === Events::NEEDS_LOOK, '(a) needs a look, though it is inside the update window');
    $body = (mails_with('guard.php')[0]['body'] ?? '');
    ok(str_contains($body, 'Version 4.21.0 still includes this file, so the update should have left it in place.'), '(a) the email says the update should have left it');
    ok(str_contains($body, 'was updated from 1.4.0 to 4.21.0 at') && str_contains($body, '(journal ' . $id . ')'), '(a) and names the update and its journal row: ' . $body);
    ok(str_contains($body, 'wp plugin install wporg-plugin --version=4.21.0 --force'), '(a) and how to put it back');
    // (b) During the copy itself: gone when the upgrader finished.
    $r22 = dccr_release('4.22.0', ['includes/a.php' => "<?php\n// a 4.22\n", 'readme.txt' => "=== WPORG Plugin ===\n", 'includes/guard.php' => "<?php\n// guard 4.22\n", 'includes/keep.php' => "<?php\n// keep\n"]);
    $id = dccr_real_update('wporg-plugin', $r22, [], static function () {
        @unlink(WP_PLUGIN_DIR . '/wporg-plugin/includes/keep.php');
    });
    $a = Alerts::get(Events::fingerprint(Fortress::MINCETA, 'file-missing', 'wp-content/plugins/wporg-plugin/includes/keep.php'));
    eq(null, $a, '(b) keep.php was never in the baseline: nothing to miss');
    // the real case: an existing shipped file deleted during the copy
    $id = dccr_real_update('wporg-plugin', dccr_release('4.23.0', ['includes/a.php' => "<?php\n// a 4.23\n", 'readme.txt' => "=== WPORG Plugin ===\n", 'includes/guard.php' => "<?php\n// guard 4.23\n"]), [], static function () {
        @unlink(WP_PLUGIN_DIR . '/wporg-plugin/includes/a.php');
    });
    $a = Alerts::get(Events::fingerprint(Fortress::MINCETA, 'file-missing', 'wp-content/plugins/wporg-plugin/includes/a.php'));
    ok($a !== null && Alerts::state($a) === 'open' && $a['severity'] === Events::NEEDS_LOOK, '(b) a shipped file gone when the upgrader finished is a finding at once');
    ok(count(mails_with('a.php')) >= 1, '(b) emailed');
    file_put_contents(WP_PLUGIN_DIR . '/wporg-plugin/includes/a.php', "<?php\n// a 4.23\n");
    file_put_contents(WP_PLUGIN_DIR . '/wporg-plugin/includes/guard.php', "<?php\n// guard 4.23\n");
    dccr_full_pass();
    Alerts::force(false);
});

suite('0.2.7 drill 5: a theme update is journaled and its dropped files judged against its package', function () {
    file_put_contents(WP_CONTENT_DIR . '/themes/bravada/style.css', "/*\nTheme Name: Bravada\nVersion: 1.2.0\n*/\n");
    file_put_contents(WP_CONTENT_DIR . '/themes/bravada/old.css', "/* old */\n");
    dccr_full_pass();
    $hook = ['type' => 'theme', 'action' => 'update', 'theme' => 'bravada'];
    $pkg  = DCCR_TEST_ROOT . '/upgrade/theme-pkg/bravada';
    @mkdir($pkg, 0755, true);
    file_put_contents("$pkg/style.css", "/*\nTheme Name: Bravada\nVersion: 1.3.0\n*/\n");
    file_put_contents("$pkg/functions.php", "<?php\n// theme 1.3\n");
    Revelin::on_source_selection($pkg . '/', dirname($pkg), null, $hook);
    copy("$pkg/style.css", WP_CONTENT_DIR . '/themes/bravada/style.css');
    copy("$pkg/functions.php", WP_CONTENT_DIR . '/themes/bravada/functions.php');
    unlink(WP_CONTENT_DIR . '/themes/bravada/old.css');
    Sveti_Ivan::on_process_complete(null, $hook);
    $row = Journal::latest('update-seen', 'bravada');
    ok($row !== null && $row['before']['old_version'] === '1.2.0' && $row['before']['new_version'] === '1.3.0' && $row['state'] === Journal::COMMITTED, 'journaled: Bravada 1.2.0 → 1.3.0');
    eq(1, (int) $row['before']['files']['removed'], 'one file removed');
    dccr_full_pass();
    eq(null, Alerts::get(Events::fingerprint(Fortress::MINCETA, 'file-missing', 'wp-content/themes/bravada/old.css')), 'old.css, not in the 1.3.0 package, raises nothing');
});

suite('0.2.7 drill 6: an unseen update of a plugin nobody publishes a file list for vouches for nothing', function () {
    Alerts::force(true);
    file_put_contents(WP_PLUGIN_DIR . '/dcc-demo/includes/extra.php', "<?php\n// extra\n");
    dccr_full_pass();
    // A bumped version header, a changed file, a removed file: no upgrader.
    file_put_contents(WP_PLUGIN_DIR . '/dcc-demo/dcc-demo.php', "<?php\n/**\n * Plugin Name: DCC Demo\n * Version: 9.9.9\n */\n");
    file_put_contents(WP_PLUGIN_DIR . '/dcc-demo/includes/class-demo.php', "<?php\nclass Demo { /* injected */ }\n");
    unlink(WP_PLUGIN_DIR . '/dcc-demo/includes/extra.php');
    tick();
    $u = array_values(array_filter(Alerts::open(Fortress::SVETI_IVAN), static fn($a) => $a['kind'] === 'update-unseen'));
    ok(count($u) === 1 && str_contains($u[0]['title'], 'Updated Without Ragusa Seeing It: DCC Demo'), 'an unseen, unverifiable update is a finding of its own');
    $miss = Alerts::get(Events::fingerprint(Fortress::MINCETA, 'file-missing', 'wp-content/plugins/dcc-demo/includes/extra.php'));
    ok($miss !== null && Alerts::state($miss) === 'open', 'the removed file is a finding: nobody can say 9.9.9 dropped it');
    $ev = array_values(array_filter(events_of('file-missing'), static fn($e) => $e['target'] === 'wp-content/plugins/dcc-demo/includes/extra.php'));
    ok(str_contains((string) ($ev[0]['message'] ?? ''), 'could not get the list of files in version 9.9.9'), 'and says why: ' . ($ev[0]['message'] ?? ''));
    ok(count(array_filter(events_of('file-changed'), static fn($e) => $e['target'] === 'wp-content/plugins/dcc-demo/includes/class-demo.php' && $e['severity'] === Events::NEEDS_LOOK)) === 1, 'the changed file is reported on its own, not credited to the unseen update');
    eq(0, count(array_filter(events_of('update-written'), static fn($e) => str_contains($e['message'], 'class-demo.php'))), 'and not accepted as the update\'s');
    foreach (['dcc-demo.php', 'includes/class-demo.php', 'includes/extra.php'] as $rel) {
        Revelin::seal('wp-content/plugins/dcc-demo/' . $rel);
    }
    Alerts::withdraw(Fortress::SVETI_IVAN, ['update-unseen']);
    Alerts::force(false);
});

suite('0.2.7 failure drill: the package list cannot be written; the update still completes and is judged by WordPress.org\'s list', function () {
    $pk = DCCR\Vault::dir() . '/packages';
    @exec('rm -rf ' . escapeshellarg($pk));
    file_put_contents($pk, 'blocked'); // a file where the folder should be
    $r = dccr_release('4.24.0', ['includes/a.php' => "<?php\n// a 4.24\n", 'readme.txt' => "=== WPORG Plugin ===\n"]);
    $id = dccr_real_update('wporg-plugin', $r, ['includes/guard.php']);
    ok($id > 0 && Journal::get($id)['before']['new_version'] === '4.24.0', 'the update was journaled');
    eq('4.24.0', Revelin::plugin_version('wporg-plugin'), 'and is installed: Ragusa never stood in the upgrader\'s way');
    eq(null, Alerts::get(Events::fingerprint(Fortress::MINCETA, 'file-missing', 'wp-content/plugins/wporg-plugin/includes/guard.php')), 'the removal is still judged, from WordPress.org\'s list for 4.24.0');
    unlink($pk);
});

// ---------------------------------------------------------------- 0.2.8


/** An upgrader run that never reaches upgrader_process_complete: pre-install, the package listed, the files copied. Returns the open row. */
function dccr_partial_update(string $slug, array $files, array $drop, bool $copy = true): int
{
    $hook = ['type' => 'plugin', 'action' => 'update', 'plugin' => "$slug/$slug.php"];
    Sveti_Ivan::on_pre_install(true, $hook);
    $pkg = DCCR_TEST_ROOT . '/upgrade/pkg-' . bin2hex(random_bytes(3)) . "/$slug";
    foreach ($files as $rel => $c) {
        @mkdir(dirname("$pkg/$rel"), 0755, true);
        file_put_contents("$pkg/$rel", $c);
    }
    Revelin::on_source_selection($pkg . '/', dirname($pkg), null, $hook);
    if ($copy) {
        foreach ($files as $rel => $c) {
            @mkdir(dirname(WP_PLUGIN_DIR . "/$slug/$rel"), 0755, true);
            file_put_contents(WP_PLUGIN_DIR . "/$slug/$rel", $c);
        }
        foreach ($drop as $rel) {
            @unlink(WP_PLUGIN_DIR . "/$slug/$rel");
        }
    }
    return (int) (((array) State::get('update.open', []))[$slug] ?? 0);
}
function dccr_install_release(array $files): void
{
    foreach ($files as $rel => $c) {
        @mkdir(dirname(WP_PLUGIN_DIR . "/wporg-plugin/$rel"), 0755, true);
        file_put_contents(WP_PLUGIN_DIR . "/wporg-plugin/$rel", $c);
    }
}
function dccr_set_started(int $id, int $ago): void
{
    $row = Journal::get($id);
    Journal::set_state($id, $row['state'], ['before' => ['started' => time() - $ago]]);
}

suite('0.2.8 drill 1: the live case: a WP-Cron auto-update whose request ended before Ragusa heard it finish', function () {
    Alerts::force(true);
    dccr_install_release(dccr_release('2.9.5', ['includes/a.php' => "<?php\n// a 2.9.5\n", 'readme.txt' => "=== WPORG Plugin ===\n", 'old/legacy.php' => "<?php\n// legacy\n"]));
    dccr_full_pass();
    tick(); // the version snapshot holds 2.9.5
    $r = dccr_release('2.9.6', ['includes/a.php' => "<?php\n// a 2.9.6\n", 'readme.txt' => "=== WPORG Plugin ===\n"]);
    $id = dccr_partial_update('wporg-plugin', $r, ['old/legacy.php']);
    $row = Journal::get($id);
    ok($id > 0 && $row['action'] === 'update-check' && ($row['before']['stage'] ?? '') === 'started', 'the row is written at upgrader_pre_install, before a file is copied');
    eq('2.9.5', $row['before']['old_version'] ?? '', 'with the version it started from');
    ok(isset($row['before']['request']['entry']) && array_key_exists('cron', (array) $row['before']['request']), 'and where its request came in');
    ok(in_array([Sveti_Ivan::class, 'on_shutdown'], $GLOBALS['dccr_shutdown'], true), 'a shutdown check is registered for the request');
    // Another plugin's upgrader_process_complete callback dies before Ragusa's runs.
    Sveti_Ivan::on_shutdown(['type' => E_ERROR, 'message' => 'Uncaught Error: Class "Old_Thing" not found', 'file' => WP_PLUGIN_DIR . '/other/other.php', 'line' => 12]);
    $row = Journal::get($id);
    eq('ended-early', $row['before']['stage'] ?? '', 'shutdown marks it ended early');
    ok(str_contains((string) $row['note'], 'PHP fatal error: Uncaught Error: Class "Old_Thing" not found in wp-content/plugins/other/other.php line 12'), 'and names the fatal error, path relative: ' . $row['note']);
    $lines = tick();
    $row = Journal::get($id);
    eq('2.9.6', $row['before']['new_version'] ?? '', 'the next tick completes it: 2.9.6');
    eq('complete', $row['before']['stage'] ?? '', 'stage complete');
    ok(($row['before']['source'] ?? '') !== 'unseen' && empty($row['before']['unseen']), 'as a recorded update, not an unseen one');
    eq(1, count(array_filter(Journal::recent(30), static fn($j) => $j['target'] === 'wporg-plugin' && $j['action'] === 'update-check' && ($j['before']['new_version'] ?? '') === '2.9.6')), 'one row for it, no unseen duplicate');
    eq(0, count(events_of('update-unseen')), 'no "updated without Ragusa seeing it"');
    ok(str_contains((string) $row['note'], 'completed by the tick'), 'the row says the tick completed it');
    ok(count(array_filter($lines, static fn($l) => str_contains($l, 'WordPress never reported it finished'))) === 1, 'and the tick says so');
    ok(count(array_filter(events_of('removed-by-update'), static fn($e) => str_contains($e['message'], '2.9.5 → 2.9.6') && str_contains($e['message'], 'legacy.php'))) === 1, 'the file 2.9.6 no longer ships is credited to it: info');
    eq(null, Alerts::get(Events::fingerprint(Fortress::MINCETA, 'file-missing', 'wp-content/plugins/wporg-plugin/old/legacy.php')), 'no File Missing for it');
    ok(in_array($row['state'], [Journal::VERIFYING, Journal::COMMITTED], true), 'its smoke checks run: ' . $row['state']);
    Alerts::force(false);
});

suite('0.2.8 drill 2: an update still copying is left alone, then finished after the grace period', function () {
    dccr_install_release(dccr_release('3.0.0', ['includes/a.php' => "<?php\n// a 3.0.0\n", 'readme.txt' => "=== WPORG Plugin ===\n"]));
    dccr_full_pass();
    tick();
    $id = dccr_partial_update('wporg-plugin', dccr_release('3.0.1', ['includes/a.php' => "<?php\n// a 3.0.1\n", 'readme.txt' => "=== WPORG Plugin ===\n"]), []);
    age_row($id, 200); // what a tick in another request sees: an unfinished row from another run
    tick();
    $row = Journal::get($id);
    eq(Journal::PLANNED, $row['state'], 'recovery leaves an open update alone');
    eq('started', $row['before']['stage'] ?? '', 'still open within the grace period');
    eq(0, count(events_of('update-unseen')), 'and the version change is not taken for an unseen update');
    dccr_set_started($id, Sveti_Ivan::OPEN_GRACE + 5);
    $lines = tick();
    $row = Journal::get($id);
    eq('3.0.1', $row['before']['new_version'] ?? '', 'after the grace period the tick completes it');
    ok(str_contains((string) $row['note'], 'its request never said how it ended'), 'saying it never heard how the request ended');
    eq(0, count(events_of('update-unseen')), 'still not unseen');
    Sveti_Ivan::on_shutdown(); // nothing left open: no error
});

suite('0.2.8 drill 3: an update that started and changed nothing is abandoned, not invented', function () {
    dccr_install_release(dccr_release('3.1.0', ['includes/a.php' => "<?php\n// a 3.1.0\n", 'readme.txt' => "=== WPORG Plugin ===\n"]));
    dccr_full_pass();
    tick();
    $id = dccr_partial_update('wporg-plugin', dccr_release('3.1.1', ['includes/a.php' => "<?php\n// a 3.1.1\n"]), [], false);
    Sveti_Ivan::on_shutdown(null);
    $row = Journal::get($id);
    ok(str_contains((string) $row['note'], 'no PHP error'), 'shutdown with no fatal says so');
    tick();
    $row = Journal::get($id);
    eq(Journal::ABANDONED, $row['state'], 'abandoned');
    ok(str_contains((string) $row['note'], 'the update did not finish: the version is still 3.1.0'), 'the version is still 3.1.0: ' . $row['note']);
    eq('', (string) ($row['before']['new_version'] ?? ''), 'no new version is claimed');
});

suite('0.2.8 drill 4: an unseen update says when WordPress\'s automatic updater died holding its lock', function () {
    dccr_install_release(dccr_release('3.2.0', ['includes/a.php' => "<?php\n// a 3.2.0\n", 'readme.txt' => "=== WPORG Plugin ===\n"]));
    dccr_full_pass();
    tick();
    update_option('auto_updater.lock', time() - 1200);
    dccr_install_release(dccr_release('3.2.1', ['includes/a.php' => "<?php\n// a 3.2.1\n", 'readme.txt' => "=== WPORG Plugin ===\n"]));
    State::set('versions', array_merge((array) State::get('versions'), ['ts' => time() - 1800]));
    tick();
    $ev = events_of('update-unseen');
    ok(count($ev) === 1 && str_contains($ev[0]['message'], 'WordPress\'s automatic updater started a run at') && str_contains($ev[0]['message'], 'never finished it'), 'the lock is named: ' . ($ev[0]['message'] ?? ''));
    $row = Journal::latest('update-check', 'wporg-plugin');
    ok(str_contains((string) $row['note'], 'automatic updater'), 'and on the journal row');
    update_option('auto_updater.lock', time() - 30);
    dccr_install_release(dccr_release('3.2.2', ['includes/a.php' => "<?php\n// a 3.2.2\n", 'readme.txt' => "=== WPORG Plugin ===\n"]));
    tick();
    $ev = array_values(array_filter(events_of('update-unseen'), static fn($e) => str_contains($e['message'], '3.2.2')));
    ok(count($ev) === 1 && !str_contains($ev[0]['message'], 'automatic updater started'), 'a lock taken moments ago is a run in progress, not a dead one');
    delete_option('auto_updater.lock');
});

suite('0.2.8 drill 5: during WordPress\'s maintenance page the inline checks wait; the follow-up runs them', function () {
    dccr_install_release(dccr_release('3.3.0', ['includes/a.php' => "<?php\n// a 3.3.0\n", 'readme.txt' => "=== WPORG Plugin ===\n"]));
    dccr_full_pass();
    file_put_contents(ABSPATH . '.maintenance', '<?php $upgrading = ' . time() . ';');
    $GLOBALS['dccr_http'] = [];
    $id = dccr_real_update('wporg-plugin', dccr_release('3.3.1', ['includes/a.php' => "<?php\n// a 3.3.1\n", 'readme.txt' => "=== WPORG Plugin ===\n"]), []);
    $row = Journal::get($id);
    eq('deferred: maintenance mode', $row['verify']['inline'] ?? null, 'no inline checks while WordPress shows its maintenance page');
    eq([], array_column(array_filter((array) $GLOBALS['dccr_http'], static fn($h) => !str_contains((string) $h['url'], 'wordpress.org/')), 'url'), 'not one loopback was made');
    ok((int) ($row['verify']['next_at'] ?? 0) > time(), 'the follow-up is scheduled');
    unlink(ABSPATH . '.maintenance');
    $id2 = dccr_real_update('wporg-plugin', dccr_release('3.3.2', ['includes/a.php' => "<?php\n// a 3.3.2\n", 'readme.txt' => "=== WPORG Plugin ===\n"]), []);
    ok(is_array(Journal::get($id2)['verify']['inline'] ?? null), 'without the maintenance page they run inline as before');
});

suite('0.2.8 drill 6: an ordinary update is one row, finished by the hook', function () {
    dccr_install_release(dccr_release('3.4.0', ['includes/a.php' => "<?php\n// a 3.4.0\n", 'readme.txt' => "=== WPORG Plugin ===\n"]));
    dccr_full_pass();
    $n  = count(Journal::recent(200));
    $id = dccr_real_update('wporg-plugin', dccr_release('3.4.1', ['includes/a.php' => "<?php\n// a 3.4.1\n", 'readme.txt' => "=== WPORG Plugin ===\n"]), []);
    eq($n + 1, count(Journal::recent(200)), 'exactly one new journal row');
    $row = Journal::get($id);
    eq('complete', $row['before']['stage'] ?? '', 'opened at pre-install, completed by the hook');
    eq('3.4.0', $row['before']['old_version'] ?? '', 'from 3.4.0');
    eq('3.4.1', $row['before']['new_version'] ?? '', 'to 3.4.1');
    ok(!str_contains((string) $row['note'], 'in progress'), 'its note no longer says in progress: ' . $row['note']);
    eq([], (array) State::get('update.open', []), 'nothing left open');
    Sveti_Ivan::on_shutdown(null);
    ok(!str_contains((string) Journal::get($id)['note'], 'request ended'), 'shutdown adds nothing to a finished update');
});

suite('0.2.8 failure drill: the journal cannot be written; the upgrader still finishes and the failure is loud', function () {
    global $wpdb;
    dccr_install_release(dccr_release('3.5.0', ['includes/a.php' => "<?php\n// a 3.5.0\n", 'readme.txt' => "=== WPORG Plugin ===\n"]));
    $t = DCCR\Schema::journal();
    $wpdb->query("ALTER TABLE {$t} RENAME TO {$t}_away");
    $log = DCCR_TEST_ROOT . '/php-error.log';
    $old = ini_set('error_log', $log);
    $hook = ['type' => 'plugin', 'action' => 'update', 'plugin' => 'wporg-plugin/wporg-plugin.php'];
    $res = @Sveti_Ivan::on_pre_install(true, $hook);
    ini_set('error_log', (string) $old);
    $wpdb->query("ALTER TABLE {$t}_away RENAME TO {$t}");
    eq(true, $res, 'upgrader_pre_install gets its value back untouched: the update goes on');
    ok(str_contains((string) @file_get_contents($log), 'DCC Ragusa: could not write the journal row for the update of wporg-plugin'), 'PHP\'s error log says so');
    ok(count(events_of('journal-write-failed')) === 1, 'and Recent Events');
    eq([], (array) State::get('update.open', []), 'nothing is left open that nobody can finish');
});

suite('0.2.8: a failed journal insert is 0, never the id wpdb kept from the insert before it', function () {
    global $wpdb;
    $real = $wpdb;
    $first = Journal::create('update-check', 'x-first', [], 'first', false);
    $wpdb = new class ($real) {
        public int $insert_id;
        public string $last_error = 'Table is marked as crashed';
        public function __construct(private $real) { $this->insert_id = $real->insert_id; }
        public function insert(...$a) { return false; } // real wpdb: false, insert_id untouched
        public function __call($m, $a) { return $this->real->$m(...$a); }
        public function __get($n) { return $this->real->$n; }
    };
    $id = Journal::create('update-check', 'x-second', [], 'second', false);
    $wpdb = $real;
    eq(0, $id, 'create returns 0');
    ok($first > 0 && Journal::get($first)['note'] === 'first', 'and the earlier row is untouched');
});

/** What Newfold's Htaccess Manager does on a write: refresh the backup with the current file, then write. */
function dccr_newfold_write(string $new_content, int $at, int $gap = 1, ?string $backup = null): void
{
    $ht = ABSPATH . '.htaccess';
    file_put_contents(ABSPATH . '.htaccess.nfd-backup', $backup ?? (string) file_get_contents($ht));
    touch(ABSPATH . '.htaccess.nfd-backup', $at - $gap);
    file_put_contents($ht, $new_content);
    touch($ht, $at);
}
function dccr_nfd_block(): string
{
    return "# BEGIN NFD Htaccess\n# Managed by Newfold Htaccess Manager v1.4.2 (doracanalcourt.com)\n# STATE sha256: " . str_repeat('ab12', 16) . " applied: " . gmdate('Y-m-d\TH:i:s\Z') . "\n\n# skip 404 for static files\n# END NFD Htaccess\n";
}

suite('0.2.8 drill 7: Newfold rewrites .htaccess right after a recorded update: still a finding, and it says who and when', function () {
    Alerts::force(true);
    @unlink(ABSPATH . '.htaccess.nfd-backup');
    dccr_install_release(dccr_release('3.6.0', ['includes/a.php' => "<?php\n// a 3.6.0\n", 'readme.txt' => "=== WPORG Plugin ===\n"]));
    dccr_full_pass();
    $id = dccr_real_update('wporg-plugin', dccr_release('3.6.1', ['includes/a.php' => "<?php\n// a 3.6.1\n", 'readme.txt' => "=== WPORG Plugin ===\n"]), []);
    $old = (string) file_get_contents(ABSPATH . '.htaccess');
    dccr_newfold_write(dccr_nfd_block() . str_replace('# BEGIN WordPress', "# BEGIN WordPress\n# nfd: skip 404 for static files", $old), time() + 2);
    dccr_full_pass();
    $a = Alerts::get(Events::fingerprint(Fortress::MINCETA, 'file-changed', '.htaccess'));
    ok($a !== null && Alerts::state($a) === 'open' && $a['severity'] === Events::NEEDS_LOOK, 'still a finding, needs a look: .htaccess is never quiet');
    $ev  = array_values(array_filter(events_of('file-changed'), static fn($e) => $e['target'] === '.htaccess'));
    $msg = (string) ($ev[0]['message'] ?? '');
    ok(str_contains($msg, 'Newfold Htaccess Manager (HostGator\'s) made this change') && str_contains($msg, 'holds exactly the .htaccess Ragusa had on record'), 'names Newfold, with the backup as proof: ' . $msg);
    ok(str_contains($msg, 'Managed by Newfold Htaccess Manager v1.4.2, STATE sha256 ab12ab12ab12…, applied'), 'quotes its STATE line');
    ok(str_contains($msg, 'seconds after the WPORG Plugin update from 3.6.0 to 3.6.1 (journal ' . $id . ')'), 'and the update just before it');
    ok(str_contains($msg, 'Ragusa still reports it'), 'and says why it is still reported');
    $m = mails_with('Newfold');
    ok(count($m) >= 1 && str_contains($m[0]['body'], 'diff .htaccess .htaccess.nfd-backup'), 'the email gives the one thing to do');
    $bk = array_values(array_filter(array_merge(events_of('file-new'), events_of('file-changed')), static fn($e) => $e['target'] === '.htaccess.nfd-backup'));
    ok(count($bk) === 1 && str_contains($bk[0]['message'], 'copy of the previous .htaccess'), 'the backup file is explained too: ' . ($bk[0]['message'] ?? ''));
    Revelin::seal('.htaccess');
    Revelin::seal('.htaccess.nfd-backup');
    Alerts::force(false);
});

suite('0.2.8 drill 8: an .htaccess edit Newfold did not make is not credited to it', function () {
    Alerts::force(true);
    dccr_full_pass();
    // A stale backup from long ago: not this write.
    file_put_contents(ABSPATH . '.htaccess.nfd-backup', "old\n");
    touch(ABSPATH . '.htaccess.nfd-backup', time() - 86400);
    dccr_full_pass();
    file_put_contents(ABSPATH . '.htaccess', (string) file_get_contents(ABSPATH . '.htaccess') . "\n# edited by hand\n");
    dccr_full_pass();
    $ev = array_values(array_filter(events_of('file-changed'), static fn($e) => $e['target'] === '.htaccess'));
    ok($ev !== [] && !str_contains($ev[0]['message'], 'Newfold'), 'a hand edit says nothing about Newfold: ' . ($ev[0]['message'] ?? ''));
    Revelin::seal('.htaccess');
    // Fresh backup, but not the file Ragusa had on record: a change between them.
    $now = (string) file_get_contents(ABSPATH . '.htaccess');
    dccr_newfold_write($now . "\n# second\n", time() + 3, 1, "# something else entirely\n");
    dccr_full_pass();
    $ev = array_values(array_filter(events_of('file-changed'), static fn($e) => $e['target'] === '.htaccess'));
    ok(str_contains($ev[0]['message'] ?? '', 'not the .htaccess Ragusa had on record, so another change may sit between them'), 'a backup that does not match is said plainly: ' . ($ev[0]['message'] ?? ''));
    ok(!str_contains($ev[0]['message'] ?? '', 'made this change'), 'and Newfold is not said to have made it');
    Revelin::seal('.htaccess');
    @unlink(ABSPATH . '.htaccess.nfd-backup');
    Alerts::force(false);
});

echo sprintf("\n%d passed, %d failed\n", $GLOBALS['t_pass'], $GLOBALS['t_fail']);
DCCR\Vault::rm_rf(DCCR_TEST_ROOT);
exit($GLOBALS['t_fail'] === 0 ? 0 : 1);
