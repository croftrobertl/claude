<?php
/**
 * v0.35.0 — THE COTTAGE PHOTO AT THE TOP OF THE CHECKOUT (item 1, server side).
 *
 *     php tests/hero/run.php
 *
 * WHAT THIS PROVES
 *   - The theme's header image is replaced ONLY when the new layout is active
 *     AND this is the checkout page. Everywhere else — and for every guest who
 *     is not previewing — Bravada draws the canal banner exactly as today.
 *   - Which registered size each of the eight cottages is served, by measured
 *     width, never the megabyte original. The widths are the Director's own
 *     read of the eight featured images (2026-10-22).
 *   - The overlay says only what the cottage's own data says: the name and
 *     number from the room type's title, the dates from the submission. It
 *     invents no "Studio · 1 Queen".
 *   - A cottage with no featured image changes nothing: no filter, no preload,
 *     no overlay, and the canal banner stays.
 *
 * WHAT IT DOES NOT PROVE
 *   - That `cryout_headerimage_hook` at priority 100 really lands the overlay
 *     INSIDE `#header-image-main-inside`. That is Bravada's own markup and is
 *     read from the Director's report, not from the theme on this machine. The
 *     browser suite renders the markup he read; whether live matches is his
 *     check. If it does not, the overlay lands next to the header rather than
 *     over it — ugly, not broken.
 *   - The bytes each cottage's chosen file weighs. That needs the uploads
 *     directory; the check list asks for it over WP-CLI.
 *
 * `wp_get_attachment_image_src()` is MODELLED here, from WordPress's own rule:
 * a registered size is a BOUNDING BOX, and an image too small for it comes
 * back as the full file. That model is what makes the portrait cottage
 * interesting — `large` gives it 768 wide, not 1024.
 */
define('ABSPATH', __DIR__);
define('DCC_CHECKOUT_VERSION', 'test');
define('DCC_CHECKOUT_FILE', __FILE__);
define('DCC_CHECKOUT_DIR', dirname(__DIR__, 2) . '/dcc-custom-checkout/');
define('DCC_CHECKOUT_URL', 'https://example.test/wp-content/plugins/dcc-custom-checkout/');
define('YEAR_IN_SECONDS', 31536000);
define('MINUTE_IN_SECONDS', 60);
define('DAY_IN_SECONDS', 86400);

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

/* ========================================================================== *
 * WordPress / MotoPress stand-ins
 * ========================================================================== */

$GLOBALS['state'] = [
    'filters'   => [],   // hook => [[cb, priority], …] recorded by add_filter/add_action
    'option'    => [],
    'is_page'   => true,
    'thumbs'    => [],   // post id => attachment id
    'sizes'     => [],   // attachment id => [w, h] of the FULL file
    'titles'    => [],
    'post'      => [],   // the checkout submission
    'files'     => [],   // attachment id => the original's path on disk
    'on_disk'   => [],   // the paths file_exists() should say yes to
    'removed'   => [],   // what remove_action() was asked to remove
];

function add_filter($hook, $cb, $priority = 10, $args = 1) {
    $GLOBALS['state']['filters'][$hook][] = [$cb, $priority];
    return true;
}
function remove_action($hook, $cb, $priority = 10) {
    $GLOBALS['state']['removed'][] = [$hook, $cb, $priority];
    foreach ($GLOBALS['state']['filters'][$hook] ?? [] as $i => $row) {
        if ($row[0] === $cb && (int) $row[1] === (int) $priority) {
            unset($GLOBALS['state']['filters'][$hook][$i]);
        }
    }
    return true;
}
function get_attached_file($id) { return $GLOBALS['state']['files'][(int) $id] ?? ''; }
function add_action($hook, $cb, $priority = 10, $args = 1) {
    return add_filter($hook, $cb, $priority, $args);
}
function has_our_hook(string $hook): bool {
    return !empty($GLOBALS['state']['filters'][$hook]);
}
function apply_filters($hook, $value, ...$rest) {
    foreach ($GLOBALS['state']['filters'][$hook] ?? [] as [$cb, $priority]) {
        $value = $cb($value, ...$rest);
    }
    return $value;
}
function do_action($hook, ...$args) {
    foreach ($GLOBALS['state']['filters'][$hook] ?? [] as [$cb, $priority]) {
        $cb(...$args);
    }
}
function __($t, $d = null) { return $t; }
function _x($t, $c = '', $d = null) { return $t; }
function _n($s, $p, $n, $d = null) { return $n === 1 ? $s : $p; }
function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function esc_url($u) { return (string) $u; }
function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function wp_strip_all_tags($t) { return strip_tags((string) $t); }
function number_format_i18n($n) { return (string) $n; }
function date_i18n($format, $ts) { return gmdate($format, (int) $ts); }
function sanitize_key($k) { return preg_replace('/[^a-z0-9_\-]/', '', strtolower((string) $k)); }
function sanitize_text_field($t) { return trim(strip_tags((string) $t)); }
function wp_unslash($v) { return $v; }
function is_admin() { return false; }
function wp_doing_ajax() { return false; }
function is_ssl() { return true; }
function home_url($p = '') { return 'https://example.test' . $p; }
function add_query_arg($k, $v, $url) { return $url . '?' . $k . '=' . $v; }
function get_option($k, $d = false) { return $GLOBALS['state']['option'][$k] ?? $d; }
function update_option($k, $v) { $GLOBALS['state']['option'][$k] = $v; return true; }
function is_page($id = null) { return (bool) $GLOBALS['state']['is_page']; }
function get_the_title($id) { return $GLOBALS['state']['titles'][(int) $id] ?? ''; }
function get_post_thumbnail_id($id) { return $GLOBALS['state']['thumbs'][(int) $id] ?? 0; }
function get_post_meta($id, $key, $single = false) { return $single ? '' : []; }
function wp_json_encode($v, $f = 0) { return json_encode($v, $f); }

/**
 * WordPress's rule, modelled: a registered size is a bounding box, and an
 * image smaller than the box is served whole.
 */
function wp_get_attachment_image_src($attachment, $size = 'thumbnail') {
    $full = $GLOBALS['state']['sizes'][(int) $attachment] ?? null;
    if ($full === null) {
        return false;
    }
    [$fw, $fh] = $full;
    $boxes = [
        'medium_large' => [768, 0],      // width only, no height constraint
        'large'        => [1024, 1024],
        '1536x1536'    => [1536, 1536],
        '2048x2048'    => [2048, 2048],
    ];
    if ($size === 'full' || !isset($boxes[$size])) {
        return ["https://example.test/u/$attachment-full.jpg", $fw, $fh];
    }
    [$bw, $bh] = $boxes[$size];
    $ratio = $bh > 0 ? min($bw / $fw, $bh / $fh) : $bw / $fw;
    if ($ratio >= 1) {
        // Too small for this size: WordPress serves the full file.
        return ["https://example.test/u/$attachment-full.jpg", $fw, $fh];
    }
    $w = (int) round($fw * $ratio);
    $h = (int) round($fh * $ratio);
    return ["https://example.test/u/$attachment-{$w}x{$h}.jpg", $w, $h];
}

/**
 * Just enough MotoPress for Assets::is_checkout_page(): the configured
 * checkout page id. The page itself is the `is_page` toggle above.
 */
class MPHB_Pages_Stub {
    public function getCheckoutPageId() { return 1399; }
    public function getCheckoutPageUrl() { return 'https://example.test/submit-booking/'; }
}
class MPHB_Settings_Stub {
    public function pages() { return new MPHB_Pages_Stub(); }
}
class MPHB_Stub {
    public function settings() { return new MPHB_Settings_Stub(); }
}
function MPHB() { return new MPHB_Stub(); }

/* The namespaced file_exists() stand-in — see tests/hero/shim.php for why it
   is a file of its own. */
require __DIR__ . '/shim.php';

$plugin = dirname(__DIR__, 2) . '/dcc-custom-checkout';
foreach (['config', 'layout', 'checkout-request', 'assets', 'hero'] as $file) {
    require $plugin . '/includes/class-' . $file . '.php';
}

use DCC_Checkout\Assets;
use DCC_Checkout\Config;
use DCC_Checkout\Hero;
use DCC_Checkout\Layout;

/** Reset the world between cases. */
function reset_state(array $over = []): void {
    $GLOBALS['state']['filters'] = [];
    $GLOBALS['state']['is_page'] = $over['is_page'] ?? true;
    $GLOBALS['state']['option'] = [
        Config::OPTION => array_merge(
            ['layout_enabled' => 1, 'layout_preview_key' => str_repeat('a', 32)],
            $over['settings'] ?? []
        ),
    ];
    $_GET = [];
    $_POST = $over['post'] ?? [];
    $_COOKIE = [];
    Config::flush_cache();
    Layout::flush();
}

/** The eight cottages' featured images, as the Director read them. */
const COTTAGES = [
    // room type => [attachment, full width, full height, label]
    1071 => [2201,  960,  720, 'Cottage 22'],
    1069 => [2202, 2560, 1920, 'Cottage 23'],
    1067 => [2203, 2049, 1536, 'Cottage 31'],
    1065 => [2204, 2560, 2136, 'Cottage 32'],
    1604 => [2205, 2560, 1920, 'Cottage 33'],
    1607 => [2206, 2000, 1500, 'Cottage 34'],
    1740 => [2207, 2500, 1875, 'Cottage 35'],
    1742 => [2208, 1500, 2000, 'Cottage 36'],
];

foreach (COTTAGES as $type => [$att, $w, $h, $label]) {
    $GLOBALS['state']['thumbs'][$type] = $att;
    $GLOBALS['state']['sizes'][$att]   = [$w, $h];
    $GLOBALS['state']['titles'][$type] = $label . ': Test Cottage';
    $GLOBALS['state']['files'][$att]   = "/uploads/2026/01/$att-full.jpg";
}

/** A checkout submission for one cottage. */
function submission(int $type, string $in = '2026-11-16', string $out = '2026-11-19'): array {
    return [
        'mphb_room_type_id'    => (string) $type,
        'mphb_check_in_date'   => $in,
        'mphb_check_out_date'  => $out,
        'mphb_rooms_details'   => [(string) $type => '1'],
        'mphb_is_direct_booking' => '1',
    ];
}

/* ========================================================================== *
 * 1. The size chosen for each cottage
 * ========================================================================== */

echo "--- which file each cottage is served ---\n";

$expected = [
    // The narrowest registered size at least 1024 wide — or, for Cottage 22
    // whose original is only 960 wide, the widest there is.
    'Cottage 22' => ['size' => 'large',     'width' => 960],   // full, 960x720
    'Cottage 23' => ['size' => 'large',     'width' => 1024],
    'Cottage 31' => ['size' => 'large',     'width' => 1024],
    'Cottage 32' => ['size' => 'large',     'width' => 1024],
    'Cottage 33' => ['size' => 'large',     'width' => 1024],
    'Cottage 34' => ['size' => 'large',     'width' => 1024],
    'Cottage 35' => ['size' => 'large',     'width' => 1024],
    // PORTRAIT. `large` is a 1024x1024 BOX, so it would give 768 wide — too
    // soft for a full-bleed band. This is the case the width rule exists for.
    'Cottage 36' => ['size' => '1536x1536', 'width' => 1152],
];

$GLOBALS['state']['on_disk'] = []; // no twins yet: the chooser alone
foreach (COTTAGES as $type => [$att, $w, $h, $label]) {
    $chosen = Hero::photo($type);
    check("$label ({$w}x{$h}) is served the right size",
        ['size' => $chosen['size'], 'width' => $chosen['width']],
        $expected[$label]);
    check("$label is never served the full original when a smaller one exists",
        $chosen['width'] <= $w, true);
}

check('a cottage with no featured image yields nothing',
    Hero::photo(9999), ['url' => '', 'width' => 0, 'height' => 0, 'size' => '']);
check('and so does a room type id of 0',
    Hero::photo(0)['url'], '');

/* ========================================================================== *
 * 1b. THE WEBP TWIN (Director, live 2026-10-22)
 *
 * Every sized file on this site has a `.webp` beside it with the extension
 * SWAPPED, served as 200 image/webp; the `…jpg.webp` form 404s. The chosen URL
 * goes into a CSS background and a preload link, and SpeedyCache's rewriting
 * only touches <img>, so nothing else on the page would ever serve the twin
 * here. It is 128 KB → 53 KB on Cottage 34 and 236 KB → 86 KB on portrait 36,
 * on the one request that blocks the top of the page.
 * ========================================================================== */

echo "\n--- the WebP twin ---\n";

/* Cottage 34's chosen file is 2206-1024x768.jpg; put its twin on disk. */
$jpeg = Hero::photo(1607)['url'];
check('without a twin on disk, the JPEG is served (the guard)',
    substr($jpeg, -4), '.jpg');

$GLOBALS['state']['on_disk'] = ['/uploads/2026/01/2206-1024x768.webp'];
check('with the twin on disk, the WebP is served instead',
    Hero::photo(1607)['url'], 'https://example.test/u/2206-1024x768.webp');
check('… the extension is SWAPPED, never appended (the .jpg.webp form 404s)',
    strpos(Hero::photo(1607)['url'], '.jpg') === false, true);

/* And the preload asks for the file that is actually served. */
reset_state(['post' => submission(1607)]);
$GLOBALS['state']['on_disk'] = ['/uploads/2026/01/2206-1024x768.webp'];
$hero = new Hero();
$hero->maybe_hook();
ob_start();
do_action('wp_head');
$head = (string) ob_get_clean();
check('the preload asks for the WebP, not the JPEG',
    strpos($head, '2206-1024x768.webp') !== false && strpos($head, '.jpg') === false, true);

/* A cottage whose twin is missing keeps its JPEG — one missing file must not
   make a broken header. */
$GLOBALS['state']['on_disk'] = ['/uploads/2026/01/2206-1024x768.webp'];
check('a cottage with no twin on disk keeps its JPEG',
    substr(Hero::photo(1742)['url'], -4), '.jpg');
check('… while the one that has a twin still gets it',
    substr(Hero::photo(1607)['url'], -5), '.webp');

/* The twin is only ever swapped for a file this knows how to swap. */
check('a URL that is already a webp is left alone',
    Hero::prefer_webp(2206, 'https://example.test/u/2206-1024x768.webp'),
    'https://example.test/u/2206-1024x768.webp');
check('an unknown extension is left alone',
    Hero::prefer_webp(2206, 'https://example.test/u/2206.svg'),
    'https://example.test/u/2206.svg');
check('an attachment whose original path cannot be read is left alone',
    Hero::prefer_webp(9999, 'https://example.test/u/x-1024x768.jpg'),
    'https://example.test/u/x-1024x768.jpg');

$GLOBALS['state']['on_disk'] = [];

/* ========================================================================== *
 * 2. The gate: who gets the cottage photo
 * ========================================================================== */

echo "\n--- the gate ---\n";

$hook_state = static function (): array {
    return [
        'url'     => has_our_hook(Hero::URL_FILTER),
        'preload' => has_our_hook('wp_head'),
        'overlay' => has_our_hook(Hero::PRINT_HOOK),
    ];
};

reset_state(['post' => submission(1607)]);
(new Hero())->maybe_hook();
check('the layout on, on the checkout: the header image is filtered',
    $hook_state(), ['url' => true, 'preload' => true, 'overlay' => true]);

reset_state(['post' => submission(1607), 'settings' => ['layout_enabled' => 0]]);
(new Hero())->maybe_hook();
check('the layout OFF: nothing is hooked, the canal banner stays',
    $hook_state(), ['url' => false, 'preload' => false, 'overlay' => false]);

$GLOBALS['state']['removed'] = [];
reset_state(['post' => submission(1607), 'settings' => ['layout_enabled' => 0]]);
$GLOBALS['state']['removed'] = [];
(new Hero())->maybe_hook();
check('with the layout OFF, the theme keeps its own page title',
    $GLOBALS['state']['removed'], []);

reset_state(['post' => submission(1607), 'is_page' => false]);
(new Hero())->maybe_hook();
check('not the checkout page: nothing is hooked',
    $hook_state(), ['url' => false, 'preload' => false, 'overlay' => false]);

reset_state(['post' => submission(9999)]);
(new Hero())->maybe_hook();
check('a cottage with no photo: nothing is hooked',
    $hook_state(), ['url' => false, 'preload' => false, 'overlay' => false]);

/* The filter itself, driven directly. */
reset_state(['post' => submission(1607)]);
$hero = new Hero();
$hero->maybe_hook();
$banner = 'https://example.test/u/DCC-Photos-Canal-3-graded-1080.webp';
$served = apply_filters(Hero::URL_FILTER, $banner);
check('the cottage photo replaces the canal banner',
    $served === $banner, false);
check('… and it is the chosen size, not the original',
    $served, Hero::photo(1607)['url']);

/* The preload, which is how a CSS background gets fetchpriority. */
ob_start();
do_action('wp_head');
$head = (string) ob_get_clean();
check('a high-priority preload is printed for that same file',
    strpos($head, '<link rel="preload" as="image" href="' . Hero::photo(1607)['url'] . '" fetchpriority="high">') !== false,
    true);

/* ========================================================================== *
 * 3. The overlay says only what the data says
 * ========================================================================== */

echo "\n--- the overlay ---\n";

reset_state(['post' => submission(1607)]);
$hero = new Hero();
$hero->maybe_hook();
ob_start();
do_action(Hero::PRINT_HOOK);
$overlay = (string) ob_get_clean();

check('the cottage name is printed',
    strpos($overlay, '>Test Cottage<') !== false, true);
check('the cottage number is printed',
    strpos($overlay, '>Cottage 34<') !== false, true);
check('the dates and the night count are printed',
    strpos($overlay, 'Mon, Nov 16 → Thu, Nov 19 · 3 Nights') !== false, true);
/* THE THEME'S OWN TITLE IS REMOVED, not hidden (Director, live: it is on the
   same hook at the same priority and prints "Submit Booking" over the photo).
   Removing the action is what makes the page have ONE heading rather than a
   hidden wrong one, which is still a heading to a screen reader. */
check('the theme\'s page title is removed from the hook',
    in_array([Hero::PRINT_HOOK, Hero::THEME_TITLE, Hero::THEME_TITLE_PRIORITY],
        $GLOBALS['state']['removed'], true), true);

/* AND THE COTTAGE NAME IS THE PAGE'S SINGLE <h1>. With the theme's title gone
   the page would otherwise have no main heading at all. */
check('the cottage name is an <h1>',
    (bool) preg_match('/<h1 class="dcc_hero-overlay__name">Test Cottage<\/h1>/', $overlay), true);
check('… and the overlay contains exactly one of them',
    preg_match_all('/<h1[\s>]/', $overlay), 1);
check('… and nothing else in the overlay is a heading',
    (bool) preg_match('/<h[2-6][\s>]/', $overlay), false);

check('NOTHING ELSE is put on the photo — no invented "Studio · 1 Queen"',
    (bool) preg_match('/Studio|Queen|guest|sleeps/i', $overlay), false);
check('and nothing animated or drawn is added (Rob, 2026-10-22)',
    (bool) preg_match('/<svg|<canvas|dcc-hl|dcc-gh|DCC_SUN/i', $overlay), false);

/* One night, so the plural is exercised rather than assumed. */
reset_state(['post' => submission(1607, '2026-11-16', '2026-11-17')]);
$hero = new Hero();
check('one night reads "1 Night"',
    strpos($hero->dates_pill(), '· 1 Night') !== false, true);

/* A title without a number: shown whole, with no number line. */
$GLOBALS['state']['titles'][1607] = 'The Boathouse';
reset_state(['post' => submission(1607)]);
$hero = new Hero();
check('a title with no "Cottage NN:" is shown whole', $hero->cottage_name(), 'The Boathouse');
check('… and no number line is invented', $hero->cottage_label(), '');
$GLOBALS['state']['titles'][1607] = 'Cottage 34: Test Cottage';

/* Dates that cannot be read: the pill is simply absent. */
reset_state(['post' => ['mphb_room_type_id' => '1607']]);
$hero = new Hero();
check('no readable dates: no pill rather than a guess', $hero->dates_pill(), '');
$hero->maybe_hook();
ob_start();
do_action(Hero::PRINT_HOOK);
$overlay = (string) ob_get_clean();
check('… and the name is still shown', strpos($overlay, '>Test Cottage<') !== false, true);
check('… with no empty pill element',
    strpos($overlay, 'dcc_hero-overlay__dates') !== false, false);

/* ========================================================================== *
 * 4. The marker class and the stylesheet follow the same gate
 * ========================================================================== */

echo "\n--- the marker class ---\n";

reset_state();
check('the new layout marks <body>', (new Assets())->body_class(['page']), ['page', 'dcc_layout']);

reset_state(['settings' => ['layout_enabled' => 0]]);
check('today\'s checkout does not', (new Assets())->body_class(['page']), ['page']);

reset_state(['is_page' => false]);
check('and no other page does', (new Assets())->body_class(['page']), ['page']);

/* ========================================================================== *
 * 5. The stylesheet's own promises, read from the file
 * ========================================================================== */

echo "\n--- checkout-layout.css ---\n";

$css = (string) file_get_contents($plugin . '/assets/checkout-layout.css');

check('the lip is a pseudo-element, never a child div (the mu-plugin would stretch one to full height)',
    strpos($css, '#header-image-main-inside::after') !== false, true);
check('the lip is 24px tall', (bool) preg_match('/--dcc-lip-height:\s*24px/', $css), true);
/* EVERY RULE IS KEYED ON THE MARKER CLASS, so no rule in this stylesheet can
   match a page that is not the new layout. The test is that the class APPEARS
   in the selector, not that the selector starts with it: `body.dcc_layout`
   carries the same class on the marked element itself, which is the only way
   to write a rule FOR the body (the bar's page padding needs one). A regex
   anchored on `.dcc_layout` at the start rejected that, which is how this
   check first read a correct rule as a violation. */
$selectors = [];
foreach (preg_split('/\R/', $css) as $line) {
    if (preg_match('/^(?![\s\/*}@\-])(\S.*?)\s*\{\s*$/', $line, $m)) {
        $selectors[] = $m[1];
    }
}
check('the stylesheet really has rules to check (the guard)', count($selectors) > 20, true);
/* THE CLASS, NOT THE SUBSTRING. `.dcc_layout-bar__label` CONTAINS the text
   ".dcc_layout", so a substring test reported an unmarked rule as marked —
   mutation css-unmarked-rule stripped the marker from exactly such a selector
   and SURVIVED. The class has to end where a class name ends. */
$unmarked = array_values(array_filter($selectors, static function (string $sel): bool {
    return !preg_match('/\.dcc_layout(?![\w-])/', $sel);
}));
check('every rule is keyed on the marker class, so today\'s checkout cannot be touched',
    $unmarked, []);

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);
