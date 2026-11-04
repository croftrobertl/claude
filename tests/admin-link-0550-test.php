<?php
/**
 * 0.55.0 — "OPEN IN WP-ADMIN" FOR EVERY AUTHORIZED STAFF VISITOR (Rob), end
 * to end: the plugin's real Staff::handle_booking() over fixture-0474.php's
 * "staff" site (tests/render/ajax.php, one process per request), this
 * checkout against 0.54.0 from git (5dae4cb) in the same harness.
 *
 *   - a password-cookie visitor gets adminUrl: the plain edit address, no
 *     nonce or token, byte-equal to what a logged-in admin gets — and the
 *     whole answer is byte-equal to 0.54.0's answer to that admin;
 *   - a logged-in admin's answer is 0.54.0's, byte for byte;
 *   - an unauthorized visitor still gets a 403 with an empty body;
 *   - a password visitor's answer is 0.54.0's with adminUrl added, nothing else.
 */
$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}
$REPO = dirname(__DIR__);
$NEW = $REPO . '/mphb-availability-calendar';
$OLD = sys_get_temp_dir() . '/admin-link-0550-' . getmypid();
@mkdir($OLD);
exec('git -C ' . escapeshellarg($REPO) . ' archive 5dae4cb mphb-availability-calendar | tar -x -C ' . escapeshellarg($OLD), $o, $rc);
check('(instrument check) 0.54.0 itself, from git (5dae4cb)', $rc === 0 && is_file("$OLD/mphb-availability-calendar/includes/class-staff.php"));
$OLDP = "$OLD/mphb-availability-calendar";

/** One request: [status, body, the edit link WordPress itself gives this visitor]. */
function ask(string $dir, string $body, array $env = []): array {
    $e = ''; foreach (['MPHBAC_FIXTURE_0474' => 'staff', 'MPHBAC_EDIT_LINK' => '1'] + $env as $k => $v) { $e .= $k . '=' . escapeshellarg($v) . ' '; }
    $err = tempnam(sys_get_temp_dir(), 'al');
    $out = (string) shell_exec($e . 'php ' . escapeshellarg(__DIR__ . '/render/ajax.php') . ' ' . escapeshellarg($dir) . ' ' . escapeshellarg($body) . ' 2>' . escapeshellarg($err));
    $se = (string) file_get_contents($err); unlink($err);
    preg_match('/STATUS (\d+)/', $se, $m); preg_match('/EDITLINK (\S*)/', $se, $l);
    return [isset($m[1]) ? (int) $m[1] : 200, $out, $l[1] ?? ''];
}
$ID = 700002;   // fixture-0474.php's first booking: the Boathouse, confirmed
$B = "action=mphbac_staff_booking&nonce=nonce&booking_id=$ID";
$PLAIN = "https://example.test/wp-admin/post.php?post=$ID&action=edit";

[$s1, $pwNew, $wpPw] = ask($NEW, $B);
[$s2, $adNew, $wpAd] = ask($NEW, $B, ['MPHBAC_LOGGED_IN' => '1']);
[$s3, $adOld] = ask($OLDP, $B, ['MPHBAC_LOGGED_IN' => '1']);
[$s4, $pwOld] = ask($OLDP, $B);
$pw = json_decode($pwNew, true); $ad = json_decode($adNew, true);
check('(instrument check) all four answered 200 with the booking', $s1 === 200 && $s2 === 200 && $s3 === 200 && $s4 === 200 && ($pw['data']['id'] ?? 0) === $ID, [$s1, $s2, $s3, $s4]);
check('(instrument check) WordPress\'s own get_edit_post_link() gives the password visitor NOTHING, the admin the plain address', $wpPw === '' && $wpAd === $PLAIN, [$wpPw, $wpAd]);

echo "\n-- a password-cookie visitor --\n";
check('gets adminUrl: the plain edit address ' . $PLAIN, ($pw['data']['adminUrl'] ?? '') === $PLAIN, $pw['data']['adminUrl'] ?? null);
parse_str((string) parse_url($pw['data']['adminUrl'] ?? '', PHP_URL_QUERY), $q);
check('...its query is post and action, nothing else: no nonce, no token, no credential', $q === ['post' => (string) $ID, 'action' => 'edit'] && !preg_match('/nonce|token|key|auth|login|pass|user/i', $pw['data']['adminUrl'] ?? ''), $q);
check('...byte-equal to what a logged-in admin gets for the same booking', ($pw['data']['adminUrl'] ?? '') === ($ad['data']['adminUrl'] ?? null));
check('...its whole answer byte-equal to 0.54.0\'s answer to a logged-in admin', $pwNew === $adOld);
$pwNoLink = $pw; unset($pwNoLink['data']['adminUrl']);
check('...and to 0.54.0\'s answer to the same password visitor, but for adminUrl added', json_encode($pwNoLink) === $pwOld && !str_contains($pwOld, 'adminUrl'));

echo "\n-- a logged-in admin --\n";
check('exactly 0.54.0\'s answer, byte for byte (adminUrl included)', $adNew === $adOld && str_contains($adOld, 'adminUrl'), [$adNew === $adOld]);

echo "\n-- an unauthorized visitor --\n";
[$s5, $body5] = ask($NEW, $B, ['MPHBAC_GATE' => 'closed']);
check('still a 403 with an EMPTY body (no adminUrl, no booking, nothing)', $s5 === 403 && $body5 === '', [$s5, $body5]);
[$s6, $body6] = ask($NEW, "action=mphbac_staff_booking&nonce=nonce&booking_id=999999");
check('a booking that does not exist: the 404 message, no link', $s6 === 404 && !str_contains($body6, 'adminUrl'), [$s6, $body6]);

exec('rm -rf ' . escapeshellarg($OLD));
echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
