<?php
/**
 * Render each admin tab to a standalone HTML file, for the layout check and
 * for the screenshots. The markup is the plugin's own — the only thing added
 * is a minimal wp-admin shell so the stylesheet has something to sit in.
 *
 *     php tests/render-screens.php
 */

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/fixtures/mphb-dataset.php';

use DCCL\Admin;
use DCCL\Importer;
use DCCL\Linker;

dccl_reset_db();
dccl_seed_mphb();

foreach ([
    'airbnb-payout.csv', 'airbnb-reservations.csv',
    'bookingcom-reservations.csv', 'bookingcom-payout.csv',
    'vrbo-reservations.csv', 'vrbo-payout.csv', 'bookingcom-invoices.csv',
] as $file) {
    Importer::run(dccl_fixture($file), $file, false, 1);
}
Linker::run(1);
DCCL\Repo::mark_reviewed('overpaid:9009', 'Checked the card processor: a refund covers it.', 1);

$out = __DIR__ . '/screens';
if (!is_dir($out)) {
    mkdir($out, 0775, true);
}

$css = (string) file_get_contents(DCCL_DIR . 'assets/css/admin.css');

foreach (Admin::TABS as $tab) {
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
    $body = (string) ob_get_clean();

    $html = "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
        . "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
        . '<title>DCC Ledger — ' . htmlspecialchars($tab) . "</title>\n<style>\n"
        // A stand-in for the few wp-admin rules the screens rely on.
        . "html,body{margin:0;padding:0;background:#f0f0f1;color:#1d2327;"
        . "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;line-height:1.5;}\n"
        . ".wrap{margin:10px 20px 0 2px;}\n"
        . "h1{font-size:23px;font-weight:400;margin:0 0 8px;}\n"
        . ".button,.button-primary{display:inline-block;padding:4px 12px;border:1px solid #2271b1;border-radius:3px;"
        . "background:#f6f7f7;color:#2271b1;text-decoration:none;cursor:pointer;font-size:13px;}\n"
        . ".button-primary{background:#2271b1;color:#fff;}\n"
        . ".button-link{background:none;border:none;color:#2271b1;cursor:pointer;padding:0;}\n"
        . "input,select{padding:3px 6px;border:1px solid #8c8f94;border-radius:3px;font-size:13px;}\n"
        . ".screen-reader-text{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);}\n"
        . $css
        . "\n</style>\n</head>\n<body>\n" . $body . "\n</body>\n</html>\n";

    file_put_contents($out . '/' . $tab . '.html', $html);
    echo 'Rendered ' . $tab . ' (' . number_format(strlen($html) / 1024, 1) . " KB)\n";
}

echo "\nScreens written to " . $out . "\n";
