<?php
/**
 * Widget_Single — the per-cottage mini calendar.
 *
 * It EXTENDS Widget rather than duplicating it, so the thing worth guarding is
 * that the inheritance still holds: the data path, the style controls and the
 * shared selectors must come from the parent, and only the per-cottage
 * content controls are re-declared here. A copy-paste divergence is the
 * failure this file exists to catch.
 */
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/elementor-stub.php';
$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
function get_transient($k) { return false; }
function set_transient($k, $v, $t) { return true; }
function delete_transient($k) { return true; }
require $ROOT . '/includes/class-cache.php';
require $ROOT . '/includes/class-data-provider.php';
require $ROOT . '/includes/class-staff.php';
require $ROOT . '/includes/class-widget.php';
require $ROOT . '/includes/class-widget-single.php';

use MPHBAC\Widget;
use MPHBAC\Widget_Single;

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}

$single = new Widget_Single();
$full   = new Widget();
$rc = new ReflectionMethod(Widget_Single::class, 'register_controls');
$rc->setAccessible(true);
$rc->invoke($single);
$rcf = new ReflectionMethod(Widget::class, 'register_controls');
$rcf->setAccessible(true);
$rcf->invoke($full);

echo "-- it inherits rather than duplicates --\n";
check('Widget_Single extends Widget', $single instanceof Widget);
check('it has its own widget name, so both can sit on one page',
    $single->get_name() !== $full->get_name(), [$single->get_name(), $full->get_name()]);
{
    $src = file_get_contents(dirname(__DIR__) . '/mphb-availability-calendar/includes/class-widget-single.php');
    check('it does not redeclare the shared selectors — they must come from the parent',
        !preg_match('/private const (SEL|FSEL|BSEL|VSEL|TSEL)\b/', $src));
    check('...nor the style control sections, which would fork the panel',
        !str_contains($src, 'register_style_controls'));
}
check('the parent\'s style controls are still reachable on the child',
    array_key_exists('nav_btn_bg', $single->t_controls)
    && array_key_exists('button_bg_color', $single->t_controls),
    array_slice(array_keys($single->t_controls), 0, 6));

echo "\n-- months_shown, the control this widget exists to expose --\n";
{
    $m = $single->t_controls['months_shown'] ?? null;
    check('months_shown is registered and responsive', is_array($m) && !empty($m['__responsive']));
    check('its range is 1-4', ($m['min'] ?? null) === 1 && ($m['max'] ?? null) === 4, [$m['min'] ?? null, $m['max'] ?? null]);
    check('desktop 4 / tablet 2 / mobile 2',
        ($m['default'] ?? null) === 4 && ($m['tablet_default'] ?? null) === 2 && ($m['mobile_default'] ?? null) === 2,
        [$m['default'] ?? null, $m['tablet_default'] ?? null, $m['mobile_default'] ?? null]);
    check('it only applies in month mode', ($m['condition']['layout'] ?? null) === 'month', $m['condition'] ?? null);

    // The control's own bounds and the render-side clamp must agree, or a
    // value the panel accepts is silently altered on the way out.
    $w = file_get_contents(dirname(__DIR__) . '/mphb-availability-calendar/includes/class-widget.php');
    preg_match('/months_shown\'\]\s*\?\?\s*null,\s*(\d+),\s*(\d+),\s*(\d+)/', $w, $c);
    check('the render clamp matches the control: same default, same 1-4 bounds',
        (int) $c[1] === (int) $m['default'] && (int) $c[2] === (int) $m['min'] && (int) $c[3] === (int) $m['max'],
        $c[0] ?? null);
}

echo "\n-- the per-cottage content controls --\n";
check('single_cottage is registered — the widget is pointless without it',
    array_key_exists('single_cottage', $single->t_controls));
check('the full widget does NOT have it', !array_key_exists('single_cottage', $full->t_controls));
{
    $f = $single->t_controls['show_filters'] ?? null;
    check('filters default OFF here — month nav usually covers it on a cottage page',
        ($f['default'] ?? null) === '', var_export($f['default'] ?? null, true));
    $l = $single->t_controls['layout'] ?? null;
    check('layout offers month and strip', isset($l['options']['month'], $l['options']['strip']),
        array_keys($l['options'] ?? []));
}

echo "\n-- the stub would have caught an unmodelled Elementor call --\n";
check('registering controls touched no Elementor API the stub does not model',
    count($single->t_controls) > 20 && count($single->t_sections) > 3,
    ['controls' => count($single->t_controls), 'sections' => count($single->t_sections)]);

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
