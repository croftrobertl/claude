<?php
/**
 * DCC Seasons — ask the REAL should_load() whether a page loads, outside
 * WordPress, so a browser suite can serve the page the way the site would
 * (4.11.0, for "All pages except for homepage").
 *
 * Scope is decided in PHP, so a browser test that invents its own answer
 * proves nothing. This prints the plugin's own verdict, and the kinds of
 * page are the ones the matrix is written against.
 *
 *   php tools/scope-decide.php --scope=not_home --kind=front|page|cottage|post|archive|checkout
 *
 * Prints "LOAD" or "SKIP". Exit code 0 either way; 2 on a bad argument.
 *
 * @package DCC_Seasons
 */

require __DIR__ . '/scope-stubs.php';

use DCC_Seasons\Plugin;
use DCC_Seasons\Settings;

$args = [];
foreach (array_slice($argv, 1) as $a) {
    if (preg_match('/^--([a-z_]+)=(.*)$/', $a, $m)) { $args[$m[1]] = $m[2]; }
}
$KINDS = [
    'front'    => ['front' => true, 'path' => '/'],
    'page'     => ['page' => true, 'id' => 12, 'slug' => 'contact', 'path' => '/contact/'],
    'cottage'  => ['cottage' => true, 'path' => '/accommodation/cottage-34/'],
    'post'     => ['path' => '/2026/10/a-post/'],
    'archive'  => ['path' => '/?s=canal'],
    'checkout' => ['page' => true, 'id' => 2393, 'slug' => 'checkout', 'path' => '/checkout/'],
];
$kind = (string) ($args['kind'] ?? '');
if (!isset($KINDS[$kind])) {
    fwrite(STDERR, "unknown --kind: $kind\n");
    exit(2);
}
$GLOBALS['REQ'] = array_merge(
    ['front' => false, 'page' => false, 'cottage' => false, 'id' => 0, 'slug' => '', 'path' => '/'],
    $KINDS[$kind]
);
$opt = Settings::defaults();
$opt['scope'] = (string) ($args['scope'] ?? 'all');
$opt['placement'] = 'content';
$opt['layering'] = 'front';
$GLOBALS['OPTIONS'][Settings::OPTION] = $opt;
$_SERVER['REQUEST_URI'] = $GLOBALS['REQ']['path'];

$ref = new \ReflectionClass(Plugin::class);
$m = $ref->getMethod('should_load');
$m->setAccessible(true);
echo $m->invoke($ref->newInstanceWithoutConstructor()) ? "LOAD\n" : "SKIP\n";
