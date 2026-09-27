<?php
/**
 * LAZY COTTAGE INFO PANELS, and the two reasons v0.6.0's attempt failed.
 *
 * The multi-cottage widget renders every cottage's info panel into the page
 * whether or not anyone opens one — measured at 413 KB raw / 47 KB gzipped
 * of the home page. 0.42.0 can defer them. The note at class-widget.php
 * records why the last attempt was abandoned: "Elementor never enqueues
 * template CSS on the parent page in that mode, so multi-column widgets lost
 * their styles on subsequent opens."
 *
 * THERE ARE TWO FAILURES IN THAT SENTENCE, not one, and both are covered here:
 *
 *   CSS. get_builder_content_for_display($id, true) does not INLINE the
 *   template's stylesheet, it ENQUEUES it — and an enqueue during an
 *   admin-ajax request reaches nothing, because wp_head fired long ago on the
 *   page the visitor is looking at. The site moved Elementor's CSS print
 *   method to "External File" on 2026-09-24, which makes this strictly worse:
 *   the enqueue now resolves to a <link> that is never printed. So the
 *   fragment carries the CSS as TEXT, fetched from the file object rather
 *   than left to the print method.
 *
 *   JS. Elementor binds its frontend widgets once, at page load. Markup
 *   inserted afterwards has no handlers — a carousel renders and never
 *   moves. widget.js re-runs Elementor's own per-element ready trigger.
 *
 * WHAT THIS SUITE CANNOT DO is open a real popup on a real page against a
 * real Elementor install. That verification is a human on staging, and the
 * release report lists the steps. What is checked here is everything that
 * can be: the shape of the fragment, the gate on what may be rendered, that
 * the default is OFF, and that the placeholder keeps every existing path
 * working.
 */
require __DIR__ . '/bootstrap.php';
$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';

$GLOBALS['t_options'] = [];
function get_transient($k) { return $GLOBALS['t_transients'][$k] ?? false; }
function set_transient($k, $v, $t) { $GLOBALS['t_transients'][$k] = $v; return true; }
function delete_transient($k) { return true; }
$GLOBALS['t_transients'] = [];
$GLOBALS['t_producer_runs'] = 0;
function wp_hash($d) { return hash_hmac('md5', $d, 'test-salt'); }
class T_Json extends \Exception { public $payload; public $code_; }
function wp_send_json_success($d = null) { $e = new T_Json('ok'); $e->payload = $d; throw $e; }
function wp_send_json_error($d = null, $code = 200) { $e = new T_Json('err'); $e->payload = $d; $e->code_ = $code; throw $e; }
function wp_unslash($v) { return $v; }
function wp_enqueue_script($h, $s = '', $d = [], $v = false, $f = false) { $GLOBALS['t_enq_scripts'][] = $h; }
function wp_enqueue_style($h, $s = '', $d = [], $v = false, $m = 'all') { $GLOBALS['t_enq_styles'][] = $h; }

require $ROOT . '/includes/class-cache.php';
require $ROOT . '/includes/class-data-provider.php';
require $ROOT . '/includes/class-staff.php';
require $ROOT . '/includes/class-ajax.php';
require $ROOT . '/includes/class-settings.php';
require __DIR__ . '/elementor-stub.php';
require $ROOT . '/includes/class-widget.php';
if (!defined('MPHBAC_VERSION')) { define('MPHBAC_VERSION', 'test'); }
use MPHBAC\Widget;
use MPHBAC\Ajax;

use MPHBAC\Settings;

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}

$widget = file_get_contents($ROOT . '/includes/class-widget.php');
$js     = file_get_contents($ROOT . '/assets/js/widget.js');
$ajax   = file_get_contents($ROOT . '/includes/class-ajax.php');

echo "-- the setting ships OFF --\n";
{
    check('lazy_cottage_panels exists', array_key_exists('lazy_cottage_panels', Settings::schema()));
    /* DEFAULT OFF, deliberately, and it is the one-line rollback for this
       feature. It cannot be verified from here and it changes the two
       heaviest pages, so it must not arrive switched on. */
    check('and it defaults to OFF, so installing 0.42.0 changes nothing until it is switched on',
        Settings::defaults()['lazy_cottage_panels'] === false);
    check('it is in the advanced section, not the common one',
        Settings::schema()['lazy_cottage_panels']['group'] === 'engine');
}

echo "\n-- the fragment carries its own CSS, because an enqueue cannot reach the page --\n";
{
    // str_contains, not a regex: the class name is four backslashes deep and
    // escaping it through a PHP single-quoted regex is three chances to be
    // wrong about the test rather than about the code.
    check('the fragment renderer asks the CSS FILE for its content',
        str_contains($widget, 'Elementor\\Core\\Files\\CSS\\Post::create($template_id)'));
    check('...and puts it in the fragment as a <style>, not as an enqueue',
        preg_match("/'<style>' \. \\\$css \. '<\/style>'/", $widget) === 1);
    check('it does not rely on wp_enqueue_style, which would reach nothing in an AJAX request',
        !preg_match('/render_info_fragment[\s\S]{0,1600}wp_enqueue_style/', $widget));
    check('the with-css render form is still used for the markup itself',
        str_contains($widget, 'get_builder_content_for_display($template_id, true)'));
    check('a template with no CSS still returns its markup rather than an empty fragment',
        preg_match("/\\\$css !== '' \? '<style>'/", $widget) === 1);
}

echo "\n-- the endpoint renders first-party content ONLY --\n";
{
    check('the reference is verified — shape AND signature — before any lookup happens',
        preg_match('/\$src = Widget::verify_info_src\(\$signed\);\s*if \(\$src === \'\'\)/', $ajax) === 1);
    /* THE REFERENCE COMES FROM THE PAGE, SO IT COMES FROM THE VISITOR. Without
       a post-type and status gate this endpoint would render any post through
       Elementor — a draft, a private page, another plugin's content. */
    check('a template must be a PUBLISHED elementor_library post',
        preg_match("/post_type === 'elementor_library' && \\\$post->post_status === 'publish'/", $widget) === 1);
    check('an accommodation goes through the existing published-room-type gate',
        preg_match("/post_type !== 'mphb_room_type' && \\\$post->post_status !== 'publish'/", $widget) === 1
        || preg_match("/post_type !== 'mphb_room_type' \|\| \\\$post->post_status !== 'publish'/", $widget) === 1);
    check('anything else is not renderable at all',
        preg_match('/function info_source_exists[\s\S]{0,600}return false;\s*\}/', $widget) === 1);
    check('a miss is one shape — no probing difference between kinds of miss',
        substr_count($ajax, "__('Panel not found.', 'mphb-availability-calendar')") === 1);
    check('no guest or booking data is reachable from this handler',
        !preg_match('/function handle_info[\s\S]{0,1200}(Staff_Data|get_post_meta|mphb_booking)/', $ajax));
}

echo "\n-- text panels are never deferred --\n";
{
    /* The weight is the templates. A custom-text panel is a few hundred bytes
       and fetching one would cost a round-trip to save nothing. */
    check('the lazy branch covers the template source',
        str_contains($widget, "self::sign_info_src('tpl:' . \$tpl_id)"));
    check('and the accommodation source', str_contains($widget, "self::sign_info_src('acc:' . \$cid)"));
    check('but the text branch has no lazy path at all',
        !preg_match("/\\\$text = \(string\) \(\\\$row\['ci_text'\][\s\S]{0,300}lazy/", $widget));
}

echo "\n-- the placeholder keeps every existing path working --\n";
{
    /* The popup finds the node by selector, MOVES it into the body, and moves
       it back on close. A lazy panel changes what is INSIDE the node and
       nothing about how the node is handled — so the move, the restore, the
       same-DOM-identity guarantee and the close all still apply. */
    check('the placeholder is still a .mphbac-info-content with the same data-room-type-id',
        preg_match('/<div class="mphbac-info-content" data-room-type-id="/', $widget) === 1);
    check('it carries the reference as data-info-src',
        str_contains($widget, "' data-info-src=\"' . esc_attr(\$info_src[\$cid]) . '\"'"));
    check('and it is still hidden, so nothing shows before it is opened',
        preg_match('/data-info-src[\s\S]{0,200}\?> hidden>/', $widget) === 1);
    check('the JS still locates it by the unchanged selector',
        substr_count($js, ".mphbac-info-content[data-room-type-id=\"' + typeId + '\"]") >= 2);
}

echo "\n-- fetched once, kept, and Elementor re-bound --\n";
{
    check('the attribute is removed after a successful fetch, so it is never re-fetched',
        str_contains($js, "content.removeAttribute('data-info-src')"));
    check('an in-flight fetch is shared rather than started twice',
        str_contains($js, 'if (infoFetches[src]) return infoFetches[src];'));
    check('a FAILED fetch is forgotten, so a later open can try again',
        preg_match('/catch\(function \(e\) \{[\s\S]{0,300}delete infoFetches\[src\]/', $js) === 1);
    /* THE OTHER HALF OF THE v0.6.0 FAILURE. Elementor binds its widgets once,
       at page load; injected markup has no handlers. */
    /* ONE re-bind implementation, not two (0.42.1). 0.42.0 added a duplicate
       of reinitElementorWidgets() next to the fetch; the existing one is
       jQuery-wrapped, guarded against double binding, and run from the open
       path's settle sequence. A lazy fill now runs that same sequence. */
    check('the duplicate re-bind is gone', !str_contains($js, 'initElementorIn'));
    check('Elementor\'s ready trigger is run by the ONE existing function, jQuery-wrapped',
        preg_match('/function reinitElementorWidgets[\s\S]{0,600}runReadyTrigger\(window\.jQuery \? window\.jQuery\(el\) : el\)/', $js) === 1);
    check('a lazy fill runs the same settle sequence the open path runs (F5)',
        preg_match('/fetchInfoPanel\(config, content\)\s*\.then\(function \(\) \{[\s\S]{0,500}settleBody\(\);\s*watchBodyImages\(\);/', $js) === 1);
    check('...but only while THAT panel is still on screen',
        preg_match('/if \(movedContent === content && sheet\.classList\.contains\(\'is-open\'\)\) \{\s*settleBody/', $js) === 1);
    check('and settle() itself now delegates to it, so there is one sequence',
        preg_match('/settled = true;\s*settleBody\(\);/', $js) === 1);
    check('the hover prefetch fetches the panel, not just its images',
        preg_match("/data-info-src'\)\) \{[\s\S]{0,300}fetchInfoPanel/", $js) === 1);
    /* F3b. touchstart fires for a scrolling finger as readily as a tap, and
       a lazy warm is a WordPress boot per touch. */
    check('but a TOUCH never prefetches a lazy panel — the tap that opens it is the fetch',
        preg_match("/root\.addEventListener\('touchstart'[\s\S]{0,1600}if \(content && content\.getAttribute\('data-info-src'\)\) return;\s*warmInfoPopup/", $js) === 1);
    check('a failed prefetch clears the warmed flag so the tap can retry',
        preg_match('/catch\(function \(\) \{ warmedInfoIds\[typeId\] = false; \}\)/', $js) === 1);
}

echo "\n-- the visitor is never left looking at an empty popup --\n";
{
    check('the popup opens immediately and shows a loading state while it waits',
        str_contains($js, "bodyEl.classList.add('is-loading')"));
    // Asserted INSIDE the .catch, not by counting occurrences: openInfo()
    // clears it too, so a count of "at least two" survived the failure-path
    // clear being deleted.
    check('the loading state is cleared on success AND on failure',
        preg_match('/\.then\(function \(\) \{\s*bodyEl\.classList\.remove\(\'is-loading\'\);/', $js) === 1
        && preg_match('/\.catch\(function \(\) \{\s*bodyEl\.classList\.remove\(\'is-loading\'\);/', $js) === 1);
    check('settleBody() is where the re-bind happens, so a lazy fill gets it',
        preg_match('/function settleBody\(\) \{[\s\S]{0,600}reinitElementorWidgets\(bodyEl\);/', $js) === 1);
    /* F6. A cold open's dimmed state must not outlive that open. */
    check('...and by openInfo(), so it cannot leak onto another cottage (closeInfo\'s copy was unobservable and is gone)',
        preg_match('/function openInfo\([^)]*\) \{[\s\S]{0,500}bodyEl\.classList\.remove\(\'is-loading\'\)/', $js) === 1
        && !preg_match('/function closeInfo\(\) \{\s*bodyEl\.classList\.remove/', $js));
    check('F7: the suggestion\'s rooms are set on EVERY render path, not only the embedded one',
        preg_match('/state\.availability = availability;[\s\S]{0,400}state\.rooms = rooms;/', $js) === 1);
    check('a failure says so, through the existing text domain rather than a hardcoded string',
        str_contains($js, 'config.strings.infoFailed')
        && str_contains($widget, "'str_info_failed'"));
    check('the loading state animates nothing, so there is nothing for reduced-motion to honour',
        !preg_match('/\.mphbac-info-body\.is-loading \{[^}]*(animation|transition)/',
            file_get_contents($ROOT . '/assets/css/widget.css')));
}

echo "\n-- F8: the endpoint renders only references a page on this site emitted --\n";
{
    t_post(501, 'elementor_library', 'publish', 'Panel');
    t_post(502, 'elementor_library', 'draft',   'Draft panel');
    $signed = Widget::sign_info_src('tpl:501');
    check('a signed reference has the shape tpl:<id>:<20 hex>',
        preg_match('/^tpl:501:[0-9a-f]{20}$/', $signed) === 1, $signed);
    check('it verifies back to the bare reference', Widget::verify_info_src($signed) === 'tpl:501');
    $tampered = substr($signed, 0, -1) . (substr($signed, -1) === 'a' ? 'b' : 'a');
    check('one changed hex digit and it is refused', Widget::verify_info_src($tampered) === '', $tampered);
    check('an UNSIGNED reference — what 0.42.0 accepted — is refused', Widget::verify_info_src('tpl:501') === '');
    check('a signature lifted from one id does not open another',
        Widget::verify_info_src('tpl:502:' . substr($signed, -20)) === '');
    $ask = static function (string $src): array {
        $_REQUEST = ['src' => $src];
        try { Ajax::handle_info(); } catch (T_Json $e) { return [$e->getMessage(), $e->code_, $e->payload]; }
        return ['none', 0, null];
    };
    check('the endpoint answers a forged reference with 400 and one fixed message',
        (static fn($r) => $r[0] === 'err' && $r[1] === 400 && $r[2]['message'] === 'Invalid panel.')($ask('tpl:501')));
    check('...and a well-signed reference to a DRAFT with 404 — the status gate still holds behind the signature',
        (static fn($r) => $r[0] === 'err' && $r[1] === 404)($ask(Widget::sign_info_src('tpl:502'))));
    $_REQUEST = [];
}

echo "\n-- F3a: a fragment is rendered once per TTL, not once per visitor --\n";
{
    $GLOBALS['t_transients'] = [];
    $GLOBALS['t_options'] = [];
    MPHBAC\Settings::flush();
    // With no Elementor in this harness the render is empty, which is fine:
    // what is under test is that the SECOND call does not run the producer.
    $before = count($GLOBALS['t_transients']);
    Widget::render_info_fragment('tpl:501');
    $stored = count($GLOBALS['t_transients']) - $before;
    Widget::render_info_fragment('tpl:501');
    $stored2 = count($GLOBALS['t_transients']) - $before;
    check('the first call stores the fragment', $stored === 1, $stored);
    check('the second call adds nothing — it was served from the store', $stored2 === 1, $stored2);
    // The flush hooks are asserted at RUNTIME in consumer-test.php, on the
    // hook table Plugin::boot() builds — a source search here matched the
    // line even after a mutation commented it out.
    check('the endpoint is on the SpeedyCache exclusion list like its siblings (F10)',
        str_contains(file_get_contents($ROOT . '/includes/class-cache-integration.php'), "MPHBAC_INFO_ACTION"));
}

echo "\n-- F4: a deferred template's widget assets are enqueued at page render --\n";
{
    /* MEASURED ON STAGING by the Website Director: in lazy mode the Angie
       snippets for pricing_table and fb_video_optimized were never loaded,
       so the pricing switcher did nothing on the inserted markup. Their
       handlers register inside an 'elementor/frontend/init' listener, so
       loading them WITH the fragment would be too late — they have to be on
       the page at render time. This drives the walk through a modelled
       Elementor with a nested template, a global widget, a widget type that
       is no longer registered, and a template that includes itself. */
    $GLOBALS['t_enq_scripts'] = []; $GLOBALS['t_enq_styles'] = [];
    Elementor\Plugin::$t_trees = [
        601 => [   // the cottage template: a container holding two widgets and a nested template
            ['elType' => 'container', 'elements' => [
                ['elType' => 'widget', 'widgetType' => 'pricing_table_d77343d4', 'settings' => []],
                ['elType' => 'widget', 'widgetType' => 'template', 'settings' => ['template_id' => 602]],
                ['elType' => 'widget', 'widgetType' => 'global', 'templateID' => 603],
                ['elType' => 'widget', 'widgetType' => 'gone_from_the_site', 'settings' => []],
            ]],
        ],
        602 => [['elType' => 'widget', 'widgetType' => 'fb_video_optimized_3322dc11', 'settings' => []],
                ['elType' => 'widget', 'widgetType' => 'template', 'settings' => ['template_id' => 601]]],  // cycle
        603 => [['elType' => 'widget', 'widgetType' => 'dcc_faq_db764d8c', 'settings' => []]],
    ];
    Elementor\Plugin::$t_widgets = [
        'pricing_table_d77343d4'      => new Elementor\Stub_Asset_Widget(['angie-snippet-11057'], ['angie-snippet-11057-style']),
        'fb_video_optimized_3322dc11' => new Elementor\Stub_Asset_Widget(['angie-snippet-11679'], ['angie-snippet-11679-style']),
        'dcc_faq_db764d8c'            => new Elementor\Stub_Asset_Widget(['angie-snippet-11984'], ['angie-snippet-11984-style']),
    ];
    t_post(601, 'elementor_library', 'publish', 'Cottage template');
    $GLOBALS['t_transients'] = [];
    $rm = new ReflectionMethod(Widget::class, 'enqueue_deferred_panel_assets');
    $rm->setAccessible(true);
    $settings = ['cottage_info' => [['ci_cottage' => 22, 'ci_source' => 'template', 'ci_template' => 601]]];
    $rm->invoke(null, [22], $settings);
    sort($GLOBALS['t_enq_scripts']); sort($GLOBALS['t_enq_styles']);
    check('the pricing-table SCRIPT is enqueued on the page — the F4 handle itself',
        in_array('angie-snippet-11057', $GLOBALS['t_enq_scripts'], true), $GLOBALS['t_enq_scripts']);
    check('...and its STYLE, not just the script',
        in_array('angie-snippet-11057-style', $GLOBALS['t_enq_styles'], true), $GLOBALS['t_enq_styles']);
    check('a widget inside a NESTED template is found (the Tour Video, the second known one)',
        in_array('angie-snippet-11679', $GLOBALS['t_enq_scripts'], true));
    check('a GLOBAL widget is found', in_array('angie-snippet-11984', $GLOBALS['t_enq_scripts'], true));
    check('a widget type no longer registered is skipped, not fatal',
        count($GLOBALS['t_enq_scripts']) === 3, $GLOBALS['t_enq_scripts']);
    check('a template that includes itself terminates',
        count(array_unique(Elementor\Plugin::$t_doc_gets)) === 3, Elementor\Plugin::$t_doc_gets);

    // Cached with the fragment's key generation: the second render walks nothing.
    $gets = count(Elementor\Plugin::$t_doc_gets);
    $rm->invoke(null, [22], $settings);
    check('the per-template type list is cached — a second page render reads no document',
        count(Elementor\Plugin::$t_doc_gets) === $gets, [$gets, count(Elementor\Plugin::$t_doc_gets)]);
    check('...but still enqueues, because enqueueing has to happen on every page',
        count($GLOBALS['t_enq_scripts']) === 6);

    // Not a per-type allowlist: nothing in the source names a snippet.
    check('the walk names no widget type and no Angie handle — whatever a widget declares, it gets',
        !preg_match('/snippet-1\d{4}|pricing_table|fb_video/', preg_replace('#/\*.*?\*/#s', '', $widget)));
    check('render() calls it only when the setting is on and something was deferred',
        preg_match('/if \(\$lazy_panels && \$info_src\) \{\s*self::enqueue_deferred_panel_assets\(array_keys\(\$info_src\), \$settings\);/', $widget) === 1);
}

echo "\n-- F12: no placeholder for a panel that could never load --\n";
{
    $rm = new ReflectionMethod(Widget::class, 'info_row');
    $rm->setAccessible(true);
    $missing = $rm->invoke(null, ['ci_source' => 'template', 'ci_template' => 999], 22, true);
    $draft   = $rm->invoke(null, ['ci_source' => 'template', 'ci_template' => 502], 22, true);
    $live    = $rm->invoke(null, ['ci_source' => 'template', 'ci_template' => 501], 22, true);
    check('a deleted template gets no placeholder — the row has no popup, as before', $missing === null);
    check('a draft template gets none either', $draft === null);
    check('a published one does', is_array($live) && $live['src'] !== '');
}

echo "\n-- F1: real characters, not backslash-u --\n";
{
    check('the failure message default contains a real apostrophe and no \\u escape',
        str_contains($widget, 'cottage’s details') && !str_contains($widget, '\u2019'));
    $settings_src = file_get_contents($ROOT . '/includes/class-settings.php');
    check('the setting help text likewise', str_contains($settings_src, 'cottage’s info panel') && !preg_match('/\\\\u20[0-9a-f]{2}/', $settings_src));
}

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
