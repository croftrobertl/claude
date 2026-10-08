<?php
/**
 * THE STAFF RANGE REQUEST (0.43.0): Weekly and Yearly are not months, so the
 * month endpoint also answers a from..to window. This suite covers the two
 * things that matter about it.
 *
 *   THE GATE COMES FIRST. A range request goes through the same handler, so
 *   require_authorization() runs before a single parameter is read: an
 *   unauthorized caller gets a 403 with an EMPTY body, and the booking table
 *   is never queried. Proved in a CHILD process, because a refused request
 *   ends with exit — which would end this suite too.
 *
 *   THE CAP IS A CONVENIENCE LIMIT. Once search exists (0.45.0) anyone with
 *   the staff password can reach every booking, so ±3 years no longer
 *   protects anything; it keeps ordinary browsing sensible. A window that
 *   overlaps it is CLAMPED (and says so); one wholly outside it is refused;
 *   no window may exceed 400 days.
 *
 * Staff_Data::month_view() is replaced by a recorder: what is under test is
 * the window the handler asks for, not the query behind it, which
 * staff-monthview-test.php already covers.
 */
namespace {
    function is_user_logged_in() { return $GLOBALS['t_auth']; }
    function current_user_can($c) { return $GLOBALS['t_auth']; }
    function post_password_required($p = null) { return true; }
    function wp_verify_nonce($n, $a) { return $n === 'good' ? 1 : false; }
    function nocache_headers() {}
    function status_header($code) { $GLOBALS['t_status'] = $code; }
    function wp_unslash($v) { return $v; }
    function get_transient($k) { return false; }
    function set_transient($k, $v, $t) { return true; }
    function delete_transient($k) { return true; }
    class T_Json extends \Exception { public $payload; public $code_; }
    function wp_send_json_success($d = null) { $e = new T_Json('ok'); $e->payload = $d; throw $e; }
    function wp_send_json_error($d = null, $c = 200) { $e = new T_Json('err'); $e->payload = $d; $e->code_ = $c; throw $e; }
}

namespace MPHBAC {
    /** Records the window it was asked for; answers like the real one. */
    final class Staff_Data {
        public static function month_view(\DateTimeImmutable $from, \DateTimeImmutable $to): array {
            $GLOBALS['t_asked'][] = [$from->format('Y-m-d'), $to->format('Y-m-d')];
            return ['from' => $from->format('Y-m-d'), 'to' => $to->format('Y-m-d'), 'bookings' => [], 'cottages' => []];
        }
    }
}

namespace {
    require __DIR__ . '/bootstrap.php';
    $ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
    require $ROOT . '/includes/class-settings.php';
    require $ROOT . '/includes/class-cache.php';
    require $ROOT . '/includes/class-data-provider.php';
    require $ROOT . '/includes/class-staff.php';

    use MPHBAC\Staff;
    use MPHBAC\Data_Provider;

    $GLOBALS['t_auth'] = true;
    $GLOBALS['t_asked'] = [];
    $GLOBALS['t_status'] = null;

    /* The child: an UNAUTHORIZED range request. Everything it does goes to
       STDERR, so STDOUT is exactly the response body. */
    if (getenv('T_RANGE_CHILD') === '1') {
        $GLOBALS['t_auth'] = false;
        $_POST = $_REQUEST = ['from' => '2026-01-01', 'to' => '2026-12-31', 'nonce' => 'good'];
        register_shutdown_function(static function () {
            fwrite(STDERR, json_encode(['status' => $GLOBALS['t_status'], 'asked' => $GLOBALS['t_asked']]));
        });
        Staff::handle_month();
        fwrite(STDERR, 'REACHED THE END');   // must never print: the gate exits first
        exit(0);
    }

    $fail = 0;
    function check(string $l, bool $c, $x = null): void {
        global $fail;
        echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
        if (!$c) { $fail++; }
    }
    function ask(array $post): array {
        $_POST = $_REQUEST = $post + ['nonce' => 'good'];
        $GLOBALS['t_asked'] = [];
        try { Staff::handle_month(); } catch (T_Json $e) { return [$e->getMessage(), $e->code_, $e->payload, $GLOBALS['t_asked']]; }
        return ['none', null, null, $GLOBALS['t_asked']];
    }
    $today = Data_Provider::today();
    $d = static fn(string $mod): string => $today->modify($mod)->format('Y-m-d');

    echo "-- the gate runs before anything is read (child process) --\n";
    {
        $spec = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $proc = proc_open([PHP_BINARY, __FILE__], $spec, $pipes, null, ['T_RANGE_CHILD' => '1'] + getenv());
        $out = stream_get_contents($pipes[1]); $err = stream_get_contents($pipes[2]);
        proc_close($proc);
        $r = json_decode($err, true);
        check('an unauthorized range request is refused with 403', ($r['status'] ?? null) === 403, $err);
        check('...with an EMPTY body', $out === '', strlen($out) . ' bytes');
        check('...and the booking table is never queried', ($r['asked'] ?? null) === [], $r['asked'] ?? null);
        check('(instrument check) the handler really stopped at the gate', !str_contains($err, 'REACHED THE END'));
    }

    echo "\n-- an ordinary week and year --\n";
    {
        $r = ask(['from' => $d('-3 days'), 'to' => $d('+3 days')]);
        check('a week inside the cap is answered', $r[0] === 'ok', $r[2]);
        check('...for exactly the window asked', $r[3] === [[$d('-3 days'), $d('+3 days')]], $r[3]);
        check('...and says it was not clamped', ($r[2]['clamped'] ?? null) === false, $r[2]);
        $y = $today->format('Y');
        $r = ask(['from' => "$y-01-01", 'to' => "$y-12-31"]);
        check('this calendar year is answered in ONE request', $r[0] === 'ok' && count($r[3]) === 1, $r[3]);
    }

    echo "\n-- the cap: clamped where it overlaps, refused where it does not --\n";
    {
        $lo = $d('-3 years'); $hi = $d('+3 years');
        $y3 = $today->modify('-3 years')->format('Y');
        $r = ask(['from' => "$y3-01-01", 'to' => "$y3-12-31"]);
        check('the year three years back is ANSWERED, not refused over a few missing weeks', $r[0] === 'ok', $r);
        check('...clamped to the cap', $r[3] === [[$lo, "$y3-12-31"]], $r[3]);
        check('...and says so, so the board can tell the user', ($r[2]['clamped'] ?? null) === true);
        $y4 = $today->modify('+3 years')->format('Y');
        $r = ask(['from' => "$y4-01-01", 'to' => "$y4-12-31"]);
        check('the year three years ahead is clamped at the far end too', $r[0] === 'ok' && $r[3] === [["$y4-01-01", $hi]], $r[3]);
        $r = ask(['from' => $d('-5 years'), 'to' => $d('-4 years')]);
        check('a window wholly before the cap is refused (400), as a month there always was', $r[0] === 'err' && $r[1] === 400, $r);
        $r = ask(['from' => $d('+4 years'), 'to' => $d('+4 years')]);
        check('a window wholly after it is refused', $r[0] === 'err' && $r[1] === 400);
        check('...and a refusal never reaches the query', $r[3] === []);
    }

    echo "\n-- malformed windows are refused before any query --\n";
    {
        foreach ([
            'a one-digit month'         => ['from' => '2026-1-01', 'to' => '2026-01-31'],
            'a date PHP would roll over'=> ['from' => '2026-02-31', 'to' => '2026-03-31'],
            'from after to'             => ['from' => $d('+2 days'), 'to' => $d('+1 day')],
            'no to at all'              => ['from' => $d('+0 days')],
            'a time smuggled in'        => ['from' => $d('+0 days') . ' 00:00', 'to' => $d('+1 day')],
        ] as $label => $post) {
            $r = ask($post);
            check("$label: refused, nothing queried", $r[0] === 'err' && $r[1] === 400 && $r[3] === [], [$r[0], $r[1], $r[3]]);
        }
        $r = ask(['from' => $d('-200 days'), 'to' => $d('+200 days')]);
        check('a span of exactly 400 days is answered', $r[0] === 'ok', [$r[0], $r[1]]);
        $r = ask(['from' => $d('-200 days'), 'to' => $d('+201 days')]);
        check('401 days is refused — no window may cost as much as the whole table', $r[0] === 'err' && $r[1] === 400);
    }

    echo "\n-- the month request an open 0.42.x tab still sends --\n";
    {
        $m = $today->format('Y-m');
        $r = ask(['month' => $m]);
        check('a plain month still works', $r[0] === 'ok' && $r[3] === [[$m . '-01', $today->modify('last day of this month')->format('Y-m-d')]], $r[3]);
    }

    echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
    exit($fail ? 1 : 0);
}
