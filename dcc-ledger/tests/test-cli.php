<?php
/**
 * What the CLI prints.
 *
 * The staging checklist is worked from these commands, so their output is a
 * deliverable in its own right. On live, 0.1.8's snapshot printed nothing
 * about Rob's two rulings, and `cleanup` ended with "28 items need a person"
 * when thirteen of those needed nobody.
 */

declare(strict_types=1);

use DCCL\Cli;
use DCCL\Issues;
use DCCL\Linker;
use DCCL\Snapshot;

dccl_seed_mphb();
dccl_import_all();
Linker::run(1);

$cli = new Cli();

T::group('The snapshot prints every figure it worked out');

WP_CLI::reset();
$cli->snapshot([], ['dry-run' => true]);
$dry = WP_CLI::output();

T::ok(str_contains($dry, 'Assumed payments:'), 'The window rule is printed');
T::ok(str_contains($dry, 'Assumed pre-exports:'), 'And so is the pre-export ruling');
T::ok(str_contains($dry, 'Refunds recorded:'), 'And the refunds');

$counts = Snapshot::run(true, 1)['counts'];
T::ok(
    str_contains($dry, '$' . number_format(((int) $counts['assumed_pre_exports_total']) / 100, 2)),
    'The pre-export total printed is the one the snapshot worked out'
);
T::ok(
    str_contains($dry, '$' . number_format(((int) $counts['refunds_total']) / 100, 2)),
    'And so is the refund total'
);
T::ok($counts['assumed_pre_exports'] > 0, 'There is a pre-export figure to print in the first place');
T::ok($counts['refunds_recorded'] > 0, 'And a refund figure');

T::group('The cleanup list counts only what needs a person');

Snapshot::run(false, 1);

$open = Issues::open();
$info = 0;
$work = 0;
foreach ($open as $item) {
    if ((string) $item['severity'] === 'info') {
        $info++;
    } else {
        $work++;
    }
}
T::ok($info > 0, 'There are information items to be miscounted');
T::ok($work > 0, 'And items that do need a person');

WP_CLI::reset();
$cli->cleanup([], []);
$out = WP_CLI::output();

T::ok(
    str_contains($out, sprintf('%d items need a person.', $work)),
    'The count at the end is the work, not the whole list'
);
T::ok(
    !str_contains($out, sprintf('%d items need a person.', $work + $info)),
    'The information items are not counted among it'
);
T::ok(
    str_contains($out, sprintf('For information only (%d)', $info)),
    'They are printed under their own heading, with their own count'
);
T::ok(
    str_contains($out, 'An Imported Calendar Block ('),
    'Grouped by what they are'
);

T::group('The money commands');

WP_CLI::reset();
$cli->money_check([], []);
$out = WP_CLI::output();
T::ok(str_contains($out, 'whole cents'), 'The check reports on the state of the money');
T::ok(str_contains($out, 'Rows still holding a decimal and no cents: 0'), 'And counts what is left unconverted');
// The two invariants that were wrong on live and shown on no screen. The
// Director checks these from the command line, without a login.
T::ok(str_contains($out, 'net is never above gross'), 'It checks net against gross over the stored data');
T::ok(str_contains($out, 'no money in a rate without nights'), 'And that no money is in a rate without nights');
T::ok(str_contains($out, 'every channel and every cottage'), 'Saying how widely it looked');
T::ok(str_contains($out, 'Success:'), 'It passes on a ledger written in cents');

WP_CLI::reset();
$cli->money_rollback([], []);
$rolled = WP_CLI::output();
T::ok(str_contains($rolled, 'Cells restored:'), 'The rollback says how much it put back');
T::ok(str_contains($rolled, 'Warning:'), 'And warns that figures are withheld until it is converted again');

// Put it back, so the suites that follow read a converted ledger.
DCCL\Money_Migration::run();

T::group('Both spellings of the money commands reach the code');

// The checklist and the rollback notes both say `wp dcc-ledger money-check`.
// Until 0.3.0 only `money_check` was registered, so the line a person would
// copy at the worst possible moment — the rollback — errored out.
WP_CLI::$commands = [];
DCCL\Plugin::instance()->register_cli();

foreach (['money-check', 'money-rollback', 'money_check', 'money_rollback'] as $spelling) {
    // Each spelling is run against a converted ledger, because money-check
    // fails by design on one that has been rolled back.
    DCCL\Money_Migration::run();
    WP_CLI::reset();
    T::ok(
        WP_CLI::run_command('dcc-ledger ' . $spelling, [], ['dry-run' => true]),
        'wp dcc-ledger ' . $spelling . ' reaches the code'
    );
    T::ok(WP_CLI::output() !== '', 'And prints something when it gets there');
}

// Put the money back in cents: the rollback spellings ran last.
DCCL\Money_Migration::run();
