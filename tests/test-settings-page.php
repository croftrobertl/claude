<?php
/**
 * Settings page: the post-save redirect, the notice, the view-state round trip.
 *
 *   php tests/test-settings-page.php            # against this checkout
 *   php tests/test-settings-page.php <plugin>/  # against another copy (e.g. 0.51.0)
 *
 * THE BUG THIS PINS (0.51.0 and earlier): admin-post.php never fires admin_menu,
 * so $GLOBALS['admin_page_hooks'] is empty on the save request whether or not the
 * shared `dcc` parent exists. The redirect read that global, always concluded
 * "no parent", and sent every save to options-general.php?page=… — which
 * WordPress refuses for a page registered under `dcc`. Every redirect test below
 * therefore runs with admin_page_hooks UNSET, as on the real request.
 */
if (isset($argv[1])) {
    $GLOBALS['__dccs_dir'] = rtrim($argv[1], '/') . '/';
}
require __DIR__ . '/settings-page-stubs.php';

use DCCS\Settings_Page as P;

$pass = 0; $fail = 0;
function ok(string $name, bool $cond, string $detail = ''): void {
    global $pass, $fail;
    if ($cond) { $pass++; echo "  ok - $name\n"; }
    else { $fail++; echo "  NOT OK - $name" . ($detail !== '' ? "  [$detail]" : '') . "\n"; }
}

/**
 * Can WordPress load this URL for a page registered under $parent? Models
 * wp-admin/admin.php + user_can_access_admin_page() for a plugin page:
 *   - admin.php?page=X resolves the parent by searching $submenu for X, so it
 *     works under ANY parent (this is how every `dcc` page is linked);
 *   - <parent>.php?page=X works only when <parent>.php is the parent it was
 *     registered under — options-general.php?page=X for a `dcc` page has no
 *     hookname registered and dies "Sorry, you are not allowed to access this page."
 * This is the model; the DCC admin session checks it on the real site.
 */
function reachable(string $url, string $parent): bool {
    $p = parse_url($url);
    parse_str($p['query'] ?? '', $q);
    if (($q['page'] ?? '') !== 'dcc-cottage-selector') { return false; }
    $file = basename($p['path'] ?? '');
    if ($file === 'admin.php') { return true; }
    return $file === $parent;
}

/** Run handle_save() with this referer and POST; return the redirect target. */
function save($referer, array $post = []): string {
    unset($GLOBALS['admin_page_hooks']);              // as on admin-post.php
    $GLOBALS['__ref'] = $referer; $GLOBALS['__calls'] = [];
    $_POST = $post + ['action' => 'dccs_save_settings', 'results_count' => '4', 'enabled_modes' => ['quick', 'compare']];
    try { P::handle_save(); } catch (WPRedirect $r) { return $r->to; }
    return '(no redirect)';
}
function q(string $url): array { parse_str(parse_url($url, PHP_URL_QUERY) ?? '', $q); return $q; }

$LIVE = 'dcc';                  // the parent on live: the shared DCC menu
$SOLO = 'options-general.php';  // the standalone fallback when the mu-plugin is absent

echo "Redirect after Save\n";
$cases = [
    'live: from admin.php?page=…'                   => ['/wp-admin/admin.php?page=dcc-cottage-selector', $LIVE, 'admin.php'],
    'live: absolute referer'                         => ['https://example.test/wp-admin/admin.php?page=dcc-cottage-selector', $LIVE, 'admin.php'],
    'standalone: from options-general.php?page=…'   => ['/wp-admin/options-general.php?page=dcc-cottage-selector', $SOLO, 'options-general.php'],
    'live: no referer at all'                        => [false, $LIVE, 'admin.php'],
    'standalone: no referer at all'                  => [false, $SOLO, 'admin.php'],
];
foreach ($cases as $name => [$ref, $parent, $file]) {
    $to = save($ref);
    ok("$name -> $file", basename(parse_url($to, PHP_URL_PATH)) === $file, $to);
    ok("$name -> page loads under its parent", reachable($to, $parent), $to);
    ok("$name -> stays on this site's wp-admin", strpos($to, 'https://example.test/wp-admin/') === 0, $to);
    ok("$name -> carries dccs-saved=1", (q($to)['dccs-saved'] ?? '') === '1', $to);
}
// Positive control for reachable(): the 0.51.0 target IS refused on live.
ok('control: options-general.php?page=… is refused under the dcc parent',
    !reachable('https://example.test/wp-admin/options-general.php?page=dcc-cottage-selector', $LIVE));

echo "Referers that must not be followed\n";
$bad = [
    'another plugin page'      => '/wp-admin/admin.php?page=dcc-custom-checkout',
    'another admin file'       => '/wp-admin/edit.php?page=dcc-cottage-selector',
    'another host'             => 'https://evil.test/wp-admin/options-general.php?page=dcc-cottage-selector',
    'path outside wp-admin'    => '/options-general.php?page=dcc-cottage-selector',
    'dot-segment trick'        => '/wp-admin/x/../options-general.php?page=dcc-cottage-selector',
    'page as an array'         => '/wp-admin/options-general.php?page[]=dcc-cottage-selector',
    'front end'                => '/cottages/?page=dcc-cottage-selector',
    'garbage'                  => 'javascript:alert(1)',
];
foreach ($bad as $name => $ref) {
    $to = save($ref);
    ok("$name -> falls back to admin.php", parse_url($to, PHP_URL_PATH) === '/wp-admin/admin.php', $to);
    ok("$name -> fallback loads on live and standalone", reachable($to, $LIVE) && reachable($to, $SOLO), $to);
}
// A subdirectory install: the admin path comes from admin_url(), not a literal.
$GLOBALS['__admin_path'] = '/blog/wp-admin/';
$to = save('/blog/wp-admin/options-general.php?page=dcc-cottage-selector');
ok('subdirectory install: referer file honoured', parse_url($to, PHP_URL_PATH) === '/blog/wp-admin/options-general.php', $to);
$to = save('/wp-admin/options-general.php?page=dcc-cottage-selector');
ok('subdirectory install: a different wp-admin is not', parse_url($to, PHP_URL_PATH) === '/blog/wp-admin/admin.php', $to);
$GLOBALS['__admin_path'] = '/wp-admin/';

echo "Second save from the reloaded page\n";
$to = save('/wp-admin/admin.php?page=dcc-cottage-selector&dccs-saved=1&dccs-scroll=900&dccs-adv=1&foo=bar');
$q = q($to);
ok('only page and dccs-saved survive from a stale referer', array_keys($q) === ['page', 'dccs-saved'], $to);

echo "View state round trip\n";
$q = q(save('/wp-admin/admin.php?page=dcc-cottage-selector', ['dccs_scroll' => '-120', 'dccs_adv' => '1']));
ok('scroll offset carried (negative allowed)', ($q['dccs-scroll'] ?? null) === '-120');
ok('advanced-open carried', ($q['dccs-adv'] ?? null) === '1');
foreach (['12abc', '1e3', '9999999', '', ' 5', '<b>'] as $junk) {
    $q = q(save(false, ['dccs_scroll' => $junk]));
    ok('junk scroll ' . json_encode($junk) . ' dropped, not coerced', !array_key_exists('dccs-scroll', $q));
}
$q = q(save(false, ['dccs_scroll' => ['1'], 'dccs_adv' => 'yes']));
ok('array scroll dropped', !array_key_exists('dccs-scroll', $q));
ok("dccs_adv other than '1' dropped", !array_key_exists('dccs-adv', $q));
$q = q(save(false));
ok('no view state when the script did not run', !array_key_exists('dccs-scroll', $q) && !array_key_exists('dccs-adv', $q));

echo "Security shape unchanged\n";
save(false);
ok('saves the option', ($GLOBALS['__opts']['dccs_settings']['results_count'] ?? null) === 4);
ok('capability, then nonce, then write', $GLOBALS['__calls'] === ['cap', 'nonce', 'update'], implode(',', $GLOBALS['__calls']));
ok('view-state fields never reach the option', !array_intersect(['dccs_scroll', 'dccs_adv'], array_keys($GLOBALS['__opts']['dccs_settings'])));
$GLOBALS['__cap'] = false; $GLOBALS['__opts'] = [];
$died = false;
try { save(false); } catch (WPDie $e) { $died = true; }
ok('no capability: dies before writing', $died && !isset($GLOBALS['__opts']['dccs_settings']));
$GLOBALS['__cap'] = true;

echo "Nothing reads menu globals on the save request\n";
$src = file_get_contents(DCCS_DIR . 'includes/class-settings-page.php');
$code = '';
foreach (token_get_all($src) as $t) {
    if (is_array($t) && in_array($t[0], [T_COMMENT, T_DOC_COMMENT], true)) { continue; }
    $code .= is_array($t) ? $t[1] : $t;
}
ok('class-settings-page.php CODE has no admin_page_hooks', strpos($code, 'admin_page_hooks') === false);
ok('class-settings-page.php CODE has no parent_file()', strpos($code, 'parent_file') === false);
ok('control: the comment does mention admin_page_hooks (tokeniser strips it)', strpos($src, 'admin_page_hooks') !== false);

echo "Render\n";
function page(array $get): string {
    $_GET = $get; $GLOBALS['wp_settings_errors'] = [];
    ob_start(); P::render(); return ob_get_clean();
}
function dom(string $html): DOMXPath {
    $d = new DOMDocument(); libxml_use_internal_errors(true);
    $d->loadHTML('<?xml encoding="utf-8"?>' . $html); libxml_clear_errors();
    return new DOMXPath($d);
}
$x = dom(page(['page' => 'dcc-cottage-selector', 'dccs-saved' => '1', 'dccs-scroll' => '-40', 'dccs-adv' => '1']));
$n = $x->query("//div[contains(concat(' ', normalize-space(@class), ' '), ' notice-success ')]");
ok('after save: one success notice', $n->length === 1, (string) $n->length);
ok('after save: it is core settings_errors markup (id setting-error-settings_updated, settings-error, dismissible)',
    $n->length === 1 && $n->item(0)->getAttribute('id') === 'setting-error-settings_updated'
    && strpos($n->item(0)->getAttribute('class'), 'settings-error') !== false
    && strpos($n->item(0)->getAttribute('class'), 'is-dismissible') !== false);
ok('after save: reads "Settings saved."', $n->length === 1 && trim($n->item(0)->textContent) === 'Settings saved.');
$h1 = $x->query('//div[@class="wrap"]/*[1]');
ok('notice sits directly under the page heading', $h1->length && $h1->item(0)->nodeName === 'h1'
    && $x->query('//div[@class="wrap"]/*[2]')->item(0)->getAttribute('id') === 'setting-error-settings_updated');
$f = $x->query('//form[@id="dccs-settings-form"]')->item(0);
ok('form carries data-dccs-scroll', $f && $f->getAttribute('data-dccs-scroll') === '-40');
ok('form carries data-dccs-adv', $f && $f->getAttribute('data-dccs-adv') === '1');
ok('form has the two empty view-state fields',
    $x->query('//form//input[@type="hidden"][@name="dccs_scroll"][@value=""]')->length === 1
    && $x->query('//form//input[@type="hidden"][@name="dccs_adv"][@value=""]')->length === 1);
ok('Advanced is a details.dccs-advanced, closed in the markup',
    $x->query('//details[@class="dccs-advanced"][not(@open)]')->length === 1);

$x = dom(page(['page' => 'dcc-cottage-selector']));
ok('plain visit: no notice', $x->query("//div[contains(@class, 'notice')]")->length === 0);
$f = $x->query('//form[@id="dccs-settings-form"]')->item(0);
ok('plain visit: no restore attributes', $f && !$f->hasAttribute('data-dccs-scroll') && !$f->hasAttribute('data-dccs-adv'));
$x = dom(page(['dccs-scroll' => '300', 'dccs-adv' => '1']));
ok('restore attributes need dccs-saved too', !$x->query('//form')->item(0)->hasAttribute('data-dccs-scroll'));
$html = page(['dccs-saved' => '1', 'dccs-scroll' => '"><script>alert(1)</script>', 'dccs-adv' => 'x"']);
ok('hostile restore values are dropped, never echoed', strpos($html, '<script>') === false && strpos($html, 'alert(1)') === false
    && !dom($html)->query('//form')->item(0)->hasAttribute('data-dccs-scroll'));
$x = dom(page(['dccs-saved' => '2']));
ok("dccs-saved other than '1': no notice", $x->query("//div[contains(@class, 'notice')]")->length === 0);

echo "Hooks\n";
$GLOBALS['__hooks'] = [];
P::init();
$removable = apply_filters('removable_query_args', ['settings-updated']);
ok('removable_query_args keeps core args and adds ours',
    $removable === ['settings-updated', 'dccs-saved', 'dccs-scroll', 'dccs-adv'], json_encode($removable));
P::$hook = 'dcc_page_dcc-cottage-selector';
foreach ($GLOBALS['__hooks']['admin_enqueue_scripts'] ?? [] as $cb) { $cb('index.php'); }
ok('script not enqueued on other admin pages', !isset($GLOBALS['__scripts']['dccs-settings-page']));
foreach ($GLOBALS['__hooks']['admin_enqueue_scripts'] ?? [] as $cb) { $cb('dcc_page_dcc-cottage-selector'); }
$s = $GLOBALS['__scripts']['dccs-settings-page'] ?? null;
ok('script enqueued on this page, in the footer', $s !== null && $s['footer'] === true);
ok('enqueued file exists in the plugin', $s !== null && is_file(DCCS_DIR . substr($s['src'], strlen(DCCS_URL))));

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
