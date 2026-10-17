<?php
/**
 * 0.46.3 (the 2026-10-13 audit): /staff/ is NEVER INDEXED. It printed no
 * robots tag although AIOSEO stores noindex for it. The page now says
 * "noindex, nofollow" itself — an X-Robots-Tag header at template_redirect
 * and a robots meta tag first thing in <head> — on the staff page and on any
 * page whose Elementor content holds the staff widget, whoever is looking
 * (the password form included). Nowhere else.
 */
namespace MPHBAC {
    function header($h, $replace = true) { $GLOBALS['t_headers'][] = $h; }
    function headers_sent() { return $GLOBALS['t_sent'] ?? false; }
}

namespace {
    require __DIR__ . '/bootstrap.php';
    $ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
    function add_action($hook, $cb, $prio = 10, $args = 1) { $GLOBALS['t_actions'][$hook][] = [$cb, $prio]; }
    function is_singular() { return $GLOBALS['t_singular'] ?? true; }
    function get_queried_object_id() { return $GLOBALS['t_qid'] ?? 0; }
    function get_transient($k) { return false; }
    function set_transient($k, $v, $t) { return true; }
    function delete_transient($k) { return true; }
    require $ROOT . '/includes/class-settings.php';
    require $ROOT . '/includes/class-cache.php';
    require $ROOT . '/includes/class-booking-rules.php';
    require $ROOT . '/includes/class-data-provider.php';
    require $ROOT . '/includes/class-staff.php';

    use MPHBAC\Staff;

    $fail = 0;
    function check(string $l, bool $c, $x = null): void {
        global $fail;
        echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
        if (!$c) { $fail++; }
    }
    /** What the page sends: [headers, the <head> output]. */
    function page(int $id, bool $singular = true, array $meta = [], bool $sent = false): array {
        $GLOBALS['t_posts'] = []; $GLOBALS['t_meta'] = [];
        if ($id > 0) { t_post($id, 'page', 'publish', 'P', $meta); }
        $GLOBALS['t_qid'] = $id; $GLOBALS['t_singular'] = $singular; $GLOBALS['t_sent'] = $sent; $GLOBALS['t_headers'] = [];
        foreach ($GLOBALS['t_actions']['template_redirect'] ?? [] as [$cb]) { call_user_func($cb); }
        ob_start();
        foreach ($GLOBALS['t_actions']['wp_head'] ?? [] as [$cb]) { call_user_func($cb); }
        return [$GLOBALS['t_headers'], ob_get_clean()];
    }

    echo "-- the hooks are registered with the endpoints --\n";
    $GLOBALS['t_actions'] = [];
    Staff::register();
    $th = $GLOBALS['t_actions']['template_redirect'] ?? [];
    $wh = $GLOBALS['t_actions']['wp_head'] ?? [];
    check('template_redirect sends the header; wp_head prints the meta tag, first (priority 1)',
        count($th) === 1 && count($wh) === 1 && $wh[0][1] === 1, [$th, $wh]);
    check('...and the four gated endpoints are still registered as before',
        count(array_filter(array_keys($GLOBALS['t_actions']), static fn($k) => str_starts_with($k, 'wp_ajax_'))) === 8);

    echo "\n-- the staff page (18102) --\n";
    [$h, $head] = page(Staff::DEFAULT_PAGE_ID);
    check('X-Robots-Tag: noindex, nofollow', $h === ['X-Robots-Tag: noindex, nofollow'], $h);
    check('<meta name="robots" content="noindex, nofollow"> in <head>', trim($head) === '<meta name="robots" content="noindex, nofollow">', $head);
    [$h, $head] = page(Staff::DEFAULT_PAGE_ID, true, [], true);
    check('headers already gone (an unusual set-up): no header call, the meta tag still printed', $h === [] && str_contains($head, 'noindex'), [$h, $head]);

    echo "\n-- any other page holding the staff widget --\n";
    [$h, $head] = page(4242, true, ['_elementor_data' => '[{"elType":"widget","widgetType":"dccac_staff","settings":[]}]']);
    check('a page whose Elementor content holds the staff widget: header and meta tag', $h === ['X-Robots-Tag: noindex, nofollow'] && str_contains($head, 'noindex, nofollow'), [$h, $head]);

    echo "\n-- and nowhere else --\n";
    [$h, $head] = page(4243, true, ['_elementor_data' => '[{"elType":"widget","widgetType":"dccac_calendar","settings":[]}]']);
    check('a page with only the PUBLIC calendar: nothing', $h === [] && $head === '', [$h, $head]);
    [$h, $head] = page(4244);
    check('an ordinary page: nothing', $h === [] && $head === '', [$h, $head]);
    [$h, $head] = page(Staff::DEFAULT_PAGE_ID, false);
    check('not a single page (an archive, the home page list): nothing', $h === [] && $head === '', [$h, $head]);

    echo "\n-- the widget says it too, whenever it renders --\n";
    $w = file_get_contents($ROOT . '/includes/class-staff-widget.php');
    $render = substr($w, strpos($w, 'public static function render'));
    check('Staff_Widget::render() sends X-Robots-Tag while headers are open, before any output',
        (bool) preg_match("/if \\(!headers_sent\\(\\)\\) \\{\\s*header\\('X-Robots-Tag: noindex, nofollow', true\\);/", $render)
        && strpos($render, "X-Robots-Tag") < strpos($render, 'ob_start()'));
    check('...after the gate: an unauthorized render returns early and outputs nothing anyway',
        strpos($render, 'Staff::is_authorized()') < strpos($render, 'X-Robots-Tag'));

    echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
    exit($fail ? 1 : 0);
}
