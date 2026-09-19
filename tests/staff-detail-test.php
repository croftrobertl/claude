<?php
/**
 * attachment_path_for() — the photo-ID proxy's only door.
 *
 * THE PATH IS DERIVED FROM THE BOOKING, NEVER FROM CLIENT INPUT. The client
 * gets an opaque booking-scoped field name and can only redeem it through
 * this function, so the proxy can reach exactly the files that booking
 * actually references and nothing else. Every refusal below is a wall, not a
 * tidiness check.
 */
require __DIR__ . '/bootstrap.php';
$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
function get_transient($k) { return false; }
function set_transient($k, $v, $t) { return true; }
function delete_transient($k) { return true; }

$GLOBALS['t_files'] = [];      // attachment id => absolute path
$GLOBALS['t_urls']  = [];      // url => attachment id
function get_attached_file($id) { return $GLOBALS['t_files'][(int) $id] ?? false; }
function attachment_url_to_postid($url) { return $GLOBALS['t_urls'][$url] ?? 0; }
function wp_get_upload_dir() { return ['basedir' => '/var/www/uploads', 'baseurl' => 'https://example.test/wp-content/uploads']; }
function trailingslashit($s) { return rtrim((string) $s, '/\\') . '/'; }

require $ROOT . '/includes/class-cache.php';
require $ROOT . '/includes/class-data-provider.php';
require $ROOT . '/includes/class-staff.php';
require $ROOT . '/includes/class-staff-data.php';

use MPHBAC\Staff_Data;

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}

function seed(array $meta, string $type = 'mphb_booking', string $status = 'confirmed'): void {
    $GLOBALS['t_posts'] = []; $GLOBALS['t_meta'] = [];
    t_post(900, $type, $status, 'B', $meta);
}

echo "-- it refuses anything that is not this booking's own field --\n";
seed(['mphb_upload_id' => 55]);
$GLOBALS['t_files'][55] = '/var/www/uploads/2026/09/id.jpg';
check('a field the booking does not have is refused',
    Staff_Data::attachment_path_for(900, 'mphb_other_field') === null);
check('a field name from another namespace is refused',
    Staff_Data::attachment_path_for(900, '../../wp-config.php') === null);
seed(['mphb_upload_id' => 55], 'page');
check('a post that is not a booking is refused', Staff_Data::attachment_path_for(900, 'mphb_upload_id') === null);
check('a missing booking is refused', Staff_Data::attachment_path_for(999999, 'mphb_upload_id') === null);

echo "\n-- the three storage shapes MPHB has used --\n";
seed(['mphb_upload_id' => 55]);
check('an attachment ID resolves through get_attached_file',
    Staff_Data::attachment_path_for(900, 'mphb_upload_id') === '/var/www/uploads/2026/09/id.jpg');
seed(['mphb_upload_id' => 'https://example.test/wp-content/uploads/2026/09/id.jpg']);
$GLOBALS['t_urls']['https://example.test/wp-content/uploads/2026/09/id.jpg'] = 55;
check('a full URL resolves through attachment_url_to_postid',
    Staff_Data::attachment_path_for(900, 'mphb_upload_id') === '/var/www/uploads/2026/09/id.jpg');
seed(['mphb_upload_id' => 'https://example.test/wp-content/uploads/2026/09/loose.jpg']);
check('a URL inside uploads with no attachment row maps to the basedir path',
    Staff_Data::attachment_path_for(900, 'mphb_upload_id') === '/var/www/uploads/2026/09/loose.jpg',
    Staff_Data::attachment_path_for(900, 'mphb_upload_id'));

echo "\n-- and it refuses the shapes that would escape uploads --\n";
seed(['mphb_upload_id' => 'https://evil.test/wp-content/uploads/2026/09/id.jpg']);
check('a URL on another host is not mapped into our uploads dir',
    Staff_Data::attachment_path_for(900, 'mphb_upload_id') === null,
    Staff_Data::attachment_path_for(900, 'mphb_upload_id'));
/* WHERE CONTAINMENT ACTUALLY LIVES, asserted at the layer that provides it.
 *
 * attachment_path_for() does NOT guarantee the path is inside uploads. Its
 * own guard is `$rel !== $val` after an ltrim, and a LEADING SLASH defeats
 * that: "/etc/passwd" becomes "etc/passwd", which differs from the input, so
 * it returns basedir . "etc/passwd". "/../../etc/passwd" composes a path that
 * resolves outside uploads entirely.
 *
 * That is not a live exposure, and it is worth being precise about why: the
 * single consumer — Staff::handle_photo() — re-checks authorization and then
 * refuses anything whose realpath() does not sit under realpath(basedir),
 * which catches traversal and symlink escape alike. The containment is real;
 * it just is not in this function. Asserting it HERE would record a guarantee
 * this layer does not make. */
seed(['mphb_upload_id' => '/../../etc/passwd']);
$escaped = Staff_Data::attachment_path_for(900, 'mphb_upload_id');
check('(recorded) this function alone does not contain a leading-slash path',
    $escaped !== null && str_contains((string) $escaped, '..'), $escaped);
{
    $staff = file_get_contents(dirname(__DIR__) . '/mphb-availability-calendar/includes/class-staff.php');
    check('the PROXY contains it: realpath must sit under realpath(basedir)',
        str_contains($staff, 'realpath($path)') && str_contains($staff, 'realpath($base)')
        && str_contains($staff, 'DIRECTORY_SEPARATOR) !== 0'), null);
    check('...and it refuses rather than serving, with a log line',
        str_contains($staff, 'refused out-of-uploads photo path'));
    check('...after re-checking authorization, not before',
        strpos($staff, 'require_authorization') < strpos($staff, 'attachment_path_for'));
    check('a file outside uploads is never streamed: the readfile is after the check',
        strpos($staff, 'DIRECTORY_SEPARATOR) !== 0') < strpos($staff, 'readfile('));
}
seed(['mphb_upload_id' => '']);
check('an empty value is refused', Staff_Data::attachment_path_for(900, 'mphb_upload_id') === null);
seed(['mphb_upload_id' => 0]);
check('a zero id is refused — get_attached_file returns false for it',
    Staff_Data::attachment_path_for(900, 'mphb_upload_id') === null);
seed(['mphb_upload_id' => 999]);   // no file on disk
check('an id with no file behind it is refused',
    Staff_Data::attachment_path_for(900, 'mphb_upload_id') === null);

echo "\n-- an empty field produces no Photo ID row at all --\n";
{
    $GLOBALS['t_posts'] = []; $GLOBALS['t_meta'] = []; $GLOBALS['wpdb']->payment_rows = [];
    t_post(22, 'mphb_room_type', 'publish', 'Cottage 22', ['mphb_adults_capacity' => 4]);
    t_post(220, 'mphb_room', 'publish', 'R', ['mphb_room_type_id' => 22]);
    t_post(910, 'mphb_booking', 'confirmed', 'B', ['mphb_upload_id' => '', 'mphb_total_price' => 0]);
    t_post(911, 'mphb_reserved_room', 'publish', 'RR', ['_mphb_room_id' => 220, '_mphb_adults' => 2]);
    $GLOBALS['t_posts'][911]->post_parent = 910;
    $labels = array_map(static fn($r) => $r['label'], Staff_Data::booking_detail(910)['sections']['customer']);
    check('no View button is offered for a file that does not exist',
        !in_array('Photo ID', $labels, true), $labels);
}

echo "\n-- exactly ONE caller, because containment lives with the caller --\n";
{
    /* The helper does not contain its own output; Staff::handle_photo() does,
     * and the assertions above test it there — correctly, since that is the
     * layer providing the guarantee. The consequence is that a SECOND caller
     * would make the missing containment live with nothing failing. So the
     * count itself is the guard: a new call site fails here and is sent to
     * the docblock on the helper. */
    $dir = dirname(__DIR__) . '/mphb-availability-calendar/includes/';
    $callers = [];
    foreach (glob($dir . '*.php') as $file) {
        foreach (file($file) as $n => $line) {
            if (str_contains($line, 'attachment_path_for(') && !str_contains($line, 'function attachment_path_for')) {
                $callers[] = basename($file) . ':' . ($n + 1);
            }
        }
    }
    check('there is exactly one caller, and it is the photo proxy',
        count($callers) === 1 && str_starts_with($callers[0], 'class-staff.php:'), $callers);
    $data = file_get_contents($dir . 'class-staff-data.php');
    check('the helper SAYS it does not contain its own output, where a second caller would read it',
        str_contains($data, 'DOES NOT CONTAIN ITS OWN OUTPUT')
        && str_contains($data, 'realpath(basedir)'));
    check('...and names the reference implementation',
        str_contains($data, 'class-staff.php:205'));
    // The count above is repo-local by construction: glob() over this
    // plugin's includes/. A theme or mu-plugin caller is invisible to it, and
    // is exactly the caller least likely to have read the docblock. Saying so
    // in the docblock is what stops a green suite being read as proof that
    // no external caller exists.
    check('the docblock states that the one-caller guard is REPO-LOCAL',
        str_contains($data, 'REPO-LOCAL') && str_contains($data, 'external callers'));
}

echo "\n-- the client never receives a URL --\n";
{
    $src = file_get_contents(dirname(__DIR__) . '/mphb-availability-calendar/includes/class-staff-data.php');
    check('the photo row carries a FIELD name, not a path or a URL',
        preg_match("/'photo'\s*=>\s*\\\$photo/", $src) === 1
        && preg_match("/'field'\s*=>\s*\(string\) \\\$key/", $src) === 1);
    check('...and the reason is recorded next to it', str_contains($src, 'never emitted as a'));
}

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
