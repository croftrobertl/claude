<?php
/**
 * MUTATION CHECK. "A harness that cannot fail is worse than none."
 *
 * Each entry below breaks ONE guarded behaviour in the plugin source and
 * expects a named suite to go red. A mutation that survives means the
 * assertion protecting it does not actually test it — which is exactly the
 * failure the Custom Checkout button-colour assertion had for weeks.
 *
 * Run: php tests/mutate.php            every mutation (slow: each browser
 *                                       suite launches Chromium, ~2-3 min)
 *      php tests/mutate.php staff       only mutations whose name matches
 *      php tests/mutate.php "tap|hover" a regex, for iterating on one area
 *
 * Restores every file, even on Ctrl-C. A FILTERED run is for iteration only —
 * "0 survived" from a filtered run is not the same claim as a full one, so
 * the summary says which it was.
 */
$root  = dirname(__DIR__);
$base = $root . '/mphb-availability-calendar/';
/** includes/ is implied for a bare class file; assets/ paths are given in full. */
$resolve = static function (string $file) use ($base): string {
    return str_contains($file, '/') ? $base . $file : $base . 'includes/' . $file;
};

$mutations = [
    // --- rule 1: the photo ID -------------------------------------------
    ['staff panel: photo ID matches on the key alone again', 'class-staff-data.php',
     "if (!is_scalar(\$val) || self::is_blank(trim((string) \$val))) {\n            return false;\n        }",
     "if (false) {\n            return false;\n        }",
     'staff-panel-test.php'],

    // --- rule 2: money --------------------------------------------------
    ['staff panel: money rows render without a price', 'class-staff-data.php',
     '$has_price = ($total_f !== null && $total_f > 0);',
     '$has_price = true;',
     'staff-panel-test.php'],
    ['staff panel: Balance Due stops rendering when paid off', 'class-staff-data.php',
     "            self::push(\$out, __('Balance Due', 'mphb-availability-calendar'), self::money(\$owed), ['money' => true]);",
     "            if (\$owed > 0) { self::push(\$out, __('Balance Due', 'mphb-availability-calendar'), self::money(\$owed), ['money' => true]); }",
     'staff-panel-test.php'],
    ['staff panel: Total and Paid render even when nothing is owed', 'class-staff-data.php',
     '            if ($owed > 0) {
                self::push($out, __(\'Total\', \'mphb-availability-calendar\'), self::money($total), [\'money\' => true]);',
     '            if (true) {
                self::push($out, __(\'Total\', \'mphb-availability-calendar\'), self::money($total), [\'money\' => true]);',
     'staff-panel-test.php'],

    // --- rule 4: the guest count ----------------------------------------
    ['staff panel: the confirmed-count marker is ignored', 'class-staff-data.php',
     'return $found ? [\'adults\' => $adults, \'children\' => $children] : null;',
     'return null;',
     'staff-panel-test.php'],
    ['staff panel: every imported count is treated as the capacity default', 'class-staff-data.php',
     'return $capacity === 0 || $adults === $capacity;',
     'return true;',
     'staff-panel-test.php'],

    // --- rule 5: the pet gate -------------------------------------------
    ['staff panel: the pet block is ungated', 'class-staff-data.php',
     'if (!self::is_blank($dog_type) || self::has_pet_service($rooms)) {',
     'if (true) {',
     'staff-panel-test.php'],
    ['staff panel: a non-pet service counts as a pet fee', 'class-staff-data.php',
     "if (preg_match('/\\b(pet|dog)/i', (string) \$post->post_title)) {",
     'if (true) {',
     'staff-panel-test.php'],
    ['staff panel: service ids read from the value instead of the key', 'class-staff-data.php',
     '$sid = (int) ($is_list ? $v : $k);',
     '$sid = (int) $v;',
     'staff-panel-test.php'],

    // --- the standing security constraints ------------------------------
    ['security: the fail-closed password check is removed', 'class-staff.php',
     "if (!is_string(\$post->post_password) || \$post->post_password === '') {",
     'if (false) {',
     'staff-gate-test.php'],
    ['security: the capability path stops being checked', 'class-staff.php',
     'if (is_user_logged_in() && current_user_can(self::capability())) {',
     'if (false) {',
     'staff-gate-test.php'],
    ['security: cancelled bookings become reachable', 'class-staff.php',
     "public const VISIBLE_STATUSES = ['confirmed', 'pending', 'pending-payment', 'pending-user'];",
     "public const VISIBLE_STATUSES = ['confirmed', 'pending', 'pending-payment', 'pending-user', 'cancelled'];",
     'staff-gate-test.php'],
    // --- 0.31.x: the hover tokens and the (0,6,0) trap ------------------
    ['hover: a control emits :hover again instead of a token', 'class-widget.php',
     "self::SEL . '.mphbac-nav-btn' => '--mphbac-color-nav-hover: {{VALUE}};',",
     "self::SEL . '.mphbac-nav-btn:hover' => 'background-color: {{VALUE}};',",
     'hover-hint-test.js'],
    ['hover: a REST control emits a paint property again', 'class-widget.php',
     "'selectors' => [self::SEL . '.mphbac-nav-btn' => '--mphbac-color-nav-bg: {{VALUE}};'],",
     "'selectors' => [self::SEL . '.mphbac-nav-btn' => 'background-color: {{VALUE}};'],",
     'hover-hint-test.js'],
    ['hover: the pointer guard is opened up', 'assets/css/widget.css',
     '@media (hover: hover) and (pointer: fine) {',
     '@media all {',
     'hover-hint-test.js'],
    ['hint: the bold default is inherited again', 'assets/css/widget.css',
     "    font-weight: 300;\n    font-size: max(16px, 1em);",
     "    font-size: max(16px, 1em);",
     'hover-hint-test.js'],
    ['hint: it stops hiding when a value is set', 'assets/css/widget.css',
     ".mphbac-input:not(.mphbac-input--empty) + .mphbac-field-ph,",
     ".mphbac-input.never-matches + .mphbac-field-ph,",
     'hover-hint-test.js'],
    ['theme fade: the button transition guard is removed', 'assets/css/widget.css',
     ".mphbac-nav-btn.mphbac-nav-btn,\n.mphbac-btn.mphbac-btn,\n.mphbac-row-toggle.mphbac-row-toggle {\n    transition: none;\n}",
     ".mphbac-nav-btn.never-matches {\n    transition: none;\n}",
     'hover-hint-test.js'],

    // --- 0.28.0-0.30.0: the field standard ------------------------------
    ['field: the native appearance reset is removed', 'assets/css/widget.css',
     "    -webkit-appearance: none;\n    appearance: none;",
     "    -webkit-appearance: auto;\n    appearance: auto;",
     'field-standard-test.js'],
    ['field: the 8.5em floor comes back', 'assets/css/widget.css',
     "    min-width: 0;\n}",
     "    min-width: 8.5em;\n}",
     'field-standard-test.js'],
    ['field: the iOS 16px floor is dropped for a plain inherit', 'assets/css/widget.css',
     "font-size: max(16px, 1em);\n}",
     "font-size: inherit;\n}",
     'field-standard-test.js'],
    ['field: the pill drops back to (0,2,0), below Bravada\'s kit', 'assets/css/widget.css',
     ".mphbac-input.mphbac-input.mphbac-input.mphbac-input {\n    background-color: #ffffff;",
     ".mphbac-input.mphbac-input {\n    background-color: #ffffff;",
     'field-standard-test.js'],
    ['field: the focus ring loses its ancestor-free selector', 'assets/css/widget.css',
     '.mphbac-input.mphbac-input.mphbac-input:focus-visible {',
     '.mphbac-root .mphbac-input:focus-visible {',
     'field-standard-test.js'],

    // --- 0.27.0-0.31.0: phones and the month grid ------------------------
    ['mobile: the filter row goes back to stacking', 'assets/css/widget.css',
     "    .mphbac-filter {\n        display: contents;\n    }",
     "    .mphbac-filter {\n        display: flex;\n        flex-direction: column;\n    }",
     'mobile-test.js'],
    ['mobile: the months grid returns to auto-fit', 'assets/css/widget.css',
     'grid-template-columns: repeat(2, minmax(0, 1fr));',
     'grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));',
     'mobile-test.js'],
    ['mobile: the popup field floor comes back at <=600px', 'assets/css/widget.css',
     "    .mphbac-sheet .mphbac-sheet-field {\n        flex: 1 1 0;",
     "    .mphbac-sheet .mphbac-sheet-field {\n        flex: 1 1 8.5em;",
     'mobile-test.js'],
    ['mobile: the first-image fix is regressed', 'assets/js/widget.js',
     'slideToLoop(0, 0, false)',
     'slideToLoop(1, 0, false)',
     'mobile-test.js'],

    // --- 0.25.0-0.26.0: the typography pin ------------------------------
    // The 0.25.0 bug was a `font:` shorthand at the CONTROL'S OWN tier
    // (0,2,0), not at (0,1,1) — the file's own note says a shorthand below the
    // control "loses harmlessly". Mutating the harmless tier produced a
    // survivor that was really a badly chosen mutation.
    ['typography: the font shorthand returns at the control\'s own tier', 'assets/css/widget.css',
     ".mphbac-input.mphbac-input {\n    box-sizing: border-box;",
     ".mphbac-input.mphbac-input {\n    font: inherit;\n    box-sizing: border-box;",
     'typography-test.js'],
    // If any of these three control selectors gains an ancestor, the portaled
    // popup silently drops out of the control's reach. That is the fault the
    // 2026-09-17 "known gap" claimed to have found; it was a fixture artefact,
    // but the failure mode is real and is now guarded.
    ['typography: the field control gains an ancestor and orphans the portaled popup', 'class-widget.php',
     "private const FSEL = '.mphbac-input.mphbac-input';",
     "private const FSEL = '{{WRAPPER}} .mphbac-root .mphbac-input.mphbac-input';",
     'typography-test.js'],
    ['typography: font-weight is pinned again, stealing it from the panel', 'assets/css/widget.css',
     "input.mphbac-input {\n    font-family: inherit;",
     "input.mphbac-input {\n    font-weight: 700;\n    font-family: inherit;",
     'typography-test.js'],
    ['staff panel: the reserved rooms are resolved once per section again', 'class-staff-data.php',
     "self::section_customer(\$booking_id, \$booking, \$rooms)",
     "self::section_customer(\$booking_id, \$booking, self::reserved_entities(\$booking_id, \$booking))",
     'staff-panel-test.php'],

    // --- /staff/ : the same shapes as the public side, on the staff selectors
    ['staff: a control emits :hover again, outside the guard\'s reach at (0,7,0)', 'class-staff-elementor.php',
     "self::SEL . '.mphbac-staff-nav' => '--staff-nav-hover: {{VALUE}};',",
     "self::SEL . '.mphbac-staff-nav:hover' => 'background-color: {{VALUE}};',",
     'staff-test.js'],
    ['staff: the rest colour goes back to a paint property and out-specifies the hover', 'class-staff-elementor.php',
     "self::SEL . '.mphbac-staff-nav' => '--staff-nav-bg: {{VALUE}};'",
     "self::SEL . '.mphbac-staff-nav' => 'background-color: {{VALUE}};'",
     'staff-test.js'],
    ['staff: the hover default reverts to the amber', 'class-staff-elementor.php',
     "'default'   => '#f08080',",
     "'default'   => '#FFA000',",
     'staff-test.js'],
    ['staff: :focus-visible is re-merged into the GATED hover rule', 'assets/css/staff.css',
     ".mphbac-staff-nav:focus-visible { background: var(--staff-nav-hover); }",
     "",
     'staff-test.js'],
    ['staff: a hover rule escapes the pointer guard', 'assets/css/staff.css',
     "    .mphbac-staff-bar:hover { filter: brightness(1.08); }",
     "}\n.mphbac-staff-bar:hover { filter: brightness(1.08); }\n@media all {",
     'staff-test.js'],
    ['staff: the view switcher drops back under the tap-target floor', 'assets/css/staff.css',
     "    min-height: 46px;\n    padding: 0 14px;",
     "    min-height: 40px;\n    padding: 0 14px;",
     'staff-test.js'],
    ['staff: the close button goes back to a fixed height', 'assets/css/staff.css',
     "    width: 46px;\n    min-height: 46px;",
     "    width: 46px;\n    height: 44px;",
     'staff-test.js'],
    ['staff: the theme 0.75s fade comes back on the view switcher', 'assets/css/staff.css',
     "    padding: 0 14px;\n    transition: none;",
     "    padding: 0 14px;",
     'staff-test.js'],
    ['staff: the selected tab starts recolouring on hover too', 'assets/css/staff.css',
     '    .mphbac-staff-view:not([aria-pressed="true"]):hover {',
     '    .mphbac-staff-view:hover {',
     'staff-test.js'],

    // --- the grid ---------------------------------------------------------
    ['cells: the day number loses its own token and inherits the cell colour', 'assets/css/widget.css',
     "    color: var(--mphbac-color-day-num, #1F2937);",
     "    color: #7A7A7A;",
     'cells-test.js'],
    ['cells: the day number goes white, which is ~3.1:1 on the coral', 'assets/css/widget.css',
     '    --mphbac-color-day-num: #1F2937;',
     '    --mphbac-color-day-num: #ffffff;',
     'cells-test.js'],
    ['cells: available and booked collapse to the same fill', 'assets/css/widget.css',
     '    --mphbac-color-booked: #FB6962;',
     '    --mphbac-color-booked: #7BDCB5;',
     'cells-test.js'],
    ['cells: the scale tiles stack upward instead of downward', 'assets/css/widget.css',
     '    z-index: calc(40 - var(--mphbac-row-i, 0));',
     '    z-index: calc(40 + var(--mphbac-row-i, 0));',
     'cells-test.js'],
    ['cells: the cottage cell clips its tile again', 'assets/css/widget.css',
     "    overflow: visible;\n    z-index: calc(40 - var(--mphbac-row-i, 0));",
     "    overflow: hidden;\n    z-index: calc(40 - var(--mphbac-row-i, 0));",
     'cells-test.js'],
    ['cells: the tooltip starts visible instead of on hover', 'assets/css/widget.css',
     "    opacity: 0;\n    transition: opacity 0.15s ease;",
     "    opacity: 1;\n    transition: opacity 0.15s ease;",
     'cells-test.js'],

    // --- the nav row ----------------------------------------------------
    ['nav: the chevrons lose currentColor, so the colour control stops driving them', 'includes/class-widget.php',
     'stroke="currentColor" stroke-width="2.25"',
     'stroke="#000000" stroke-width="2.25"',
     'nav-test.js'],
    ['nav: the row goes back to space-between', 'assets/css/widget.css',
     "    justify-content: center;\n    gap: 10px;\n    margin-bottom: 12px;",
     "    justify-content: space-between;\n    gap: 10px;\n    margin-bottom: 12px;",
     'nav-test.js'],
    ['nav: [hidden] stops hiding the Today button', 'assets/css/widget.css',
     ".mphbac-root.mphbac-root .mphbac-nav-btn[hidden],\n.mphbac-root.mphbac-root .mphbac-btn[hidden] {",
     ".mphbac-root.mphbac-root .mphbac-nav-btn.never-matches,\n.mphbac-root.mphbac-root .mphbac-btn.never-matches {",
     'nav-test.js'],
    ['nav: the 44px hit area is dropped from the arrows', 'assets/css/widget.css',
     "    min-width: 44px;\n    min-height: 44px;\n    padding: 0 4px;",
     "    min-width: 20px;\n    min-height: 20px;\n    padding: 0 4px;",
     'nav-test.js'],
    ['nav: the svg stops being hidden from the accessibility tree', 'includes/class-widget.php',
     '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7"',
     '<svg viewBox="0 0 24 24" focusable="true"><path d="M15 5l-7 7 7 7"',
     'nav-test.js'],

    // --- the stylesheet-wide disciplines ---------------------------------
    ['polish: a hover rule escapes the pointer guard', 'assets/css/widget.css',
     '.mphbac-row-toggle--info:hover .mphbac-label-abbrev,',
     '}\n.mphbac-row-toggle--info:hover .mphbac-label-abbrev,',
     'polish-test.js'],
    ['polish: an !important lands on a property the field control emits', 'assets/css/widget.css',
     '    line-height: 1.3 !important;',
     '    line-height: 1.3 !important;\n    font-size: 18px !important;',
     'polish-test.js'],
    ['polish: reduced motion stops switching the field transition off', 'assets/css/widget.css',
     '    .mphbac-input.mphbac-input { transition: none; }',
     '    .mphbac-input.never-matches { transition: none; }',
     'polish-test.js'],
    ['polish: the action buttons drop below the 44px floor', 'assets/css/widget.css',
     "    min-height: 46px;\n    padding: 0.5em 0.9em;",
     "    min-height: 40px;\n    padding: 0.5em 0.9em;",
     'polish-test.js'],
    ['polish: the action buttons sit exactly on 44.0 with no headroom', 'assets/css/widget.css',
     "    min-height: 46px;\n    padding: 0.5em 0.9em;",
     "    min-height: 44px;\n    padding: 0.5em 0.9em;",
     'polish-test.js'],
    ['polish: min-height becomes height, so a wrapping label is clipped', 'assets/css/widget.css',
     "    min-height: 46px;\n    padding: 0.5em 0.9em;",
     "    height: 46px;\n    padding: 0.5em 0.9em;",
     'polish-test.js'],
    ['polish: the buttons go back to inline-block and the label stops centring', 'assets/css/widget.css',
     "row would read as misaligned without anything reporting an error. */\n    display: inline-flex;\n    align-items: center;\n    justify-content: center;",
     "row would read as misaligned without anything reporting an error. */\n    display: inline-block;",
     'polish-test.js'],
];

$originals = [];
$restore = static function () use (&$originals) {
    foreach ($originals as $path => $body) { file_put_contents($path, $body); }
    $originals = [];
};
register_shutdown_function($restore);
foreach ([SIGINT, SIGTERM] as $sig) {
    if (function_exists('pcntl_signal')) { pcntl_signal($sig, static function () use ($restore) { $restore(); exit(2); }); }
}

$filter = $argv[1] ?? '';
if ($filter !== '') {
    $mutations = array_values(array_filter(
        $mutations,
        static fn(array $m): bool => (bool) preg_match('/' . str_replace('/', '\/', $filter) . '/i', $m[0])
    ));
    if (!$mutations) {
        echo "no mutation matches /$filter/\n";
        exit(1);
    }
}

$survived = [];
$broken    = [];
echo "MUTATION CHECK — each line breaks one guarded behaviour and must go RED.\n"
   . ($filter !== '' ? "FILTERED to /$filter/ — this is an iteration run, not a full one.\n" : '')
   . "\n";
foreach ($mutations as [$name, $file, $from, $to, $suite]) {
    $path = $resolve($file);
    $body = file_get_contents($path);
    if (!str_contains($body, $from)) {
        $broken[] = $name;
        printf("%-8s %s\n", 'STALE', $name . '  (the code it mutates has moved — fix the mutation)');
        continue;
    }
    $originals[$path] = $body;
    // Replace the FIRST occurrence only. Replacing every match can mutate
    // more than the behaviour under test, so a red result would not prove the
    // suite guards the thing this entry names.
    $hits = substr_count($body, $from);
    $pos = strpos($body, $from);
    file_put_contents($path, substr_replace($body, $to, $pos, strlen($from)));
    $out = [];
    $code = 0;
    $runner = str_ends_with($suite, '.js') ? 'node' : 'php';
    $path_to = __DIR__ . '/' . ($runner === 'node' ? 'browser/' : '') . $suite;
    exec($runner . ' ' . escapeshellarg($path_to) . ' 2>&1', $out, $code);
    file_put_contents($path, $body);
    unset($originals[$path]);
    $went_red = $code !== 0;
    printf("%-8s %s%s\n", $went_red ? 'red ok' : 'SURVIVED', $name,
        $hits > 1 ? "  (first of $hits occurrences)" : '');
    if (!$went_red) { $survived[] = $name; }
}

echo "\n" . count($mutations) . ($filter !== '' ? " matching" : '') . " mutations, "
   . count($survived) . " survived, " . count($broken) . " stale\n";
if ($survived) {
    echo "\nSURVIVING MUTATIONS — these behaviours are NOT actually guarded:\n";
    foreach ($survived as $s) { echo "  - $s\n"; }
}
exit(($survived || $broken) ? 1 : 0);
