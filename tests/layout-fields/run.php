<?php
/**
 * v0.35.0 — ITEM 3a's TOKEN MAP, from the shipped PHP.
 *
 *     php tests/layout-fields/run.php
 *
 * WHAT THIS PROVES
 *   - Every contact field Rob listed gets the token he listed, and the tokens
 *     are ones the HTML spec actually defines — an invented token is ignored
 *     by every browser, so it would look wired up and offer nothing.
 *   - `mphb_address1` gets NO token, ever, including when a filter on the
 *     guest field names returns that name. Google Places owns that field.
 *   - Guests 2-4 carry an autofill SECTION name, so a browser offers a
 *     different person rather than the account holder again — and the roles
 *     come from the role-keyed accessors, not from the groups' positional
 *     `names` list.
 *   - The Guest 3/4 switch reaches this map: with it off, nothing describes
 *     fields that are not offered.
 *   - The script is enqueued ONLY for the new layout, and only on the
 *     checkout.
 */
define('ABSPATH', __DIR__);
define('DCC_CHECKOUT_VERSION', 'test');
define('DCC_CHECKOUT_FILE', __FILE__);
define('DCC_CHECKOUT_DIR', dirname(__DIR__, 2) . '/dcc-custom-checkout/');
define('DCC_CHECKOUT_URL', 'https://example.test/wp-content/plugins/dcc-custom-checkout/');
define('DAY_IN_SECONDS', 86400);
define('YEAR_IN_SECONDS', 31536000);

$failures = 0;
function check($name, $actual, $expected) {
    global $failures;
    $ok = $actual === $expected;
    if (!$ok) { $failures++; }
    echo ($ok ? 'PASS  ' : 'FAIL  ') . $name . "\n";
    if (!$ok) {
        echo '      expected: ' . var_export($expected, true) . "\n";
        echo '      actual:   ' . var_export($actual, true) . "\n";
    }
}

$GLOBALS['state'] = ['filters' => [], 'option' => [], 'is_page' => true];
$GLOBALS['scripts'] = [];
$GLOBALS['localized'] = [];

function add_filter($hook, $cb, $p = 10, $a = 1) { $GLOBALS['state']['filters'][$hook][] = $cb; return true; }
function add_action($hook, $cb, $p = 10, $a = 1) { return add_filter($hook, $cb, $p, $a); }
function apply_filters($hook, $value, ...$rest) {
    foreach ($GLOBALS['state']['filters'][$hook] ?? [] as $cb) { $value = $cb($value, ...$rest); }
    return $value;
}
function __($t, $d = null) { return $t; }
function _x($t, $c = '', $d = null) { return $t; }
function _n($s, $p, $n, $d = null) { return $n === 1 ? $s : $p; }
function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function esc_url($u) { return (string) $u; }
function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function wp_strip_all_tags($t) { return strip_tags((string) $t); }
function number_format_i18n($n) { return (string) $n; }
function date_i18n($f, $ts) { return gmdate($f, (int) $ts); }
function sanitize_text_field($t) { return trim(strip_tags((string) $t)); }
function sanitize_key($k) { return preg_replace('/[^a-z0-9_\-]/', '', strtolower((string) $k)); }
function wp_unslash($v) { return $v; }
function is_admin() { return false; }
function wp_doing_ajax() { return false; }
function is_ssl() { return true; }
function home_url($p = '') { return 'https://example.test' . $p; }
function add_query_arg($k, $v, $u) { return $u . '?' . $k . '=' . $v; }
function get_option($k, $d = false) { return $GLOBALS['state']['option'][$k] ?? $d; }
function update_option($k, $v) { $GLOBALS['state']['option'][$k] = $v; return true; }
function is_page($id = null) { return (bool) $GLOBALS['state']['is_page']; }
function get_the_title($id) { return ''; }
function get_post_meta($id, $k, $single = false) { return $single ? '' : []; }
function wp_json_encode($v, $f = 0) { return json_encode($v, $f); }
function wp_enqueue_script($h, $src = '', $deps = [], $ver = false, $footer = false) {
    $GLOBALS['scripts'][$h] = ['src' => $src, 'deps' => $deps, 'footer' => $footer];
}
function wp_localize_script($h, $name, $data) { $GLOBALS['localized'][$h] = $data; return true; }

class MPHB_Pages_Stub {
    public function getCheckoutPageId() { return 1399; }
    public function getCheckoutPageUrl() { return 'https://example.test/submit-booking/'; }
}
class MPHB_Settings_Stub { public function pages() { return new MPHB_Settings_Stub2(); } }
class MPHB_Settings_Stub2 extends MPHB_Pages_Stub {}
class MPHB_Stub { public function settings() { return new MPHB_Settings_Stub(); } }
function MPHB() { return new MPHB_Stub(); }

$plugin = dirname(__DIR__, 2) . '/dcc-custom-checkout';
// boat-field is loaded because Layout_Script reads its NAME constant: the
// segmented set's boat field is the one that plugin owns, never retyped here.
// id-files is loaded because Layout_Script reads its META_KEY: the photo-ID
// preview names the same input the protected store does, never a retyped one.
// hero is loaded because Layout_Script's summary card reads Hero's own
// shared dates text: the card and the pill over the photo must word the same
// stay identically, so there is one reader and not two.
foreach (['config', 'layout', 'checkout-request', 'rendered-stay', 'assets', 'boat-field', 'id-files', 'hero', 'layout-script'] as $f) {
    require $plugin . '/includes/class-' . $f . '.php';
}

use DCC_Checkout\Config;
use DCC_Checkout\Layout;
use DCC_Checkout\Layout_Script;

function reset_state(array $settings = []): void {
    $GLOBALS['state']['filters'] = [];
    $GLOBALS['state']['is_page'] = true;
    $GLOBALS['state']['option'] = [
        Config::OPTION => array_merge(['layout_enabled' => 1], $settings),
    ];
    $_GET = [];
    $_POST = [];
    $_COOKIE = [];
    Config::flush_cache();
    Layout::flush();
}

/* ========================================================================== *
 * 1. The tokens Rob listed
 * ========================================================================== */

echo "--- the tokens ---\n";

reset_state();
$map = Layout_Script::autocomplete_map();

check('Guest 1 and contact', [
    'first' => $map['mphb_first_name'] ?? null,
    'last'  => $map['mphb_last_name'] ?? null,
    'phone' => $map['mphb_phone'] ?? null,
    'email' => $map['mphb_email'] ?? null,
], ['first' => 'given-name', 'last' => 'family-name', 'phone' => 'tel', 'email' => 'email']);

check('the address, with the unit field on address-line2', [
    'unit'    => $map['mphb_apartment-units'] ?? null,
    'unitAlt' => $map['mphb_apartment_units'] ?? null,
    'city'    => $map['mphb_city'] ?? null,
    'state'   => $map['mphb_state'] ?? null,
    'zip'     => $map['mphb_zip'] ?? null,
    'country' => $map['mphb_country'] ?? null,
], [
    'unit' => 'address-line2', 'unitAlt' => 'address-line2',
    'city' => 'address-level2', 'state' => 'address-level1',
    'zip' => 'postal-code', 'country' => 'country',
]);

/* GOOGLE PLACES OWNS mphb_address1. */
check('mphb_address1 gets NO token — Google Places is bound to it',
    isset($map[Layout_Script::PLACES_FIELD]), false);
check('… and no token anywhere in the map names address-line1',
    in_array('address-line1', array_values($map), true), false);

/* The guests carry a section name AND the right role. */
check('Guest 2 is described as a different person', [
    'first' => $map['mphb_guest2_first_name'] ?? null,
    'last'  => $map['mphb_guest2_last_name'] ?? null,
    'phone' => $map['mphb_guest2_phone'] ?? null,
], [
    'first' => 'section-guest2 given-name',
    'last'  => 'section-guest2 family-name',
    'phone' => 'section-guest2 tel',
]);
check('Guests 3 and 4 too, each its own section', [
    'g3first' => $map['mphb_guest3_first_name'] ?? null,
    'g3last'  => $map['mphb_guest3_last_name'] ?? null,
    'g4first' => $map['mphb_guest4_first_name'] ?? null,
    'g4last'  => $map['mphb_guest4_last_name'] ?? null,
], [
    'g3first' => 'section-guest3 given-name',
    'g3last'  => 'section-guest3 family-name',
    'g4first' => 'section-guest4 given-name',
    'g4last'  => 'section-guest4 family-name',
]);

/* EVERY TOKEN MUST BE ONE THE SPEC DEFINES. A token outside the list is
   ignored by every browser, so an invented one offers nothing while looking
   wired up. */
$allowed = [
    'given-name', 'family-name', 'tel', 'email', 'address-line1', 'address-line2',
    'address-level1', 'address-level2', 'postal-code', 'country', 'country-name',
    'name', 'organization', 'street-address',
];
$bad = [];
foreach ($map as $field => $token) {
    $parts = explode(' ', $token);
    $last  = (string) array_pop($parts);
    if (!in_array($last, $allowed, true)) {
        $bad[$field] = $token;
    }
    foreach ($parts as $p) {
        if (strpos($p, 'section-') !== 0) { $bad[$field] = $token; }
    }
}
check('every token is one the HTML spec defines (an invented one is ignored)', $bad, []);

/* ========================================================================== *
 * 2. The Guest 3/4 switch reaches the map
 * ========================================================================== */

echo "\n--- the Guest 3/4 switch ---\n";

$GLOBALS['state']['option']['dcc_guest34_enabled'] = '';
Config::flush_cache();
$off = Layout_Script::autocomplete_map();
check('with Guest 3/4 switched off, Guest 2 is still described',
    isset($off['mphb_guest2_first_name']), true);
check('… and Guests 3 and 4 are not described at all',
    [isset($off['mphb_guest3_first_name']), isset($off['mphb_guest4_first_name'])],
    [false, false]);
unset($GLOBALS['state']['option']['dcc_guest34_enabled']);
Config::flush_cache();

/* ========================================================================== *
 * 3. A filter cannot reinstate the Places field
 * ========================================================================== */

echo "\n--- the Places field cannot be reinstated ---\n";

reset_state();
$GLOBALS['state']['filters']['dcc_checkout_guest2_field_names'][] = static function () {
    /* Someone points Guest 2's first name at the Places field. The map must
       still not describe it: the unset runs LAST for exactly this. */
    return ['first_name' => 'mphb_address1', 'last_name' => 'mphb_guest2_last_name', 'phone' => 'mphb_guest2_phone'];
};
$filtered = Layout_Script::autocomplete_map();
check('a filter pointing a guest field at mphb_address1 still leaves it untokened',
    isset($filtered[Layout_Script::PLACES_FIELD]), false);
check('… and the other guest fields are unaffected',
    $filtered['mphb_guest2_last_name'] ?? null, 'section-guest2 family-name');

/* AN UNKNOWN ROLE CANNOT REACH THE MAP AT ALL, and the first version of this
   test did not know that: it filtered a 'nickname' role in and asserted it got
   no token, which held with role_token()'s default deleted — mutation
   lf-unknown-role-guessed SURVIVED on it. The reason is that
   Config::guestN_field_names() REBUILDS its array from the known roles only,
   so a filter cannot introduce one. role_token()'s default is therefore a
   defensive fallback on an unreachable path, kept because '' is the right
   direction to fail in, and no longer pretended to be under test.
   What IS true, and worth pinning, is the normalisation itself. */
reset_state();
$GLOBALS['state']['filters']['dcc_checkout_guest3_field_names'][] = static function () {
    return ['first_name' => 'mphb_guest3_first_name', 'last_name' => 'mphb_guest3_last_name',
            'nickname' => 'mphb_guest3_nickname'];
};
$odd = Layout_Script::autocomplete_map();
$guest3 = array_keys(array_filter($odd, static function (string $token): bool {
    return strpos($token, 'section-guest3') === 0;
}));
sort($guest3);
check('Config normalises a guest\'s field names, so only known roles reach the map',
    $guest3, ['mphb_guest3_first_name', 'mphb_guest3_last_name']);

/* ========================================================================== *
 * 4. Who gets the script
 * ========================================================================== */

/* ========================================================================== *
 * THE BAR'S WORDS, AND ROB'S CASING RULE (v0.35.1, item 6)
 *
 * Title Case is for titles and labels; sentences stay sentence case — and a
 * preposition inside a title stays down. 0.35.0 shipped "Show Me ↑ 1 Of 2".
 *
 * THE BROWSER SUITE HOLDS ITS OWN COPY of these strings, because it has to
 * print a config the way `wp_localize_script` does. A copy is a second
 * implementation, so the two are compared here rather than trusted: this is
 * the only thing standing between a PHP string change and a browser fixture
 * that goes on asserting the old words.
 * ========================================================================== */

echo "\n--- the bar's words ---\n";

$bar = Layout_Script::bar();
check('"of" is lower case inside the Title Case label',
    $bar['showMe'], 'Show Me ↑ %1$s of %2$s');
check('… and no label in the bar Title-Cases a preposition',
    array_values(array_filter($bar, static function ($v) {
        return is_string($v) && preg_match('/\b(Of|And|For|To|The|A|In|On)\b/', $v);
    })), []);

$fixture = (string) file_get_contents(__DIR__ . '/browser.js');
foreach ($bar as $key => $value) {
    if (!is_string($value) || $value === '') { continue; }
    /* The fixture writes the arrow as a \u escape, which is the same
       character; everything else is compared literally. */
    $js = str_replace('↑', '↑', $value);
    check("the browser fixture's $key is the string PHP really sends",
        strpos($fixture, "'" . $js . "'") !== false, true);
}

echo "\n--- who gets it ---\n";

reset_state();
$GLOBALS['scripts'] = [];
(new Layout_Script())->enqueue();
check('the new layout gets layout.js, built, after checkout.js',
    [isset($GLOBALS['scripts'][Layout_Script::HANDLE]),
     basename($GLOBALS['scripts'][Layout_Script::HANDLE]['src'] ?? ''),
     $GLOBALS['scripts'][Layout_Script::HANDLE]['deps'] ?? null,
     $GLOBALS['scripts'][Layout_Script::HANDLE]['footer'] ?? null],
    [true, 'layout.min.js', ['dcc-checkout'], true]);

reset_state(['layout_enabled' => 0]);
$GLOBALS['scripts'] = [];
(new Layout_Script())->enqueue();
check('today\'s checkout does NOT get it — item 3 is behind the gate',
    isset($GLOBALS['scripts'][Layout_Script::HANDLE]), false);

reset_state();
$GLOBALS['state']['is_page'] = false;
$GLOBALS['scripts'] = [];
(new Layout_Script())->enqueue();
check('no other page gets it', isset($GLOBALS['scripts'][Layout_Script::HANDLE]), false);

/* ========================================================================== *
 * 5. Which dropdowns become segmented sets (item 3)
 * ========================================================================== */

echo "\n--- the segmented set (item 3) ---\n";

reset_state();
$seg = Layout_Script::segmented();

check('three fields, in the order the guest meets them',
    array_column($seg, 'name'), ['[adults]', 'mphb_dog_hair', 'mphb_boat']);
check('the guest chooser is matched by SUFFIX — MotoPress numbers it per room',
    array_column($seg, 'match'), ['suffix', 'exact', 'exact']);

/* THE NAMES ARE NOT RETYPED. The coat field's name comes from Config (the
   same one the pet backstop and the gating read) and the boat field's from
   the Boat field's own contract, so a rename moves the match with it. */
$GLOBALS['state']['filters']['dcc_checkout_dog_field_names'][] = static function (array $n): array {
    $n['hair'] = 'mphb_dog_coat_renamed';
    return $n;
};
check('a renamed coat field moves the match with it',
    array_column(Layout_Script::segmented(), 'name'),
    ['[adults]', 'mphb_dog_coat_renamed', 'mphb_boat']);
$GLOBALS['state']['filters']['dcc_checkout_dog_field_names'] = [];

check('the boat field is the one Boat_Field owns',
    in_array('mphb_' . \DCC_Checkout\Boat_Field::NAME, array_column($seg, 'name'), true), true);

/* THE DOG QUESTION IS NOT IN THE LIST. checkout.js already builds it as a
   real fieldset of Yes/No radios — the control that applies the pet fee — so
   item 3 styles it and never rebuilds it. */
check('the dog Yes/No is NOT segmented from here',
    in_array('dcc_checkout_dog', array_column($seg, 'name'), true), false);
/* And nor is Dog Size: Rob's picture 10 makes it a single promise tick box. */
$dog = Config::dog_field_names();
check('Dog Size is not segmented either — it is the promise tick box',
    in_array($dog['size'], array_column($seg, 'name'), true), false);

/* ========================================================================== *
 * 6. Items 4 and 5 — the coupon and the photo-ID preview
 * ========================================================================== */

echo "\n--- the coupon and the photo ID ---\n";

reset_state();
$cp = Layout_Script::coupon();
check('the coupon field is MotoPress\'s own name', $cp['field'], 'mphb_coupon_code');
check('and the link says Rob\'s words', $cp['reveal'], 'Have A Coupon Code?');

$up = Layout_Script::upload();
/* THE FIELD NAME IS Id_Files', NOT RETYPED: the preview and the protected
   store must never disagree about which input holds the photo. */
check('the photo-ID field is the one Id_Files owns',
    $up['field'], \DCC_Checkout\Id_Files::META_KEY);
check('the card\'s words are translatable, and there is a word for a file that cannot be drawn',
    [$up['ready'], $up['change'], $up['document']], ['Ready', 'Change', 'Document']);
check('the size units are the site\'s own words, so a translation can change them',
    $up['units'], ['bytes', 'KB', 'MB']);

/* 0.29.0: nothing localized at the top level may be a boolean. */
reset_state();
$bools = [];
foreach (Layout_Script::config() as $k => $v) {
    if (is_bool($v)) { $bools[] = $k; }
}
check('no top-level value handed to the browser is a boolean (0.29.0)', $bools, []);

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);
