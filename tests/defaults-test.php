<?php
/**
 * "DEFAULTS MUST REPRODUCE CURRENT BEHAVIOUR EXACTLY" — asserted against the
 * OTHER FILES, not against the settings schema's own say-so.
 *
 * Before 0.40.0 the same value was written in up to three places at once: an
 * Elementor control default, a `var(--token, literal)` fallback in the
 * stylesheet, and a PHP `?? fallback`. PROJECT-NOTES records the rule that
 * made that survivable — "three places have to agree and nothing warns when
 * they drift" — and 0.29.0 records the release that had to move all three
 * together by hand. This suite IS the warning.
 *
 * It also guards the mechanism 0.40.0 introduced: sixteen colour controls now
 * carry NO default at all, so that Elementor emits nothing for them and the
 * settings token governs instead of being masked at (0,6,0). A default
 * creeping back into any of them silently re-arms exactly that trap, and is
 * invisible on a page whose Elementor CSS has not been regenerated yet.
 */
require __DIR__ . '/bootstrap.php';
$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';

$GLOBALS['t_options'] = [];
function get_transient($k) { return false; }
function set_transient($k, $v, $t) { return true; }
function delete_transient($k) { return true; }

require $ROOT . '/includes/class-cache.php';
require $ROOT . '/includes/class-data-provider.php';
require $ROOT . '/includes/class-staff.php';
require $ROOT . '/includes/class-ajax.php';
require $ROOT . '/includes/class-settings.php';

use MPHBAC\Settings;
use MPHBAC\Cache;
use MPHBAC\Data_Provider;
use MPHBAC\Ajax;
use MPHBAC\Staff;

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}

$widget_php = file_get_contents($ROOT . '/includes/class-widget.php');
$single_php = file_get_contents($ROOT . '/includes/class-widget-single.php');
$staff_php  = file_get_contents($ROOT . '/includes/class-staff-elementor.php');
/** Comments quote the very declarations they describe, so scan the CODE. */
$widget_css = preg_replace('#/\*.*?\*/#s', '', file_get_contents($ROOT . '/assets/css/widget.css'));
$staff_css  = preg_replace('#/\*.*?\*/#s', '', file_get_contents($ROOT . '/assets/css/staff.css'));

$d = Settings::defaults();

/**
 * What a stylesheet resolves a token to with nothing stored.
 *
 * IT HAS TO FOLLOW THE CHAIN, and the first version of this did not. Two of
 * the buttons' hover colours are written `var(--mphbac-color-btn-hover,
 * var(--dcc-button-hover-bg))` — a fallback that is itself a token — and a
 * regex stopping at the first `)` reported the literal string
 * "var(--dcc-button-hover-bg" as the resolved colour and failed two settings
 * that were in fact correct. An instrument that cannot read the stylesheet
 * the way a browser does reports drift where there is none, which is worse
 * than not checking at all.
 *
 * A token resolves either because the stylesheet DECLARES it, or because
 * every var() use of it carries the same fallback. Two different fallbacks
 * for one token is itself a drift and is reported as such.
 */
function css_take_var(string $s): ?array {
    // Return [token, fallback] from a string that starts with var(, honouring
    // nested parentheses rather than stopping at the first close.
    if (!preg_match('/^var\(\s*(--[A-Za-z0-9-]+)\s*/', $s, $m)) { return null; }
    $i = strlen($m[0]);
    if ($i < strlen($s) && $s[$i] === ')') { return [$m[1], null]; }
    if ($i >= strlen($s) || $s[$i] !== ',') { return null; }
    $i++;
    $depth = 1; $buf = '';
    for (; $i < strlen($s); $i++) {
        $c = $s[$i];
        if ($c === '(') { $depth++; }
        if ($c === ')') { $depth--; if ($depth === 0) { break; } }
        $buf .= $c;
    }
    return [$m[1], trim($buf)];
}

function css_resolves(string $css, string $token, int $depth = 0): ?string {
    if ($depth > 5) { return 'CYCLE:' . $token; }
    if (preg_match('/--' . preg_quote($token, '/') . ':\s*([^;]+);/', $css, $m)) {
        $v = trim($m[1]);
        $var = str_starts_with($v, 'var(') ? css_take_var($v) : null;
        if ($var === null) { return $v; }
        // Declared in terms of another token: resolve THAT, then its literal.
        $inner = css_resolves($css, substr($var[0], 2), $depth + 1);
        return $inner ?? $var[1];
    }
    $uses = [];
    $offset = 0;
    while (($pos = strpos($css, 'var(--' . $token, $offset)) !== false) {
        $offset = $pos + 1;
        $var = css_take_var(substr($css, $pos));
        // EXACT token, not a prefix. `var(--mphbac-color-btn-hover` is also a
        // prefix of `--mphbac-color-btn-hover-text`, so a prefix match mixed
        // a background colour and a text colour together and reported the
        // pair as AMBIGUOUS. Two of the settings were correct all along.
        if ($var === null || $var[1] === null || $var[0] !== '--' . $token) { continue; }
        $fb = $var[1];
        if (str_starts_with($fb, 'var(')) {
            $nested = css_take_var($fb);
            if ($nested !== null) {
                $fb = css_resolves($css, substr($nested[0], 2), $depth + 1) ?? $nested[1] ?? $fb;
            }
        }
        $uses[] = $fb;
    }
    if (!$uses) { return null; }
    $uses = array_values(array_unique(array_map('strtolower', $uses)));
    return count($uses) === 1 ? $uses[0] : 'AMBIGUOUS:' . implode('|', $uses);
}

echo "-- every settable colour resolves to its schema default with nothing stored --\n";
{
    $missing = $mismatch = [];
    foreach (Settings::schema() as $key => $f) {
        if ($f['type'] !== 'color' || ($f['token'] ?? '') === '') { continue; }
        $css = str_starts_with($f['token'], 'mphbac-') ? $widget_css : $staff_css;
        $resolved = css_resolves($css, $f['token']);
        if ($resolved === null) { $missing[$key] = $f['token']; continue; }
        if (strcasecmp($resolved, (string) $f['default']) !== 0) {
            $mismatch[$key] = ['schema' => $f['default'], 'stylesheet' => $resolved];
        }
    }
    check('every token a setting writes is resolvable from the stylesheet alone',
        $missing === [], $missing);
    check('...and the stylesheet resolves it to the very value the schema ships',
        $mismatch === [], $mismatch);
}

echo "\n-- the engine defaults ARE the shipped constants --\n";
{
    check('cache_ttl matches Cache::DEFAULT_TTL',
        $d['cache_ttl'] === Cache::DEFAULT_TTL, [$d['cache_ttl'], Cache::DEFAULT_TTL]);
    check('forward_scan_days matches Data_Provider::FORWARD_SCAN_MAX_DAYS',
        $d['forward_scan_days'] === Data_Provider::FORWARD_SCAN_MAX_DAYS);
    check('max_range_days matches Ajax::MAX_RANGE_DAYS',
        $d['max_range_days'] === Ajax::MAX_RANGE_DAYS);
    check('clamp_past_days matches Ajax::CLAMP_PAST_DAYS',
        $d['clamp_past_days'] === Ajax::CLAMP_PAST_DAYS);
    check('clamp_future_days matches Ajax::CLAMP_FUTURE_DAYS',
        $d['clamp_future_days'] === Ajax::CLAMP_FUTURE_DAYS);
    check('staff_page_id matches Staff::DEFAULT_PAGE_ID',
        $d['staff_page_id'] === Staff::DEFAULT_PAGE_ID);
    check('staff_capability matches the capability the gate shipped with',
        $d['staff_capability'] === 'edit_mphb_bookings', $d['staff_capability']);
}

echo "\n-- the sixteen token colours carry NO Elementor default --\n";
{
    // A default here is emitted into Elementor's per-post CSS at (0,6,0),
    // where it out-specifies the settings token no matter what widget.css
    // says. That is the whole reason they were emptied.
    $EMPTIED = ['color_available','color_booked','color_past','calheader_bg','namecol_bg',
                'namecol_alt_bg','nav_btn_bg','nav_btn_text','nav_btn_hover_bg',
                'button_bg_color','button_text_color','button_bg_color_hover',
                'view_bg_color','view_text_color','view_bg_color_hover','view_text_color_hover'];
    $armed = [];
    foreach ($EMPTIED as $key) {
        if (!preg_match("/add_(?:responsive_)?control\('" . $key . "',\s*\[(.*?)\n        \]\);/s", $widget_php, $m)) {
            $armed[$key] = 'CONTROL MISSING';
            continue;
        }
        if (preg_match("/'default'\s*=>/", $m[1])) { $armed[$key] = 'has a default again'; }
    }
    check('none of the sixteen has grown a default back', $armed === [], $armed);
    check('...and each still says so in the panel, so "empty" reads as deliberate',
        substr_count($widget_php, 'Leave empty to follow DCC') === 16,
        substr_count($widget_php, 'Leave empty to follow DCC'));
    check('the staff widget\'s three colours are emptied on the same rule',
        substr_count($staff_php, 'Leave empty to follow DCC') === 3
        && !preg_match("/add_control\('nav_btn_bg',\s*\[[^\]]*'default'/s", $staff_php),
        substr_count($staff_php, 'Leave empty to follow DCC'));
}

echo "\n-- every other control default READS the setting rather than repeating it --\n";
{
    // These are the controls whose value is a paint property or a behaviour,
    // where an empty default would mean "no colour" or "no value" rather than
    // "inherit". They take the setting AS the default instead.
    $INHERIT = ['calheader_text','namecol_text','legend_text_color','visible_days','font_size',
                'dow_format','label_style','namecol_style','show_legend','show_nav','show_past',
                'heading_show','enable_popup','min_nights','info_popup_full_width',
                'info_popup_max_width','info_popup_side_margin','namecol_width','cell_radius',
                'cell_min_height','header_min_height','cell_gap'];
    $literal = [];
    foreach ($INHERIT as $key) {
        if (!preg_match("/add_(?:responsive_)?control\('" . $key . "',\s*\[(.*?)\n        \]\);/s", $widget_php, $m)) {
            $literal[$key] = 'CONTROL MISSING'; continue;
        }
        if (!preg_match("/'default'\s*=>[^\n]*Settings::get\('" . $key . "'\)/", $m[1])) {
            $literal[$key] = 'default does not read the setting';
        }
    }
    check('each reads Settings::get() for its OWN key', $literal === [], $literal);
    check('every key those controls read actually exists in the schema',
        !array_diff($INHERIT, array_keys(Settings::schema())),
        array_diff($INHERIT, array_keys(Settings::schema())));
}

echo "\n-- 4 / 2 / 2 is written ONCE, not in two places that can drift --\n";
{
    check('the single widget\'s months control reads the settings',
        preg_match("/'default'\s*=> Settings::get\('months_shown'\)/", $single_php) === 1
        && preg_match("/'tablet_default'\s*=> Settings::get\('months_shown_tablet'\)/", $single_php) === 1
        && preg_match("/'mobile_default'\s*=> Settings::get\('months_shown_mobile'\)/", $single_php) === 1);
    check('and the multi-cottage render fallback reads the same keys',
        preg_match("/device_number\(\\\$settings\['months_shown'\]\s*\?\? null, \(int\) Settings::get\('months_shown'\)/", $widget_php) === 1);
    check('the shipped values are still 4 / 2 / 2',
        [$d['months_shown'], $d['months_shown_tablet'], $d['months_shown_mobile']] === [4, 2, 2],
        [$d['months_shown'], $d['months_shown_tablet'], $d['months_shown_mobile']]);
}

echo "\n-- the PHP render fallbacks read the settings too --\n";
{
    $stale = [];
    foreach ([
        "\$settings['enable_popup'] ?? 'yes'",
        "\$settings['min_nights'] ?? 2",
        "\$settings['show_past'] ?? 'yes'",
        "\$settings['namecol_style'] ?? 'scales'",
        "\$settings['info_popup_full_width'] ?? 'yes'",
    ] as $old) {
        if (str_contains($widget_php, $old)) { $stale[] = $old; }
    }
    check('no render fallback still hard-codes a value the settings own', $stale === [], $stale);
}

echo "\n-- nothing on this screen can reach booking or guest data --\n";
{
    $admin = file_get_contents($ROOT . '/includes/class-admin.php');
    $settings_src = file_get_contents($ROOT . '/includes/class-settings.php');
    // NEEDLES ARE CALLS, NOT WORDS. The first version of this searched for
    // the substring "_mphb_" and failed on the capability NAME
    // edit_mphb_bookings, which is a permission string in a <select> and not
    // booking data at all. A check that cannot tell a capability from a meta
    // key reports a leak where there is none, and would have been silenced
    // rather than fixed.
    foreach (['Staff_Data::', 'get_post_meta(', 'get_posts(', 'MPHB()', '$wpdb', 'get_transient('] as $needle) {
        check("the settings screen never calls $needle",
            !str_contains($admin, $needle) && !str_contains($settings_src, $needle), $needle);
    }
    check('...and the only mphb_* strings on it are capability names in a choice list',
        preg_match_all('/_mphb_\w+/', $admin . $settings_src, $m) === 0
        || array_unique($m[0]) === ['_mphb_bookings'], $m[0] ?? []);
}

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
