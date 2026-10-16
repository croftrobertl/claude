<?php
/**
 * DCC Guest Guide — the Front Desk button (v0.24.0).
 *
 * Drives the REAL render_more_menu() through reflection, for the hub and for a
 * section popup, and asserts the markup the browser will get. The property
 * under test: when the slots resolve to exactly one item the control is a real
 * <button> that performs that action directly — carrying the same action class
 * and the same data-report-section the popover item used to carry, so the
 * existing delegated handlers drive it — and its accessible name is the
 * visible label, not "More".
 *
 *   php tests/front-desk.test.php
 *   DCCGG_PLUGIN_DIR=/path/to/dcc-guest-guide php tests/front-desk.test.php   (mutation runs)
 */
require __DIR__ . '/_render-guide.php';

$pass = 0; $fail = 0; $failures = [];
function check($name, $cond, $detail = '') {
    global $pass, $fail, $failures;
    if ($cond) { $pass++; echo "  ✓ $name\n"; }
    else { $fail++; $failures[] = $name . ($detail ? " — $detail" : ''); echo "  ✗ $name" . ($detail ? " — $detail" : '') . "\n"; }
}

/** Render the menu the way render() does, with every control at its default. */
function more_menu(array $over = [], string $context = 'hub', string $section = ''): string {
    $w = new \DCCGG\Widget();
    $rc = new ReflectionMethod($w, 'register_controls'); $rc->setAccessible(true); $rc->invoke($w);
    $w->__overrides = $over + ['enable_detail_more_menu' => 'yes'];
    $s = $w->get_settings_for_display();
    $m = new ReflectionMethod($w, 'render_more_menu'); $m->setAccessible(true);
    ob_start(); $m->invoke($w, $s, $context, $section); return (string) ob_get_clean();
}
/** The accessible name a screen reader computes: aria-label, else visible text. */
function acc_name(string $html): string {
    if (preg_match('/<(?:button|summary)\b[^>]*\baria-label="([^"]*)"/', $html, $m)) { return html_entity_decode($m[1]); }
    $inner = preg_replace('#<span class="dccgg-fd-icon"[^>]*>.*?</span>#s', '', $html);     // aria-hidden
    $inner = preg_replace('#<i\b[^>]*aria-hidden="true"[^>]*>.*?</i>#s', '', $inner);
    if (!preg_match('#<(?:button|summary)\b[^>]*>(.*?)</(?:button|summary)>#s', $inner, $m)) { return ''; }
    return trim(preg_replace('/\s+/', ' ', html_entity_decode(strip_tags($m[1]))));
}
const REPORT_ON = ['enable_problem_report' => 'yes'];

echo "\nA. One item: a real button, no popover\n";
$hub = more_menu(REPORT_ON);
check('the control is a <button type="button">', strpos($hub, '<button type="button"') === 0 || strpos(ltrim($hub), '<button type="button"') === 0, substr(ltrim($hub), 0, 60));
check('there is no <details> and no popover', strpos($hub, '<details') === false && strpos($hub, 'dccgg-more-popover') === false);
check('it keeps .dccgg-more and the hub modifier, and adds .dccgg-more--direct',
    strpos($hub, 'class="dccgg-more dccgg-more--hub dccgg-more--direct dccgg-more--fd') !== false, $hub);
check('it carries the Report action class the delegated handler listens for',
    strpos($hub, 'dccgg-more-report') !== false);
check('the hub button reports no section', preg_match('/data-report-section=""/', $hub) === 1, $hub);
$pop = more_menu(REPORT_ON, 'popup', 'wifi');
check('a popup button keeps its own section key, as the popover item did',
    strpos($pop, 'data-report-section="wifi"') !== false && strpos($pop, 'dccgg-more--popup') !== false, $pop);

echo "\nB. The face: one emoji in a circle, label beneath\n";
check('the icon is the bell emoji and is hidden from screen readers',
    preg_match('/<span class="dccgg-fd-icon" aria-hidden="true">🛎️<\/span>/u', $hub) === 1, $hub);
check('the label reads Front Desk, in Title Case',
    strpos($hub, '<span class="dccgg-fd-label">Front Desk</span>') !== false);
check('the accessible name is the visible label, not "More"', acc_name($hub) === 'Front Desk', acc_name($hub));
check('and the button carries no aria-label that could drift from it',
    strpos($hub, 'aria-label') === false, $hub);
check('a host icon replaces the bell', strpos(more_menu(REPORT_ON + ['more_button_icon' => '🔔']), '🔔') !== false);
$named = more_menu(REPORT_ON + ['more_button_label' => 'Reception']);
check('a host label replaces Front Desk, and names the button',
    strpos($named, '>Reception</span>') !== false && acc_name($named) === 'Reception');
$nolabel = more_menu(REPORT_ON + ['more_button_label' => '']);
check('with the label cleared the button still has a spoken name',
    strpos($nolabel, 'dccgg-fd-label') === false && acc_name($nolabel) === 'Report a problem', acc_name($nolabel));

echo "\nC. Two or more items: today's popover, same face\n";
$two = more_menu(['more_menu_slot_1' => 'print', 'more_menu_slot_2' => 'save_pdf']);
check('two items still render a <details> popover', strpos($two, '<details') !== false && strpos($two, 'dccgg-more-popover') !== false);
check('its summary wears the same circle and label',
    strpos($two, 'dccgg-more-summary--fd') !== false && strpos($two, 'dccgg-fd-icon') !== false
    && strpos($two, '<span class="dccgg-fd-label">Front Desk</span>') !== false, $two);
check('the summary is named by its label too', acc_name($two) === 'Front Desk', acc_name($two));
check('both items are inside the popover',
    substr_count($two, 'dccgg-more-item') === 2 && strpos($two, 'dccgg-more-print') !== false
    && strpos($two, 'dccgg-more-save-pdf') !== false);
$three = more_menu(REPORT_ON + ['more_menu_slot_1' => 'print', 'more_menu_slot_2' => 'save_pdf', 'more_menu_slot_3' => 'report']);
check('three items: a popover whose Report item keeps the section key',
    strpos($three, '<details') !== false && substr_count($three, 'dccgg-more-item') === 3);
$onlyPrint = more_menu(['more_menu_slot_1' => 'print', 'more_menu_slot_2' => 'none']);
check('a single Print item is a direct button the delegated handler can see',
    strpos($onlyPrint, 'dccgg-more--direct') !== false && strpos($onlyPrint, 'dccgg-more-print') !== false, $onlyPrint);
check('a single Save-as-PDF item likewise',
    strpos(more_menu(['more_menu_slot_1' => 'save_pdf', 'more_menu_slot_2' => 'none']), 'dccgg-more-save-pdf') !== false);
check('a direct Print button carries no data-report-section',
    strpos(more_menu(['more_menu_slot_1' => 'print', 'more_menu_slot_2' => 'none']), 'data-report-section') === false);

echo "\nD. Zero items: nothing at all\n";
check('reporting off, with the shipped defaults, renders nothing', trim(more_menu([])) === '');
check('every slot none renders nothing',
    trim(more_menu(REPORT_ON + ['more_menu_slot_1' => 'none', 'more_menu_slot_2' => 'none', 'more_menu_slot_3' => 'none'])) === '');

echo "\nE. The shipped defaults are the site's choices\n";
$w = new \DCCGG\Widget();
$rc = new ReflectionMethod($w, 'register_controls'); $rc->setAccessible(true); $rc->invoke($w);
$d = $w->__defaults;
check('slot 1 is Report, slots 2 and 3 are none',
    [$d['more_menu_slot_1'], $d['more_menu_slot_2'], $d['more_menu_slot_3']] === ['report', 'none', 'none'],
    json_encode([$d['more_menu_slot_1'] ?? null, $d['more_menu_slot_2'] ?? null, $d['more_menu_slot_3'] ?? null]));
check('the icon default is the bell emoji', ($d['more_button_icon'] ?? '') === '🛎️');
check('the label default is Front Desk', ($d['more_button_label'] ?? '') === 'Front Desk');
check('the shape default is round', ($d['more_button_shape'] ?? '') === 'round');
check('more_menu_items() agrees with the control defaults',
    \DCCGG\Widget::more_menu_items(REPORT_ON) === ['report']
    && \DCCGG\Widget::MORE_SLOT_DEFAULTS === ['report', 'none', 'none']);
// The three stored keys page 4645 carries today must not change the result
// once they are cleared — and must still be honoured while they are set.
$live = REPORT_ON + ['more_button_label' => '🧑‍✈️🛎️', 'str_more_menu' => 'More',
    'more_menu_slot_1' => 'report', 'more_menu_slot_2' => 'none', 'more_menu_slot_3' => 'none'];
check('with the live stored values still set, the button is round with their label',
    strpos(more_menu($live), 'dccgg-more--direct') !== false
    && strpos(more_menu($live), '<span class="dccgg-fd-label">🧑‍✈️🛎️</span>') !== false);
check('clearing them gives exactly the default button', more_menu(REPORT_ON) === $hub);

// A guide saved before these controls existed carries none of their keys:
// Plugin::render_source_guide() and any legacy widget hand the renderer the
// stored array as-is, with no Elementor defaults merged in. The fallbacks in
// render_more_menu() are what give those guides the Front Desk button.
function raw_menu(array $s, string $context = 'hub', string $section = ''): string {
    $w = (new ReflectionClass('\DCCGG\Widget'))->newInstanceWithoutConstructor();
    $m = new ReflectionMethod('\DCCGG\Widget', 'render_more_menu'); $m->setAccessible(true);
    ob_start(); $m->invoke($w, $s, $context, $section); return (string) ob_get_clean();
}
$legacy = raw_menu(['enable_detail_more_menu' => 'yes', 'enable_problem_report' => 'yes']);
check('a legacy guide with none of the new keys still gets the circle and the label',
    strpos($legacy, 'dccgg-more--direct') !== false
    && strpos($legacy, '<span class="dccgg-fd-icon" aria-hidden="true">🛎️</span>') !== false
    && strpos($legacy, '<span class="dccgg-fd-label">Front Desk</span>') !== false, $legacy);
check('and it is named by that label, not by "More"', acc_name($legacy) === 'Front Desk', acc_name($legacy));
check('a legacy guide with no slot keys resolves to Report alone',
    strpos($legacy, 'dccgg-more-report') !== false && strpos($legacy, 'dccgg-more-print') === false);

echo "\nF. The pre-0.24.0 text box is still available\n";
$pill = more_menu(REPORT_ON + ['more_button_shape' => 'pill', 'more_button_label' => 'Options']);
check('shape=pill renders the old text summary', strpos($pill, 'dccgg-more-summary--text') !== false
    && strpos($pill, 'dccgg-fd-icon') === false, $pill);
check('and a pill with no label keeps the ⋯ icon and a spoken name',
    strpos(more_menu(REPORT_ON + ['more_button_shape' => 'pill', 'more_button_label' => '']), 'fa-ellipsis-h') !== false);

echo "\nG. The stylesheet carries the look, in the guest bundle only\n";
$dir = __DIR__ . '/../dcc-guest-guide/assets/css/';
$src = (string) file_get_contents($dir . 'widget.css');
$core = (string) file_get_contents($dir . 'widget.min.css');
$guest = (string) file_get_contents($dir . 'widget-guest.min.css');
check('the rules ship in the minified build', strpos($guest, 'dccgg-fd-icon') !== false);
check('and only in the guest bundle: the public guide never renders this button',
    strpos($core, 'dccgg-fd-icon') === false && strpos($core, 'dccgg-more--direct') === false);
check('the circle is 48px with a 2px button-blue edge',
    preg_match('/width: *48px/', $src) === 1 && strpos($src, 'border: 2px solid var(--dccgg-btn-bg, #006BCF)') !== false);
check('the label states its own weight, against html{font-weight:700}',
    preg_match('/\.dccgg-fd-label[^{]*\{[^}]*font-weight: *700/s', $src) === 1);
check('the label never wraps', preg_match('/\.dccgg-fd-label[^{]*\{[^}]*white-space: *nowrap/s', $src) === 1);
check('an explicit emoji font stack, so the glyph is never a text outline',
    strpos($src, '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif') !== false);
check('hover is behind the pointer guard', preg_match('/@media \(hover: hover\) and \(pointer: fine\) \{[^@]*dccgg-fd-icon/s', $src) === 1);
check('pressed and open sit OUTSIDE it, so touch gets the fill too',
    preg_match('/dccgg-more--fd:active \.dccgg-fd-icon/', $src) === 1
    && preg_match('/dccgg-more\[open\] > \.dccgg-more-summary--fd \.dccgg-fd-icon/', $src) === 1);
check('the button keeps the print-hide rule by keeping .dccgg-more',
    strpos($src, '.dccgg-root .dccgg-more,') !== false);
check('and the touch-action rule names the new faces',
    strpos($src, '.dccgg-root.dccgg-root .dccgg-more--direct,') !== false
    && strpos($src, '.dccgg-root.dccgg-root .dccgg-more-summary--fd,') !== false);
check('transitions drop under prefers-reduced-motion',
    preg_match('/@media \(prefers-reduced-motion: reduce\) \{\s*\.dccgg-more \.dccgg-fd-icon \{ transition: none/s', $src) === 1);

echo "\n$pass passed, $fail failed\n";
if ($fail) { echo "Failures:\n"; foreach ($failures as $f) { echo "  - $f\n"; } exit(1); }
