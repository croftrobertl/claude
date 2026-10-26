<?php
/**
 * How to refresh tests/real-theme/ — printed, not performed.
 *
 * Deliberately NOT a fetcher. The capture reaches into a live site, and the
 * one thing that must never happen on that page is a write: a submission of
 * /submit-booking/ creates a real booking for a real cottage. A script that
 * fetches is a script someone will later extend to "just log in first", so
 * this one only ever prints the steps and checks what is on disk.
 *
 * Run: php tests/real-theme/refresh.php
 */

$here = __DIR__;
$manifest = $here . '/manifest.json';
$rows = is_file($manifest)
    ? (array) json_decode((string) file_get_contents($manifest), true)
    : [];

echo "tests/real-theme/ — refresh\n";
echo str_repeat('-', 62) . "\n";

if ($rows) {
    $bytes = array_sum(array_column($rows, 'bytes'));
    printf("on disk: %d stylesheets, %s KB, plus %d font files\n",
        count($rows),
        number_format($bytes / 1024, 0),
        count(glob($here . '/font/*') ?: []));
    $date = preg_match('/captured (\d{4}-\d{2}-\d{2})/', (string) file_get_contents($here . '/README.md'), $m)
        ? $m[1] : '(unknown)';
    echo "captured: $date\n";
    $age = $date === '(unknown)' ? null : (int) floor((time() - strtotime($date)) / 86400);
    if ($age !== null) { echo "age:      $age days\n"; }
} else {
    echo "NOTHING ON DISK — the fixture has not been captured.\n";
}

echo str_repeat('-', 62) . "\n";
echo <<<TXT
To refresh, from a session that can reach the site:

  1. GET the page. A GET only — never submit anything on live.

       curl -sS -A '<a real browser UA>' \\
         https://doracanalcourt.com/submit-booking/ -o live-submit-booking.html

  2. Download every <link rel=stylesheet> IN DOCUMENT ORDER into css/,
     numbered 01- upwards, and rewrite the page's links to point at them.
     Keep every inline <style> block exactly where it is — the Elementor kit
     is inline on this site. Write manifest.json as you go.

  3. Localise the fonts the captured CSS references into font/ and rewrite
     those url()s, so text metrics are the site's own.

  4. Update the date in README.md. The suite asserts it, so a stale fixture
     is visible rather than silent.

  5. node tests/real-theme/browser.js

Refresh after any Bravada or Elementor update, and after any theme or
Customizer change that touches the header.

TXT;
