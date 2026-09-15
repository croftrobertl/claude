<?php
/**
 * Path-safety tests for DCC_Checkout\Id_Files.
 *
 *   php tests/id-files/run.php
 *
 * contain() and resolve() are the only things between post-meta content and
 * unlink(). They are pure static functions with no WordPress dependencies
 * precisely so they can be tested directly, against a real temporary
 * directory tree with real symlinks and real traversal attempts.
 *
 * Also asserts the guard-file CONTENTS, because the /privacy/ promise depends
 * on them. Whether the live web server honours them is a different question,
 * answered by the "Check public access" probe on the settings page — only the
 * real server can answer that, so it is not faked here.
 */

define('ABSPATH', __DIR__);

// Minimal i18n shims so the pure functions can be exercised without loading
// WordPress. Only note_text() needs them; contain() and resolve() touch
// nothing outside PHP itself, which is the point of keeping them pure.
if (!function_exists('__')) {
    function __($text, $domain = null) { return $text; }
}

require __DIR__ . '/../../dcc-custom-checkout/includes/class-id-files.php';

use DCC_Checkout\Id_Files;

$failures = 0;
function check(string $name, $actual, $expected): void
{
    global $failures;
    $ok = $actual === $expected;
    if (!$ok) { $failures++; }
    echo ($ok ? 'PASS' : 'FAIL') . "  $name\n";
    if (!$ok) {
        echo '      expected: ' . var_export($expected, true) . "\n";
        echo '      actual:   ' . var_export($actual, true) . "\n";
    }
}

/* --- A realistic tree: the store, a sibling, and something precious. ----- */
$root    = sys_get_temp_dir() . '/dcc-id-test-' . bin2hex(random_bytes(4));
$store   = $root . '/uploads/mphb_protected_uploads';
$sibling = $root . '/uploads/mphb_protected_uploads-old';   // prefix trap
$secrets = $root . '/secrets';
mkdir($store, 0777, true);
mkdir($sibling, 0777, true);
mkdir($secrets, 0777, true);
mkdir($store . '/2026', 0777, true);

file_put_contents($store . '/licence.jpg', 'ID');
file_put_contents($store . '/2026/august.jpg', 'ID');
file_put_contents($sibling . '/licence.jpg', 'OTHER');
file_put_contents($secrets . '/wp-config.php', 'SECRET');
file_put_contents($root . '/uploads/holiday.jpg', 'PUBLIC');
@symlink($secrets . '/wp-config.php', $store . '/escape.jpg');

/* --- contain(): what may be deleted. ------------------------------------ */
check('contain: a file in the store resolves',
    Id_Files::contain($store, $store . '/licence.jpg'), realpath($store . '/licence.jpg'));
check('contain: a file in a subdirectory resolves',
    Id_Files::contain($store, $store . '/2026/august.jpg'), realpath($store . '/2026/august.jpg'));

/* --- contain(): what may NOT. ------------------------------------------- */
check('contain: rejects traversal out of the store',
    Id_Files::contain($store, $store . '/../holiday.jpg'), null);
check('contain: rejects deep traversal to wp-config.php',
    Id_Files::contain($store, $store . '/../../secrets/wp-config.php'), null);
check('contain: rejects a SYMLINK pointing outside the store',
    Id_Files::contain($store, $store . '/escape.jpg'), null);
check('contain: rejects a sibling directory sharing the store prefix',
    Id_Files::contain($store, $sibling . '/licence.jpg'), null);
check('contain: rejects a directory, even inside the store',
    Id_Files::contain($store, $store . '/2026'), null);
check('contain: rejects the store itself',
    Id_Files::contain($store, $store), null);
check('contain: rejects a file that does not exist',
    Id_Files::contain($store, $store . '/nope.jpg'), null);
check('contain: rejects an empty candidate', Id_Files::contain($store, ''), null);
check('contain: rejects an empty base', Id_Files::contain('', $store . '/licence.jpg'), null);

/* --- resolve(): the shapes the meta value might take. ------------------- */
check('resolve: a bare filename',
    Id_Files::resolve('licence.jpg', $store), realpath($store . '/licence.jpg'));
check('resolve: a path relative to the store',
    Id_Files::resolve('2026/august.jpg', $store), realpath($store . '/2026/august.jpg'));
check('resolve: an absolute path inside the store',
    Id_Files::resolve($store . '/licence.jpg', $store), realpath($store . '/licence.jpg'));
check('resolve: a URL, reduced to its path under the store',
    Id_Files::resolve('https://doracanalcourt.com/wp-content/uploads/mphb_protected_uploads/licence.jpg', $store),
    realpath($store . '/licence.jpg'));
check('resolve: a URL-encoded traversal is still refused',
    Id_Files::resolve('%2e%2e%2fholiday.jpg', $store), null);
check('resolve: a traversal in a relative value is refused',
    Id_Files::resolve('../holiday.jpg', $store), null);
check('resolve: a Windows-style traversal is refused',
    Id_Files::resolve('..\\holiday.jpg', $store), null);
check('resolve: an absolute path outside the store is refused',
    Id_Files::resolve($secrets . '/wp-config.php', $store), null);
check('resolve: an empty value', Id_Files::resolve('', $store), null);
check('resolve: an attachment ID with no resolved path is refused',
    Id_Files::resolve('123', $store), null);
check('resolve: an attachment ID resolving into the store is accepted',
    Id_Files::resolve('123', $store, $store . '/licence.jpg'), realpath($store . '/licence.jpg'));
check('resolve: an attachment ID resolving OUTSIDE the store is refused',
    Id_Files::resolve('123', $store, $secrets . '/wp-config.php'), null);

/* --- Guard files: the /privacy/ promise in text form. ------------------- */
$guards = Id_Files::guard_files();
check('guards: both files are defined', array_keys($guards), ['index.php', '.htaccess']);
check('guards: index.php is inert PHP', trim($guards['index.php']), "<?php\n// Silence is golden.");
check('guards: .htaccess denies modern Apache',
    (bool) preg_match('/Require all denied/', $guards['.htaccess']), true);
check('guards: .htaccess denies pre-2.4 Apache too',
    (bool) preg_match('/Deny from all/', $guards['.htaccess']), true);
check('guards: .htaccess allows nothing',
    (bool) preg_match('/^\s*(Allow|Require all granted)/mi', $guards['.htaccess']), false);

/* --- The audit line. This is the record of a deletion, so its wording is
       worth pinning: the file, what happened, and who did it. ------------- */
check('note: a manual deletion names the file, the act and the actor',
    Id_Files::note_text('licence.jpg', 'manual', 'Rob Croft (rob)'),
    'Guest ID image "licence.jpg" deleted on request by Rob Croft (rob).');
check('note: a deletion with the booking says so',
    Id_Files::note_text('licence.jpg', 'booking-deleted', 'Rob Croft (rob)'),
    'Guest ID image "licence.jpg" deleted with the booking by Rob Croft (rob).');
check('note: an unknown reason is passed through, never dropped',
    Id_Files::note_text('licence.jpg', 'some-future-reason', 'system'),
    'Guest ID image "licence.jpg" some-future-reason by system.');

/* --- Clean up. ---------------------------------------------------------- */
exec('rm -rf ' . escapeshellarg($root));

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);
