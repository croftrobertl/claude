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
    require $ROOT . '/includes/class-staff-ready.php';

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
    check('template_redirect sends the header; wp_head prints the robots tag, then (0.53.1) the viewport tag, both at priority 1',
        count($th) === 1 && count($wh) === 2 && $wh[0][1] === 1 && $wh[1][1] === 1 && $wh[0][0][1] === 'robots_meta' && $wh[1][0][1] === 'viewport_meta', [$th, $wh]);
    check('...and the five gated endpoints are still registered as before (ready since 0.48.0)',
        count(array_filter(array_keys($GLOBALS['t_actions']), static fn($k) => str_starts_with($k, 'wp_ajax_'))) === 10);

    echo "\n-- the staff page (18102) --\n";
    [$h, $head] = page(Staff::DEFAULT_PAGE_ID);
    check('X-Robots-Tag: noindex, nofollow', $h === ['X-Robots-Tag: noindex, nofollow'], $h);
    check('<meta name="robots" content="noindex, nofollow"> in <head>, then (0.53.1) the viewport tag with viewport-fit=cover',
        $head === "<meta name=\"robots\" content=\"noindex, nofollow\">\n<meta name=\"viewport\" content=\"width=device-width, user-scalable=yes, initial-scale=1.0, viewport-fit=cover\">\n", $head);
    check('...the viewport tag keeps live theme\'s own values (width=device-width, user-scalable=yes, initial-scale=1.0) and only adds viewport-fit=cover',
        Staff::VIEWPORT === 'width=device-width, user-scalable=yes, initial-scale=1.0' . ', viewport-fit=cover');
    [$h, $head] = page(Staff::DEFAULT_PAGE_ID, true, [], true);
    check('headers already gone (an unusual set-up): no header call, the meta tag still printed', $h === [] && str_contains($head, 'noindex'), [$h, $head]);

    echo "\n-- any other page holding the staff widget --\n";
    [$h, $head] = page(4242, true, ['_elementor_data' => '[{"elType":"widget","widgetType":"dccac_staff","settings":[]}]']);
    check('a page whose Elementor content holds the staff widget: header and meta tag', $h === ['X-Robots-Tag: noindex, nofollow'] && str_contains($head, 'noindex, nofollow'), [$h, $head]);
    check('...and the viewport tag', str_contains($head, 'viewport-fit=cover'), $head);

    echo "\n-- and nowhere else --\n";
    [$h, $head] = page(4243, true, ['_elementor_data' => '[{"elType":"widget","widgetType":"dccac_calendar","settings":[]}]']);
    check('a page with only the PUBLIC calendar: nothing', $h === [] && $head === '', [$h, $head]);
    [$h, $head] = page(4244);
    check('an ordinary page: nothing', $h === [] && $head === '', [$h, $head]);
    [$h, $head] = page(Staff::DEFAULT_PAGE_ID, false);
    check('not a single page (an archive, the home page list): nothing', $h === [] && $head === '', [$h, $head]);

    // OTHER PAGES' <head> UNCHANGED (0.53.1, the definition of done). Every
    // page on live that holds one of this plugin's widgets, by its real
    // Elementor widget type (live-state-0.46.6.json): the plugin adds NOTHING
    // to any <head> but the staff page's — byte for byte what 0.53.0 added
    // (nothing), so the theme's viewport tag is the only one there. And
    // wp_head is hooked nowhere else in the plugin, so these two hooks are
    // all it can print.
    echo "\n-- every other live page's <head>: nothing added (0.53.1) --\n";
    $live = json_decode(file_get_contents(__DIR__ . '/render/live-state-0.46.6.json'), true);
    foreach ($live['widgets'] as $lw) {
        [$h, $head] = page((int) $lw['post_id'], true, ['_elementor_data' => '[{"elType":"widget","widgetType":"' . $lw['widget_type'] . '","settings":[]}]']);
        if ($lw['widget_type'] === 'dccac_staff') {
            check($lw['post_id'] . ' ' . $lw['post_title'] . ' (staff): robots + viewport-fit=cover', str_contains($head, 'noindex') && str_contains($head, 'viewport-fit=cover'), $head);
        } else {
            check($lw['post_id'] . ' ' . $lw['post_title'] . ' (' . $lw['widget_type'] . '): nothing in <head>, no header', $h === [] && $head === '', [$h, $head]);
        }
    }
    $hooks = [];
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($ROOT)) as $f) {
        if (substr((string) $f, -4) === '.php' && preg_match_all("/add_action\\(\\s*'wp_head'/", file_get_contents((string) $f), $m)) {
            $hooks[basename((string) $f)] = count($m[0]);
        }
    }
    check('wp_head is hooked in class-staff.php only (the two above), nowhere else in the plugin', $hooks === ['class-staff.php' => 2], $hooks);
    check('...and nothing buffers or rewrites the page (no ob_start on a front-end hook that could touch the theme\'s tag)',
        !preg_match("/add_action\\(\\s*'(template_redirect|wp_head|init|wp)'[^;]*ob_start|ob_start\\(\\s*\\[/", implode('', array_map('file_get_contents', glob($ROOT . '/includes/*.php')))));

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
