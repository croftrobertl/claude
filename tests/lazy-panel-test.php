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
function get_transient($k) { return false; }
function set_transient($k, $v, $t) { return true; }
function delete_transient($k) { return true; }

require $ROOT . '/includes/class-cache.php';
require $ROOT . '/includes/class-data-provider.php';
require $ROOT . '/includes/class-staff.php';
require $ROOT . '/includes/class-ajax.php';
require $ROOT . '/includes/class-settings.php';

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
        !preg_match('/render_info_fragment[\s\S]{0,900}wp_enqueue_style/', $widget));
    check('the with-css render form is still used for the markup itself',
        str_contains($widget, 'get_builder_content_for_display($template_id, true)'));
    check('a template with no CSS still returns its markup rather than an empty fragment',
        preg_match("/\\\$css !== '' \? '<style>'/", $widget) === 1);
}

echo "\n-- the endpoint renders first-party content ONLY --\n";
{
    check('the reference is shape-checked before any lookup happens',
        preg_match("#preg_match\('/\^\(\?:tpl\|acc\):\[1-9\]#", $ajax) === 1);
    /* THE REFERENCE COMES FROM THE PAGE, SO IT COMES FROM THE VISITOR. Without
       a post-type and status gate this endpoint would render any post through
       Elementor — a draft, a private page, another plugin's content. */
    check('a template must be a PUBLISHED elementor_library post',
        preg_match("/post_type !== 'elementor_library' \|\| \\\$post->post_status !== 'publish'/", $widget) === 1);
    check('an accommodation goes through the existing published-room-type gate',
        preg_match("/post_type !== 'mphb_room_type' && \\\$post->post_status !== 'publish'/", $widget) === 1
        || preg_match("/post_type !== 'mphb_room_type' \|\| \\\$post->post_status !== 'publish'/", $widget) === 1);
    check('anything else returns empty rather than guessing',
        preg_match("/return '';\s*\}\s*\/\*\*\s*\n\s*\* THE TEMPLATE|return '';\n    \}/", $widget) === 1);
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
        str_contains($widget, "\$info_src[\$cid]  = 'tpl:' . \$tpl_id;"));
    check('and the accommodation source', str_contains($widget, "'acc:' . \$cid"));
    check('but the text branch has no lazy path at all',
        !preg_match("/\\\$text = \(string\) \(\\\$row\['ci_text'\][\s\S]{0,300}lazy_panels/", $widget));
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
    check('Elementor\'s own per-element ready trigger is re-run on the injected markup',
        str_contains($js, 'elementsHandler.runReadyTrigger'));
    check('...per element, not a page-wide re-init that would disturb what already works',
        preg_match('/querySelectorAll\(\'\.elementor-element\'\)[\s\S]{0,200}runReadyTrigger/', $js) === 1);
    check('...and a template with no JS widgets still opens if that call throws',
        preg_match('/runReadyTrigger[\s\S]{0,200}catch \(e\) \{ \/\* a template with no JS/', $js) === 1);
    check('the hover/touch prefetch fetches the panel, not just its images',
        preg_match("/data-info-src'\)\) \{[\s\S]{0,300}fetchInfoPanel/", $js) === 1);
    check('a failed prefetch clears the warmed flag so the tap can retry',
        preg_match('/catch\(function \(\) \{ warmedInfoIds\[typeId\] = false; \}\)/', $js) === 1);
}

echo "\n-- the visitor is never left looking at an empty popup --\n";
{
    check('the popup opens immediately and shows a loading state while it waits',
        str_contains($js, "bodyEl.classList.add('is-loading')"));
    check('the loading state is cleared on success AND on failure',
        substr_count($js, "bodyEl.classList.remove('is-loading')") === 2);
    check('a failure says so, through the existing text domain rather than a hardcoded string',
        str_contains($js, 'config.strings.infoFailed')
        && str_contains($widget, "'str_info_failed'"));
    check('the loading state animates nothing, so there is nothing for reduced-motion to honour',
        !preg_match('/\.mphbac-info-body\.is-loading \{[^}]*(animation|transition)/',
            file_get_contents($ROOT . '/assets/css/widget.css')));
}

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
