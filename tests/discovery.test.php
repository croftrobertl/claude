<?php
/**
 * Guide auto-detect (v0.12.2).
 *
 * The bug: a public widget with source_post = 0 on /explore/ resolved to
 * /explore/ itself — an empty page — and rendered nothing. Two causes: the
 * metadata search matched "dccgg_guide_public" as well as "dccgg_guide", and
 * nothing excluded the page doing the asking.
 *
 *   php tests/discovery.test.php
 */
define('ABSPATH', '/tmp/');
define('DCCGG_VERSION', 'test');
define('MINUTE_IN_SECONDS', 60);

$GLOBALS['POSTS'] = [];      // id => ['status' => , 'meta' => elementor json]
$GLOBALS['OPTIONS'] = [];
$GLOBALS['TRANSIENTS'] = [];
$GLOBALS['QUERIES'] = [];

function __($s, $d = null) { return $s; }
function esc_html__($s, $d = null) { return $s; }
function esc_attr__($s, $d = null) { return $s; }
function esc_html($s) { return $s; }
function esc_attr($s) { return $s; }
function esc_url($s) { return $s; }
function esc_url_raw($s) { return $s; }
function add_action(...$a) {} function add_shortcode(...$a) {} function add_filter(...$a) {}
function get_option($k, $d = false) { return $GLOBALS['OPTIONS'][$k] ?? $d; }
function update_option($k, $v, $a = null) { $GLOBALS['OPTIONS'][$k] = $v; return true; }
function delete_option($k) { unset($GLOBALS['OPTIONS'][$k]); return true; }
function get_transient($k) { return $GLOBALS['TRANSIENTS'][$k] ?? false; }
function set_transient($k, $v, $t = 0) { $GLOBALS['TRANSIENTS'][$k] = $v; return true; }
function get_post_status($id) { return $GLOBALS['POSTS'][$id]['status'] ?? false; }
function get_post_meta($id, $key, $single = false) { return $GLOBALS['POSTS'][$id]['meta'] ?? ''; }
function get_the_ID() { return $GLOBALS['CURRENT_ID'] ?? 0; }
function is_singular() { return true; }
function current_user_can($c) { return false; }
function wp_json_encode($v) { return json_encode($v); }
function home_url($p = '/') { return 'https://example.test' . $p; }
function get_permalink($id = 0) { return 'https://example.test/p/' . $id; }
function wp_parse_url($u, $c = -1) { return parse_url($u, $c); }
function get_bloginfo($k) { return 'Test'; }

/** Stand-in for WP_Query: applies the meta LIKE the way MySQL would. */
class WP_Query {
    public $posts = [];
    public function __construct($args) {
        $GLOBALS['QUERIES'][] = $args;
        $needle = $args['meta_query'][0]['value'] ?? '';
        foreach ($GLOBALS['POSTS'] as $id => $p) {
            if (($args['post_status'] ?? 'publish') === 'publish' && $p['status'] !== 'publish') { continue; }
            if ($needle !== '' && strpos($p['meta'], $needle) === false) { continue; }
            $this->posts[] = $id;
        }
    }
}

require __DIR__ . '/_elementor-stub.php';
require __DIR__ . '/../dcc-guest-guide/includes/class-widget.php';
require __DIR__ . '/../dcc-guest-guide/includes/class-plugin.php';

$pass = 0; $fail = 0; $failures = [];
function check($name, $cond, $detail = '') {
    global $pass, $fail, $failures;
    if ($cond) { $pass++; echo "  ✓ $name\n"; }
    else { $fail++; $failures[] = "$name" . ($detail ? " — $detail" : ''); echo "  ✗ $name" . ($detail ? " — $detail" : '') . "\n"; }
}

// The real shape: 4645 holds the guide; 18119 (/explore/) holds only the
// PUBLIC widget and is NEWER, so it is the first candidate a naive scan sees.
$guideJson  = '[{"elType":"widget","widgetType":"dccgg_guide","id":"abc123","settings":{"guide_sections":[{"section_key":"amenities","section_audience":"public"}],"guide_items":[]}}]';
$publicJson = '[{"elType":"widget","widgetType":"dccgg_guide_public","id":"pub999","settings":{"source_post":""}}]';
$GLOBALS['POSTS'] = [
    18119 => ['status' => 'publish', 'meta' => $publicJson],   // /explore/ — scanned first
    4645  => ['status' => 'publish', 'meta' => $guideJson],
];
$p = \DCCGG\Plugin::instance();

echo "\nA. Auto-detect from the public page\n";
$GLOBALS['CURRENT_ID'] = 18119;
$found = $p->discover_guide_source(18119);
check('resolves to the page holding the guide (4645)', $found === 4645, "got $found");
check('never resolves to the page asking (18119)', $found !== 18119, "got $found");

echo "\nB. The metadata search no longer matches the public widget\n";
$needle = $GLOBALS['QUERIES'][0]['meta_query'][0]['value'] ?? '';
check('searches for the exact widget token', $needle === '"widgetType":"dccgg_guide"', $needle);
check('that token does not appear in a public-only page', strpos($publicJson, $needle) === false);
check('it does appear in the guide page', strpos($guideJson, $needle) !== false);

echo "\nC. The resolved page really carries a guide\n";
$el = $p->find_widget_element(4645);
check('guide element found on 4645', !empty($el) && ($el['widgetType'] ?? '') === 'dccgg_guide');
check('no guide element on 18119', $p->find_widget_element(18119) === []);
check('its public section survives filtering', (function () use ($el) {
    $s = (array) $el['settings']; $s['guide_mode'] = 'public';
    \DCCGG\Widget::apply_public_mode($s);
    return count($s['guide_sections']) === 1;
})());

echo "\nD. A poisoned cache pointing at the asking page is ignored\n";
$GLOBALS['OPTIONS']['dccgg_guide_source_post'] = ['version' => DCCGG_VERSION, 'post_id' => 18119];
$GLOBALS['TRANSIENTS'] = [];
check('cached self-reference is re-resolved to the guide', $p->discover_guide_source(18119) === 4645);

echo "\nE. Re-scoping the source page's Elementor CSS (v0.16.0)\n";
// The public guide re-renders a widget that lives on another post, and the
// host's style-control values are compiled into THAT post's stylesheet —
// scoped to that post's wrapper:
//
//   .elementor-4645 .elementor-element.elementor-element-2afb24b … { --dccgg-tile-min:120px }
//
// Rendered on /explore/ the wrapper is .elementor-18119, so the selector
// matches nothing and every configured value falls back to a plugin default.
// Enqueueing the file (which is what the plugin used to do) puts the CSS in
// the page but cannot make it apply — which is exactly why the bug looked
// fixed. These assertions are about the transform that makes it real.
$css = implode("\n", [
    '.elementor-4645 .elementor-element.elementor-element-2afb24b .dccgg-root.dccgg-root .dccgg-menu{--dccgg-gap:5px;--dccgg-tile-min:120px;}',
    '@media(max-width:767px){.elementor-4645 .elementor-element.elementor-element-2afb24b .dccgg-root.dccgg-root .dccgg-menu{--dccgg-grid-cols-mobile-tpl:repeat(2,1fr);}}',
    '@media(min-width:768px){.elementor-4645 .elementor-element.elementor-element-9999zzz .other{color:red;}}',
    '.elementor-4645{--page-padding:20px;}',
    '.elementor-4645 .elementor-element.elementor-element-9999zzz .other-widget{color:red;}',
    '.elementor-46450 .elementor-element.elementor-element-2afb24b .dccgg-root{color:blue;}',
    '@font-face{font-family:X;src:url(x.woff2);}',
]);
$scoped = \DCCGG\Plugin::rescope_element_css($css, 4645, '2afb24b');

check('the configured values survive the transform',
    strpos($scoped, '--dccgg-tile-min:120px') !== false && strpos($scoped, '--dccgg-gap:5px') !== false, $scoped);
check('the source page prefix is stripped', strpos($scoped, '.elementor-4645 ') === false, $scoped);
check('the element scope is kept, so the rule still targets this widget',
    strpos($scoped, '.elementor-element-2afb24b') !== false);
check('a responsive value survives inside its @media',
    strpos($scoped, '@media(max-width:767px){') !== false
    && strpos($scoped, '--dccgg-grid-cols-mobile-tpl') !== false);
// The source page's own page-settings rules are NOT this widget's business,
// and importing them would style someone else's page.
check('a page-wide rule is not imported', strpos($scoped, '--page-padding') === false);
check('another element\'s rule is not imported', strpos($scoped, 'other-widget') === false);
check('an @media emptied by the filter is not emitted', strpos($scoped, '@media(min-width:768px)') === false);
check('a lookalike page id (.elementor-46450) is neither matched nor mangled',
    strpos($scoped, 'color:blue') === false);
check('@font-face is left behind with the source page', strpos($scoped, '@font-face') === false);
// Negative control: without the transform the same CSS is inert on any page
// whose wrapper is not .elementor-4645 — this is the bug, asserted directly.
check('control: the untransformed CSS is scoped to a wrapper the host page lacks',
    strpos($css, '.elementor-4645 .elementor-element') !== false
    && strpos($scoped, '.elementor-4645 .elementor-element') === false);

echo "\n$pass passed, $fail failed\n";
if ($fail) { echo "Failures:\n"; foreach ($failures as $f) { echo "  - $f\n"; } exit(1); }
