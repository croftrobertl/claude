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
    'post_type'   => [], // post id => post type, for the cookie validator
    'post_status' => [], // post id => status
    'in_loop'     => false,
    'is_feed'     => false,
    'no_meta'     => [], // attachment id => true to model a missing metadata row
    'uploads'     => ['basedir' => '/uploads', 'baseurl' => 'https://example.test/u'],
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
function get_post_type($id) { return $GLOBALS['state']['post_type'][(int) $id] ?? false; }
function get_post_status($id) { return $GLOBALS['state']['post_status'][(int) $id] ?? false; }
function in_the_loop() { return (bool) ($GLOBALS['state']['in_loop'] ?? false); }
function is_feed() { return (bool) ($GLOBALS['state']['is_feed'] ?? false); }
function wp_get_upload_dir() { return $GLOBALS['state']['uploads']; }

/**
 * THE ATTACHMENT'S OWN METADATA, MODELLED FROM WORDPRESS'S RULE — and this is
 * the row v0.35.1 reads instead of `wp_get_attachment_image_src()`.
 *
 * Two behaviours matter and both are WordPress's own:
 *   - a sized file is named `<stem>-<w>x<h>.<ext>` beside the original;
 *   - a size whose BOX is not smaller than the original is never generated, so
 *     its key is simply absent from `sizes` (which is how Cottage 22, whose
 *     original is 960 wide, has no `large`).
 */
function wp_get_attachment_metadata($id, $unfiltered = false) {
    $id = (int) $id;
    if (!empty($GLOBALS['state']['no_meta'][$id])) {
        return false;
    }
    $full = $GLOBALS['state']['sizes'][$id] ?? null;
    $path = $GLOBALS['state']['files'][$id] ?? '';
    if ($full === null || $path === '') {
        return false;
    }
    [$fw, $fh] = $full;
    $name = basename($path);
    $stem = (string) preg_replace('/\.jpg$/', '', $name);
    $sizes = [];
    foreach (test_size_boxes() as $size => [$bw, $bh]) {
        $ratio = $bh > 0 ? min($bw / $fw, $bh / $fh) : $bw / $fw;
        if ($ratio >= 1) {
            continue; // WordPress does not upscale, so this size does not exist
        }
        $w = (int) round($fw * $ratio);
        $h = (int) round($fh * $ratio);
        $sizes[$size] = ['file' => "$stem-{$w}x{$h}.jpg", 'width' => $w, 'height' => $h];
    }
    return [
        'width'  => $fw,
        'height' => $fh,
        'file'   => '2026/01/' . $name,
        'sizes'  => $sizes,
    ];
}

function test_size_boxes(): array {
    return [
        'medium'       => [300, 300],
        'medium_large' => [768, 0],      // width only, no height constraint
        'large'        => [1024, 1024],
        '1536x1536'    => [1536, 1536],
        '2048x2048'    => [2048, 2048],
    ];
}

/**
 * `wp_get_attachment_image_src()` AS THIS SITE REALLY ANSWERS IT — WHICH IS
 * NOT WHAT WORDPRESS WOULD (Director's live measurement, 2026-10-23).
 *
 * Jetpack's Site Accelerator filters `image_downsize`, so what comes back is
 * the ORIGINAL file's name on another host with the size in a QUERY STRING:
 *
 *     https://i0.wp.com/example.test/u/2026/01/Cottage-34-Photos.jpg?fit=1024,768
 *
 * THE 0.35.0 FIXTURE RETURNED A LOCAL `…-1024x768.jpg` INSTEAD, and that is
 * why the whole twin lookup was green while being dead code on live:
 * `/\.(jpe?g|png)$/` cannot match a URL ending `?fit=1024,768`, and Photon's
 * own re-encode (76 KB) was being served where the twin is 53 KB. The v0.9.0
 * rule again — a plausible fixture is missing exactly what nobody thought to
 * put in it.
 *
 * The bounding-box rule still decides the DIMENSIONS, because Photon's
 * `?fit=` carries them.
 */
function wp_get_attachment_image_src($attachment, $size = 'thumbnail') {
    $full = $GLOBALS['state']['sizes'][(int) $attachment] ?? null;
    $path = $GLOBALS['state']['files'][(int) $attachment] ?? '';
    if ($full === null || $path === '') {
        return false;
    }
    [$fw, $fh] = $full;
    $photon = 'https://i0.wp.com/example.test/u/2026/01/' . basename($path);
    $boxes = test_size_boxes();
    if ($size === 'full' || !isset($boxes[$size])) {
        return ["$photon?fit=$fw,$fh", $fw, $fh];
    }
    [$bw, $bh] = $boxes[$size];
    $ratio = $bh > 0 ? min($bw / $fw, $bh / $fh) : $bw / $fw;
    if ($ratio >= 1) {
        // Too small for this size: WordPress serves the full file.
        return ["$photon?fit=$fw,$fh", $fw, $fh];
    }
    $w = (int) round($fw * $ratio);
    $h = (int) round($fh * $ratio);
    return ["$photon?fit=$w,$h", $w, $h];
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
foreach (['config', 'layout', 'checkout-request', 'rendered-stay', 'assets', 'hero'] as $file) {
    require $plugin . '/includes/class-' . $file . '.php';
}

use DCC_Checkout\Assets;
use DCC_Checkout\Config;
use DCC_Checkout\Checkout_Request;
use DCC_Checkout\Hero;
use DCC_Checkout\Layout;
use DCC_Checkout\Rendered_Stay;

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
    Rendered_Stay::flush();
    /* `removed` accumulates, so it is cleared with everything else — a case
       that asserts "nothing was removed" would otherwise be reading the
       previous case's answer. */
    $GLOBALS['state']['removed'] = [];
    $GLOBALS['state']['in_loop'] = false;
    $GLOBALS['state']['is_feed'] = false;
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
    /* THE FILE NAMES ARE THE SHAPE THE DIRECTOR QUOTED off live —
       `Cottage-34-Photos-17.jpg`, with `Cottage-34-Photos-17-1024x768.webp`
       beside it. The old `2206-full.jpg` was a stand-in that happened to end
       in `.jpg`, which is all the dead twin lookup needed to look alive. */
    $n = (int) preg_replace('/\D/', '', $label);
    $GLOBALS['state']['files'][$att]   = "/uploads/2026/01/Cottage-$n-Photos.jpg";
    /* And the room type is really a room type, which is what the cookie
       fallback validates every candidate against. */
    $GLOBALS['state']['post_type'][$type]   = 'mphb_room_type';
    $GLOBALS['state']['post_status'][$type] = 'publish';
}

/** The local URL of one cottage's sized file, built the way the plugin does. */
function sized_url(int $n, int $w, int $h, string $ext = 'jpg'): string {
    return "https://example.test/u/2026/01/Cottage-$n-Photos-{$w}x{$h}.$ext";
}
function sized_path(int $n, int $w, int $h, string $ext = 'jpg'): string {
    return "/uploads/2026/01/Cottage-$n-Photos-{$w}x{$h}.$ext";
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
    /* WordPress never GENERATED a `large` for a 960-wide original, so the
       metadata row has no such key and the chooser falls to the widest there
       is: the original itself. 0.35.0's model answered "large" for it because
       `wp_get_attachment_image_src()` hands back the full file for a size an
       image is too small for — the same answer by a different road. */
    'Cottage 22' => ['size' => 'full',      'width' => 960],   // 960x720
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
 * 1b. THE WEBP TWIN, AND THE PHOTON URL THAT HID IT FOR A RELEASE
 *     (Director, live 2026-10-22; the defect measured 2026-10-23)
 *
 * Every sized file on this site has a `.webp` beside it with the extension
 * SWAPPED, served as 200 image/webp; the `…jpg.webp` form 404s. The chosen URL
 * goes into a CSS background and a preload link — SpeedyCache only rewrites
 * `<img>` and Photon only rewrites `image_downsize` — so nothing else on the
 * page would ever serve the twin here. It is 76 KB → 53 KB on Cottage 34 and
 * 124 KB → 86 KB on portrait 36, on the one request that blocks the top of the
 * page.
 *
 * THE GUARD THAT MAKES THESE HONEST is in the fixture, not here: the stand-in
 * `wp_get_attachment_image_src()` now returns the i0.wp.com URL this site
 * really returns. Against it, 0.35.0's code serves Photon every time.
 * ========================================================================== */

echo "\n--- the WebP twin ---\n";

/* Cottage 34's chosen file is Cottage-34-Photos-1024x768.jpg. */
$GLOBALS['state']['on_disk'] = [];
$served = Hero::photo(1607)['url'];
check('with no twin on disk, the site\'s own URL is served (the guard)',
    $served, 'https://i0.wp.com/example.test/u/2026/01/Cottage-34-Photos.jpg?fit=1024,768');
check('… which is PHOTON\'s, so a local JPEG is never a step backwards',
    strpos($served, 'i0.wp.com') !== false, true);

$GLOBALS['state']['on_disk'] = [sized_path(34, 1024, 768, 'webp')];
check('with the twin on disk, the local WebP is served instead',
    Hero::photo(1607)['url'], sized_url(34, 1024, 768, 'webp'));
check('… the extension is SWAPPED, never appended (the .jpg.webp form 404s)',
    strpos(Hero::photo(1607)['url'], '.jpg') === false, true);
check('… and it is NOT a Photon URL, so nothing can re-encode it',
    strpos(Hero::photo(1607)['url'], 'i0.wp.com'), false);
check('… and the dimensions are still the metadata\'s true pixels',
    [Hero::photo(1607)['width'], Hero::photo(1607)['height']], [1024, 768]);

/* THE 0.35.0 DEFECT, CONSTRUCTED. The twin lookup used to run on the URL, and
   the URL this site hands back ends in a query string, so the pattern it
   matched on could never fire. Asserting the chosen URL is local is what
   catches that; asserting "it ends .webp" would not, because Photon serves
   WebP too — under a .jpg URL. */
check('the chosen URL names the twin FILE, not a re-encode of the original',
    substr(Hero::photo(1607)['url'], -strlen('-1024x768.webp')), '-1024x768.webp');

/* And the preload asks for the file that is actually painted. */
reset_state(['post' => submission(1607)]);
$GLOBALS['state']['on_disk'] = [sized_path(34, 1024, 768, 'webp')];
$hero = new Hero();
$hero->maybe_hook();
ob_start();
do_action('wp_head');
$head = (string) ob_get_clean();
check('the preload asks for the WebP twin',
    strpos($head, sized_url(34, 1024, 768, 'webp')) !== false, true);
check('… and the preload URL EQUALS the URL the header paints',
    preg_match('/href="([^"]+)"/', $head, $m) ? $m[1] : '',
    apply_filters(Hero::URL_FILTER, 'https://example.test/u/canal.webp'));

/* A cottage whose twin is missing keeps what the site serves — one missing
   file must not make a broken header. */
check('a cottage with no twin on disk is unaffected',
    strpos(Hero::photo(1742)['url'], 'i0.wp.com') !== false, true);
check('… while the one that has a twin still gets it',
    substr(Hero::photo(1607)['url'], -5), '.webp');

/* Portrait Cottage 36 chooses 1536x1536 → 1152x1536, so ITS twin is that
   file, not the 1024 one. A twin lookup keyed on the wrong size would miss. */
$GLOBALS['state']['on_disk'] = [sized_path(36, 1152, 1536, 'webp')];
check('the portrait cottage gets the twin of the size IT chose',
    Hero::photo(1742)['url'], sized_url(36, 1152, 1536, 'webp'));

/* The twin is only ever swapped for a file this knows how to swap. */
$GLOBALS['state']['on_disk'] = [];
check('a URL that is already a webp is left alone',
    Hero::prefer_webp(2206, sized_url(34, 1024, 768, 'webp')),
    sized_url(34, 1024, 768, 'webp'));
check('an unknown extension is left alone',
    Hero::prefer_webp(2206, 'https://example.test/u/2026/01/Cottage-34-Photos.svg'),
    'https://example.test/u/2026/01/Cottage-34-Photos.svg');
check('an attachment whose original path cannot be read is left alone',
    Hero::prefer_webp(9999, sized_url(34, 1024, 768)),
    sized_url(34, 1024, 768));

/* prefer_webp() IS THE PATH THE CONTINUE CARD USES, and it holds a URL rather
   than a path — including, on this site, a Photon one with a query string.
   The query string must not be read as the extension, and must survive. */
$GLOBALS['state']['on_disk'] = [sized_path(34, 1024, 768, 'webp')];
check('a query string is not mistaken for the extension',
    Hero::prefer_webp(2206, sized_url(34, 1024, 768) . '?fit=1024,768'),
    sized_url(34, 1024, 768, 'webp') . '?fit=1024,768');

/* A missing metadata row falls back to whatever the site serves, rather than
   leaving the header with no picture. */
$GLOBALS['state']['no_meta'][2206] = true;
$GLOBALS['state']['on_disk'] = [sized_path(34, 1024, 768, 'webp')];
check('an attachment with no metadata row still yields a photo',
    strpos(Hero::photo(1607)['url'], 'i0.wp.com') !== false, true);
unset($GLOBALS['state']['no_meta'][2206]);

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
 * 3b. A RELOAD KEEPS THE HERO (v0.35.1, item 1)
 *
 * A plain GET of /submit-booking/ after a POST still shows a working checkout:
 * MotoPress re-renders the form from its own `mphb_check_in_date` /
 * `mphb_check_out_date` cookies. Nothing is posted, so 0.35.0 read nothing,
 * the hero stood down, and the page came back with the canal banner and the
 * theme's "Submit Booking" over it — bar, sheet and all around it.
 *
 * THE ROOM COOKIE IS `mphb_rooms_details`, PINNED BY NAME in v0.35.2 (the
 * Director read live's three cookies on 2026-10-23). 0.35.1 scanned any
 * `mphb…room…` cookie because the name had not been read; the scan is gone,
 * and these cases assert that it is — a scan could take a room type id out of
 * a cookie that is about something else.
 * ========================================================================== */

echo "\n--- GET after POST (item 1) ---\n";

/** A plain GET, with the cookies MotoPress itself fell back to. */
function reload(array $cookies): void {
    reset_state(['post' => []]);
    $_COOKIE = $cookies;
    Rendered_Stay::flush();
}

$mp = [
    'mphb_check_in_date'  => '2026-11-16',
    'mphb_check_out_date' => '2026-11-19',
    'mphb_rooms_details'  => 'a:1:{i:1607;s:1:"1";}',
];

reload($mp);
check('GET after POST shows the same cottage hero',
    Hero::room_type_id(), 1607);
$GLOBALS['state']['on_disk'] = [sized_path(34, 1024, 768, 'webp')];
check('… and the same photo it would have shown on the POST',
    Hero::photo(Hero::room_type_id())['url'], sized_url(34, 1024, 768, 'webp'));
$hero = new Hero();
$hero->maybe_hook();
check('… the header image is filtered, the overlay printed, the theme title removed',
    [has_our_hook(Hero::URL_FILTER), has_our_hook(Hero::PRINT_HOOK),
     in_array([Hero::PRINT_HOOK, Hero::THEME_TITLE, Hero::THEME_TITLE_PRIORITY],
        $GLOBALS['state']['removed'], true)],
    [true, true, true]);
check('… and the dates pill reads the cookie stay',
    $hero->dates_pill(), 'Mon, Nov 16 → Thu, Nov 19 · 3 Nights');

/* THE BOUNDARY THAT MATTERS MOST. The server-side backstops read
   Checkout_Request to decide whether to REFUSE a booking. A cookie is not a
   submission, and if a cookie could supply the dates for a submission that
   posted none, those guards would start evaluating a stay nobody sent. */
check('the backstops still see NOTHING posted (a cookie is not a submission)',
    [Checkout_Request::posted_room_type_id(), Checkout_Request::stay_dates(),
     Checkout_Request::nights()],
    [0, [null, null], 0]);

reload([]);
check('no cookies at all: no hero, and the canal banner stays',
    Hero::room_type_id(), 0);
(new Hero())->maybe_hook();
check('… so nothing is hooked and nothing is removed',
    [has_our_hook(Hero::URL_FILTER), $GLOBALS['state']['removed']], [false, []]);

reload(['mphb_check_in_date' => '2026-11-16', 'mphb_check_out_date' => '2026-11-19']);
check('the dates alone, with no room cookie: no hero rather than a guess',
    Hero::room_type_id(), 0);

/* AMBIGUITY IS AN ANSWER OF ITS OWN. Two cottages named means we do not know
   which one this page is for, and a hero for the wrong cottage is worse than
   none: it looks deliberate. A real multi-cottage stay lands here too, and
   correctly — there is one photo at the top of the page. */
reload(['mphb_rooms_details' => 'a:2:{i:1607;s:1:"1";i:1065;s:1:"1";}']);
check('two different cottages in the cookie: no hero',
    Hero::room_type_id(), 0);
reload(['mphb_rooms_details' => 'a:1:{i:1607;s:1:"2";}']);
check('the SAME cottage with a quantity is not ambiguous',
    Hero::room_type_id(), 1607);

/* THE COOKIE IS PINNED BY NAME (v0.35.2), so a cottage named in some OTHER
   cookie is not read. The guard that makes this observable: post 2026 is a
   published room type here, so a scan of every cookie WOULD find the year in
   `mphb_check_in_date` beside the real 1607, read two cottages, and show no
   hero at all. 0.35.1 needed an exclusion list to avoid exactly that. */
$GLOBALS['state']['post_type'][2026] = 'mphb_room_type';
$GLOBALS['state']['post_status'][2026] = 'publish';
reload($mp);
check('only mphb_rooms_details is read, so a year in a date cookie is not a cottage',
    Hero::room_type_id(), 1607);
reload(['mphb_check_in_date' => '2026-11-16', 'mphb_check_out_date' => '2026-11-19',
        'mphb_rooms_other' => '1065']);
check('a cottage named in any other cookie is not read at all',
    Hero::room_type_id(), 0);
unset($GLOBALS['state']['post_type'][2026], $GLOBALS['state']['post_status'][2026]);

/* Every candidate is validated by WordPress, so a tampered cookie cannot
   name anything that is not one of this site's own published cottages. */
$GLOBALS['state']['post_type'][7777] = 'page';
$GLOBALS['state']['post_status'][7777] = 'publish';
reload(['mphb_rooms_details' => '7777']);
check('a post that is not a room type is refused', Hero::room_type_id(), 0);

$GLOBALS['state']['post_type'][7778] = 'mphb_room_type';
$GLOBALS['state']['post_status'][7778] = 'draft';
reload(['mphb_rooms_details' => '7778']);
check('an unpublished room type is refused', Hero::room_type_id(), 0);

reload(['mphb_rooms_details' => 'a:1:{i:999999;s:1:"1";}']);
check('an id that is no post at all is refused', Hero::room_type_id(), 0);

/* NEVER unserialize() A COOKIE. The value is treated as text and only digit
   runs are taken out of it, so a crafted payload is inert — there is nothing
   here that could instantiate anything. */
reload(['mphb_rooms_details' => 'O:8:"stdClass":1:{s:4:"x";i:1607;}']);
check('a serialised OBJECT is read as text, not unserialised',
    Hero::room_type_id(), 1607);
check('… and nothing was instantiated to get there',
    class_exists('DCC_Checkout\\Rendered_Stay', false), true);

/* A quantity or an index is not a candidate: ids on this site are four digits
   and the floor is three. */
reload(['mphb_rooms_details' => 'a:1:{i:0;s:1:"1";}']);
check('a quantity of 1 is not a candidate id', Hero::room_type_id(), 0);

/* AND THE SUBMISSION STILL WINS. A POST that names a cottage is never
   overruled by a stale cookie for another one. */
reset_state(['post' => submission(1742)]);
$_COOKIE = $mp;
Rendered_Stay::flush();
check('a real submission beats the cookies',
    Hero::room_type_id(), 1742);

/* ========================================================================== *
 * 3c. THE CANAL BANNER STOPS BEING FETCHED (v0.35.1, item 3)
 *
 * Two things were still downloading it alongside the cottage photo, and both
 * read the PAGE'S FEATURED IMAGE rather than the header: SpeedyCache Pro
 * preloads it at high priority (227 KB), and the theme prints the article's
 * featured <picture>, hidden, through i0.wp.com. 0.35.0 replaced the header
 * image's URL, which is a different thing.
 * ========================================================================== */

echo "\n--- the page's own featured image (item 3) ---\n";

/**
 * WHAT `get_post_meta()` REALLY DOES WITH A FILTER'S ANSWER — core's own
 * lines, because the SHAPE of the answer matters and getting it wrong is a
 * PHP warning rather than a wrong value:
 *
 *     $check = apply_filters("get_{$meta_type}_metadata", null, …);
 *     if (null !== $check) {
 *         if ($single && is_array($check)) { return $check[0]; }
 *         return $check;
 *     }
 *
 * `get_post_thumbnail_id()` asks with `$single = true`, so a filter returning
 * `[]` sends core to `$check[0]` of an empty array: an undefined-offset
 * warning on every checkout render. The Director's "no new PHP warnings" is
 * exactly that check, and modelling the indexing step is the only way this
 * suite can see it.
 */
function core_get_post_meta(int $post_id, string $key, bool $single) {
    $check = apply_filters('get_post_metadata', null, $post_id, $key, $single, 'post');
    if ($check !== null) {
        if ($single && is_array($check)) {
            return $check[0];   // core's own line — warns on an empty array
        }
        return $check;
    }
    return $single ? '' : [];   // no filter spoke: the real row, modelled empty
}

/** Run something with every PHP notice turned into a failure. */
function without_warnings(string $name, callable $fn) {
    $seen = [];
    set_error_handler(static function ($no, $str) use (&$seen) {
        $seen[] = $str;
        return true;
    });
    try {
        $value = $fn();
    } finally {
        restore_error_handler();
    }
    check($name, $seen, []);
    return $value;
}

/** `_thumbnail_id` as a single read, which is what the thumbnail API does. */
function thumb_meta(int $post_id) {
    return core_get_post_meta($post_id, '_thumbnail_id', true);
}

reset_state(['post' => submission(1607)]);
(new Hero())->maybe_hook();
$single = without_warnings(
    'reading the checkout page\'s featured image raises NO PHP warning',
    static function () { return thumb_meta(1399); });
check('the checkout page has NO featured image for this request',
    $single, '');
check('… which is falsy, so get_post_thumbnail_id() returns false',
    (bool) $single, false);
check('… and a LIST read gets the empty list, the shape core expects there',
    core_get_post_meta(1399, '_thumbnail_id', false), []);
check('… and has_post_thumbnail() says so too',
    apply_filters('has_post_thumbnail', true, 1399), false);
/* THE SCOPE IS THE WHOLE SAFETY OF THIS. The hero and the Continue card read
   `_thumbnail_id` on the ROOM TYPE; an unscoped filter would blank the cottage
   photo and leave the page with no picture at all. */
check('the COTTAGE\'s own featured image is untouched',
    apply_filters('get_post_metadata', null, 1607, '_thumbnail_id', true, 'post'), null);
check('… and so is every other post',
    apply_filters('get_post_metadata', null, 2515, '_thumbnail_id', true, 'post'), null);
check('… and no other meta key is affected',
    apply_filters('get_post_metadata', null, 1399, 'mphb_services', true, 'post'), null);
check('the cottage photo still resolves, so the header is not left empty',
    Hero::photo(Hero::room_type_id())['width'] > 0, true);

reset_state(['post' => submission(1607), 'settings' => ['layout_enabled' => 0]]);
(new Hero())->maybe_hook();
check('with the layout OFF the page keeps its featured image',
    [apply_filters('get_post_metadata', null, 1399, '_thumbnail_id', true, 'post'),
     apply_filters('has_post_thumbnail', true, 1399)], [null, true]);

/* No cottage photo means the canal banner IS the header and its heading is the
   page's only one, so neither may be taken away. */
reset_state(['post' => submission(9999)]);
(new Hero())->maybe_hook();
check('with no cottage photo the banner is left alone',
    [apply_filters('get_post_metadata', null, 1399, '_thumbnail_id', true, 'post'),
     apply_filters('has_post_thumbnail', true, 1399)], [null, true]);

/* ========================================================================== *
 * 3d. ONE <h1> IN THE HTML, NOT ONE VISIBLE (v0.35.1, item 5)
 *
 * The theme's HEADER-IMAGE title went in 0.35.0. The ARTICLE's own
 * `<h1 class="entry-title singular-title">Submit Booking</h1>` is a different
 * heading in a different place and was still in the page, hidden by CSS. A
 * hidden heading is still a heading: the page had two h1s, the wrong one
 * first.
 * ========================================================================== */

echo "\n--- the article's own heading (item 5) ---\n";

reset_state(['post' => submission(1607)]);
(new Hero())->maybe_hook();

$GLOBALS['state']['in_loop'] = true;
check('inside the loop, the checkout page\'s title is emptied',
    apply_filters('the_title', 'Submit Booking', 1399), '');

/* SCOPED THREE WAYS, because `the_title` is the most-read filter in
   WordPress. Any of these going wrong renames things all over the site. */
$GLOBALS['state']['in_loop'] = false;
check('outside the loop it is untouched — the document <title>, menus, breadcrumbs',
    apply_filters('the_title', 'Submit Booking', 1399), 'Submit Booking');
$GLOBALS['state']['in_loop'] = true;
check('another post\'s title is untouched',
    apply_filters('the_title', 'Cottage 34: Test Cottage', 1607), 'Cottage 34: Test Cottage');
check('a title with no post id is untouched',
    apply_filters('the_title', 'Submit Booking'), 'Submit Booking');
$GLOBALS['state']['is_feed'] = true;
check('a feed is untouched', apply_filters('the_title', 'Submit Booking', 1399), 'Submit Booking');
$GLOBALS['state']['is_feed'] = false;

/* AND THE CONSEQUENCE, BOTH WAYS ROUND, modelling core's own rule:
   `the_title( $before, $after )` returns BEFORE printing anything when the
   title is empty (wp-includes/post-template.php), so a theme that wraps the
   title the usual way prints no element at all. A theme that writes the tags
   by hand keeps an EMPTY one — which this cannot remove, and says so rather
   than assuming live is the kind shape. */
function core_the_title(string $before, string $after, $id) {
    $title = apply_filters('the_title', get_the_title($id) ?: 'Submit Booking', $id);
    if (strlen((string) $title) === 0) {
        return '';           // core's early return — the tags never print
    }
    return $before . $title . $after;
}
check('a theme using the_title($before,$after) prints no heading at all',
    core_the_title('<h1 class="entry-title singular-title">', '</h1>', 1399), '');
check('… and the same template on another page is unaffected',
    core_the_title('<h1 class="entry-title singular-title">', '</h1>', 1607),
    '<h1 class="entry-title singular-title">Cottage 34: Test Cottage</h1>');
$hand_written = '<h1 class="entry-title singular-title">'
    . apply_filters('the_title', 'Submit Booking', 1399) . '</h1>';
check('KNOWN LIMIT: a hand-wrapped <h1> is left empty, not removed',
    $hand_written, '<h1 class="entry-title singular-title"></h1>');

reset_state(['post' => submission(1607), 'settings' => ['layout_enabled' => 0]]);
(new Hero())->maybe_hook();
$GLOBALS['state']['in_loop'] = true;
check('with the layout OFF the article keeps its heading',
    apply_filters('the_title', 'Submit Booking', 1399), 'Submit Booking');
$GLOBALS['state']['in_loop'] = false;

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
