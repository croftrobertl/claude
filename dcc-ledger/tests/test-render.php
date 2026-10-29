<?php
/** Every tab renders cleanly, and says the things it must say. */

declare(strict_types=1);

use DCCL\Admin;
use DCCL\Importer;
use DCCL\Linker;

T::group('Rendering');

dccl_seed_mphb();
dccl_import_all();
Linker::run(1);
DCCL\Snapshot::run(false, 1);

$render = static function (string $tab, array $extra = []): string {
    $_GET = $extra + [
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

// The metrics, each with its definition and the range beside it.
T::ok(str_contains($screens['overview'], 'ADR, Gross'), 'The overview shows ADR gross');
T::ok(str_contains($screens['overview'], 'ADR, Net'), 'And ADR net beside it, never one alone');
T::ok(str_contains($screens['overview'], 'RevPAR, Gross'), 'RevPAR gross');
T::ok(str_contains($screens['overview'], 'RevPAR, Net'), 'And RevPAR net');
T::ok(str_contains($screens['overview'], 'Occupancy'), 'Occupancy');
T::ok(str_contains($screens['overview'], 'Length Of Stay'), 'Length of stay');
T::ok(str_contains($screens['overview'], 'Platform Lead Time'), 'Platform lead time');
T::ok(str_contains($screens['overview'], 'Direct Lead Time'), 'And direct lead time, separately');
T::ok(
    str_contains($screens['overview'], 'From the date the booking was entered'),
    'With the direct figure labelled for what it actually measures'
);
T::ok(str_contains($screens['overview'], 'Booking Pace'), 'Booking pace has its own panel');
T::ok(
    str_contains($screens['overview'], 'never worked out afterwards'),
    'Which says the curve is recorded, not reconstructed'
);
T::ok(str_contains($screens['channel'], 'Channel Mix'), 'The channel screen shows the mix');
T::ok(str_contains($screens['channel'], 'Share Of Net Revenue'), 'By money as well as by nights');

// The trail: every figure opens to the rows behind it.
T::ok(
    substr_count($screens['overview'], 'Show The Rows Behind This') >= 6,
    'Every headline figure on the overview opens to its rows'
);
T::ok(str_contains($screens['overview'], 'tab=stays'), 'And the link goes to the stays they came from');
T::ok(str_contains($screens['overview'], 'show=rate_nights'), 'Naming the figure it is showing the rows for');
T::ok(str_contains($screens['imports'], 'Assumed Payments Standing'), 'The imports screen lists the assumptions standing');
T::ok(str_contains($screens['imports'], 'Reverse This Assumption'), 'Each with a way to reverse it');
// The tile counted information items as work, the same bug the CLI had.
T::ok(str_contains($screens['cleanup'], 'For Information'), 'The cleanup screen counts information items apart from the work');
T::ok(
    str_contains($screens['cleanup'], 'for information only, and need nothing doing about them'),
    'And says so in words before listing them'
);
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

T::group('A figure opens to the rows behind it');

$all_stays = $render('stays');
$cancelled = $render('stays', ['show' => 'cancellations']);

T::ok(str_contains($cancelled, 'Cancellations'), 'Following the trail says which figure is being explained');
T::ok(
    str_contains($cancelled, 'counted in the month it would have checked in'),
    'And states the definition the figure was computed by'
);
T::ok(
    str_contains($cancelled, '2025-01-01') && str_contains($cancelled, '2026-09-30'),
    'Over the same range the figure was taken over'
);
T::ok(
    str_contains($cancelled, 'Show Every Stay In This Period Instead'),
    'With a way back to the whole list'
);

$count = static function (string $html): int {
    return (int) preg_match('/(\d+) stays? overlapping/', $html, $m) ? (int) $m[1] : -1;
};
T::ok($count($all_stays) > $count($cancelled), 'And the list really is narrowed to those rows');
T::ok($count($cancelled) > 0, 'But not to nothing');

$unknown = $render('stays', ['show' => 'not-a-figure']);
T::same($count($all_stays), $count($unknown), 'A figure nobody knows shows every row rather than none');
