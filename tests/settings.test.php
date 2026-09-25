<?php
/**
 * Plugin settings: defaults reproduce today, an upgrade cannot switch a new
 * feature off, and saving cannot silently clear what the form did not post.
 *
 *   php tests/settings.test.php
 */
define('ABSPATH', '/tmp/');
define('DCCGG_VERSION', '0.21.0');

$GLOBALS['options'] = [];
$GLOBALS['did']     = ['init' => 1];
function __($s, $d = null) { return $s; }
function esc_html__($s, $d = null) { return $s; }
function esc_attr__($s, $d = null) { return $s; }
function esc_url_raw($s) { $s = trim((string) $s); return preg_match('~^https?://~i', $s) ? $s : ''; }
function sanitize_text_field($s) { return trim(strip_tags((string) $s)); }
function get_option($k, $d = false) { return $GLOBALS['options'][$k] ?? $d; }
function update_option($k, $v, $a = null) { $GLOBALS['options'][$k] = $v; return true; }
function did_action($h) { return $GLOBALS['did'][$h] ?? 0; }
require __DIR__ . '/../dcc-guest-guide/includes/class-settings.php';

$pass = 0; $fail = 0; $failures = [];
function check($name, $cond, $detail = '') {
    global $pass, $fail, $failures;
    if ($cond) { $pass++; echo "  ✓ $name\n"; }
    else { $fail++; $failures[] = $name . ($detail ? " — $detail" : ''); echo "  ✗ $name" . ($detail ? " — $detail" : '') . "\n"; }
}
$reset = static function (array $stored = null) {
    $GLOBALS['options'] = [];
    if ($stored !== null) { $GLOBALS['options'][\DCCGG\Settings::OPTION] = $stored; }
    \DCCGG\Settings::flush();
};

echo "A. Defaults reproduce current behaviour\n";
$reset();
$d = \DCCGG\Settings::defaults();
// Each default is the behaviour the plugin shipped with BEFORE the setting
// existed. If one of these flips, a fresh install changes behaviour silently.
$expected = [
    'auto_hide_secrets'   => true,    // v0.13.0 re-mask on close / section change
    'copy_confirm_ms'     => 1500,    // flashCopied() timeout
    'log_search_misses'   => true,    // v0.12.1 failed-search log
    'search_miss_keep'    => 50,      // the panel slices 50
    'public_cta_label'    => '',      // widget default wins when empty
    'public_cta_url'      => '',
    'inline_search_index' => true,    // v0.9.7.16 inlined the index
    'report_rate_limit'   => 3,       // handle_report_problem: 3 per 15 min
    'secret_reveal'       => 'fetch', // v0.19.0
];
foreach ($expected as $k => $v) {
    check("default $k reproduces today's behaviour", array_key_exists($k, $d) && $d[$k] === $v,
        var_export($d[$k] ?? null, true) . ' expected ' . var_export($v, true));
}
check('no setting exists without a default', count($d) === count(\DCCGG\Settings::fields()));

echo "\nB. An upgrade cannot leave a new feature switched off\n";
// The Seasons 4.0.0 trap: a row stored by an older version has none of the
// new keys. Merging on READ means the new default is live immediately.
$reset(['_version' => '0.20.0', 'copy_confirm_ms' => 900]);
$all = \DCCGG\Settings::all();
check('a key the stored row has never heard of takes its default',
    $all['secret_reveal'] === 'fetch');
check('and the value the owner did set survives untouched',
    $all['copy_confirm_ms'] === 900);
check('the row is re-saved so the database describes current behaviour too',
    (string) ($GLOBALS['options'][\DCCGG\Settings::OPTION]['_version'] ?? '') === '0.21.0');
// Reading must not invent keys that are not in the schema.
$reset(['_version' => '0.21.0', 'bogus_key' => 'x']);
check('a stale key is dropped rather than carried forever',
    !array_key_exists('bogus_key', \DCCGG\Settings::all()));

echo "\nC. Saving: absence means different things per type\n";
// An unchecked checkbox posts NOTHING. Iterating the POST would leave every
// unchecked box at its old value and make Save look broken; iterating the
// SCHEMA is what makes absence mean "off" for booleans only.
$reset();
$saved = \DCCGG\Settings::sanitize(['copy_confirm_ms' => '1200']);
check('an absent checkbox saves as OFF, not as its default',
    $saved['auto_hide_secrets'] === false && $saved['log_search_misses'] === false
    && $saved['inline_search_index'] === false);
check('a present checkbox saves as ON', \DCCGG\Settings::sanitize(['auto_hide_secrets' => '1'])['auto_hide_secrets'] === true);
check('an absent number keeps its default rather than becoming 0',
    $saved['report_rate_limit'] === 3);
check('a submitted number is kept', $saved['copy_confirm_ms'] === 1200);

echo "\nD. Sanitisation rejects bad input\n";
foreach ([['copy_confirm_ms', '999999', 6000], ['copy_confirm_ms', '-5', 400],
          ['report_rate_limit', '0', 1], ['report_rate_limit', '9999', 20],
          ['search_miss_keep', 'abc', 5]] as [$k, $in, $want]) {
    check("$k=\"$in\" is clamped to $want", \DCCGG\Settings::sanitize([$k => $in])[$k] === $want,
        var_export(\DCCGG\Settings::sanitize([$k => $in])[$k], true));
}
check('a select only accepts one of its own options',
    \DCCGG\Settings::sanitize(['secret_reveal' => 'inline'])['secret_reveal'] === 'inline'
    && \DCCGG\Settings::sanitize(['secret_reveal' => 'javascript:alert(1)'])['secret_reveal'] === 'fetch');
check('a url field rejects a non-url',
    \DCCGG\Settings::sanitize(['public_cta_url' => 'javascript:alert(1)'])['public_cta_url'] === ''
    && \DCCGG\Settings::sanitize(['public_cta_url' => 'https://x.test/a'])['public_cta_url'] === 'https://x.test/a');
check('a text field is stripped of markup',
    \DCCGG\Settings::sanitize(['public_cta_label' => '<script>x</script>Book'])['public_cta_label'] === 'xBook');
check('every save stamps the version', \DCCGG\Settings::sanitize([])['_version'] === '0.21.0');

echo "\n$pass passed, $fail failed\n";
if ($fail) { echo "Failures:\n"; foreach ($failures as $f) { echo "  - $f\n"; } exit(1); }
