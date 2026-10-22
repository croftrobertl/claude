<?php
/**
 * Renders the Ragusa page and its confirmation screen to tests/screens/ as
 * static HTML with the real stylesheet, for the layout check and the
 * screenshots. Synthetic state only.
 *
 *     php tests/render-screens.php
 */

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/site.php';

use DCCR\Admin;
use DCCR\Alerts;
use DCCR\Budget;
use DCCR\Cron;
use DCCR\Events;
use DCCR\Fortress;
use DCCR\Fortress\Lovrijenac;
use DCCR\Fortress\Sveti_Ivan;
use DCCR\Journal;
use DCCR\Settings;
use DCCR\State;

Test_Site::reset();
$GLOBALS['dccr_is_admin'] = true;
Cron::tick(new Budget(30.0), true);
Settings::save(['heartbeat_url' => 'https://hc-ping.com/8b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'feed_key' => 'abcdefghijklmnop1234']);

// A rolled-back update, a vulnerability, a restored guard, a quarantine.
$GLOBALS['dccr_site_handler'] = static function (string $url, array $args) {
    if (DCCR\Fortress\Revelin::plugin_version('wporg-plugin') === '1.5.0' && str_contains($url, 'cottage-34')) {
        return dccr_http_ok('<html>broken</html>', 500);
    }
    return Test_Site::site_page($url);
};
$hook = ['type' => 'plugin', 'action' => 'update', 'plugin' => 'wporg-plugin/wporg-plugin.php'];
Sveti_Ivan::on_pre_install(true, $hook);
DCCR\Fortress\Revelin::on_source_selection(DCCR_TEST_ROOT . '/upgrade/wporg-plugin/', '', null, $hook);
file_put_contents(WP_PLUGIN_DIR . '/wporg-plugin/wporg-plugin.php', "<?php\n/**\n * Plugin Name: WPORG Plugin\n * Version: 1.5.0\n */\n");
Sveti_Ivan::on_process_complete(null, $hook);
$row = Journal::latest('update-check', 'wporg-plugin');
Sveti_Ivan::scheduled_check((int) $row['id']);
Sveti_Ivan::scheduled_check((int) $row['id']);
$verify = Journal::latest('update-check', 'wporg-plugin');
Sveti_Ivan::scheduled_check((int) $verify['id']);
$GLOBALS['dccr_site_handler'] = null;

file_put_contents(WPMU_PLUGIN_DIR . '/dcc-postpass-guard.php', "<?php\n// tampered\n");
Test_Site::write('wp-content/uploads/2026/10/photo.jpg.php', "<?php eval('x');\n");
Cron::tick(new Budget(30.0), true);

Alerts::raise([
    'fortress' => Fortress::LOVRIJENAC, 'severity' => Events::NEEDS_LOOK, 'kind' => 'vuln', 'target' => 'wporg-plugin@1.4.0',
    'title' => 'WPORG Plugin Has A Known Weakness', 'what' => 'WPORG Plugin 1.4.0 is affected by a published vulnerability: Stored XSS.',
    'did' => 'Ragusa installed nothing.', 'todo' => 'Open Ragusa and tap Update Now.',
]);
Fortress::set_status(Fortress::LOVRIJENAC, Fortress::NEEDS_LOOK, '1 Plugin Has A Known Weakness · Feed Read 6 Hours Ago');

// 0.1.3: a practice finding (a drill), a resolved one, and one marked as seen.
DCCR\Drill::$active = true;
Alerts::raise(['fortress' => Fortress::MINCETA, 'severity' => Events::BREACHED, 'kind' => 'quarantined', 'target' => 'wp-content/uploads/ragusa-drill/evil.php', 'title' => 'File Quarantined', 'what' => 'A drill.', 'did' => 'Practice.', 'todo' => 'Nothing.']);
Events::record(Fortress::MINCETA, Events::BREACHED, 'quarantined', 'wp-content/uploads/ragusa-drill/evil.php', 'Quarantined wp-content/uploads/ragusa-drill/evil.php (drill: an executable file inside the uploads folder).');
DCCR\Drill::$active = false;
Alerts::raise(['fortress' => Fortress::SVETI_IVAN, 'severity' => Events::BREACHED, 'kind' => 'update-rolled-back', 'target' => 'dcc-wildlife', 'title' => 'Update Rolled Back', 'what' => 'w', 'did' => 'd', 'todo' => 't', 'data' => ['rolled_back' => '1.44.5']]);
Alerts::resolve(Events::fingerprint(Fortress::SVETI_IVAN, 'update-rolled-back', 'dcc-wildlife'), true);
$GLOBALS['dccr_alerts_backdate'] = true;
Alerts::raise(['fortress' => Fortress::SVETI_IVAN, 'severity' => Events::NEEDS_LOOK, 'kind' => 'fatal-elsewhere', 'target' => 'dcc-ledger@1a2b3c4d', 'title' => 'A New Fatal Elsewhere After This Update', 'what' => 'w', 'did' => 'd', 'todo' => 't']);
Alerts::mark_seen(Events::fingerprint(Fortress::SVETI_IVAN, 'fatal-elsewhere', 'dcc-ledger@1a2b3c4d'), 'Rob');
$opt = get_option(Alerts::OPTION);
$opt['active'][Events::fingerprint(Fortress::SVETI_IVAN, 'update-rolled-back', 'dcc-wildlife')]['resolved_at'] = time() - 3 * 86400;
update_option(Alerts::OPTION, $opt, 'no');
Alerts::reset_cache();
Fortress::settle();
State::set('heartbeat', ['ts' => time() - 240, 'ok' => true, 'result' => 'sent', 'code' => 200]);
State::flush();

$css = (string) file_get_contents(dirname(__DIR__) . '/assets/css/admin.css');
$wrap = static function (string $body) use ($css): string {
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ragusa</title>'
        . '<style>body{margin:0;background:#f0f0f1;color:#1d2327;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}'
        . '#wpcontent{padding:0 20px 20px}.wrap{margin:10px 0 0}h1{font-size:23px;font-weight:400;margin:0;padding:9px 0 4px;line-height:1.3}'
        . '.button{display:inline-block;text-decoration:none;font-size:13px;border:1px solid #2271b1;border-radius:3px;background:#f6f7f7;color:#2271b1;padding:0 10px;cursor:pointer}'
        . '.button-primary{background:#2271b1;color:#fff}.button-link{background:none;border:0;color:#2271b1;cursor:pointer}'
        . 'input[type=email],input[type=url],input[type=password]{border:1px solid #8c8f94;border-radius:4px;padding:0 8px;font-size:14px;line-height:2;min-height:30px;box-sizing:border-box}'
        . 'code{font-family:Consolas,Monaco,monospace;font-size:13px;background:rgba(0,0,0,.07);padding:3px 5px}'
        . '@media (max-width:782px){#wpcontent{padding:0 10px 10px}}</style><style>' . $css . '</style></head><body><div id="wpcontent">' . $body . '</div></body></html>';
};

@mkdir(__DIR__ . '/screens', 0755, true);
$_GET = [];
ob_start();
Admin::render();
file_put_contents(__DIR__ . '/screens/ragusa.html', $wrap((string) ob_get_clean()));
$_GET = ['confirm' => 'seal', 'target' => 'wp-content/mu-plugins/dcc-postpass-guard.php'];
ob_start();
Admin::render();
file_put_contents(__DIR__ . '/screens/confirm.html', $wrap((string) ob_get_clean()));
$_GET = [];
echo "Rendered tests/screens/ragusa.html and confirm.html\n";
DCCR\Vault::rm_rf(DCCR_TEST_ROOT);
