<?php
/**
 * Prints the guest-count script's config exactly as the shipped
 * Guest_Count_Script::config() builds it, after WordPress's own localize step
 * (every top-level scalar cast to a string — WP_Scripts::localize(), the loop
 * copied in tests/admin-layout/config.php), as JSON.
 *
 *     php tests/recalc/config.php [admin|guest]
 *
 * The suite reads this rather than keeping its own copy, so a renamed key or
 * a changed message in the PHP changes what the browser is given.
 */
define('ABSPATH', __DIR__);

$GLOBALS['opt'] = ['dcc_checkout_settings' => []];
function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['opt']) ? $GLOBALS['opt'][$k] : $d; }
function apply_filters($hook, $value) { return $value; }
function add_action() {} function add_filter() {}
function __($t, $d = null) { return $t; }
function current_user_can($cap) { return ($GLOBALS['argv'][1] ?? '') === 'admin'; }

require __DIR__ . '/../../dcc-custom-checkout/includes/class-config.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-guest-count-script.php';

$out = \DCC_Checkout\Guest_Count_Script::config();
foreach ($out as $key => $value) {
    if (!is_scalar($value)) {
        continue;
    }
    $out[$key] = html_entity_decode((string) $value, ENT_QUOTES, 'UTF-8');
}
echo json_encode($out, JSON_UNESCAPED_UNICODE);
