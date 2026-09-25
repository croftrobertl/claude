<?php
/**
 * The staff widget's Elementor controls.
 *
 * TWO THINGS MATTER. First, the controls must write TOKENS and never a paint
 * property or a :hover — per-post CSS lands at (0,7,0), out-specifying
 * staff.css and sitting somewhere the (hover: hover) guard cannot reach.
 * Second, registering controls must not drag the staff RENDER path — and with
 * it the authorization gate — into the Elementor editor.
 */
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/elementor-stub.php';
$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
function get_transient($k) { return false; }
function set_transient($k, $v, $t) { return true; }
function delete_transient($k) { return true; }
$GLOBALS['t_authorized_calls'] = 0;
// Settings is required by the classes below since 0.40.0 (Cache::ttl(),
// Staff::page_id(), the Ajax clamps, the widgets' control defaults). In
// production the plugin's autoloader supplies it on demand; these harnesses
// require their classes explicitly, so it has to be named here. Left out, the
// suite FATALS rather than failing — which mutate.php reports as NO RUN, and
// which is how this was caught before it shipped.
require $ROOT . '/includes/class-settings.php';
require $ROOT . '/includes/class-cache.php';
require $ROOT . '/includes/class-data-provider.php';
require $ROOT . '/includes/class-staff.php';
require $ROOT . '/includes/class-staff-data.php';
require $ROOT . '/includes/class-staff-elementor.php';

use MPHBAC\Staff_Elementor;

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}

$w = new Staff_Elementor();
$rc = new ReflectionMethod(Staff_Elementor::class, 'register_controls');
$rc->setAccessible(true);
$rc->invoke($w);
$src = file_get_contents(dirname(__DIR__) . '/mphb-availability-calendar/includes/class-staff-elementor.php');

echo "-- the controls exist and are scoped to this widget --\n";
check('controls were registered', count($w->t_controls) >= 4, array_keys($w->t_controls));
check('SEL is wrapper-scoped and class-doubled',
    preg_match("/private const SEL = '\{\{WRAPPER\}\} \.mphbac-staff\.mphbac-staff /", $src) === 1);

echo "\n-- NO control emits :hover or a paint property --\n";
check('no :hover selector anywhere in the controls', !preg_match("/:hover'/", $src),
    implode(' | ', array_slice(preg_match_all("/.{0,40}:hover'/", $src, $m) ? $m[0] : [], 0, 3)));
{
    $bad = [];
    foreach (array_keys($w->t_controls) as $id) {
        $i = strpos($src, "add_control('" . $id . "'");
        if ($i === false) { continue; }
        $block = substr($src, $i, strpos($src, ']);', $i) - $i);
        if (!str_contains($block, 'mphbac-staff-nav')) { continue; }   // the hoverable one
        if (preg_match("/=>\s*'(background-color|color): \{\{VALUE\}\}/", $block)) { $bad[] = $id; }
    }
    check('every nav control writes a custom property, not a paint property', $bad === [], $bad);
}
foreach ([
    'nav_btn_bg'       => '--staff-nav-bg',
    'nav_btn_text'     => '--staff-nav-text',
    'nav_btn_hover_bg' => '--staff-nav-hover',
] as $id => $token) {
    $i = strpos($src, "add_control('" . $id . "'");
    $block = $i === false ? '' : substr($src, $i, strpos($src, ']);', $i) - $i);
    check("$id writes $token", str_contains($block, $token . ': {{VALUE}}'));
}
// THE SALMON MOVED IN 0.40.0, it did not disappear. A default on this control
// is emitted into Elementor's per-post CSS at (0,7,0), where it out-specifies
// both staff.css and the settings screen — the very mask the settings page
// exists to lift. So the control must carry NO default, and the salmon is
// asserted at its new home instead.
check('the hover control carries no default, so Elementor cannot mask the setting',
    !array_key_exists('default', $w->t_controls['nav_btn_hover_bg'] ?? []),
    $w->t_controls['nav_btn_hover_bg']['default'] ?? null);
check('...and the shared salmon is what the settings ship',
    MPHBAC\Settings::defaults()['staff_nav_hover'] === '#f08080',
    MPHBAC\Settings::defaults()['staff_nav_hover']);
check('the deploy note about Elementor\'s cached CSS is recorded next to it',
    str_contains($src, 'does NOT refresh'));

echo "\n-- registering controls does not touch the render path --\n";
check('no authorization call happens while registering controls',
    $GLOBALS['t_authorized_calls'] === 0, $GLOBALS['t_authorized_calls']);
check('...and the controls class does not read booking data at all',
    !str_contains($src, 'booking_detail') && !str_contains($src, 'month_view'));
check('the widget renders through the shared render path rather than duplicating it',
    str_contains($src, 'Staff_Widget') || str_contains($src, 'render'));

echo "\n-- the staff widget exposes NO typography control --\n";
{
    // This is load-bearing: it is WHY staff.css is free to carry per-control
    // font-size and font-weight at (0,2,0) without outranking a panel.
    check('no typography group control is registered',
        !array_key_exists('typography', $w->t_groups)
        && !preg_match('/Group_Control_Typography/', $src), array_keys($w->t_groups));
}

echo "\n-- the stub would have caught an unmodelled Elementor call --\n";
check('registration completed without reaching an API the stub does not model',
    count($w->t_sections) >= 1, count($w->t_sections));

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
