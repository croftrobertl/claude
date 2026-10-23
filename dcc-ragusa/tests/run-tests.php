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
    ok(str_contains(Alerts::body(['what' => 'w', 'did' => 'd', 'todo' => 't']), 'Ragusa: '), 'body carries the plain link');

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
    eq(Htaccess::ORDER_SPEEDY_MISSING, Htaccess::order_problem(Test_Site::PREGZ_BLOCK), 'no speedycache block');
    eq(Htaccess::ORDER_PREGZ_MISSING, Htaccess::order_problem(''), 'an empty file');
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
    $mails = count($GLOBALS['dccr_mail']);
    $rows  = count(Journal::recent(50, null, 'htaccess-block'));
    tick();
    $a = Alerts::get($fp);
    ok($a !== null && Alerts::state($a) === 'open', 'the wrong order is an open finding');
    eq(Events::NEEDS_LOOK, $a['severity'], 'needs a look, not breached');
    eq('The Pre-gzipped Cache Block Is Below SpeedyCache', $a['title'], 'title');
    eq($swapped, file_get_contents($path), '.htaccess untouched: an alert, never a rewrite');
    eq($rows, count(Journal::recent(50, null, 'htaccess-block')), 'no journal row');
    eq(1, count($GLOBALS['dccr_mail']) - $mails, 'one email');
    $mail = end($GLOBALS['dccr_mail']);
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

    // Either block missing is a finding too, each with its own title.
    file_put_contents($path, str_replace(Test_Site::PREGZ_BLOCK, '', $orig));
    tick();
    eq('The Pre-gzipped Cache Block Is Missing', Alerts::get($fp)['title'], 'pre-gzipped block missing');
    eq('open', Alerts::state(Alerts::get($fp)), 'open again');
    ok(str_contains(Alerts::body(Alerts::get($fp) + ['todo' => 'Put the DCC Pre-gzipped Cache block back, above # BEGIN speedycache.']), 'above # BEGIN speedycache'), 'the fix names the order');
    eq(2, count(events_of('htaccess-order')), 'a different problem is a new event');
    file_put_contents($path, str_replace(Test_Site::SPEEDY_BLOCK, '', $orig));
    tick();
    eq('The SpeedyCache Block Is Missing', Alerts::get($fp)['title'], 'speedycache block missing');
    file_put_contents($path, $orig);
    tick();
    eq('resolved', Alerts::state(Alerts::get($fp)), 'resolved again');
    Alerts::force(false);
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
    ok(str_contains($GLOBALS['dccr_mail'][0]['body'], "w\n\nd\n\nt\n\nRagusa: "), 'three sentences and the plain link');
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

    // A fatal in the updated plugin's own files still rolls back.
    file_put_contents($log, '');
    break_cottage_when('9.9.9'); // pages fine; only the log fails
    $id = simulate_update('wporg-plugin', '1.6.0');
    file_put_contents($log, "[22-Oct-2026 01:50:00 UTC] PHP Fatal error: Uncaught Error: boom in " . WP_PLUGIN_DIR . "/wporg-plugin/includes/a.php:2\n", FILE_APPEND);
    Sveti_Ivan::scheduled_check($id);
    Sveti_Ivan::scheduled_check($id);
    eq(1, count(Journal::recent(5, null, 'rollback')), 'a fatal in the plugin itself rolls back');
    $GLOBALS['dccr_site_handler'] = null;
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

echo sprintf("\n%d passed, %d failed\n", $GLOBALS['t_pass'], $GLOBALS['t_fail']);
DCCR\Vault::rm_rf(DCCR_TEST_ROOT);
exit($GLOBALS['t_fail'] === 0 ? 0 : 1);
