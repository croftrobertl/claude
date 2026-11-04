<?php
/**
 * DCC Guest Guide — the empty-paragraph guard (v0.27.7 add-on).
 *
 * Drives the REAL Widget::drop_empty_paragraphs() and the real renderer, not
 * a copy of the regex. That distinction already earned its keep: the first
 * version of the pattern used # as its delimiter while containing `&#160;`,
 * so the entity closed the pattern, PHP read `160;...` as modifiers, and
 * preg_replace returned null for every input. A test that re-declared the
 * regex would have tested its own copy and passed.
 *
 *   php tests/item-text.test.php
 *   DCCGG_PLUGIN_DIR=… php tests/item-text.test.php   (mutation runs)
 */
define('ABSPATH', '/tmp/');
define('DCCGG_VERSION', 'test');
$GLOBALS['PLUGIN'] = $PLUGIN = rtrim(getenv('DCCGG_PLUGIN_DIR') ?: __DIR__ . '/../dcc-guest-guide', '/') . '/';

function __($s, $d = null) { return $s; }
function esc_html__($s, $d = null) { return $s; }
function esc_attr__($s, $d = null) { return $s; }
function esc_html($s) { return htmlspecialchars((string) $s, ENT_QUOTES); }
function esc_attr($s) { return htmlspecialchars((string) $s, ENT_QUOTES); }
function esc_url($s) { return htmlspecialchars((string) $s, ENT_QUOTES); }
function esc_url_raw($s) { return (string) $s; }
function wp_kses_post($s) { return (string) $s; }
function wp_strip_all_tags($s) { return strip_tags((string) $s); }
function do_shortcode($s) { return $s; }
function apply_filters($t, $v) { return $v; }
function wpautop($s) { return (string) $s; }
function sanitize_html_class($s) { return preg_replace('/[^A-Za-z0-9_-]/', '', (string) $s); }
function wp_unique_id($p = '') { static $i = 0; return $p . (++$i); }
function absint($n) { return abs((int) $n); }
function get_option($k, $d = false) { return $GLOBALS['options'][$k] ?? $d; }
function update_option($k, $v, $a = null) { $GLOBALS['options'][$k] = $v; return true; }
function did_action($h) { return 0; }
function add_action(...$a) {}
function add_filter(...$a) {}

require __DIR__ . '/_elementor-stub.php';
require $PLUGIN . 'includes/class-settings.php';
require $PLUGIN . 'includes/class-widget.php';

$pass = 0; $fail = 0; $failures = [];
function check($name, $cond, $detail = '') {
    global $pass, $fail, $failures;
    if ($cond) { $pass++; echo "  ✓ $name\n"; }
    else { $fail++; $failures[] = $name . ($detail ? " — $detail" : ''); echo "  ✗ $name" . ($detail ? " — $detail" : '') . "\n"; }
}
function drop($html) { return \DCCGG\Widget::drop_empty_paragraphs($html); }

echo "\nA. A paragraph with nothing to read is dropped\n";
foreach ([
    'an empty one'                 => '<p></p>',
    'one space'                    => '<p> </p>',
    'a newline and a tab'          => "<p>\n\t</p>",
    '&nbsp;'                       => '<p>&nbsp;</p>',
    'the numeric entity'           => '<p>&#160;</p>',
    'the hex entity'               => '<p>&#xa0;</p>',
    'a literal U+00A0'             => "<p>\xc2\xa0</p>",
    'a single <br>'                => '<p><br></p>',
    'a self-closing <br />'        => '<p><br /></p>',
    'two <br>s'                    => '<p><br><br></p>',
    'nbsp and a <br> together'     => '<p>&nbsp;&nbsp; <br></p>',
    'one carrying an attribute'    => '<p class="x">&nbsp;</p>',
] as $name => $html) {
    check("dropped: $name", drop($html) === '', json_encode(drop($html)));
}

echo "\nB. A paragraph with anything to read is kept, untouched\n";
foreach ([
    'ordinary text'                => '<p>Real text.</p>',
    'a leading &nbsp; then text'   => '<p>&nbsp;Real</p>',
    'a <br> between two words'     => '<p>a<br>b</p>',
    'a single zero'                => '<p>0</p>',
    'an image'                     => '<p><img src="x.png"></p>',
    'a link'                       => '<p><a href="#">link</a></p>',
] as $name => $html) {
    check("kept: $name", drop($html) === $html, json_encode(drop($html)));
}

echo "\nC. In a real body, only the empty ones go\n";
$body = "<p>First.</p>\n<p>&nbsp;</p>\n<p>Second.</p>\n<p><br></p>\n<p>Third.</p>";
$out  = drop($body);
check('three paragraphs survive', substr_count($out, '<p') === 3, $out);
check('and in their original order',
    strpos($out, 'First.') < strpos($out, 'Second.')
    && strpos($out, 'Second.') < strpos($out, 'Third.'), $out);
check('no empty paragraph is left', !preg_match('~<p[^>]*>(?:\s|&nbsp;|<br\s*/?>)*</p>~i', $out), $out);

echo "\nD. It is render-time only — stored content is never rewritten\n";
// The guard is applied to the rendered body. The search index and the
// read-aloud text are built from the RAW item_content, so a guest searching
// for a word either side of a stray blank line still finds it.
$settings = [
    'guide_mode' => 'full',
    'guide_sections' => [['section_key' => 'a', 'section_title' => 'A', 'section_audience' => 'both']],
    'guide_items' => [['item_section' => 'a', 'item_title' => 'Gap',
        'item_content' => '<p>Before the gap.</p><p>&nbsp;</p><p>After the gap.</p>']],
];
$index = \DCCGG\Widget::build_search_index($settings);
check('the index still carries the text either side of the gap',
    count($index) === 1 && strpos($index[0]['text'], 'Before the gap') !== false
        && strpos($index[0]['text'], 'After the gap') !== false, json_encode($index));
check('the stored setting is unchanged',
    $settings['guide_items'][0]['item_content'] === '<p>Before the gap.</p><p>&nbsp;</p><p>After the gap.</p>');

echo "\nE. Degenerate input cannot lose a body\n";
check('an empty string stays empty', drop('') === '');
check('markup with no <p> at all is returned as-is',
    drop('<div>No paragraphs here</div>') === '<div>No paragraphs here</div>');
check('a body that is ONLY empty paragraphs becomes empty, not null',
    drop('<p>&nbsp;</p><p><br></p>') === '', json_encode(drop('<p>&nbsp;</p><p><br></p>')));
check('the return is always a string', is_string(drop('<p>x</p>')) && is_string(drop('')));

echo "\n";
if ($fail) {
    echo "FAILED ($fail):\n";
    foreach ($failures as $f) { echo "  - $f\n"; }
}
echo ($fail ? "✗" : "✓") . " item-text: $pass passed, $fail failed\n";
exit($fail ? 1 : 0);
