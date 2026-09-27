<?php
/**
 * THE STANDING RULE: every engine setting has a "setting reaches its consumer"
 * test — a CHANGED value changes the OUTCOME. Not "the default equals the
 * constant", which is what defaults-test.php proves and which is exactly how
 * `cache_ttl` shipped in 0.40.0 governing nothing: the availability cache
 * passed Cache::DEFAULT_TTL explicitly, the default equalled the constant,
 * every test was green, and the settings screen lied for two releases. The
 * same defect was found in three other DCC plugins the same week.
 *
 * Each block below sets the setting to a value that is NOT the default, drives
 * the real consumer, and reads the outcome back from the far side — the TTL
 * handed to set_transient, the date span a scan actually walked, the `to` the
 * endpoint actually answered with. If the setting is decorative, the outcome
 * does not move and the block goes red.
 */
// Declared BEFORE bootstrap.php, whose did_action() always answers 0. The
// boot-path block below needs Plugin::dependencies_present() to be true, or
// boot() returns before it hooks anything and the test cannot tell "the
// setting is off" from "nothing ran".
function did_action($t) { return $t === 'elementor/loaded' ? 1 : 0; }
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/elementor-stub.php';
$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';

$GLOBALS['t_options']    = [];
$GLOBALS['t_transients'] = [];
$GLOBALS['t_set_ttls']   = [];
$GLOBALS['t_hooks']      = [];
function get_transient($k) { return $GLOBALS['t_transients'][$k] ?? false; }
function set_transient($k, $v, $t) { $GLOBALS['t_set_ttls'][] = $t; $GLOBALS['t_transients'][$k] = $v; return true; }
function delete_transient($k) { unset($GLOBALS['t_transients'][$k]); return true; }
function add_action($h, $cb, $p = 10, $a = 1) { $GLOBALS['t_hooks']['action'][$h][] = $cb; }
function add_filter($h, $cb, $p = 10, $a = 1) { $GLOBALS['t_hooks']['filter'][$h][] = $cb; }
function add_shortcode($t, $cb) {}
function is_admin() { return false; }
function nocache_headers() {}
function wp_unslash($v) { return $v; }
if (!function_exists('wp_strip_all_tags')) { function wp_strip_all_tags($t) { return strip_tags((string) $t); } }
function wp_kses_post($t) { return $t; }
function wpautop($t) { return '<p>' . $t . '</p>'; }
function wp_hash($d) { return hash_hmac('md5', $d, 'test-salt'); }
function MPHB() { return null; }
class T_Json extends \Exception { public $payload; public $code_; }
function wp_send_json_success($d = null) { $e = new T_Json('ok'); $e->payload = $d; throw $e; }
function wp_send_json_error($d = null, $code = 200) { $e = new T_Json('err'); $e->payload = $d; $e->code_ = $code; throw $e; }

require $ROOT . '/includes/class-settings.php';
require $ROOT . '/includes/class-cache.php';
require $ROOT . '/includes/class-data-provider.php';
require $ROOT . '/includes/class-staff.php';
require $ROOT . '/includes/class-staff-widget.php';
require $ROOT . '/includes/class-cache-integration.php';
require $ROOT . '/includes/class-ajax.php';
require $ROOT . '/includes/class-widget.php';
require $ROOT . '/includes/class-plugin.php';
if (!defined('MPHBAC_VERSION'))      { define('MPHBAC_VERSION', 'test'); }
if (!defined('MPHBAC_AJAX_ACTION'))  { define('MPHBAC_AJAX_ACTION', 'mphbac_query'); }
if (!defined('MPHBAC_PRICE_ACTION')) { define('MPHBAC_PRICE_ACTION', 'mphbac_price'); }
if (!defined('MPHBAC_INFO_ACTION'))  { define('MPHBAC_INFO_ACTION', 'mphbac_info'); }
if (!defined('MPHBAC_FILE'))         { define('MPHBAC_FILE', $ROOT . '/mphb-availability-calendar.php'); }

use MPHBAC\Settings;
use MPHBAC\Cache;
use MPHBAC\Data_Provider;
use MPHBAC\Ajax;
use MPHBAC\Staff;
use MPHBAC\Widget;
use MPHBAC\Plugin;

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}
function with(array $overrides): void {
    $GLOBALS['t_options'][Settings::OPTION] = array_merge(Settings::defaults(), $overrides);
    Settings::flush();
    $GLOBALS['t_transients'] = [];
    $GLOBALS['t_set_ttls']   = [];
}
$d = Settings::defaults();
$today = Data_Provider::today();
// Cottage 22 has to exist as a room type: the endpoint checks the ids it is
// asked about against the real list before it clamps anything.
t_post(22, 'mphb_room_type', 'publish', 'Cottage 22');

echo "-- cache_ttl reaches the availability cache --\n";
{
    with(['cache_ttl' => 123]);
    Data_Provider::get_availability([22], $today, $today->modify('+3 days'));
    check('a changed TTL is the TTL the availability answer is stored with',
        ($GLOBALS['t_set_ttls'][0] ?? null) === 123, $GLOBALS['t_set_ttls']);
    check('(instrument check) that is not the shipped value', 123 !== $d['cache_ttl']);

    with(['cache_ttl' => 0]);
    Data_Provider::get_availability([22], $today, $today->modify('+3 days'));
    Data_Provider::get_availability([22], $today, $today->modify('+3 days'));
    check('"0 disables caching" is now TRUE: nothing is stored at 0',
        $GLOBALS['t_set_ttls'] === [], $GLOBALS['t_set_ttls']);
}

echo "\n-- forward_scan_days bounds the walk the scan actually makes --\n";
{
    $span = static function (int $days) use ($today): int {
        with(['forward_scan_days' => $days]);
        Data_Provider::find_first_availability([22], $today);
        // The scan stores what it fetched; the stored value's day keys ARE
        // the span it walked. Read it from the far side.
        $stored = array_values($GLOBALS['t_transients']);
        $v = $stored[0]['__v'][22] ?? $stored[0]['__v'][array_key_first($stored[0]['__v'] ?? [0])] ?? [];
        return count($v);
    };
    $a = $span(30); $b = $span(60);
    check('30 days walks 31 dates, 60 walks 61 — the setting is the bound',
        $a === 31 && $b === 61, [$a, $b]);
}

echo "\n-- the three request clamps reach the endpoint --\n";
{
    $ask = static function (array $post) {
        $_POST = $post;
        try { Ajax::handle(); } catch (T_Json $e) { return $e->payload; }
        return null;
    };
    $from = $today->format('Y-m-d');
    with(['max_range_days' => 40]);
    $r = $ask(['room_type_ids' => [22], 'from' => $from, 'to' => $today->modify('+300 days')->format('Y-m-d')]);
    check('max_range_days: a 300-day ask is answered with the CHANGED 40-day window',
        ($r['to'] ?? '') === $today->modify('+40 days')->format('Y-m-d'), $r['to'] ?? $r);

    with(['clamp_future_days' => 50, 'max_range_days' => 400]);
    $r = $ask(['room_type_ids' => [22], 'from' => $today->modify('+45 days')->format('Y-m-d'),
               'to' => $today->modify('+120 days')->format('Y-m-d')]);
    check('clamp_future_days: the answer stops at the CHANGED horizon',
        ($r['to'] ?? '') === $today->modify('+50 days')->format('Y-m-d'), $r['to'] ?? $r);

    with(['clamp_past_days' => 5, 'max_range_days' => 400]);
    $r = $ask(['room_type_ids' => [22], 'from' => $today->modify('-30 days')->format('Y-m-d'), 'to' => $from]);
    check('clamp_past_days: the answer starts no earlier than the CHANGED floor',
        ($r['from'] ?? '') === $today->modify('-5 days')->format('Y-m-d'), $r['from'] ?? $r);
    $_POST = [];
}

echo "\n-- the staff gate reads its two settings --\n";
{
    with(['staff_page_id' => 4242, 'staff_capability' => 'manage_options']);
    check('staff_page_id', Staff::page_id() === 4242, Staff::page_id());
    check('staff_capability', Staff::capability() === 'manage_options', Staff::capability());
}

echo "\n-- keep_assets_unoptimized decides whether the opt-out filters are hooked --\n";
{
    $boot = static function (bool $on): array {
        with(['keep_assets_unoptimized' => $on]);
        $GLOBALS['t_hooks'] = [];
        $prop = new ReflectionProperty(Plugin::class, 'instance');
        $prop->setAccessible(true);
        $prop->setValue(null, null);                 // a fresh, unbooted singleton
        Plugin::instance()->boot();
        return array_keys($GLOBALS['t_hooks']['filter'] ?? []);
    };
    $on = $boot(true); $off = $boot(false);
    check('ON hooks script_loader_tag and style_loader_tag',
        in_array('script_loader_tag', $on, true) && in_array('style_loader_tag', $on, true), $on);
    check('OFF hooks neither', !in_array('script_loader_tag', $off, true) && !in_array('style_loader_tag', $off, true), $off);

    /* F3a's invalidation, asserted on the HOOK TABLE the boot actually built.
       The first version of this check searched the source for the
       add_action() line and a mutation that commented that line out SURVIVED
       — the substring was still there, behind two slashes. Code, not
       comments. */
    $flushes = static fn(string $hook): bool => in_array(
        ['\\MPHBAC\\Cache', 'flush_all'], $GLOBALS['t_hooks']['action'][$hook] ?? [], true);
    check('saving an Elementor template flushes the fragment cache', $flushes('save_post_elementor_library'),
        array_keys($GLOBALS['t_hooks']['action'] ?? []));
    check('saving a MotoPress accommodation flushes it too', $flushes('save_post_mphb_room_type'));
}

echo "\n-- lazy_cottage_panels decides what a template row puts in the page --\n";
{
    t_post(501, 'elementor_library', 'publish', 'Panel');
    $rm = new ReflectionMethod(Widget::class, 'info_row');
    $rm->setAccessible(true);
    $row = ['ci_cottage' => 22, 'ci_source' => 'template', 'ci_template' => 501];
    with(['lazy_cottage_panels' => true]);
    $lazy = $rm->invoke(null, $row, 22);
    with(['lazy_cottage_panels' => false]);
    $eager = $rm->invoke(null, $row, 22);
    check('ON: a signed placeholder reference and no markup',
        is_array($lazy) && $lazy['html'] === '' && preg_match('/^tpl:501:[0-9a-f]{20}$/', $lazy['src']) === 1, $lazy);
    check('OFF: no placeholder (and, with no Elementor in this harness, no markup either — the point is the src)',
        $eager === null || ($eager['src'] ?? 'x') === '', $eager);
    check('a text row is never deferred, whichever way the setting is set',
        (static function () use ($rm) {
            with(['lazy_cottage_panels' => true]);
            $r = $rm->invoke(null, ['ci_cottage' => 22, 'ci_source' => 'text', 'ci_text' => 'Hello'], 22);
            return is_array($r) && $r['src'] === '' && str_contains($r['html'], 'Hello');
        })());
}

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
