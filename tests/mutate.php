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
    // widget.css carried only the whole-guard mutation above; the staff file
    // has had a single-rule escape since 0.36.0. This is that one, on the
    // second of the two close selectors.
    ['hover: the booking popup close\'s hover escapes the pointer guard', 'assets/css/widget.css',
     "    .mphbac-sheet-close:not(.mphbac-info-close--floating):hover {",
     "}\n.mphbac-sheet-close:not(.mphbac-info-close--floating):hover {",
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
    // RETARGETED IN 0.38.0 ONTO THE CLOSE SELECTOR rather than duplicated for
    // it. The assertion this exercises — "no :hover rule sits before the
    // guard" — is about the whole stylesheet, not about one rule, so moving
    // the target from the bar to the close loses no coverage and puts the
    // mutation on the selector this release is about.
    ['staff: the close button\'s hover escapes the pointer guard', 'assets/css/staff.css',
     "    .mphbac-staff-sheet.mphbac-staff-sheet .mphbac-staff-close:hover {",
     "}\n.mphbac-staff-sheet.mphbac-staff-sheet .mphbac-staff-close:hover {",
     'staff-test.js'],
    ['staff: the view switcher drops back under the tap-target floor', 'assets/css/staff.css',
     "    min-height: 46px;\n    padding: 0 14px;",
     "    min-height: 40px;\n    padding: 0 14px;",
     'staff-test.js'],
    ['staff: the close button goes back to a fixed height', 'assets/css/staff.css',
     "    width: 46px;\n    min-height: 46px;",
     "    width: 46px;\n    height: 44px;",
     'staff-test.js'],

    // --- 0.38.0: the two popup close buttons, treated as one control -----
    // The tap-target mutation above covers the staff X; this is the public
    // one, which had no box assertion of its own before this release.
    ['close: the public popup X drops back under the 46px tap floor', 'assets/css/widget.css',
     "    width: 46px;\n    height: 46px;",
     "    width: 44px;\n    height: 44px;",
     'staff-test.js'],
    ['close: focus goes back to being a FILL instead of an outline', 'assets/css/widget.css',
     ".mphbac-sheet-close.mphbac-sheet-close:focus-visible {\n    outline:",
     ".mphbac-sheet-close.mphbac-sheet-close:focus-visible {\n    background: var(--mphbac-color-alert);\n    color: #ffffff;\n    outline:",
     'staff-test.js'],
    ['close: the public rest colour goes back to a literal, so a palette cannot move it', 'assets/css/widget.css',
     "    color: var(--dcc-button-bg, #0A50B2);",
     "    color: #4A5260;",
     'staff-test.js'],
    ['close: the staff rest colour goes back to a literal', 'assets/css/staff.css',
     "    color: var(--dcc-button-bg, #0A50B2);",
     "    color: #111111;",
     'staff-test.js'],
    ['close: the pre-color-mix() literal fallback is dropped', 'assets/css/widget.css',
     "    background: #E7EEF7;\n    background: color-mix(",
     "    background: color-mix(",
     'staff-test.js'],
    ['close: the glyph shrinks back to punctuation', 'assets/css/widget.css',
     ".mphbac-sheet-close:not(.mphbac-info-close--floating) svg {\n    width: 30px;\n    height: 30px;",
     ".mphbac-sheet-close:not(.mphbac-info-close--floating) svg {\n    width: 20px;\n    height: 20px;",
     'staff-test.js'],
    ['close: the staff X reverts to the &times; character', 'class-staff-widget.php',
     "aria-label=\"<?php echo esc_attr__('Close', 'mphb-availability-calendar'); ?>\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M6 6l12 12M18 6L6 18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.25\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg></button>",
     "aria-label=\"<?php echo esc_attr__('Close', 'mphb-availability-calendar'); ?>\">&times;</button>",
     'staff-test.js'],
    ['close: the staff tokens stop reaching the portaled dialog', 'assets/css/staff.css',
     ".mphbac-staff,\n.mphbac-staff-sheet,\n.mphbac-staff-overlay {",
     ".mphbac-staff {",
     'staff-test.js'],
    ['close: the INFO popup\'s floating X is dragged along with the booking one', 'assets/css/widget.css',
     ".mphbac-sheet-close:not(.mphbac-info-close--floating) {",
     ".mphbac-sheet-close {",
     'staff-test.js'],

    ['staff: the selected tab starts recolouring on hover too', 'assets/css/staff.css',
     '    .mphbac-staff-view:not([aria-pressed="true"]):hover {',
     '    .mphbac-staff-view:hover {',
     'staff-test.js'],

    // --- /staff/ : the font: shorthand, one mutation per control ----------
    // Each drops ONE control's rule back to (0,1,0), where the shorthand at
    // (0,1,1) swallows it again. Three separate mutations because three
    // separate assertions have to be shown to fail.
    ['staff font: the nav rule falls back under the shorthand', 'assets/css/staff.css',
     '.mphbac-staff-nav.mphbac-staff-nav { font-size: 16px; }',
     '.mphbac-staff-nav { font-size: 16px; }',
     'staff-test.js'],
    ['staff font: the Today rule falls back under the shorthand', 'assets/css/staff.css',
     '.mphbac-staff-today.mphbac-staff-today { font-size: 13px; font-weight: 600; }',
     '.mphbac-staff-today { font-size: 13px; font-weight: 600; }',
     'staff-test.js'],
    ['staff font: the view rule falls back under the shorthand', 'assets/css/staff.css',
     '.mphbac-staff-view.mphbac-staff-view { font-size: 14px; font-weight: 600; }',
     '.mphbac-staff-view { font-size: 14px; font-weight: 600; }',
     'staff-test.js'],
    ['staff font: the shorthand is deleted, dropping buttons to the UA font', 'assets/css/staff.css',
     ".mphbac-staff button {\n    font: inherit;",
     ".mphbac-staff button {",
     'staff-test.js'],
    ['staff font: the shorthand is re-expanded to longhands including weight', 'assets/css/staff.css',
     ".mphbac-staff button {\n    font: inherit;",
     ".mphbac-staff button {\n    font-family: inherit;\n    font-size: inherit;\n    font-weight: inherit;",
     'staff-test.js'],

    ['staff font: a word appears in a nav arrow, where the font rules suddenly matter', 'includes/class-staff-widget.php',
     '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7"',
     'Prev<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7"',
     'staff-test.js'],

    // --- /staff/ : the last two fades --------------------------------------
    ['staff fade: every staff button fades again (the block-level guard)', 'assets/css/staff.css',
     "Say which, rather than claiming both. */\n    transition: none;",
     "Say which, rather than claiming both. */",
     'staff-test.js'],
    ['staff fade: a BLANKET transition: none kills the sheet animation', 'assets/css/staff.css',
     '    transition: transform 0.2s ease, opacity 0.2s ease;',
     '    transition: none;',
     'staff-test.js'],

    // --- the rebuilt PHP suites ------------------------------------------
    ['abbrev: the short name stops at the first word again (the 0.23.5 bug)', 'class-data-provider.php',
     "while (count(\$words) > 1 && in_array(strtolower(rtrim(end(\$words), '.,')), \$generic, true)) {",
     "while (count(\$words) > 1) {",
     'abbrev-test.php'],
    ['abbrev: the length cap cuts mid-word', 'class-data-provider.php',
     "\$out = (\$sp !== false && \$sp > 0) ? mb_substr(\$cut, 0, \$sp) : \$cut;",
     "\$out = \$cut;",
     'abbrev-test.php'],
    ['cache: a hit with age 0 is reported as a miss', 'class-cache.php',
     "\$hit = true; // explicit: an age of 0s does not imply a miss",
     "\$hit = \$age > 0;",
     'cache-test.php'],
    ['cache: the unwrapped legacy payload is returned raw', 'class-cache.php',
     "if (is_array(\$cached) && array_key_exists('__v', \$cached) && array_key_exists('__t', \$cached)) {",
     "if (is_array(\$cached)) {",
     'cache-test.php'],
    ['cache: flush_all stops bumping the generation', 'class-cache.php',
     'update_option(self::GEN_OPTION, self::generation() + 1, true);',
     'update_option(self::GEN_OPTION, self::generation(), true);',
     'cache-test.php'],
    ['device-number: the clamp stops clamping', 'class-widget.php',
     'return max($min, min($max, (int) $value));',
     'return (int) $value;',
     'device-number-test.php'],
    ['device-number: an empty value clamps instead of taking the default', 'class-widget.php',
     "if (\$value === '' || \$value === null) {\n            return \$default;",
     "if (false) {\n            return \$default;",
     'device-number-test.php'],
    ['single-widget: months_shown loses its month-mode condition', 'class-widget-single.php',
     "'condition'      => ['layout' => 'month'],",
     "'condition'      => [],",
     'single-widget-test.php'],
    ['single-widget: the control default drifts from the render clamp', 'class-widget-single.php',
     "'default'        => 4,\n            'tablet_default' => 2,",
     "'default'        => 3,\n            'tablet_default' => 2,",
     'single-widget-test.php'],
    ['price: the accommodation whitelist is dropped', 'class-ajax.php',
     'if ($type_id <= 0 || !in_array($type_id, $valid_ids, true)) {',
     'if ($type_id <= 0) {',
     'price-test.php'],
    ['price: a past check-in is accepted', 'class-ajax.php',
     "if (\$ci < \$today) {\n            return null;",
     "if (false) {\n            return null;",
     'price-test.php'],
    ['price: the kses allowlist grows a script tag', 'class-ajax.php',
     "'span' => ['class' => true],",
     "'span' => ['class' => true],\n                'script' => [],",
     'price-test.php'],
    ['staff-ota: Booking.com stops being recognised', 'class-staff-data.php',
     "if (strpos(\$p, 'booking.com') !== false || strpos(\$p, 'booking') !== false) return 'Booking.com';",
     "if (false) return 'Booking.com';",
     'staff-ota-test.php'],
    ['staff-ota: the reserved-room fallback is removed', 'class-staff-data.php',
     "foreach ((array) \$reserved_ids as \$rid) {",
     "foreach ([] as \$rid) {",
     'staff-ota-test.php'],
    ['staff-payment: a failed payment counts toward the balance', 'class-staff-data.php',
     "if (in_array((string) \$r->post_status, \$counts, true) && is_numeric(\$r->amount)) {",
     "if (is_numeric(\$r->amount)) {",
     'staff-payment-test.php'],
    // money() and str_or_dash() both call plain(), so removing either one
    // leaves the other stripping — sound defence in depth, but it means a
    // mutation on one of them proves nothing. plain() is the shared floor.
    ['staff-sections: plain() stops stripping tags', 'class-staff-data.php',
     'wp_strip_all_tags(',
     'strval(',
     'staff-sections-test.php'],
    ['staff-detail: the proxy stops re-deriving from the booking', 'class-staff.php',
     "\$path = Staff_Data::attachment_path_for(\$booking_id, \$field);",
     "\$path = (string) (\$_REQUEST['path'] ?? '');",
     'staff-detail-test.php'],
    ['staff-detail: a SECOND caller of the uncontained helper appears', 'class-staff.php',
     "\$path = Staff_Data::attachment_path_for(\$booking_id, \$field);",
     "\$path = Staff_Data::attachment_path_for(\$booking_id, \$field);\n        \$other = Staff_Data::attachment_path_for(\$booking_id, 'mphb_upload_id');",
     'staff-detail-test.php'],
    ['staff-detail: the docblock warning is deleted', 'class-staff-data.php',
     'DOES NOT CONTAIN ITS OWN OUTPUT',
     'is fine and contains its own output',
     'staff-detail-test.php'],
    ['staff-detail: the uploads containment check is removed', 'class-staff.php',
     "if (\$real === false || \$realbase === false || strpos(\$real, \$realbase . DIRECTORY_SEPARATOR) !== 0) {",
     'if (false) {',
     'staff-detail-test.php'],
    ['staff-notes: a ?object hint comes back and refatals on an array', 'class-staff-data.php',
     'private static function first_of($obj, array $methods)',
     'private static function first_of(?object $obj, array $methods)',
     'staff-notes-test.php'],
    ['staff-notes: a placeholder note renders as an empty row', 'class-staff-data.php',
     "            if (self::is_blank(\$n['text'])) {",
     '            if (false) {',
     'staff-notes-test.php'],
    ['staff-monthview: the cache prime is dropped, restoring the N+1', 'class-staff-data.php',
     '_prime_post_caches($booking_ids, false, true);',
     '/* no prime */;',
     'staff-monthview-test.php'],
    ['staff-nplus1: source_for stops being handed its ids', 'class-staff-data.php',
     "\$source = self::source_for(\$bid, \$reserved_by_booking[\$bid] ?? []);",
     "\$source = self::source_for(\$bid);",
     'staff-nplus1-test.php'],
    ['staff-nplus1: the services query goes back to one per service', 'class-staff-data.php',
     "        \$posts = get_posts([",
     "        \$posts = [];\n        foreach (array_keys(\$ids) as \$one) { \$posts = array_merge(\$posts, get_posts(['post_type' => 'mphb_room_service', 'post__in' => [(int) \$one], 'posts_per_page' => 1])); }\n        \$unused = ([",
     'staff-nplus1-test.php'],
    ['staff-honesty: an imported booking prints the capacity default as a fact', 'class-staff-data.php',
     "} elseif (\$source['imported'] && self::is_capacity_default(\$rooms, \$adults, \$children)) {",
     '} elseif (false) {',
     'staff-honesty-test.php'],
    ['staff-elementor: a control emits a paint property again', 'class-staff-elementor.php',
     "self::SEL . '.mphbac-staff-nav' => '--staff-nav-hover: {{VALUE}};',",
     "self::SEL . '.mphbac-staff-nav:hover' => 'background-color: {{VALUE}};',",
     'staff-elementor-test.php'],

    // --- the rebuilt JS suites --------------------------------------------
    ['js month-grid: the window ends on the FIRST of the last month', 'assets/js/widget.js',
     'function monthWindowEnd(fromStr, n) {',
     'function monthWindowEnd(fromStr, n) { return shiftMonthStr(fromStr, Math.max(0, n - 1));',
     'js/month-grid-test.js'],
    ['js fresh: the two ages stop compounding', 'assets/js/widget.js',
     'return (dataAge + pageAge) < Math.min(EMBED_FRESH_MAX_S, ttl);',
     'return pageAge < Math.min(EMBED_FRESH_MAX_S, ttl);',
     'js/fresh-test.js'],
    ['js fresh: a clock skewed into the future counts as brand new', 'assets/js/widget.js',
     'if (!(pageAge >= 0)) return false;',
     'if (false) return false;',
     'js/fresh-test.js'],
    ['js parity: availability stops being checked on selection', 'assets/js/widget.js',
     'if (blockedNight(ci, co)) {',
     'if (false) {',
     'js/parity-test.js'],
    ['js parity: the checkout day is treated as a night stayed', 'assets/js/widget.js',
     'while (cursor < end && guard++ < 400) {',
     'while (cursor <= end && guard++ < 400) {',
     'js/parity-test.js'],
    ['js estimate: a plain value takes the innerHTML path', 'assets/js/widget.js',
     "if (typeof v === 'object' && v.html !== undefined) {",
     'if (true) {',
     'js/estimate-test.js'],
    ['js estimate: the singular night template is dropped', 'assets/js/widget.js',
     'var tmpl = nights === 1',
     'var tmpl = false',
     'js/estimate-test.js'],
    ['js hint: it anchors on days[0] again (the 0.20.1 bug)', 'assets/js/widget.js',
     'if (!dayIsPast(days[s])) { startIdx = s; break; }',
     'startIdx = s; break;',
     'js/hint-test.js'],
    ['js hint: the single-cottage silence switch stops working', 'assets/js/widget.js',
     'if (config && config.availabilityHint === false) return null;',
     'if (false) return null;',
     'js/hint-test.js'],

    // --- the rebuilt browser suites ---------------------------------------
    ['estimate-ui: the estimate block loses its centring through the portal', 'assets/css/widget.css',
     ".mphbac-sheet-estimate.mphbac-sheet-estimate {\n    text-align: center;",
     ".mphbac-root .mphbac-sheet-estimate {\n    text-align: center;",
     'estimate-ui-test.js'],
    ['sheet-validate: the error row loses its alert role', 'includes/class-widget.php',
     '<p class="mphbac-sheet-error" role="alert" hidden>',
     '<p class="mphbac-sheet-error" hidden>',
     'sheet-validate-test.js'],
    ['public-ui: the cottage name is hidden again on a phone', 'assets/css/widget.css',
     '/* MPHB Availability Calendar — frontend styles */',
     "/* MPHB Availability Calendar — frontend styles */\n@media (max-width: 600px) { .mphbac-label-abbrev { display: none; } }",
     'public-ui-test.js'],

    // --- the portal token fault (0.37.0) ----------------------------------
    ['portal: the tokens go back to being root-only and die inside the popup', 'assets/css/widget.css',
     ".mphbac-root,\n.mphbac-sheet,\n.mphbac-info-sheet {\n    --mphbac-color-available",
     ".mphbac-root {\n    --mphbac-color-available",
     'sheet-validate-test.js'],
    ['portal: ...and the sweep across every token notices too', 'assets/css/widget.css',
     ".mphbac-root,\n.mphbac-sheet,\n.mphbac-info-sheet {\n    --mphbac-color-available",
     ".mphbac-root {\n    --mphbac-color-available",
     'public-ui-test.js'],

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

// Every file this run touches, with the bytes it had BEFORE. Used at the end
// to prove the source was put back: a mutation left applied would be
// committed as a real change, and while the run is in flight `git status`
// shows a mutated file that is about to be restored.
$touched = [];

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
    $runner = str_ends_with($suite, '.js') ? 'node' : 'php';
    // Resolve the suite BY LOOKING FOR IT, and do it BEFORE touching the
    // source: the previous version glued 'browser/' onto every .js path, so a
    // suite under tests/js/ resolved to tests/browser/js/… — a file that does
    // not exist. node exited non-zero and a non-zero exit was read as "the
    // assertion caught it", so NINE mutations reported red because their
    // suite could not run.
    $candidates = [__DIR__ . '/' . $suite, __DIR__ . '/browser/' . $suite];
    $path_to = null;
    foreach ($candidates as $c) { if (is_file($c)) { $path_to = $c; break; } }
    if ($path_to === null) {
        $broken[] = $name;
        printf("%-8s %s\n", 'NO SUITE', $name . '  (' . $suite . ' not found — the mutation cannot prove anything)');
        continue;
    }

    $originals[$path] = $body;
    $touched[$path] = $body;
    // Replace the FIRST occurrence only. Replacing every match can mutate
    // more than the behaviour under test, so a red result would not prove the
    // suite guards the thing this entry names.
    $hits = substr_count($body, $from);
    $pos = strpos($body, $from);
    file_put_contents($path, substr_replace($body, $to, $pos, strlen($from)));
    $out = [];
    $code = 0;
    exec($runner . ' ' . escapeshellarg($path_to) . ' 2>&1', $out, $code);
    file_put_contents($path, $body);
    unset($originals[$path]);
    // RED MUST MEAN "AN ASSERTION CAUGHT IT", not merely "the process exited
    // non-zero" — a crash, a syntax error or a missing dependency exits
    // non-zero too, and reading that as success is how a mutation comes to
    // prove nothing. A suite that really ran prints PASS/FAIL lines; one that
    // printed none did not get far enough to judge anything.
    $text = implode("\n", $out);
    $ran  = preg_match('/^(PASS|FAIL)\s/m', $text) === 1;
    if (!$ran) {
        $broken[] = $name;
        printf("%-8s %s\n", 'NO RUN', $name . '  (the suite produced no PASS/FAIL output — it crashed rather than failed)');
        continue;
    }
    $went_red = $code !== 0;
    printf("%-8s %s%s\n", $went_red ? 'red ok' : 'SURVIVED', $name,
        $hits > 1 ? "  (first of $hits occurrences)" : '');
    if (!$went_red) { $survived[] = $name; }
}

// PROVE THE SOURCE IS BACK. Not decoration: this script rewrites the plugin's
// own files, and a mutation left applied looks exactly like a deliberate edit.
$dirty = [];
foreach ($touched as $path => $before) {
    if (file_get_contents($path) !== $before) {
        $dirty[] = $path;
    }
}
echo "\n" . (count($dirty) === 0
    ? 'source restored: ' . count($touched) . ' file(s) verified byte-identical'
    : 'SOURCE NOT RESTORED — ' . implode(', ', $dirty)) . "\n";

echo "\n" . count($mutations) . ($filter !== '' ? " matching" : '') . " mutations, "
   . count($survived) . " survived, " . count($broken) . " stale\n";
if ($survived) {
    echo "\nSURVIVING MUTATIONS — these behaviours are NOT actually guarded:\n";
    foreach ($survived as $s) { echo "  - $s\n"; }
}
exit(($survived || $broken || $dirty) ? 1 : 0);
