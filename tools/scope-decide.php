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
 * Since 4.15.0 the gate is the "Show On" checklist: --show=default (Rob's
 * Home, Contact, Cottages), --show=all (every kind below ticked, so only
 * the hard exclusions can say no), or a list (--show=home,22). The old
 * --scope= is accepted: 'all' means --show=all, anything else the default.
 *
 *   php tools/scope-decide.php --show=default --kind=front|page|cottages|other|cottage|post|archive|checkout|submitbooking
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
    'page'     => ['page' => true, 'id' => 22, 'slug' => 'contact', 'path' => '/contact/'],
    'cottages' => ['page' => true, 'id' => 1005, 'slug' => 'cottages', 'path' => '/cottages/'],
    'other'    => ['page' => true, 'id' => 9999, 'slug' => 'new-page', 'path' => '/new-page/'],
    'cottage'  => ['cottage' => true, 'id' => 1607, 'path' => '/accommodation/cottage-34/'],
    'post'     => ['path' => '/2026/10/a-post/'],
    'archive'  => ['path' => '/?s=canal'],
    'checkout' => ['page' => true, 'id' => 2393, 'slug' => 'checkout', 'path' => '/checkout/'],
    /* 4.14.0: the page the Book Now form posts to (MotoPress's checkout page, ID 1399) */
    'submitbooking' => ['page' => true, 'id' => 1399, 'slug' => 'submit-booking', 'path' => '/submit-booking/'],
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
$show = (string) ($args['show'] ?? ((($args['scope'] ?? '') === 'all') ? 'all' : 'default'));
if ($show === 'all') {
    $opt['show_on'] = ['home', 22, 1005, 9999, 1607, 2393, 1399];
} elseif ($show !== 'default') {
    $opt['show_on'] = Settings::show_on_norm(explode(',', $show));
}
$opt['placement'] = 'content';
$opt['layering'] = 'front';
$GLOBALS['OPTIONS'][Settings::OPTION] = $opt;
$_SERVER['REQUEST_URI'] = $GLOBALS['REQ']['path'];

$ref = new \ReflectionClass(Plugin::class);
$m = $ref->getMethod('should_load');
$m->setAccessible(true);
echo $m->invoke($ref->newInstanceWithoutConstructor()) ? "LOAD\n" : "SKIP\n";
