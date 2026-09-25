<?php
/**
 * The settings screen: the shared-menu contract, and the four security rules
 * that are non-negotiable on an admin page — capability on render AND on
 * save, a nonce verified before anything is written, sanitise in, escape out.
 *
 * THE MENU IS A CONTRACT BETWEEN PLUGINS, not this plugin's property. Several
 * DCC plugins register the same `dcc` parent at admin_menu priority 5. This
 * suite asserts the three rules that keep them from fighting: register the
 * parent only if it is ABSENT, take a submenu priority nobody else is using,
 * and remove the duplicate parent entry at 999.
 */
require __DIR__ . '/bootstrap.php';
$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';

$GLOBALS['t_options']  = [];
$GLOBALS['t_actions']  = [];   // hook => [[cb, priority], ...]
$GLOBALS['t_menus']    = [];
$GLOBALS['t_submenus'] = [];
$GLOBALS['t_removed']  = [];
$GLOBALS['t_died']     = null;
$GLOBALS['t_can']      = true;
$GLOBALS['t_referer']  = true;
$GLOBALS['admin_page_hooks'] = [];

function get_transient($k) { return false; }
function set_transient($k, $v, $t) { return true; }
function delete_transient($k) { return true; }
function add_action($hook, $cb, $prio = 10, $args = 1) { $GLOBALS['t_actions'][$hook][] = [$cb, $prio]; }
function current_user_can($c) { return $GLOBALS['t_can']; }
function is_user_logged_in() { return true; }
function post_password_required($p = null) { return true; }
function add_menu_page($pt, $mt, $cap, $slug, $cb = '', $icon = '', $pos = null) {
    // Real WordPress records the hook name here; the "is it already there"
    // test depends on it, so the stub must do it too.
    $GLOBALS['admin_page_hooks'][$slug] = $mt;
    $GLOBALS['t_menus'][] = compact('pt', 'mt', 'cap', 'slug', 'cb', 'icon', 'pos');
    return 'toplevel_page_' . $slug;
}
function add_submenu_page($parent, $pt, $mt, $cap, $slug, $cb = '') {
    $GLOBALS['t_submenus'][] = compact('parent', 'pt', 'mt', 'cap', 'slug', 'cb');
    return $parent . '_page_' . $slug;
}
function remove_submenu_page($parent, $slug) { $GLOBALS['t_removed'][] = [$parent, $slug]; }
class T_Died extends \Exception {}
function wp_die($msg = '', $title = '', $args = []) { $GLOBALS['t_died'] = [$msg, $args]; throw new T_Died('died'); }
function check_admin_referer($action, $field) {
    $GLOBALS['t_referer_checked'] = [$action, $field];
    if (!$GLOBALS['t_referer']) { wp_die('bad nonce', '', ['response' => 403]); }
    return true;
}
function wp_nonce_field($a, $n, $ref = true, $echo = true) { echo '<input type="hidden" name="' . $n . '" value="nonce">'; }
function wp_unslash($v) { return is_array($v) ? array_map('wp_unslash', $v) : stripslashes((string) $v); }
function selected($a, $b, $echo = true) { return (string) $a === (string) $b ? ' selected' : ''; }
function submit_button($text, $type = '', $name = '', $wrap = true, $attrs = '') {
    $a = '';
    foreach ((array) $attrs as $k => $v) { $a .= ' ' . $k . '="' . $v . '"'; }
    echo '<input type="submit" name="' . $name . '" value="' . htmlspecialchars($text, ENT_QUOTES) . '"' . $a . '>';
}
function is_admin() { return true; }
function admin_url($p = '') { return 'https://example.test/wp-admin/' . $p; }
function esc_url($u) { return htmlspecialchars((string) $u, ENT_QUOTES); }
function add_query_arg($args, $url) { return $url . '?' . http_build_query($args); }
function sanitize_key($k) { return preg_replace('/[^a-z0-9_\-]/', '', strtolower((string) $k)); }
class T_Redirect extends \Exception {}
function wp_safe_redirect($to, $status = 302) { $GLOBALS['t_redirect'] = $to; throw new T_Redirect('redirect'); }

require $ROOT . '/includes/class-cache.php';
require $ROOT . '/includes/class-data-provider.php';
require $ROOT . '/includes/class-staff.php';
require $ROOT . '/includes/class-ajax.php';
require $ROOT . '/includes/class-settings.php';
require $ROOT . '/includes/class-admin.php';

use MPHBAC\Admin;
use MPHBAC\Settings;

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}
function render_page(): string {
    ob_start();
    try { Admin::render(); } catch (T_Died $e) { /* recorded in t_died */ }
    return (string) ob_get_clean();
}

echo "-- this plugin does not own the dcc parent --\n";
{
    /* dcc-menu.php, a site-side mu-plugin, registers the parent at 5 and
       removes the mirrored duplicate at 999. That is the fix to the CAUSE:
       add_menu_page() always creates a submenu duplicating its own parent, so
       every plugin that registered the parent also had to carry a removal,
       and four of them did. With one owner there is nothing to deduplicate.
       What this plugin must do is add a submenu and NOTHING else. */
    $GLOBALS['admin_page_hooks'] = [];
    $GLOBALS['t_menus'] = [];
    $GLOBALS['t_removed'] = [];
    $GLOBALS['t_actions'] = [];
    Admin::register();
    foreach ($GLOBALS['t_actions']['admin_menu'] ?? [] as [$cb, $p]) { $cb(); }
    check('it never calls add_menu_page — the parent is not its to create',
        $GLOBALS['t_menus'] === [], $GLOBALS['t_menus']);
    check('...and never removes a submenu it did not add',
        $GLOBALS['t_removed'] === [], $GLOBALS['t_removed']);
    check('the methods that used to do both are gone from the class, not merely unhooked',
        !method_exists(Admin::class, 'register_parent')
        && !method_exists(Admin::class, 'remove_duplicate_parent'));
    // SCAN THE CODE, NOT THE COMMENTS. The docblock explains add_menu_page()
    // and remove_submenu_page() at length — that is the point of it — so a
    // raw substring search matches the prose describing what this file no
    // longer does. The project has recorded this exact fault before.
    $src  = file_get_contents(dirname(__DIR__) . '/mphb-availability-calendar/includes/class-admin.php');
    $code = preg_replace(['#/\*.*?\*/#s', '#//[^\n]*#'], '', $src);
    check('(instrument check) the comments really do mention them, so this is not vacuous',
        str_contains($src, 'add_menu_page(') && str_contains($src, 'remove_submenu_page('));
    check('and no CALL to either survives in the code',
        !str_contains($code, 'add_menu_page(') && !str_contains($code, 'remove_submenu_page('),
        array_values(array_filter(explode("\n", $code),
            static fn($l) => str_contains($l, 'add_menu_page(') || str_contains($l, 'remove_submenu_page('))));
}

echo "\n-- the hook priorities are the ones the contract names --\n";
{
    $GLOBALS['t_actions'] = [];
    Admin::register();
    $prios = [];
    foreach ($GLOBALS['t_actions']['admin_menu'] ?? [] as [$cb, $p]) { $prios[] = $p; }
    sort($prios);
    check('exactly one admin_menu hook, and it is the submenu', $prios === [55], $prios);
    /* THE LIVE REGISTER, as verified by the intermediary on 2026-09-25.
       0.40.0 took 40 and collided with dcc-seasons, which was already there —
       neither session could see the other's source, which is why the number
       is stated in every report and pinned here. */
    $TAKEN = [5 => 'dcc-menu (parent)', 20 => 'contact-form', 30 => 'guest-guide',
              35 => 'features-amenities', 40 => 'seasons', 45 => 'cottage-selector',
              50 => 'custom-checkout', 63 => 'wildlife',
              10 => 'reserved (mu-plugin)', 60 => 'reserved (mu-plugin)'];
    check('55 collides with nothing on the live register',
        !array_intersect($prios, array_keys($TAKEN)),
        array_intersect_key($TAKEN, array_flip($prios)));
    check('the persisted upgrade merge runs on admin_init, never on a front-end view',
        isset($GLOBALS['t_actions']['admin_init']));
    check('the save has its own entry point rather than riding on the render',
        isset($GLOBALS['t_actions']['admin_post_' . Admin::SAVE_ACTION]));
}

echo "\n-- the submenu --\n";
{
    $GLOBALS['t_submenus'] = [];
    Admin::register_page();
    $s = $GLOBALS['t_submenus'][0] ?? [];
    check('hangs off the shared parent', ($s['parent'] ?? '') === 'dcc', $s['parent'] ?? null);
    check('is capability-gated at registration too', ($s['cap'] ?? '') === 'manage_options', $s['cap'] ?? null);
}

echo "\n-- capability: RENDER --\n";
{
    $GLOBALS['t_can'] = false;
    $GLOBALS['t_died'] = null;
    $_POST = [];
    render_page();
    check('a user without the capability is stopped before anything is drawn',
        $GLOBALS['t_died'] !== null && ($GLOBALS['t_died'][1]['response'] ?? 0) === 403);
}

echo "\n-- capability and nonce: SAVE --\n";
{
    /* THE SAVE IS ITS OWN ENTRY POINT since 0.40.0 (admin-post.php), which is
       why these checks are testable at all. While the POST was handled inside
       render(), render()'s own capability check ran first and the save path's
       check was unreachable — a mutation deleting it changed nothing and
       SURVIVED. admin-post.php has no guard of its own, so what is below is
       the whole guard. */
    $save = static function (): void {
        $GLOBALS['t_died'] = null;
        $GLOBALS['t_redirect'] = null;
        try { Admin::handle_save(); } catch (T_Died $e) {} catch (T_Redirect $e) {}
    };

    // Valid nonce, no capability.
    $GLOBALS['t_options'] = []; Settings::flush();
    $GLOBALS['t_can'] = false; $GLOBALS['t_referer'] = true;
    $_POST = ['mphbac' => ['color_booked' => '#123456']];
    $save();
    check('a valid nonce does NOT substitute for the capability',
        $GLOBALS['t_died'] !== null && !isset($GLOBALS['t_options'][Settings::OPTION]));
    check('...and it is refused with a 403, not a redirect',
        ($GLOBALS['t_died'][1]['response'] ?? 0) === 403 && $GLOBALS['t_redirect'] === null);

    // Capability, bad nonce.
    $GLOBALS['t_can'] = true; $GLOBALS['t_referer'] = false;
    $GLOBALS['t_options'] = []; Settings::flush();
    $save();
    check('and the capability does NOT substitute for the nonce',
        $GLOBALS['t_died'] !== null && !isset($GLOBALS['t_options'][Settings::OPTION]));

    // Both.
    $GLOBALS['t_can'] = true; $GLOBALS['t_referer'] = true;
    $GLOBALS['t_options'] = []; Settings::flush();
    $save();
    check('with both, the save happens', isset($GLOBALS['t_options'][Settings::OPTION]));
    check('...and only schema keys are written',
        array_keys($GLOBALS['t_options'][Settings::OPTION]) === array_keys(Settings::defaults()));
    check('...and the submitted value is stored',
        $GLOBALS['t_options'][Settings::OPTION]['color_booked'] === '#123456');
    check('...and the nonce that was checked is the one the form emits',
        ($GLOBALS['t_referer_checked'] ?? []) === [Admin::SAVE_ACTION, 'mphbac_nonce'],
        $GLOBALS['t_referer_checked'] ?? null);
    check('POST-REDIRECT-GET: it ends in a redirect, so a refresh cannot re-submit',
        is_string($GLOBALS['t_redirect']) && str_contains($GLOBALS['t_redirect'], 'mphbac-notice=saved'),
        $GLOBALS['t_redirect']);

    // The form must actually point at that entry point, or none of the above
    // guards the thing the admin is really using.
    $GLOBALS['t_can'] = true; $_POST = [];
    $GLOBALS['t_options'] = []; Settings::flush();
    $form = render_page();
    check('the form posts to admin-post.php with the matching action',
        str_contains($form, 'action="https://example.test/wp-admin/admin-post.php"')
        && str_contains($form, 'name="action" value="' . Admin::SAVE_ACTION . '"'));

    // And the notice comes from the query string, matched against a fixed
    // list — never echoed back.
    $_GET = ['mphbac-notice' => 'saved'];
    check('the confirmation is shown after the redirect', str_contains(render_page(), 'Settings saved'));
    $_GET = ['mphbac-notice' => '"><script>alert(1)</script>'];
    $html = render_page();
    check('a notice value invented in the URL is ignored, not printed',
        !str_contains($html, '<script') && !str_contains($html, 'Settings saved'));
    $_GET = [];
}

echo "\n-- a hostile stored value cannot break out on the way back to the page --\n";
{
    // Settings::all() re-validates, so a bad colour never even reaches the
    // form. This asserts the SECOND line of defence: whatever is printed is
    // escaped at the point of output.
    $GLOBALS['t_can'] = true;
    $_POST = [];
    $GLOBALS['t_options'] = [Settings::OPTION => [
        'color_booked'     => '#fff" onfocus="alert(1)',
        'staff_capability' => '"><script>alert(1)</script>',
    ]];
    Settings::flush();
    $html = render_page();
    check('no unescaped quote-break survives into an attribute',
        !str_contains($html, 'onfocus="alert'), 'onfocus');
    check('no script tag survives', !str_contains($html, '<script'), '<script');
    check('the value shown is the safe default instead',
        str_contains($html, 'value="#FB6962"'));
}

echo "\n-- accessibility --\n";
{
    $GLOBALS['t_can'] = true;
    $_POST = [];
    $GLOBALS['t_options'] = [];
    Settings::flush();
    $html = render_page();

    preg_match_all('/<(input|select)[^>]*\sid="([^"]+)"/', $html, $controls);
    preg_match_all('/<label[^>]*\sfor="([^"]+)"/', $html, $labels);
    $unlabelled = array_values(array_diff(
        array_filter($controls[2], static fn($id) => str_starts_with($id, 'mphbac-')),
        $labels[1]
    ));
    check('every settings control has a <label for> pointing at it',
        $unlabelled === [], $unlabelled);

    // Help text must be TIED to its control, not merely adjacent.
    preg_match_all('/id="(mphbac-[\w-]+-help)"/', $html, $helps);
    $untied = [];
    foreach ($helps[1] as $hid) {
        if (!str_contains($html, 'aria-describedby="' . $hid . '"')) { $untied[] = $hid; }
    }
    check('every help paragraph is referenced by aria-describedby', $untied === [], $untied);

    check('the colour swatch is hidden from assistive tech — the text field IS the control',
        substr_count($html, 'class="mphbac-swatch" aria-hidden="true"') === substr_count($html, 'mphbac-swatch"'),
        substr_count($html, 'mphbac-swatch'));
    check('the advanced section is a native <details>, so it is keyboard-operable with no JS',
        str_contains($html, '<details') && str_contains($html, '<summary>'));
    check('NO JavaScript is added to this screen at all',
        !str_contains($html, '<script') && !str_contains($html, 'onclick='));
    check('the disclosure has a visible focus ring declared',
        str_contains($html, 'summary:focus-visible{outline:'));
    $_GET = ['mphbac-notice' => 'saved'];
    check('the saved notice is role=status, not an alert that interrupts',
        str_contains(render_page(), 'role="status"'));
    $_GET = [];
}

echo "\n-- reset --\n";
{
    $GLOBALS['t_can'] = true;
    $GLOBALS['t_referer'] = true;
    $GLOBALS['t_options'] = [Settings::OPTION => ['color_booked' => '#123456']];
    Settings::flush();
    $_POST = ['mphbac_reset' => 'Reset'];
    $GLOBALS['t_redirect'] = null;
    try { Admin::handle_save(); } catch (T_Died $e) {} catch (T_Redirect $e) {}
    $_POST = [];
    check('reset restores every shipped default',
        $GLOBALS['t_options'][Settings::OPTION] === Settings::defaults());
    check('...and still went through the nonce check',
        ($GLOBALS['t_referer_checked'] ?? []) === [Admin::SAVE_ACTION, 'mphbac_nonce']);
    check('...and redirects like a save does',
        is_string($GLOBALS['t_redirect']) && str_contains($GLOBALS['t_redirect'], 'mphbac-notice=reset'),
        $GLOBALS['t_redirect']);
    $_GET = ['mphbac-notice' => 'reset'];
    check('the page says so', str_contains(render_page(), 'back to the value the plugin ships with'));
    $_GET = [];
}

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
