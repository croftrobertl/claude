<?php
/**
 * v0.34.2 — WHICH postmeta row the Checkout Fields upload viewer may serve.
 *
 *     php tests/upload-access/run.php
 *
 * The finding (Director's read-only audit of live 0.34.1): the add-on's viewer
 * takes `?upload_id=` and accepts ANY postmeta row — the row is checked against
 * neither the booking being viewed nor the photo-ID meta key. Upload_Access
 * filters `mphb_cf_upload_link_has_access` to close that, and may only ever
 * narrow the add-on's own decision.
 *
 * WHAT IS REAL HERE: the shipped Upload_Access, driven through the filter
 * callback exactly as WordPress would call it.
 *
 * WHAT IS A STAND-IN: `$wpdb` (a postmeta table of four rows, built from the
 * live shapes the Director described — a guest ID on a booking, a guest ID on
 * another booking, an unrelated key on a booking, and a row on a post that is
 * not a booking), `get_post_type`, and the request. The add-on itself is
 * MotoPress's code and is not on this machine, so what it PASSES to the filter
 * is not reproduced here: the callback is variadic and is driven with no
 * context arguments, one, and a booking object, which is every shape it can be
 * handed.
 */
define('ABSPATH', __DIR__);
// WordPress's own: $wpdb->get_row() is asked for an associative array.
define('ARRAY_A', 'ARRAY_A');

$GLOBALS['posts'] = [];
$GLOBALS['meta_rows'] = [];
$GLOBALS['queries'] = 0;

function apply_filters($hook, $value, ...$rest) { return $value; }
function add_filter() {}
function add_action() {}
function __($t, $d = null) { return $t; }
function get_post_type($id = null) {
    $id = is_object($id) ? ($id->ID ?? 0) : (int) $id;
    return $GLOBALS['posts'][$id] ?? false;
}

/** Just enough of $wpdb: one prepared SELECT against postmeta. */
class FakeDb
{
    public $postmeta = 'wp_postmeta';
    public $last = '';
    public function prepare($sql, ...$args) {
        foreach ($args as $a) {
            $sql = preg_replace('/%d/', (string) (int) $a, $sql, 1);
        }
        return $sql;
    }
    public function get_row($sql, $output = null) {
        $GLOBALS['queries']++;
        $this->last = $sql;
        if (!preg_match('/meta_id = (\d+)/', $sql, $m)) {
            return null;
        }
        return $GLOBALS['meta_rows'][(int) $m[1]] ?? null;
    }
}
$GLOBALS['wpdb'] = new FakeDb();

require __DIR__ . '/../../dcc-custom-checkout/includes/class-id-files.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-upload-access.php';

use DCC_Checkout\Id_Files;
use DCC_Checkout\Upload_Access;

$failures = 0;
function check($name, $actual, $expected) {
    global $failures;
    $ok = $actual === $expected;
    if (!$ok) { $failures++; }
    echo ($ok ? 'PASS  ' : 'FAIL  ') . $name . "\n";
    if (!$ok) {
        echo '      expected: ' . var_export($expected, true) . "\n";
        echo '      actual:   ' . var_export($actual, true) . "\n";
    }
}

/* The site: two bookings, a page, and four postmeta rows. */
function site(): void
{
    $GLOBALS['posts'] = [
        19615 => 'mphb_booking',
        19600 => 'mphb_booking',
        2394  => 'page',
    ];
    $GLOBALS['meta_rows'] = [
        // meta_id => the row, as $wpdb->get_row(ARRAY_A) returns it
        501 => ['post_id' => '19615', 'meta_key' => Id_Files::META_KEY],  // this booking's guest ID
        502 => ['post_id' => '19600', 'meta_key' => Id_Files::META_KEY],  // ANOTHER booking's guest ID
        503 => ['post_id' => '19615', 'meta_key' => 'mphb_dog_type'],     // same booking, another key
        504 => ['post_id' => '2394',  'meta_key' => Id_Files::META_KEY],  // the key, but not a booking
    ];
    $_GET = [];
    $_POST = [];
    $GLOBALS['queries'] = 0;
}

$svc = new Upload_Access();

/* --- It can only ever NARROW. -------------------------------------------- */
site();
$_GET = ['upload_id' => 501, 'booking_id' => 19615];
check('a request the add-on already refuses stays refused',
    $svc->filter_access(false), false);
check('... and is not even looked up', $GLOBALS['queries'], 0);
site();
$_GET = ['upload_id' => 501];
check('a refusal expressed as null is returned as it was (never turned into a yes)',
    $svc->filter_access(null), null);

/* --- The guard on the guard: the legitimate view still works. ------------- */
site();
$_GET = ['upload_id' => 501, 'booking_id' => 19615];
check('this booking\'s own guest ID is served', $svc->filter_access(true), true);
check('... and that took exactly one query', $GLOBALS['queries'], 1);

site();
$_GET = ['upload_id' => 501];
check('with no booking named, a guest-ID row on a booking is still served',
    $svc->filter_access(true), true);

/* --- The finding: any other row is refused. ------------------------------- */
site();
$_GET = ['upload_id' => 503, 'booking_id' => 19615];
check('a row on the right booking under ANOTHER meta key is refused',
    $svc->filter_access(true), false);

site();
$_GET = ['upload_id' => 503];
check('... and still refused when no booking is named',
    $svc->filter_access(true), false);

site();
$_GET = ['upload_id' => 502, 'booking_id' => 19615];
check('another booking\'s guest ID is refused while viewing this one',
    $svc->filter_access(true), false);

site();
$_GET = ['upload_id' => 504, 'booking_id' => 19615];
check('the photo-ID key on a post that is not a booking is refused',
    $svc->filter_access(true), false);

site();
$_GET = ['upload_id' => 504];
check('... and refused on its own account, with no booking named to catch it',
    $svc->filter_access(true), false);

site();
$_GET = ['upload_id' => 9999, 'booking_id' => 19615];
check('a meta_id that does not exist is refused', $svc->filter_access(true), false);

site();
$_GET = ['upload_id' => '501abc', 'booking_id' => 19600];
check('a row id that is not a number is read as its leading digits, and still checked',
    $svc->filter_access(true), false);

/* --- Where the id comes from. -------------------------------------------- */
site();
$_POST = ['upload_id' => 502, 'booking_id' => 19615];
check('a POSTed upload_id is checked too', $svc->filter_access(true), false);

site();
$_GET = ['upload_id' => 502, 'post' => 19615];
check('the booking can be named as `post` (the edit screen\'s own parameter)',
    $svc->filter_access(true), false);

site();
$_GET = ['upload_id' => 502];
$booking = new class { public $ID = 19615; };
check('or passed by the add-on as a booking object',
    $svc->filter_access(true, $booking), false);

site();
$_GET = ['upload_id' => 502];
$entity = new class { public function getId() { return 19615; } };
check('or as a MotoPress entity with getId()',
    $svc->filter_access(true, $entity), false);

site();
$_GET = ['upload_id' => 501];
check('extra arguments that name nothing do not refuse a good row',
    $svc->filter_access(true, 'some-string', null, 0), true);

site();
$_GET = ['upload_id' => 502, 'booking_id' => 2394];
check('a "booking id" that is not a booking is ignored, and the row decides',
    $svc->filter_access(true), true);

/* --- Not a request of this shape: left exactly as it was. ----------------- */
site();
$_GET = ['booking_id' => 19615];
check('no upload_id in the request: the decision is untouched',
    $svc->filter_access(true), true);
check('... and nothing was queried', $GLOBALS['queries'], 0);

/* --- An unreadable database refuses rather than opens. -------------------- */
site();
$_GET = ['upload_id' => 501];
$real = $GLOBALS['wpdb'];
$GLOBALS['wpdb'] = new class {
    public $postmeta = 'wp_postmeta';
    public function prepare($sql, ...$a) { return $sql; }
    public function get_row($sql, $o = null) { throw new \RuntimeException('database gone'); }
};
check('a database error refuses, it does not fall open',
    $svc->filter_access(true), false);
$GLOBALS['wpdb'] = $real;

/* --- It is actually registered. A filter nobody adds is a fix nobody has. - */
$boot = (string) file_get_contents(__DIR__ . '/../../dcc-custom-checkout/includes/class-plugin.php');
check('Plugin::boot() registers Upload_Access',
    strpos($boot, '(new Upload_Access())->register();') !== false, true);
$cls = (string) file_get_contents(__DIR__ . '/../../dcc-custom-checkout/includes/class-upload-access.php');
check('... on the add-on\'s own access filter',
    strpos($cls, "add_filter('mphb_cf_upload_link_has_access'") !== false, true);

/* --- The key is the one Id_Files writes, not a retyped string. ------------ */
check('the key checked is Id_Files::META_KEY', Id_Files::META_KEY, 'mphb_upload_id');
check('and the post type is Id_Files::BOOKING_POST_TYPE',
    Id_Files::BOOKING_POST_TYPE, 'mphb_booking');

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);
