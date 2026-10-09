<?php
/**
 * THE PHOTO-ID PROXY, END TO END (0.43.2).
 *
 * "View photo ID" opened a BLANK TAB on Rob's iPhone. The Website Director
 * found why on live: on all 13 bookings with a photo, MotoPress stores the
 * file as a path relative to the WordPress root —
 *     wp-content/uploads/mphb_protected_uploads/<file>
 * — a shape attachment_path_for() did not resolve, so Staff::handle_photo()
 * answered 404 with an empty body for every one of them. staff-detail-test.php
 * covered the three shapes the code knew; nothing covered the one live uses,
 * and nothing ran the handler itself.
 *
 * This suite does: Staff::handle_photo() is run for real, in a CHILD process
 * per request (it ends in exit), against a real directory tree laid out like
 * a WordPress install — ABSPATH, wp-content/uploads, mphb_protected_uploads,
 * and a file OUTSIDE uploads that must never be streamed. STDOUT is exactly
 * the response body; the status and headers the handler sent come back on
 * STDERR. header() is recorded by an MPHBAC\header() shadow: the handler is
 * namespaced, so its unqualified calls resolve to it first.
 *
 * The containment check in handle_photo() is unchanged and is exercised here
 * with the new shapes: ABSPATH-relative and absolute paths that land outside
 * uploads, including through "..", are refused.
 */
namespace {
    $tmp = getenv('T_PHOTO_ROOT') ?: '';
    if ($tmp === '') {
        $tmp = sys_get_temp_dir() . '/mphbac-photo-' . getmypid();
    }
    define('ABSPATH', $tmp . '/');
}

namespace MPHBAC {
    function header($h, $replace = true) { $GLOBALS['t_headers'][] = $h; }
}

namespace {
    function is_user_logged_in() { return $GLOBALS['t_auth']; }
    function current_user_can($c) { return $GLOBALS['t_auth']; }
    function post_password_required($p = null) { return true; }
    function wp_verify_nonce($n, $a) { return $n === 'good' ? 1 : false; }
    function nocache_headers() {}
    function status_header($code) { $GLOBALS['t_status'] = $code; }
    function wp_unslash($v) { return $v; }
    function sanitize_key($k) { return preg_replace('/[^a-z0-9_\-]/', '', strtolower((string) $k)); }
    function get_transient($k) { return false; }
    function set_transient($k, $v, $t) { return true; }
    function delete_transient($k) { return true; }
    function get_attached_file($id) { return false; }
    function attachment_url_to_postid($url) { return 0; }
    function trailingslashit($s) { return rtrim((string) $s, '/\\') . '/'; }
    function wp_get_upload_dir() {
        return ['basedir' => ABSPATH . 'wp-content/uploads', 'baseurl' => 'https://example.test/wp-content/uploads'];
    }
    /* WordPress core's own mapping (wp_get_mime_types() since 6.7 carries
       heic/heif), matched case-insensitively as wp_check_filetype() does.
       T_NO_HEIC models an install or filter that does not know HEIC. */
    function wp_check_filetype($name) {
        $map = ['jpg|jpeg|jpe' => 'image/jpeg', 'png' => 'image/png', 'gif' => 'image/gif', 'webp' => 'image/webp',
                'pdf' => 'application/pdf', 'heic' => 'image/heic', 'heif' => 'image/heif', 'txt' => 'text/plain'];
        if (getenv('T_NO_HEIC') === '1') { unset($map['heic'], $map['heif']); }
        foreach ($map as $exts => $mime) {
            if (preg_match('!\.(' . $exts . ')$!i', $name, $m)) { return ['ext' => $m[1], 'type' => $mime]; }
        }
        return ['ext' => false, 'type' => false];
    }

    require __DIR__ . '/bootstrap.php';
    $ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
    require $ROOT . '/includes/class-settings.php';
    require $ROOT . '/includes/class-cache.php';
    require $ROOT . '/includes/class-data-provider.php';
    require $ROOT . '/includes/class-staff.php';
    require $ROOT . '/includes/class-staff-data.php';

    use MPHBAC\Staff;

    $GLOBALS['t_headers'] = [];
    $GLOBALS['t_status'] = 200;
    $GLOBALS['t_auth'] = true;

    /* ---- the child: one request ------------------------------------------ */
    if (getenv('T_PHOTO_CHILD') === '1') {
        $c = json_decode((string) getenv('T_PHOTO_CASE'), true);
        $GLOBALS['t_auth'] = (bool) ($c['auth'] ?? true);
        t_post(900, 'mphb_booking', 'confirmed', 'B', [$c['field'] => $c['value']]);
        $_REQUEST = ['booking_id' => '900', 'field' => $c['field'], 'nonce' => 'good'];
        register_shutdown_function(static function () {
            fwrite(STDERR, json_encode(['status' => $GLOBALS['t_status'], 'headers' => $GLOBALS['t_headers']]));
        });
        Staff::handle_photo();
        exit(0);
    }

    $fail = 0;
    function check(string $l, bool $c, $x = null): void {
        global $fail;
        echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
        if (!$c) { $fail++; }
    }

    /* ---- a WordPress-shaped tree on disk ---------------------------------- */
    $prot = ABSPATH . 'wp-content/uploads/mphb_protected_uploads';
    @mkdir($prot, 0777, true);
    $im = imagecreatetruecolor(4, 4);
    imagefill($im, 0, 0, imagecolorallocate($im, 10, 80, 178));
    ob_start(); imagejpeg($im); $jpeg = ob_get_clean();
    file_put_contents($prot . '/guest-id.jpg', $jpeg);
    file_put_contents($prot . '/guest-id.HEIC', "\0\0\0\x18ftypheic fake-heic-bytes");
    file_put_contents(ABSPATH . 'secret.jpg', 'NOT AN UPLOAD — must never be streamed');
    register_shutdown_function(static function () use ($prot) {
        foreach ([$prot . '/guest-id.jpg', $prot . '/guest-id.HEIC', ABSPATH . 'secret.jpg'] as $f) { @unlink($f); }
        @rmdir($prot); @rmdir(ABSPATH . 'wp-content/uploads'); @rmdir(ABSPATH . 'wp-content'); @rmdir(rtrim(ABSPATH, '/'));
    });

    function photo(array $case, array $env = []): array {
        $spec = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $proc = proc_open([PHP_BINARY, __FILE__], $spec, $pipes, null,
            ['T_PHOTO_CHILD' => '1', 'T_PHOTO_ROOT' => rtrim(ABSPATH, '/'), 'T_PHOTO_CASE' => json_encode($case + ['field' => 'mphb_upload_id'])] + $env + getenv());
        $out = stream_get_contents($pipes[1]); $err = stream_get_contents($pipes[2]);
        proc_close($proc);
        $r = json_decode(substr($err, (int) strrpos($err, '{"status"')), true) ?: ['status' => null, 'headers' => [], 'raw' => $err];
        $h = [];
        foreach ($r['headers'] as $line) { [$k, $v] = array_map('trim', explode(':', $line, 2)) + [1 => '']; $h[strtolower($k)] = $v; }
        return ['status' => $r['status'], 'h' => $h, 'body' => $out, 'err' => $err];
    }
    $CSP = "default-src 'none'; img-src 'self'; object-src 'none'; sandbox";

    echo "-- the shape live actually stores: relative to the WordPress root --\n";
    $r = photo(['value' => 'wp-content/uploads/mphb_protected_uploads/guest-id.jpg']);
    check('"wp-content/uploads/mphb_protected_uploads/<file>" is SERVED, not 404', $r['status'] === 200, [$r['status'], $r['err']]);
    check('...the file\'s own bytes, untouched', $r['body'] === $jpeg, strlen($r['body']) . ' bytes');
    check('...as image/jpeg, inline (it opens in the tab, it does not download)',
        ($r['h']['content-type'] ?? '') === 'image/jpeg' && str_starts_with($r['h']['content-disposition'] ?? '', 'inline'), $r['h']);
    check('...with the CSP header unchanged, character for character', ($r['h']['content-security-policy'] ?? '') === $CSP, $r['h']['content-security-policy'] ?? null);
    check('...nosniff, and never cached', ($r['h']['x-content-type-options'] ?? '') === 'nosniff'
        && str_contains($r['h']['cache-control'] ?? '', 'no-store'), $r['h']);
    check('...and the download name carries the booking, not the guest\'s file name',
        str_contains($r['h']['content-disposition'] ?? '', 'filename="id-900.jpg"'), $r['h']['content-disposition'] ?? null);
    $r = photo(['value' => '/wp-content/uploads/mphb_protected_uploads/guest-id.jpg']);
    check('the same with a leading slash', $r['status'] === 200 && $r['body'] === $jpeg, $r['status']);
    $r = photo(['value' => ABSPATH . 'wp-content/uploads/mphb_protected_uploads/guest-id.jpg']);
    check('an ABSOLUTE path inside uploads is served', $r['status'] === 200 && $r['body'] === $jpeg, $r['status']);
    $r = photo(['value' => ['wp-content/uploads/mphb_protected_uploads/guest-id.jpg']]);
    check('the value as MotoPress\'s one-element array is served too', $r['status'] === 200, $r['status']);

    echo "\n-- HEIC, the iPhone camera's format: shown, not downloaded --\n";
    $r = photo(['value' => 'wp-content/uploads/mphb_protected_uploads/guest-id.HEIC']);
    check('.HEIC (upper case, as live has it) is served inline as image/heic',
        $r['status'] === 200 && ($r['h']['content-type'] ?? '') === 'image/heic'
        && str_starts_with($r['h']['content-disposition'] ?? '', 'inline'), $r['h']);
    $r = photo(['value' => 'wp-content/uploads/mphb_protected_uploads/guest-id.HEIC'], ['T_NO_HEIC' => '1']);
    check('...and still inline as image/heic where WordPress does not know the type',
        $r['status'] === 200 && ($r['h']['content-type'] ?? '') === 'image/heic'
        && str_starts_with($r['h']['content-disposition'] ?? '', 'inline'), $r['h']);

    echo "\n-- containment is unchanged: nothing outside uploads, by any new shape --\n";
    foreach ([
        'secret.jpg'                                                    => 'an ABSPATH-relative file outside uploads',
        ABSPATH . 'secret.jpg'                                          => 'an absolute path outside uploads',
        'wp-content/uploads/mphb_protected_uploads/../../../secret.jpg' => 'a ".." walk out of uploads',
        '/etc/passwd'                                                   => 'a system file',
    ] as $value => $what) {
        $r = photo(['value' => $value]);
        check("$what is refused (404)", $r['status'] === 404, [$r['status'], substr($r['body'], 0, 40)]);
        check('...and none of its bytes are streamed', !str_contains($r['body'], 'NOT AN UPLOAD') && !str_contains($r['body'], 'root:'));
    }
    check('(instrument check) the outside file really exists, so those refusals were containment, not absence',
        is_file(ABSPATH . 'secret.jpg'));
    $r = photo(['value' => 'https://evil.test/wp-content/uploads/mphb_protected_uploads/guest-id.jpg']);
    check('a URL on another host is not read as a path', $r['status'] === 404, $r['status']);

    echo "\n-- a 404 says so; a 403 says nothing --\n";
    $r = photo(['value' => 'wp-content/uploads/mphb_protected_uploads/gone.jpg']);
    check('a photo that is not on disk: 404 WITH a sentence, not a blank tab',
        $r['status'] === 404 && $r['body'] === 'This photo could not be found.', [$r['status'], $r['body']]);
    check('...as plain text, nosniff', ($r['h']['content-type'] ?? '') === 'text/plain; charset=utf-8'
        && ($r['h']['x-content-type-options'] ?? '') === 'nosniff', $r['h']);
    $r = photo(['value' => 'wp-content/uploads/mphb_protected_uploads/guest-id.jpg', 'auth' => false]);
    check('unauthorized: 403 with an EMPTY body, as before', $r['status'] === 403 && $r['body'] === '', [$r['status'], strlen($r['body'])]);
    check('...and no Content-Type or file header was sent', !isset($r['h']['content-type']) && !isset($r['h']['content-disposition']), $r['h']);

    echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
    exit($fail ? 1 : 0);
}
