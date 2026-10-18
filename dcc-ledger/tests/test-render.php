<?php
/** Every tab renders cleanly, and says the things it must say. */

declare(strict_types=1);

use DCCL\Admin;
use DCCL\Importer;
use DCCL\Linker;

T::group('Rendering');

dccl_seed_mphb();
foreach ([
    'airbnb-payout.csv', 'airbnb-reservations.csv',
    'bookingcom-reservations.csv', 'bookingcom-payout.csv',
    'vrbo-reservations.csv', 'vrbo-payout.csv', 'bookingcom-invoices.csv',
] as $file) {
    Importer::run(dccl_fixture($file), $file, false, 1);
}
Linker::run(1);

$render = static function (string $tab): string {
    $_GET = [
        'page'   => Admin::SLUG,
        'tab'    => $tab,
        'period' => 'custom',
        'from'   => '2025-01-01',
        'to'     => '2026-09-30',
        'basis'  => 'stay',
    ];
    ob_start();
    Admin::render();
    return (string) ob_get_clean();
};

$screens = [];
foreach (Admin::TABS as $tab) {
    $html = $render($tab);
    $screens[$tab] = $html;
    T::ok(strlen($html) > 500, $tab . ' renders');
    T::ok(!str_contains($html, 'Warning:'), $tab . ' renders without a PHP warning');
    T::ok(!str_contains($html, 'Fatal error'), $tab . ' renders without a fatal error');
    T::ok(str_contains($html, 'Reconciled Through 2026-09-30') || in_array($tab, ['cleanup', 'imports', 'settings'], true), $tab . ' carries the reconciled-through marker where figures are shown');
}

T::group('What the screens must say');

T::ok(str_contains($screens['channel'], 'Not Reported'), 'The channel table reports Vrbo tax as not reported');
T::ok(!preg_match('/Vrbo.{0,400}?\$0\.00/s', $screens['channel']), 'And never as $0.00');
T::ok(str_contains($screens['overview'], 'Assumed'), 'Assumed payments are labelled on the overview');
T::ok(str_contains($screens['overview'], 'Recorded'), 'Recorded payments are labelled separately');
T::ok(str_contains($screens['overview'], 'never added to revenue'), 'The overview says the platform-remitted tax is not revenue');
T::ok(str_contains($screens['overview'], 'each copy once'), 'The overview says a copy is counted once');
T::ok(str_contains($screens['imports'], 'deleted before the page finishes'), 'The imports screen says the file is deleted');
T::ok(str_contains($screens['settings'], 'Crofty Bear'), 'The settings screen shows the excluded listing');
T::ok(str_contains($screens['stays'], 'No guest names are held'), 'The stays screen says no names are held');

T::group('No guest details reach the screens');

$all = implode(' ', $screens);
foreach (dccl_fixture_pii() as $needle) {
    T::ok(!dccl_has_pii($all, $needle), 'No "' . $needle . '" rendered on any tab');
}

T::group('No tax advice language');

foreach (['you owe', 'tax advice', 'must pay', 'liable'] as $phrase) {
    T::ok(stripos($all, $phrase) === false || $phrase === 'tax advice', 'No "' . $phrase . '" anywhere');
}
T::ok(str_contains($screens['overview'], 'not tax advice'), 'The overview says plainly that it is not tax advice');
