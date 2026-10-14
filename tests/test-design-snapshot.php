<?php
/**
 * Unit test for the design-mirroring core: Selector_Widget::design_snapshot(),
 * config_from_snapshot(), and publish_design() (the registry round-trip a Mini
 * Entry relies on when mirroring a Cottage Selector). Pure PHP with tiny stubs for
 * the handful of WP/Elementor symbols these static methods touch — no real WP needed.
 *
 * Run: php tests/test-design-snapshot.php
 */

namespace {
    define('ABSPATH', sys_get_temp_dir() . '/');
    define('DCCS_DIR', __DIR__ . '/../dcc-cottage-selector/');

    if (!function_exists('__')) {
        function __($text, $domain = null) { return $text; }
    }
    if (!function_exists('wp_json_encode')) {
        function wp_json_encode($data) { return json_encode($data); }
    }
    if (!function_exists('esc_url_raw')) {
        // Pass-through is fine for tests: design_snapshot() only needs it defined.
        function esc_url_raw($url) { return $url; }
    }
    // register_controls() renders labels/descriptions through the escaping helpers.
    if (!function_exists('esc_html__')) {
        function esc_html__($t, $d = null) { return $t; }
        function esc_attr__($t, $d = null) { return $t; }
        function esc_html($t) { return $t; }
        function esc_attr($t) { return $t; }
    }

    // In-memory options store so publish_design()/get_option() can round-trip.
    $GLOBALS['__opts'] = [];
    function get_option($k, $default = false) { return $GLOBALS['__opts'][$k] ?? $default; }
    // Passthrough, so a guest34 reader that grows a filter hook still RUNS here and
    // is caught by the no-hook assertion, rather than a fatal hiding which check bit.
    function apply_filters($hook, $value) { return $value; }
    function update_option($k, $v, $autoload = null) { $GLOBALS['__opts'][$k] = $v; $GLOBALS['__writes'][] = $k; return true; }
    // Posts that exist (0.53.1 design_sources() skips sources whose post is gone).
    function get_post_status($id) { return in_array((int) $id, $GLOBALS['__posts'] ?? [], true) ? 'publish' : false; }
}

// Minimal Elementor base so the widget class can load (design_snapshot et al. are
// static and never touch the parent; the Icons_Manager guard is class_exists()'d).
// The control methods RECORD what register_controls() registers, which lets the
// preset-defaults test below check every preset key against a real control.
namespace Elementor {
    class Controls_Manager {
        const TAB_CONTENT = 'content'; const TAB_STYLE = 'style';
        const TEXT = 'text'; const TEXTAREA = 'textarea'; const COLOR = 'color';
        const SELECT = 'select'; const SWITCHER = 'switcher'; const SLIDER = 'slider';
        const DIMENSIONS = 'dimensions'; const CHOOSE = 'choose'; const ICONS = 'icons';
        const RAW_HTML = 'raw_html'; const HEADING = 'heading'; const SELECT2 = 'select2';
        const WYSIWYG = 'wysiwyg'; const NUMBER = 'number'; const URL = 'url';
        const MEDIA = 'media'; const REPEATER = 'repeater'; const HIDDEN = 'hidden';
        const ALERT = 'alert'; const POPOVER_TOGGLE = 'popover_toggle';
    }
    class Group_Control_Typography { public static function get_type() { return 'typography'; } }
    class Group_Control_Border { public static function get_type() { return 'border'; } }
    class Group_Control_Box_Shadow { public static function get_type() { return 'box_shadow'; } }
    class Base_Data_Control { public function get_type() { return 'x'; } }
    // NOTE: these three signatures mirror Elementor\Controls_Stack EXACTLY, including
    // `final` on add_group_control()/add_responsive_control() and the required
    // `array $args`. v0.19.0 shipped overrides of the final ones, which is a fatal
    // "Cannot override final method" as soon as the widget class is autoloaded — it
    // took down every front-end page carrying the widget. Keeping the real modifiers
    // here means any future attempt to override them fails this test file outright
    // instead of reaching a live site.
    class Widget_Base {
        public $__ctrls = [];
        public $__gfields = [];
        // The args are kept, not just the id, so the preset test can check each preset
        // VALUE against the control TYPE it will be handed to.
        public function add_control($id, array $args, $o = []) { $this->__ctrls[$id] = $args; }
        final public function add_responsive_control($id, array $args, $o = []) { $this->__ctrls[$id] = $args; }
        final public function add_group_control($t, array $args = [], array $o = []) {
            foreach ((array) ($args['fields_options'] ?? []) as $f => $fa) {
                $this->__gfields[($args['name'] ?? '') . '_' . $f] = $fa;
            }
        }
        public function start_controls_section($i, $a = []) {} public function end_controls_section() {}
        public function start_controls_tabs($i, $a = []) {} public function end_controls_tabs() {}
        public function start_controls_tab($i, $a = []) {} public function end_controls_tab() {}
        public function get_settings_for_display($k = null) { return []; }
    }
}

namespace {
    require DCCS_DIR . 'includes/class-data.php';
    require DCCS_DIR . 'includes/class-settings.php';
    require DCCS_DIR . 'includes/class-menu.php';
    require DCCS_DIR . 'includes/class-config.php';
    require DCCS_DIR . 'includes/class-icons.php';
    require DCCS_DIR . 'includes/class-selector-widget.php';

    use DCCS\Selector_Widget;

    $pass = 0; $fail = 0;
    function ok($label, $cond) {
        global $pass, $fail;
        if ($cond) { $pass++; echo "  ok  - $label\n"; }
        else { $fail++; echo "  NOT OK - $label\n"; }
    }

    // A representative Selector settings array (as Elementor would store it).
    $settings = [
        'str_heading'         => 'Find your cottage',
        'str_results_heading' => 'Your top matches',
        'start_mode'          => 'weights',
        'enabled_modes'       => ['weights', 'compare'],
        'show_heading'        => '',                 // heading off
        'icon_submit'         => ['value' => ''],    // empty icon -> dropped
        'icon_side_view'      => 'right',
        'not_a_string'        => ['x' => 1],         // ignored (non-scalar, non str_)
        'color_accent'        => '#123456',          // -> --dccs-accent
        'color_text'          => '',                 // unset -> dropped
        'color_btn_bg'        => '#abcdef',          // -> --dccs-btn-bg (split-out palette)
        'color_results_bg'    => '#fafafa',          // -> --dccs-results-bg
        'corner_radius'       => ['size' => 14, 'unit' => 'px'], // -> --dccs-radius: 14px
    ];

    $snap = Selector_Widget::design_snapshot($settings);

    ok('string overrides strip the str_ prefix', ($snap['string_overrides']['heading'] ?? null) === 'Find your cottage');
    ok('multiple string overrides captured', ($snap['string_overrides']['results_heading'] ?? null) === 'Your top matches');
    ok('non str_ / non-scalar keys ignored', !array_key_exists('not_a_string', $snap['string_overrides']));
    ok('startMode carried', $snap['startMode'] === 'weights');
    ok('enabledModes carried', $snap['enabledModes'] === ['weights', 'compare']);
    ok('showHeading reflects the switcher (off)', $snap['showHeading'] === false);
    ok('empty icons are dropped', !isset($snap['icons']['submit']));
    ok('icon sides captured', ($snap['iconSides']['view'] ?? null) === 'right');
    ok('icon sides default to left', ($snap['iconSides']['questions'] ?? null) === 'left');
    ok('cssVars capture a set colour', ($snap['cssVars']['--dccs-accent'] ?? null) === '#123456');
    ok('cssVars capture the split-out button background', ($snap['cssVars']['--dccs-btn-bg'] ?? null) === '#abcdef');
    ok('cssVars capture the split-out results background', ($snap['cssVars']['--dccs-results-bg'] ?? null) === '#fafafa');
    ok('cssVars format a slider as size+unit', ($snap['cssVars']['--dccs-radius'] ?? null) === '14px');
    ok('cssVars drop unset colours', !array_key_exists('--dccs-text', $snap['cssVars']));

    // Rebuild the front-end config from the snapshot (what a Mini Entry does when mirroring).
    $cfg = Selector_Widget::config_from_snapshot($snap, ['highlight' => '31']);
    ok('config applies the mirrored heading string', ($cfg['strings']['heading'] ?? null) === 'Find your cottage');
    ok('config carries startMode from the snapshot', ($cfg['startMode'] ?? null) === 'weights');
    ok('config carries the extra highlight', ($cfg['highlight'] ?? null) === '31');
    ok('config still includes the cottage dataset', !empty($cfg['cottages']));
    ok('config surfaces cssVars for inline application', ($cfg['cssVars']['--dccs-accent'] ?? null) === '#123456');

    // publish_design() round-trip + hash dedupe.
    Selector_Widget::publish_design('Main', 123, 'abc123', $settings);
    $reg = get_option(Selector_Widget::DESIGN_OPTION, []);
    ok('registry stores the named design', isset($reg['Main']));
    ok('registry records the source post id', ($reg['Main']['post_id'] ?? null) === 123);
    ok('registry records the page scope class', ($reg['Main']['page_class'] ?? null) === 'elementor-123');
    ok('registry records the element scope class', ($reg['Main']['el_class'] ?? null) === 'elementor-element-abc123');
    ok('registry stores the snapshot overrides', ($reg['Main']['overrides']['string_overrides']['heading'] ?? null) === 'Find your cottage');

    $hash1 = $reg['Main']['hash'];
    Selector_Widget::publish_design('Main', 123, 'abc123', $settings);   // unchanged
    $reg2 = get_option(Selector_Widget::DESIGN_OPTION, []);
    ok('re-publishing identical settings is a no-op (same hash)', $reg2['Main']['hash'] === $hash1);

    $settings['str_heading'] = 'Changed';
    Selector_Widget::publish_design('Main', 123, 'abc123', $settings);   // changed
    $reg3 = get_option(Selector_Widget::DESIGN_OPTION, []);
    ok('a real change updates the registry', ($reg3['Main']['overrides']['string_overrides']['heading'] ?? null) === 'Changed');

    // ---- Mini Entry parity with the Cottage Selector ----------------------------
    // Mini_Entry_Widget subclasses Selector_Widget, so it must land in the SAME
    // Elementor category without redeclaring it.
    require DCCS_DIR . 'includes/class-mini-entry-widget.php';
    $selCats  = (new \ReflectionClass(Selector_Widget::class))->newInstanceWithoutConstructor()->get_categories();
    $miniRef  = new \ReflectionClass(\DCCS\Mini_Entry_Widget::class);
    $miniCats = $miniRef->newInstanceWithoutConstructor()->get_categories();
    ok('Mini Entry shares the Selector\'s Elementor category', $miniCats === $selCats);
    // Elementor groups the panel by SLUG, not by title. 'dcc-widgets' is the slug the
    // sibling DCC plugins register on the LIVE install (verified: Guest Guide, Contact
    // Form, Availability Calendar), so sharing it is what puts all the widgets in ONE
    // "Dora Canal Court" section; any other slug silently splits the panel in two.
    ok('category slug is the one shared with the sibling DCC plugins', $selCats === ['dcc-widgets']);
    ok('Mini Entry inherits the category (no duplicated slug to drift)',
        $miniRef->getMethod('get_categories')->getDeclaringClass()->getName() === Selector_Widget::class);

    // The [dcc_selector_entry] shortcode builds its pop-up config WITHOUT a widget,
    // via Config::build(). selector.js reads a MISSING key as "on"
    // (`config.showReview !== false`), so any default the widget sets must also be
    // present here or the shortcode pop-up silently behaves differently.
    $shortcodeCfg = \DCCS\Config::build([], ['highlight' => '22', 'startMode' => 'quick']);
    $widgetCfg    = Selector_Widget::config_from_snapshot(Selector_Widget::design_snapshot([]));
    foreach (['showReview', 'showHeading', 'showCompareTip', 'capacityFeeUrl', 'petFeeUrl'] as $key) {
        ok("shortcode pop-up config declares $key (no silent JS default)", array_key_exists($key, $shortcodeCfg));
        ok("shortcode $key matches the widget default", ($shortcodeCfg[$key] ?? null) === ($widgetCfg[$key] ?? null));
    }
    ok('review step is off by default on both paths', ($shortcodeCfg['showReview'] ?? null) === false);

    // The "pick 2" tip switch: off by default, and a MISSING stored key (every
    // instance placed before 0.21.0) must read as off too.
    ok('compare tip is off by default on both paths', ($shortcodeCfg['showCompareTip'] ?? null) === false);
    // 0.48.0: a missing key is INHERITED, not false — the snapshot omits it and the
    // effective config carries the site default (off).
    ok('snapshot omits show_compare_tip when nothing is stored (inherit)',
        !array_key_exists('showCompareTip', Selector_Widget::design_snapshot([])));
    ok('and the effective config still reads off',
        Selector_Widget::config_from_snapshot(Selector_Widget::design_snapshot([]))['showCompareTip'] === false);
    ok('snapshot maps show_compare_tip=yes to on',
        Selector_Widget::design_snapshot(['show_compare_tip' => 'yes'])['showCompareTip'] === true);

    // Fee-details URLs (v0.22.0): DEFAULT EMPTY -> no link renders; a set URL
    // control carries through the snapshot to the JS config.
    ok('capacity fee URL is inherited (omitted) when unset, and effectively empty',
        !array_key_exists('capacityFeeUrl', Selector_Widget::design_snapshot([]))
        && Selector_Widget::config_from_snapshot(Selector_Widget::design_snapshot([]))['capacityFeeUrl'] === '');
    ok('pet fee URL is inherited (omitted) when unset, and effectively empty',
        !array_key_exists('petFeeUrl', Selector_Widget::design_snapshot([]))
        && Selector_Widget::config_from_snapshot(Selector_Widget::design_snapshot([]))['petFeeUrl'] === '');
    ok('a set capacity fee URL flows through the snapshot',
        Selector_Widget::design_snapshot(['capacity_fee_url' => ['url' => '/extra-guest-fees/']])['capacityFeeUrl'] === '/extra-guest-fees/');
    ok('a set pet fee URL flows through the snapshot',
        Selector_Widget::design_snapshot(['pet_fee_url' => ['url' => '/pet-policy/']])['petFeeUrl'] === '/pet-policy/');

    // 0.22.3: the two note strings are deliberately NOT preset any more — they
    // duplicated the Config defaults verbatim (drift hazard, bitten in 0.22.2)
    // and bypassed Loco. A widget with NO stored value (every instance placed
    // before the controls existed) must fall back to the translatable Config
    // default and render the exact live wording.
    require_once DCCS_DIR . 'includes/class-preset-defaults.php';
    $presetNow = \DCCS\Preset_Defaults::map();
    ok('preset no longer carries str_capacity_note', !array_key_exists('str_capacity_note', $presetNow));
    ok('preset no longer carries str_pet_note', !array_key_exists('str_pet_note', $presetNow));
    $fallbackCfg = Selector_Widget::config_from_snapshot(Selector_Widget::design_snapshot([]));

    // 0.39.0: OWNER-APPROVED COPY, pinned deliberately. The stored per-widget
    // overrides that carried this wording are being removed from all three live
    // instances, so these two strings become the only copy of it on the site.
    // They are content, not a placeholder — changing either sends new words
    // straight to guests, so a change here should be a decision, not a tidy-up.
    $CAPACITY = 'Guests 1-2 are included in the nightly rate and will have a queen bed. '
        . 'Guests 3-4 will have a pull-out couch and be charged a nightly fee.';
    $PET = 'Pets are only allowed in Cottage 34 and must be pre-approved.';

    ok('capacity note falls back to the Config default (live wording)',
        ($fallbackCfg['strings']['capacity_note'] ?? null) === $CAPACITY);
    ok('pet note falls back to the Config default (live wording)',
        ($fallbackCfg['strings']['pet_note'] ?? null) === $PET);
    ok('a widget-stored note still wins over the fallback',
        (Selector_Widget::config_from_snapshot(Selector_Widget::design_snapshot(
            ['str_capacity_note' => 'CUSTOM NOTE']))['strings']['capacity_note'] ?? null) === 'CUSTOM NOTE');

    // THE GUARANTEE THE OVERRIDE REMOVAL RESTS ON. design_snapshot() copies ANY
    // scalar str_ setting into string_overrides, including an empty string — but
    // Config::build() applies an override only when it is a non-empty string, so
    // a blanked panel field falls through to the packaged copy instead of
    // publishing nothing. That makes clearing the field equivalent, for what a
    // guest reads, to deleting the key from the settings array.
    $blanked = Selector_Widget::config_from_snapshot(Selector_Widget::design_snapshot(
        ['str_capacity_note' => '', 'str_pet_note' => '']));
    ok('an empty capacity override falls through to the packaged copy',
        ($blanked['strings']['capacity_note'] ?? null) === $CAPACITY);
    ok('an empty pet override falls through to the packaged copy',
        ($blanked['strings']['pet_note'] ?? null) === $PET);
    // Positive control: the same path DOES carry a non-empty override, so the two
    // assertions above are not passing because overrides are ignored wholesale.
    ok('the override path is live — a non-empty value still lands',
        (Selector_Widget::config_from_snapshot(Selector_Widget::design_snapshot(
            ['str_pet_note' => 'OVERRIDDEN']))['strings']['pet_note'] ?? null) === 'OVERRIDDEN');

    // Neither note may name a fee amount — amounts have one source of truth
    // elsewhere on the site, and the pet fee is tiered ($25/$20/$10 per night by
    // stay length), so any single figure would be wrong for two of three tiers.
    // Read the LIVE strings, not the literals above: asserting against our own
    // copies would only test this file's typing and would pass however Config
    // changed. (It did exactly that until a mutation adding "$25" to the pet note
    // sailed through.)
    $liveNotes = ($fallbackCfg['strings']['capacity_note'] ?? '')
        . ' ' . ($fallbackCfg['strings']['pet_note'] ?? '');
    ok('the notes were actually read, so the checks below mean something',
        strlen($liveNotes) > 40);
    ok('neither note quotes a fee amount',
        strpos($liveNotes, '$') === false
        && preg_match('/\\b\\d+\\s*(dollars?|usd)\\b/i', $liveNotes) === 0);
    // And the superseded wording is gone from the packaged strings entirely.
    $allStrings = implode(' ', array_filter(\DCCS\Config::strings(), 'is_string'));
    ok('the strings table is non-empty, so the search below means something',
        strlen($allStrings) > 500);
    ok('no packaged string still carries the superseded capacity wording',
        strpos($allStrings, 'For guests 3 and 4, a nightly fee will apply') === false);
    ok('no packaged string still carries the superseded pet wording',
        strpos($allStrings, 'only, by pre-approval') === false);

    // ---- The site-wide 3-4 guest switch (option dcc_guest34_enabled) -----------
    // This plugin only READS the option; DCC Custom Checkout renders the checkbox.
    // ABSENT or TRUTHY means ON, so a site without that plugin — or before the
    // option is ever written — is unaffected.
    $optKey = 'dcc_guest34_enabled';
    $saved = $GLOBALS['__opts'][$optKey] ?? null;
    unset($GLOBALS['__opts'][$optKey]);

    ok('absent option => ON (the site is unchanged until the owner flips it)',
        \DCCS\Config::guest34_enabled() === true);
    ok('and the config payload says so', \DCCS\Config::build([], [])['guest34'] === true);

    // POSITIVE CONTROL: the reader can return false at all, so the trues above are
    // not passing because the method is hard-wired.
    $GLOBALS['__opts'][$optKey] = '';
    ok('an empty stored value => OFF', \DCCS\Config::guest34_enabled() === false);
    ok('and that reaches the config payload', \DCCS\Config::build([], [])['guest34'] === false);

    // THE CONTRACT, as DCC Custom Checkout 0.25.2 actually implements it (read
    // from its source, not from notes): it WRITES '1' for on and '' for off, and
    // READS ON only for absent, '1' or 1 — everything else is OFF. Checkout's
    // reader comment says this plugin's copy "must agree character for
    // character", so this matrix is Checkout's own tests/guest34 matrix plus the
    // strings the 0.43.0 reader got wrong.
    foreach ([['1', true], [1, true], ['', false], ['0', false], [0, false],
              ['yes', false], ['true', false], ['no', false], ['false', false], ['off', false],
              [true, false], [false, false]] as $case) {
        list($stored, $expect) = $case;
        $GLOBALS['__opts'][$optKey] = $stored;
        ok('guest34: stored ' . var_export($stored, true) . ' reads ' . ($expect ? 'ON' : 'OFF') . ', as Checkout reads it',
            \DCCS\Config::guest34_enabled() === $expect);
    }
    // Checkout is dropping its filter hook (owner's decision); this plugin must not
    // grow one either, or the two readers can disagree through a third party.
    $cfgSrc = (string) file_get_contents(DCCS_DIR . 'includes/class-config.php');
    $fnStart = strpos($cfgSrc, 'function guest34_enabled');
    $fnBody  = substr($cfgSrc, $fnStart, strpos($cfgSrc, "\n    }", $fnStart) - $fnStart);
    ok('the reader was found', $fnStart !== false && strlen($fnBody) > 40);
    ok('the reader exposes no filter hook', strpos($fnBody, 'apply_filters') === false);

    // The switch is site-wide and read afresh every render, so it must NOT be
    // frozen into a published design snapshot the way per-widget settings are.
    $GLOBALS['__opts'][$optKey] = '';
    $snap = Selector_Widget::design_snapshot(['str_heading' => 'x']);
    ok('the switch is not part of the design snapshot',
        !array_key_exists('guest34', $snap) && !array_key_exists('guest34', $snap['string_overrides'] ?? []));
    ok('a config rebuilt from a snapshot still reads the LIVE option',
        Selector_Widget::config_from_snapshot($snap)['guest34'] === false);
    $GLOBALS['__opts'][$optKey] = '1';
    ok('and follows it back on again',
        Selector_Widget::config_from_snapshot($snap)['guest34'] === true);

    if ($saved === null) { unset($GLOBALS['__opts'][$optKey]); } else { $GLOBALS['__opts'][$optKey] = $saved; }

    // ---- 0.44.0: the settings page ---------------------------------------------
    $sKey = \DCCS\Settings::OPTION;
    $sSaved = $GLOBALS['__opts'][$sKey] ?? null;
    unset($GLOBALS['__opts'][$sKey]);

    // (1) DEFAULTS REPRODUCE PRE-0.44.0 BEHAVIOUR EXACTLY. These literals are the
    // ones that used to be hard-coded in Config::build() and in the JS; if a
    // default here drifts, a fresh install stops matching the shipped release.
    $d = \DCCS\Settings::defaults();
    // 0.53.1 (Rob, Part D): the defaults ARE live's stored dccs_settings row, as
    // exported 2026-10-14. Until 0.53.0 they reproduced 0.43.0 (3 results, all
    // three modes); a blind install now behaves like live instead.
    $wasHardCoded = [
        'results_count' => 8, 'badges_max' => 3, 'reasons_max' => 3,
        'start_mode' => 'quick', 'enabled_modes' => ['quick', 'compare'],
        'show_heading' => true, 'show_review' => false, 'show_compare_tip' => false,
        'capacity_fee_url' => '', 'pet_fee_url' => '',
        'avail_enable' => false, 'avail_max_nights' => 95,
        'avail_action' => 'mphbac_query', 'avail_calendar_url' => '',
    ];
    foreach ($wasHardCoded as $k => $v) {
        ok('default ' . $k . ' equals the live value', ($d[$k] ?? null) === $v);
    }
    ok('and defaults() covers every key the page writes, with no extras',
        array_keys($d) === array_keys($wasHardCoded));

    // The config a widget-less caller builds must carry those same values.
    $fresh = \DCCS\Config::build([], []);
    ok('a fresh install still opens on the quick finder', $fresh['startMode'] === 'quick');
    ok('a fresh install lists eight cottages, as live does', $fresh['resultsCount'] === 8);
    ok('a fresh install offers Matching Quiz and Compare Mode only, as live does', $fresh['enabledModes'] === ['quick', 'compare']);
    ok('a fresh install still has availability OFF', $fresh['availability']['enabled'] === false);
    ok('a fresh install still caps the stay at 95 nights', $fresh['availability']['maxNights'] === 95);

    // (2) THE UPGRADE MERGE. A row stored by an EARLIER release has none of the
    // keys a later one adds; reading must fill them from defaults rather than
    // leaving the new feature looking switched off (the DCC Seasons 4.0.0 trap).
    $GLOBALS['__opts'][$sKey] = ['start_mode' => 'compare', 'show_review' => true];
    $merged = \DCCS\Settings::get();
    ok('a stored value still wins after the merge', $merged['start_mode'] === 'compare');
    ok('a second stored value too', $merged['show_review'] === true);
    ok('a key the stored row never had picks up its default', $merged['results_count'] === 8);
    ok('including one added after that row was written', $merged['avail_max_nights'] === 95);
    ok('every default key is present after merging a partial row',
        array_diff(array_keys($d), array_keys($merged)) === []);
    // A key the plugin no longer knows about must not ride along.
    $GLOBALS['__opts'][$sKey] = ['results_count' => 5, 'dccs_retired_key' => 'x'];
    $pruned = \DCCS\Settings::get();
    ok('a retired key is dropped on read', !array_key_exists('dccs_retired_key', $pruned));
    ok('while the live key beside it survives', $pruned['results_count'] === 5);

    // (3) SANITISATION. Out-of-range and wrong-shape input falls back to the
    // DEFAULT rather than being clamped to an edge, so a malformed POST cannot
    // quietly reconfigure the site.
    $bad = \DCCS\Settings::sanitize([
        'results_count' => '99', 'badges_max' => '-2', 'reasons_max' => 'three',
        'start_mode' => 'nonsense', 'enabled_modes' => ['quick', 'evil'],
        'capacity_fee_url' => 'javascript:alert(1)',
        'pet_fee_url' => 'https://example.com/fees',
        'avail_max_nights' => '0', 'avail_action' => 'drop tables; --',
        'avail_calendar_url' => 'data:text/html,<script>',
    ]);
    ok('an out-of-range count falls back to the default', $bad['results_count'] === 8);
    ok('a negative count does too', $bad['badges_max'] === 3);
    ok('a non-numeric count does too', $bad['reasons_max'] === 3);
    ok('an unknown mode is dropped', $bad['enabled_modes'] === ['quick']);
    ok('an opening mode outside the enabled set is corrected', $bad['start_mode'] === 'quick');
    ok('a javascript: URL is rejected outright', $bad['capacity_fee_url'] === '');
    ok('a data: URL is rejected outright', $bad['avail_calendar_url'] === '');
    ok('a legitimate https URL survives', $bad['pet_fee_url'] === 'https://example.com/fees');
    ok('zero nights falls back to 95', $bad['avail_max_nights'] === 95);
    ok('an action slug with spaces/punctuation is rejected', $bad['avail_action'] === 'mphbac_query');
    // POSITIVE CONTROL: sanitize does accept good input, so the rejections above
    // are not passing because everything is rejected wholesale.
    $good = \DCCS\Settings::sanitize([
        'results_count' => '5', 'enabled_modes' => ['compare', 'quick'],
        'start_mode' => 'compare', 'show_heading' => '1',
        'avail_max_nights' => '30', 'avail_action' => 'mphbac_query',
    ]);
    ok('a valid count is accepted', $good['results_count'] === 5);
    ok('a valid mode set is accepted, in canonical order', $good['enabled_modes'] === ['quick', 'compare']);
    ok('a valid opening mode is accepted', $good['start_mode'] === 'compare');
    ok('a valid night cap is accepted', $good['avail_max_nights'] === 30);
    ok('never saves an empty mode set', \DCCS\Settings::sanitize(['enabled_modes' => []])['enabled_modes'] === $d['enabled_modes']);

    // (4) The shared DCC menu contract. A divergent slug silently makes a SECOND
    // "DCC" top-level menu; a colliding priority reorders someone else's page.
    ok('the parent slug is the shared one', \DCCS\Menu::PARENT === 'dcc');
    ok('the submenu priority is the one recorded in the report', \DCCS\Menu::PRIORITY === 45);
    // Live register, 2026-09-25: 20 contact-form, 30 guest-guide, 35 features,
    // 40 seasons, 45 us, 50 checkout, 55 calendar, 63 wildlife.
    ok('and it does not collide with a sibling on the live register',
        !in_array(\DCCS\Menu::PRIORITY, [20, 30, 35, 40, 50, 55, 63], true));
    ok('saving is gated on manage_options', \DCCS\Menu::CAP === 'manage_options');

    // 0.45.0: the dcc-menu.php mu-plugin OWNS the parent. Two owners is the
    // duplicate-parent problem, not the fix, so this plugin must no longer create
    // it or clean up after it. Tokenised rather than grepped: the class comment
    // explains the removal and names both functions, and a text search would match
    // the explanation and pass forever.
    $menuSrc = (string) file_get_contents(DCCS_DIR . 'includes/class-menu.php');
    $calls = [];
    foreach (token_get_all($menuSrc) as $t) {
        if (is_array($t) && $t[0] === T_STRING) { $calls[] = $t[1]; }
    }
    ok('the tokeniser sees real calls in the menu class, so the checks below mean something',
        in_array('add_submenu_page', $calls, true));
    ok('the plugin no longer registers the shared parent itself',
        !in_array('add_menu_page', $calls, true));
    ok('nor removes the mirrored first item the mu-plugin now handles',
        !in_array('remove_submenu_page', $calls, true));
    ok('and the words still appear in prose, proving the tokeniser ignored the comment',
        strpos($menuSrc, 'add_menu_page') !== false || strpos($menuSrc, '999') !== false);

    if ($sSaved === null) { unset($GLOBALS['__opts'][$sKey]); } else { $GLOBALS['__opts'][$sKey] = $sSaved; }

    // ---- 0.45.0: the comment-stripped stylesheet is EQUIVALENT ------------------
    // --check guards staleness; this guards that the stripper removed comments and
    // nothing else. Computed styles were compared in Chromium too (508 elements x
    // 34 properties x four widths x modal open/closed, zero differences) — this is
    // the cheap structural half that runs on every commit.
    $cssFull = (string) file_get_contents(DCCS_DIR . 'assets/css/selector.css');
    $cssMin  = (string) file_get_contents(DCCS_DIR . 'assets/css/selector.min.css');

    ok('both stylesheets ship', $cssFull !== '' && $cssMin !== '');
    ok('the minified one really is smaller', strlen($cssMin) < strlen($cssFull));
    // Structure, against the COMMENT-STRIPPED source — counting the raw source is
    // wrong, because comments contain braces and semicolons of their own (the
    // first version of this check failed for exactly that reason). The stripper is
    // required from the build script so there is one copy of it, not two.
    require_once dirname(DCCS_DIR) . '/tools/build-css.php';
    $stripped = dccs_strip_comments($cssFull);
    $norm = static fn(string $t): string => trim((string) preg_replace('/\s+/', ' ', $t));
    ok('the shipped file is the source with its comments removed, and nothing else',
        $norm($stripped) === $norm($cssMin));
    ok('same number of rule blocks', substr_count($stripped, '{') === substr_count($cssMin, '{'));
    ok('same number of declarations', substr_count($stripped, ';') === substr_count($cssMin, ';'));
    ok('braces still balanced in the shipped file',
        substr_count($cssMin, '{') === substr_count($cssMin, '}'));
    // Tokens: every custom property defined and consumed must survive.
    $tok = static function (string $css, string $re): array {
        preg_match_all($re, $css, $m);
        $v = array_values(array_unique($m[1]));
        sort($v);
        return $v;
    };
    $defFull = $tok($cssFull, '/(--dccs-[\w-]+)\s*:/');
    $defMin  = $tok($cssMin,  '/(--dccs-[\w-]+)\s*:/');
    $useFull = $tok($cssFull, '/var\(\s*(--dccs-[\w-]+)/');
    $useMin  = $tok($cssMin,  '/var\(\s*(--dccs-[\w-]+)/');
    ok('the sheet defines custom properties at all, so the comparison means something',
        count($defFull) > 10);
    ok('every custom property DEFINED survives minification', $defFull === $defMin);
    ok('every custom property CONSUMED survives minification', $useFull === $useMin);
    // A token the sheet never defines comes from Elementor's per-widget CSS, so it
    // MUST be consumed with a fallback or it computes to nothing.
    preg_match_all('/var\(\s*(--dccs-[\w-]+)\s*([,)])/', $cssMin, $vm, PREG_SET_ORDER);
    $bare = [];
    foreach ($vm as $m) {
        if ($m[2] === ')' && !in_array($m[1], $defMin, true)) { $bare[] = $m[1]; }
    }
    ok('no externally-supplied token is consumed without a fallback',
        $bare === [], implode(', ', array_unique($bare)));
    // And the comments really are gone — that is the whole point of the build.
    ok('the shipped stylesheet carries no comments', strpos($cssMin, '/*') === false);
    ok('while the source still does', strpos($cssFull, '/*') !== false);

    // ---- 0.48.0: INHERITANCE, per key, both directions ---------------------------
    // STANDING RULE (the same defect turned up in three other DCC plugins the same
    // week): for every key the settings page holds, prove (a) a CHANGED site default
    // reaches an untouched widget and (b) a deliberately set widget value still
    // wins. The 2026-09-26 audit's three KNOWN GAP assertions are the red half of
    // this block; they are now asserted the other way round.
    if (!function_exists('admin_url')) { function admin_url($p = '') { return 'https://example.test/wp-admin/' . $p; } }

    // Site defaults DIFFERENT from every control default, so inheriting is visible.
    $site = [
        'results_count' => 5, 'badges_max' => 2, 'reasons_max' => 2,
        'start_mode' => 'compare', 'enabled_modes' => ['quick', 'compare'],
        'show_heading' => false, 'show_review' => true, 'show_compare_tip' => true,
        'capacity_fee_url' => 'https://site.test/cap', 'pet_fee_url' => 'https://site.test/pet',
        'avail_enable' => true, 'avail_max_nights' => 30, 'avail_action' => 'mphbac_query',
        'avail_calendar_url' => 'https://site.test/cal',
    ];
    $GLOBALS['__opts'][$sKey] = $site;
    $eff = static fn(array $widget): array => Selector_Widget::config_from_snapshot(Selector_Widget::design_snapshot($widget));

    // POSITIVE CONTROL for the whole block: an untouched widget's snapshot carries
    // NONE of the inheritable keys. If it carried any, every "reaches an untouched
    // widget" assertion below would be measuring a coincidence.
    $snapUntouched = Selector_Widget::design_snapshot([]);
    $inheritable = ['startMode', 'enabledModes', 'showHeading', 'showReview', 'showCompareTip',
                    'capacityFeeUrl', 'petFeeUrl', 'availability', 'resultsCount', 'badgesMax', 'reasonsMax'];
    ok('an untouched widget snapshot emits NONE of the eleven inheritable keys',
        array_intersect(array_keys($snapUntouched), $inheritable) === []);
    ok('(and it still emits the keys that are legitimately always present)',
        isset($snapUntouched['string_overrides'], $snapUntouched['icons'], $snapUntouched['cssVars']));

    $u = $eff([]);   // the untouched widget, effective config
    // (a) a changed site default reaches an untouched widget — was MASKED before 0.48.0
    ok('INHERITS start_mode',        $u['startMode'] === 'compare');
    ok('INHERITS enabled_modes',     $u['enabledModes'] === ['quick', 'compare']);
    ok('INHERITS show_heading',      $u['showHeading'] === false);
    ok('INHERITS show_review',       $u['showReview'] === true);
    ok('INHERITS show_compare_tip',  $u['showCompareTip'] === true);
    ok('INHERITS capacity_fee_url',  $u['capacityFeeUrl'] === 'https://site.test/cap');
    ok('INHERITS pet_fee_url',       $u['petFeeUrl'] === 'https://site.test/pet');
    ok('INHERITS avail_enable',      $u['availability']['enabled'] === true);
    ok('INHERITS avail_calendar_url',$u['availability']['calendarUrl'] === 'https://site.test/cal');
    ok('INHERITS avail_max_nights (was hard-coded 95 in the snapshot)', $u['availability']['maxNights'] === 30);
    ok('INHERITS results_count',     $u['resultsCount'] === 5);
    ok('INHERITS badges_max',        $u['badgesMax'] === 2);
    ok('INHERITS reasons_max',       $u['reasonsMax'] === 2);
    // The catch found while building this: a widget that inherits "enabled" must
    // still be handed an endpoint, or the lookup silently has nowhere to go.
    ok('an inherited availability lookup still gets the ajax endpoint',
        strpos((string) $u['availability']['ajaxUrl'], 'admin-ajax.php') !== false);

    // (b) a deliberately set widget value still wins over the same site defaults
    $w = $eff([
        'start_mode' => 'quick', 'enabled_modes' => ['quick', 'weights'],
        'show_heading' => 'yes', 'show_review' => 'no', 'show_compare_tip' => 'no',
        'capacity_fee_url' => ['url' => 'https://widget.test/cap'], 'pet_fee_url' => ['url' => 'https://widget.test/pet'],
        'avail_enable' => 'no', 'avail_calendar_url' => ['url' => 'https://widget.test/cal'],
        'results_count' => '4', 'badges_max' => '1', 'reasons_max' => '1',
    ]);
    ok('WINS start_mode',        $w['startMode'] === 'quick');
    ok('WINS enabled_modes',     $w['enabledModes'] === ['quick', 'weights']);
    ok('WINS show_heading',      $w['showHeading'] === true);
    ok('WINS show_review',       $w['showReview'] === false);
    ok('WINS show_compare_tip',  $w['showCompareTip'] === false);
    ok('WINS capacity_fee_url',  $w['capacityFeeUrl'] === 'https://widget.test/cap');
    ok('WINS pet_fee_url',       $w['petFeeUrl'] === 'https://widget.test/pet');
    ok('WINS avail_enable',      $w['availability']['enabled'] === false);
    ok('WINS avail_calendar_url',$w['availability']['calendarUrl'] === 'https://widget.test/cal');
    ok('WINS results_count',     $w['resultsCount'] === 4);
    ok('WINS badges_max',        $w['badgesMax'] === 1);
    ok('WINS reasons_max',       $w['reasonsMax'] === 1);
    ok('while the never-per-widget sub-keys still come from the site',
        $w['availability']['maxNights'] === 30 && $w['availability']['action'] === 'mphbac_query');

    // Availability inherits SUB-KEY BY SUB-KEY, not as a block.
    $half = $eff(['avail_enable' => 'no']);
    ok('setting only avail_enable leaves the calendar URL inherited',
        $half['availability']['enabled'] === false && $half['availability']['calendarUrl'] === 'https://site.test/cal');
    $half2 = $eff(['avail_calendar_url' => ['url' => 'https://widget.test/cal']]);
    ok('setting only the calendar URL leaves "enabled" inherited',
        $half2['availability']['enabled'] === true && $half2['availability']['calendarUrl'] === 'https://widget.test/cal');

    // A widget may set an opening mode the INHERITED mode set does not contain.
    $odd = $eff(['start_mode' => 'weights']);   // site enabled_modes = quick+compare
    ok('an opening mode outside the inherited mode set resolves to the first enabled mode',
        $odd['startMode'] === 'quick' && $odd['enabledModes'] === ['quick', 'compare']);

    // LEGACY: '' is what the pre-0.48.0 SWITCHER stored for OFF. It must keep
    // meaning OFF — a deliberate choice — not become "inherit". This is the named
    // risk (a heading someone turned off, on a site whose default is on), handled
    // at read time with no rewrite of stored widget data.
    $GLOBALS['__opts'][$sKey] = ['show_heading' => true, 'show_review' => true, 'show_compare_tip' => true, 'avail_enable' => true];
    $legacy = $eff(['show_heading' => '', 'show_review' => '', 'show_compare_tip' => '', 'avail_enable' => '']);
    ok('legacy \'\' on show_heading still means OFF, even with the site default on', $legacy['showHeading'] === false);
    ok('legacy \'\' on show_review still means OFF',       $legacy['showReview'] === false);
    ok('legacy \'\' on show_compare_tip still means OFF',  $legacy['showCompareTip'] === false);
    ok('legacy \'\' on avail_enable still means OFF',      $legacy['availability']['enabled'] === false);
    ok('and the explicit inherit value does inherit, so the two are distinct',
        $eff(['show_heading' => 'inherit'])['showHeading'] === true);

    unset($GLOBALS['__opts'][$sKey]);

    // 0.49.0 (Opus audit): every value design_snapshot() treats as a DELIBERATE
    // choice must be offerable by the control, or the panel cannot display what is
    // stored. A native select shows a value that matches no option as BLANK.
    $triOpts = array_keys((function () { return self::tri_options(); })->bindTo(null, Selector_Widget::class)());
    ok('the tri-select offers the site-default value', in_array('inherit', $triOpts, true));
    ok('the tri-select offers the legacy OFF value \'\' — so a pre-0.48.0 widget displays as Off, not blank',
        in_array('', $triOpts, true));
    ok('and it still offers On', in_array('yes', $triOpts, true));
    ok('\'no\' saved during 0.48.0 is still READ as off',
        $eff(['show_heading' => 'no'])['showHeading'] === false);

    // ---- 0.50.0: the Mini Entry pop-up always opens on Quick Pick --------------
    // Owner's decision (2026-09-27): the ONE intended exception to "no hard-coded
    // override of a site default". Tested through the REAL shortcode path, not a
    // literal restated here.
    foreach (['wp_style_is' => true, 'wp_script_is' => true] as $fn => $ret) {
        if (!function_exists($fn)) { eval("function $fn(...\$a) { return " . var_export($ret, true) . "; }"); }
    }
    if (!function_exists('shortcode_atts')) {
        function shortcode_atts($pairs, $atts) { $atts = (array) $atts; $out = [];
            foreach ($pairs as $k => $v) { $out[$k] = array_key_exists($k, $atts) ? $atts[$k] : $v; } return $out; }
    }
    foreach (['wp_enqueue_style', 'wp_enqueue_script', 'wp_register_style', 'wp_register_script'] as $fn) {
        if (!function_exists($fn)) { eval("function $fn(...\$a) { return null; }"); }
    }
    $sKey = \DCCS\Settings::OPTION;
    $GLOBALS['__opts'][$sKey] = ['start_mode' => 'compare', 'enabled_modes' => ['quick', 'compare'], 'show_review' => true];
    $html = (string) \DCCS\Mini_Entry_Widget::shortcode(['current' => '22', 'url' => '']);
    $cfgJson = null;
    // The harness's esc_attr() stub does not escape quotes, so slice between the
    // attribute's fixed delimiters rather than regex-matching a quoted value.
    $p0 = strpos($html, 'data-entry="'); $p1 = strpos($html, '"><p class="dccs-entry-intro"');
    if ($p0 !== false && $p1 !== false) {
        $raw = substr($html, $p0 + 12, $p1 - $p0 - 12);
        $entryData = json_decode(html_entity_decode($raw, ENT_QUOTES), true);
        $cfgJson = $entryData['modalConfig'] ?? null;
    }
    ok('the real shortcode renders a pop-up config the test can read', is_array($cfgJson));
    ok('EXCEPTION PINNED: the pop-up opens on Quick Pick even with the site set to Compare',
        ($cfgJson['startMode'] ?? null) === 'quick');
    ok('...and it is ONLY the opening mode: the same pop-up still inherits the site review step',
        ($cfgJson['showReview'] ?? null) === true);

    // ---- 0.50.0: a MIRRORED pop-up follows the settings page once its source
    // Selector has published under 0.48.0+ rules. render() republishes from merged
    // settings on any non-editor view, so this is the path live takes after a cache
    // purge. Site defaults differ from control defaults so inheriting is visible.
    $GLOBALS['__opts'][Selector_Widget::DESIGN_OPTION] = [];
    Selector_Widget::publish_design('Primary', 1005, 'abc123', ['share_design' => 'yes', 'design_name' => 'Primary']);
    $reg = $GLOBALS['__opts'][Selector_Widget::DESIGN_OPTION]['Primary']['overrides'] ?? null;
    ok('the source published into the registry', is_array($reg));
    ok('a snapshot published under 0.48.0+ rules omits the inheritable keys',
        is_array($reg) && !array_key_exists('showReview', $reg) && !array_key_exists('startMode', $reg));
    $mirrored = Selector_Widget::config_from_snapshot((array) $reg, ['highlight' => '22', 'startMode' => 'quick']);
    ok('a CHANGED site default reaches the mirrored pop-up', $mirrored['showReview'] === true);
    // RED CONTROL: the stale shape a <=0.47.0 publish left behind still masks it —
    // proves the assertion above can tell the two apart.
    $stale = ['string_overrides' => [], 'startMode' => 'quick', 'enabledModes' => ['quick', 'compare'],
              'showHeading' => true, 'showReview' => false, 'showCompareTip' => false,
              'capacityFeeUrl' => '', 'petFeeUrl' => '', 'icons' => [], 'iconSides' => [], 'cssVars' => []];
    ok('(control) a <=0.47.0 registry snapshot still masks it, so the check can see the difference',
        Selector_Widget::config_from_snapshot($stale, ['startMode' => 'quick'])['showReview'] === false);
    unset($GLOBALS['__opts'][$sKey]);

    // ---- 0.51.0: Rob's copy, baked in as plugin defaults --------------------------
    $str51 = \DCCS\Config::strings();
    $pre51 = \DCCS\Preset_Defaults::map();
    ok('results heading default is Title Case', $str51['results_heading'] === 'Your Top Matches');
    ok('review heading default is Title Case',  $str51['review_heading'] === 'Review Your Answers');
    // The preset seeds NEW widgets; it must agree with Config or a new widget
    // would store the old wording.
    ok('the preset seeds new widgets with the Title Case results heading',
        ($pre51['str_results_heading'] ?? null) === 'Your Top Matches');
    ok('the preset seeds new widgets with the Title Case review heading',
        ($pre51['str_review_heading'] ?? null) === 'Review Your Answers');
    ok('pet note is the owner\'s new wording',
        $str51['pet_note'] === 'Pets are only allowed in Cottage 34 and must be pre-approved.');
    ok('and the new-tab notice exists as a translatable string', ($str51['opens_new_tab'] ?? '') !== '');

    // ---- Never override an Elementor `final` method ----------------------------
    // Controls_Stack marks add_group_control()/add_responsive_control() (and others)
    // final; declaring them in a subclass is a fatal error at class-declaration time,
    // which takes down every front-end page that autoloads the widget. v0.19.0 shipped
    // exactly that. This list is from Elementor's controls-stack / widget-base /
    // element-base sources.
    $elementorFinal = [
        'add_group_control', 'add_responsive_control', 'remove_responsive_control',
        'update_responsive_control', 'start_injection', 'end_injection', 'get_injection_point',
        'start_popover', 'end_popover', 'get_class_name', 'get_config', 'get_control_index',
        'get_control_key', 'get_section_controls', 'get_style_controls', 'get_tabs_controls',
        'get_frontend_settings_keys', 'get_position_info', 'print_text_editor',
        'print_unescaped_setting', 'enqueue_scripts', 'enqueue_styles',
    ];
    foreach (['DCCS\Selector_Widget', 'DCCS\Mini_Entry_Widget'] as $cls) {
        $declared = [];
        foreach ((new \ReflectionClass($cls))->getMethods() as $meth) {
            if ($meth->getDeclaringClass()->getName() === $cls) { $declared[] = $meth->getName(); }
        }
        $clash = array_values(array_intersect($declared, $elementorFinal));
        ok(basename(str_replace('\\', '/', $cls)) . ' overrides no Elementor final method'
            . ($clash ? ' [' . implode(', ', $clash) . ']' : ''), $clash === []);
    }

    // ---- after_save must never re-enter Document::get_elements_data() -----------
    // Elementor's get_elements_data(), in edit mode on a document with no elements,
    // calls convert_to_elementor(), whose first statement is save([]) — and save()
    // ends by firing 'elementor/document/after_save'. A handler that answers by
    // calling get_elements_data() therefore recurses forever: save([]) carries no
    // 'elements' key, so save_elements() never runs, _elementor_data stays empty, and
    // the `empty( $elements )` guard never flips. That was the "critical error" on any
    // page opened in the editor with nothing on it (v0.11.0–v0.19.4).
    //
    // The trap document throws if the elements are read from it, so the recursion can
    // only come back as a failure here rather than as a white screen on the site.
    require_once DCCS_DIR . 'includes/class-plugin.php';
    $trapDoc = new class {
        public function get_main_id() { return 123; }
        public function get_elements_data() {
            throw new \RuntimeException('after_save handler re-entered get_elements_data()');
        }
    };
    $plugin = \DCCS\Plugin::instance();
    $selectorEl = [[
        'elType' => 'widget', 'widgetType' => 'dccs_selector', 'id' => 'deadbee',
        'settings' => ['share_design' => 'yes', 'design_name' => 'FromPayload', 'str_heading' => 'Payload'],
    ]];

    $threw = '';
    try {
        // The exact re-entrant call: convert_to_elementor()'s save([]).
        $plugin->republish_designs($trapDoc, []);
        // A settings-only save — also no 'elements' key.
        $plugin->republish_designs($trapDoc, ['settings' => ['post_status' => 'publish']]);
        // A real editor save carrying the tree.
        $plugin->republish_designs($trapDoc, ['elements' => $selectorEl]);
    } catch (\Throwable $e) {
        $threw = $e->getMessage();
    }
    ok('after_save never reads elements off the document' . ($threw ? " [$threw]" : ''), $threw === '');

    $reg4 = get_option(Selector_Widget::DESIGN_OPTION, []);
    ok('after_save publishes from the payload Elementor passes', isset($reg4['FromPayload']));
    ok('the published entry is scoped to the saved document', ($reg4['FromPayload']['post_id'] ?? null) === 123);

    // An autosave is a draft; mirroring must follow the saved design, not the draft.
    $plugin->republish_designs($trapDoc, [
        'elements' => [[
            'elType' => 'widget', 'widgetType' => 'dccs_selector', 'id' => 'deadbee',
            'settings' => ['share_design' => 'yes', 'design_name' => 'FromAutosave'],
        ]],
        'settings' => ['post_status' => 'autosave'],
    ]);
    ok('autosaves do not publish a design', !isset(get_option(Selector_Widget::DESIGN_OPTION, [])['FromAutosave']));

    // ---- Registry pruning on save --------------------------------------------
    // A save's payload is the full truth for its document: any registry entry this
    // document owns but no longer publishes (widget deleted, share turned off, or
    // design renamed) must be dropped, or the dead name haunts every Mini Entry's
    // "Mirror design from" dropdown forever. Entries owned by OTHER pages are
    // untouchable. Note the earlier direct publish_design('Main', 123, …) was
    // already pruned by the payload save above, which published only 'FromPayload'.
    ok('a save prunes this page\'s designs the payload no longer publishes',
        !isset(get_option(Selector_Widget::DESIGN_OPTION, [])['Main']));

    Selector_Widget::publish_design('OtherPage', 999, 'el999', $settings);
    $plugin->republish_designs($trapDoc, ['elements' => $selectorEl]);
    $regP = get_option(Selector_Widget::DESIGN_OPTION, []);
    ok('pruning never touches designs owned by other pages', isset($regP['OtherPage']));
    ok('the payload\'s own design is kept through a prune', isset($regP['FromPayload']));

    // Renaming: the new name replaces the old one instead of accumulating.
    $renamedEl = $selectorEl;
    $renamedEl[0]['settings']['design_name'] = 'RenamedDesign';
    $plugin->republish_designs($trapDoc, ['elements' => $renamedEl]);
    $regR = get_option(Selector_Widget::DESIGN_OPTION, []);
    ok('a renamed design publishes under the new name', isset($regR['RenamedDesign']));
    ok('…and its old name is pruned', !isset($regR['FromPayload']));

    // Turning "Share this design" off: the save publishes nothing, so the page's
    // entry disappears (other pages' entries still survive).
    $offEl = $selectorEl;
    $offEl[0]['settings']['share_design'] = '';
    $plugin->republish_designs($trapDoc, ['elements' => $offEl]);
    $regO = get_option(Selector_Widget::DESIGN_OPTION, []);
    ok('share turned off prunes the page\'s design', !isset($regO['RenamedDesign']));
    ok('share turned off leaves other pages\' designs alone', isset($regO['OtherPage']));

    // Elementor is not the only thing that can fire the action; a one-argument or
    // non-array call must not be an ArgumentCountError/TypeError fatal.
    $survived = true;
    try {
        $plugin->republish_designs($trapDoc);
        $plugin->republish_designs($trapDoc, null);
        $plugin->republish_designs(null, ['elements' => $selectorEl]);
    } catch (\Throwable $e) {
        $survived = false;
    }
    ok('a malformed after_save payload is ignored, not fatal', $survived);

    // ---- Site button spec (0.27.0) ---------------------------------------------
    // The per-button Style sections emit {{WRAPPER}} .dccs-root.dccs-root .<class>
    // = (0,4,0) and beat the stylesheet's spec rule (0,3,0). Anything preset there
    // silently overrides the spec for that button, which is exactly what happened
    // to the Compare button, so these must stay out of the preset.
    foreach (['style_comparebtn_bg', 'style_comparebtn_bg_hover',
              'style_comparebtn_color', 'style_comparebtn_color_hover'] as $k) {
        ok("preset does not pin '$k' off the button spec",
            !array_key_exists($k, \DCCS\Preset_Defaults::map()));
    }
    ok('the Compare button label is Title Case in the string itself',
        (\DCCS\Config::strings()['compare_btn'] ?? null) === 'Compare %d Cottages');
    // 0.31.0 removed the Share button. Its strings went with it, so the casing
    // assertion is retired — replaced by one that keeps them gone, since a
    // translatable string with nothing rendering it is dead weight in Loco.
    foreach (['share_btn', 'share_done', 'share_fail'] as $k) {
        ok("the removed share string '$k' is gone from Config",
            !array_key_exists($k, \DCCS\Config::strings()));
    }

    // ---- Heading marks are PARKED (0.29.0) -------------------------------------
    // The drawn marks were retired after four rounds: a 38px pictogram cannot carry
    // "cottage" + "wizard" + "canal" at once. The class stays in the repo for its
    // size notes, but nothing may render it — the heading is plain type again.
    $marksCfg = \DCCS\Config::build([], []);
    $mk = $marksCfg['icons'] ?? [];
    ok('the config carries no heading marks',
        !array_key_exists('heading_cottage', $mk) && !array_key_exists('heading_wizard', $mk));
    // Tokenise rather than grep: the comment in Config::build() that records what
    // 0.26.0 did and how to bring the marks back is a reference we WANT to keep,
    // and a plain string search cannot tell it from a live call.
    ok('no CODE in the plugin references Heading_Marks any more', (function () {
        foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(DCCS_DIR)) as $f) {
            if (!$f->isFile() || substr($f->getFilename(), -4) !== '.php') { continue; }
            if ($f->getFilename() === 'class-heading-marks.php') { continue; }
            foreach (token_get_all((string) file_get_contents($f->getPathname())) as $t) {
                if (is_array($t) && $t[0] === T_STRING && $t[1] === 'Heading_Marks') { return false; }
            }
        }
        return true;
    })());
    // Parked, not deleted: the drawing notes are the durable part of that work.
    $marksSrc = (string) file_get_contents(DCCS_DIR . 'includes/class-heading-marks.php');
    ok('the marks source is still in the repo', $marksSrc !== '');
    ok('it says plainly that it is parked and why',
        strpos($marksSrc, 'PARKED') !== false && strpos($marksSrc, '0.29.0') !== false);
    ok('the 22px drawing notes are kept',
        strpos($marksSrc, 'THE BRIM CARRIES THE HAT') !== false &&
        strpos($marksSrc, 'THERE IS NO BEARD') !== false);
    // The icons channel itself still works — it carries the admin-set Elementor icons.
    $withAdmin = \DCCS\Config::build([], ['icons' => ['next' => '<i class="fas"></i>']]);
    ok('admin-set icons still come through the icons channel',
        ($withAdmin['icons']['next'] ?? null) === '<i class="fas"></i>');

    // ---- The dates step is off unless a widget switches it on (0.26.0) ---------
    // avail_enable is the control that governs the check-in/check-out question. It
    // is a switcher defaulting to off, and it is deliberately NOT in the preset, so
    // a widget that has never stored it gets no dates step at all.
    ok('availability is off in a config built with no settings',
        (\DCCS\Config::build([], [])['availability']['enabled'] ?? null) === false);
    ok('a widget that never saved avail_enable inherits, and the site default is off',
        !array_key_exists('availability', Selector_Widget::design_snapshot([]))
        && Selector_Widget::config_from_snapshot(Selector_Widget::design_snapshot([]))['availability']['enabled'] === false);
    ok('avail_enable is absent from the preset, so the default stands',
        !array_key_exists('avail_enable', \DCCS\Preset_Defaults::map()));
    ok('a widget that saved avail_enable=yes still turns it on',
        (Selector_Widget::design_snapshot(['avail_enable' => 'yes'])['availability']['enabled'] ?? null) === true);
    ok('the dates question copy is past tense',
        (\DCCS\Config::strings()['q_dates'] ?? null) === 'When were you thinking of staying?');

    // ---- Site preset defaults (Preset_Defaults) --------------------------------
    require_once DCCS_DIR . 'includes/class-preset-defaults.php';
    require_once DCCS_DIR . 'includes/class-control-design-io.php';
    require_once DCCS_DIR . 'includes/class-mini-entry-widget.php';
    // The preset is ON (0.19.6). It must actually reach the controls, and — because it
    // OVERRIDES inline defaults by design — it must override them rather than defer.
    ok('preset is enabled by default', \DCCS\Preset_Defaults::enabled() === true);
    ok('apply() overrides an inline factory default',
        \DCCS\Preset_Defaults::apply('str_heading', ['default' => 'Factory'])['default'] === 'Cottage Wizard');
    ok('apply() seeds a control that had no default',
        \DCCS\Preset_Defaults::apply('color_accent', [])['default'] === '#002E7A');
    ok('apply() leaves the rest of the control args intact',
        \DCCS\Preset_Defaults::apply('color_accent', ['label' => 'L', 'type' => 'color'])['label'] === 'L');
    ok('apply() ignores a control the preset says nothing about',
        \DCCS\Preset_Defaults::apply('not_in_preset', ['default' => 'keep']) === ['default' => 'keep']);
    ok('group_fields() feeds typography groups',
        (\DCCS\Preset_Defaults::group_fields('chip_typography')['typography']['default'] ?? null) === 'custom');
    ok('group_fields() is empty for an unknown group', \DCCS\Preset_Defaults::group_fields('nope') === []);

    $preset = \DCCS\Preset_Defaults::map();
    ok('preset defines a non-trivial set of defaults', count($preset) > 50);
    ok('preset carries the site heading + palette',
        ($preset['str_heading'] ?? null) === 'Cottage Wizard' &&
        ($preset['color_accent'] ?? null) === '#002E7A');
    ok('preset carries the enabled modes', ($preset['enabled_modes'] ?? null) === ['quick', 'compare']);

    // Instance-specific wiring must never be preset: design_name/share_design would make
    // every new Selector republish itself as the shared source and clobber the registry.
    foreach (['share_design', 'design_name', 'mirror_source', 'current', 'selector_url'] as $k) {
        ok("preset excludes instance-specific '$k'", !array_key_exists($k, $preset));
    }

    // Every preset key must correspond to a control that is actually registered,
    // otherwise a typo/renamed control would silently do nothing.
    $reg = [];
    foreach (['DCCS\Selector_Widget', 'DCCS\Mini_Entry_Widget'] as $cls) {
        $r = new \ReflectionClass($cls);
        $w = $r->newInstanceWithoutConstructor();
        $m = $r->getMethod('register_controls');
        $m->setAccessible(true);
        $m->invoke($w);
        $reg += $w->__ctrls + $w->__gfields;
    }
    $orphans = array_values(array_diff(array_keys($preset), array_keys($reg)));
    ok('every preset key maps to a registered control' . ($orphans ? ' [' . implode(', ', $orphans) . ']' : ''),
        $orphans === []);

    // ---- 0.53.1: Rob's A–D -----------------------------------------------------
    $s531 = \DCCS\Config::strings();
    $LIVE = json_decode(file_get_contents(__DIR__ . '/fixtures/live-state-0.53.0.json'), true);
    ok('0.53.1: the live export fixture loads (positive control)', is_array($LIVE) && count($LIVE['widgets']) === 10);

    // B1/B2: the intro line.
    ok('0.53.1: intro is exactly Rob\'s sentence',
        $s531['intro'] === 'Answer a few questions to find your best match, or select cottages to compare side by side.');
    ok('0.53.1: the preset no longer pins the old intro or its navy colour',
        !array_key_exists('str_intro', $preset) && !array_key_exists('intro_color', $preset));
    ok('0.53.1: str_intro\'s control defaults to the new line', ($reg['str_intro']['default'] ?? null) === $s531['intro']);

    // B6: icons are inline SVG for the three packaged values, Elementor for the rest.
    foreach (['fas fa-clipboard-check' => '0 0 384 512', 'fas fa-balance-scale' => '0 0 640 512', 'fas fa-hat-wizard' => '0 0 512 512'] as $v => $vb) {
        $svg = \DCCS\Icons::svg($v);
        ok("0.53.1: $v renders as decorative inline SVG", strpos($svg, '<svg') === 0 && strpos($svg, 'viewBox="' . $vb . '"') !== false
            && strpos($svg, 'aria-hidden="true"') !== false && strpos($svg, 'fill="currentColor"') !== false && strpos($svg, '<i') === false);
    }
    ok('0.53.1: any other icon value is left to Elementor', \DCCS\Icons::svg('fas fa-list-ol') === '' && \DCCS\Icons::svg('') === '');
    ok('0.53.1: the icon file carries the Font Awesome CC BY 4.0 licence note',
        strpos(file_get_contents(DCCS_DIR . 'includes/class-icons.php'), 'CC BY 4.0') !== false);
    ok('0.53.1: preset Matching Quiz icon is clipboard-check', ($preset['icon_mode_quick']['value'] ?? '') === 'fas fa-clipboard-check');
    ok('0.53.1: preset Compare Mode icon is balance-scale', ($preset['icon_mode_compare']['value'] ?? '') === 'fas fa-balance-scale');
    $snapI = Selector_Widget::design_snapshot(['icon_mode_quick' => $preset['icon_mode_quick'], 'icon_mode_compare' => $preset['icon_mode_compare'],
        'icon_submit' => ['value' => 'fas fa-check', 'library' => 'fa-solid']]);
    ok('0.53.1: the landing icons reach the config as SVG, needing no icon font',
        strpos((string) ($snapI['icons']['mode_quick'] ?? ''), 'viewBox="0 0 384 512"') !== false
        && strpos((string) ($snapI['icons']['mode_compare'] ?? ''), 'viewBox="0 0 640 512"') !== false);

    // B2/B3/B6: the Mini Entry markup — line, button, ONE icon, no emoji.
    $entryHtml = \DCCS\Mini_Entry_Widget::shortcode(['current' => '34']);
    // This file's esc_attr() stub does not escape quotes, so the data-entry JSON is
    // sliced out (as the shortcode test above does) and the markup after it parsed.
    $tailAt = strpos($entryHtml, '"><p class="dccs-entry-intro"');
    $entryMarkup = '<div class="dccs-entry">' . ($tailAt === false ? '' : substr($entryHtml, $tailAt + 2));
    $ed = new DOMDocument(); libxml_use_internal_errors(true); $ed->loadHTML('<?xml encoding="utf-8"?>' . $entryMarkup); libxml_clear_errors();
    $ex = new DOMXPath($ed);
    $line = $ex->query('//div[@class="dccs-entry"]/p[@class="dccs-entry-intro"]');
    $btn  = $ex->query('//div[@class="dccs-entry"]/button[@class="dccs-entry-btn"]');
    ok('0.53.1: Mini Entry has the intro line directly above its button',
        $line->length === 1 && $btn->length === 1 && $line->item(0)->nextSibling === $btn->item(0));
    ok('0.53.1: ...reading the intro string', $line->length === 1 && trim($line->item(0)->textContent) === $s531['intro']);
    ok('0.53.1: the button holds exactly one icon, a hat-wizard SVG, hidden from screen readers',
        $btn->length === 1 && $ex->query('.//svg', $btn->item(0))->length === 1
        && stripos($ed->saveHTML($btn->item(0)), 'viewBox="0 0 512 512"') !== false   // libxml lowercases viewBox
        && $ex->query('.//*[@aria-hidden="true"]//svg | .//svg[@aria-hidden="true"]', $btn->item(0))->length >= 1);
    ok('0.53.1: its label is "Cottage Wizard", with no emoji anywhere',
        trim($btn->item(0)->textContent) === 'Cottage Wizard' && !preg_match('/[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]/u', $entryHtml));

    // D: "P" — a source whose post is gone — is never read; "Primary" is.
    $GLOBALS['__posts'] = [1005, 620];
    $GLOBALS['__opts'][Selector_Widget::DESIGN_OPTION] = $LIVE['options']['dccs_design_sources'];
    $GLOBALS['__writes'] = [];
    $src = Selector_Widget::design_sources();
    ok('0.53.1: the stale source "P" (post 9389, deleted) is ignored', !isset($src['P']));
    ok('0.53.1: "Primary" (post 1005) is still offered', isset($src['Primary']) && (int) $src['Primary']['post_id'] === 1005);
    ok('0.53.1: ignoring is read-only — the option still holds "P", and nothing was written',
        isset($GLOBALS['__opts'][Selector_Widget::DESIGN_OPTION]['P']) && $GLOBALS['__writes'] === []);
    $mini = new class extends \DCCS\Mini_Entry_Widget {
        public $s = [];
        public function get_settings_for_display($k = null) { return $this->s; }
        public function out(): string { ob_start(); $this->render(); return (string) ob_get_clean(); }
    };
    $entryOf = function (string $html): array {
        $a = strpos($html, 'data-entry="'); $b = strpos($html, '"><p class="dccs-entry-intro"');
        return ($a === false || $b === false) ? [] : (json_decode(html_entity_decode(substr($html, $a + 12, $b - $a - 12), ENT_QUOTES), true) ?: []);
    };
    $mini->s = ['mirror_source' => 'P', 'copy' => '', 'current' => '34'];
    $eP = $entryOf($mini->out());
    ok('0.53.1: a Mini Entry still set to mirror "P" falls back to its own settings, not P\'s old strings',
        ($eP['modalConfig']['strings']['mode_compare'] ?? null) === 'Compare Mode' && !isset($eP['scope']));
    $mini->s = ['mirror_source' => 'Primary', 'copy' => '', 'current' => '34'];
    $eQ = $entryOf($html = $mini->out());
    ok('0.53.1: mirroring "Primary" still works (positive control)', ($eQ['scope']['el'] ?? '') === 'elementor-element-5be94a3');
    ok('0.53.1: the line above the button follows the mirrored source\'s intro',
        strpos($html, '<p class="dccs-entry-intro">' . htmlspecialchars($LIVE['options']['dccs_design_sources']['Primary']['overrides']['string_overrides']['intro']) . '</p>') !== false);
    $GLOBALS['__posts'] = [];

    // D: packaged defaults = live values, for every control live stores.
    $instanceKeys = ['share_design', 'design_name', 'mirror_source', 'current', 'selector_url', 'avail_enable'];
    $changedOn531 = ['str_intro' => true, 'copy' => true];   // B1 / B6 replace these on purpose
    $drift = [];
    foreach ($LIVE['widgets'] as $wd) {
        if ($wd['widget_type'] !== 'dccs_selector') { continue; }   // Mini Entries mirror: their own keys are not read
        foreach ($wd['stored_settings'] as $k => $v) {
            if ($k[0] === '_' || in_array($k, $instanceKeys, true) || isset($changedOn531[$k]) || !isset($reg[$k])) { continue; }
            if (is_array($v) && array_key_exists('size', $v) && $v['size'] === '') { continue; }   // empty responsive value = unset
            $def = $reg[$k]['default'] ?? ($reg[$k]['placeholder'] ?? null);
            if (json_encode($def) !== json_encode($v)) { $drift[] = "$k: live " . json_encode($v) . ' vs default ' . json_encode($def); }
        }
    }
    ok('0.53.1: every control live stores has that value as its packaged default' . ($drift ? ' [' . implode('; ', $drift) . ']' : ''), $drift === []);
    $d531 = \DCCS\Settings::defaults();
    foreach ($LIVE['options']['dccs_settings'] as $k => $v) {
        ok("0.53.1: Settings default '$k' equals the live row", ($d531[$k] ?? '(missing)') === $v);
    }
    // Packaged strings = live: every str_ value the preset hands a NEW widget is
    // also the packaged Config string, so the shortcode (no preset), a blind install
    // and a CLEARED field (which falls through to Config) all show live's words.
    $split = [];
    foreach ($preset as $k => $v) {
        if (strpos($k, 'str_') === 0 && ($s531[substr($k, 4)] ?? null) !== $v) { $split[] = substr($k, 4); }
    }
    ok('0.53.1: every preset string equals its packaged string' . ($split ? ' [' . implode(', ', $split) . ']' : ''), $split === []);
    ok('0.53.1: ...including the twelve that differed before (spot-check)',
        $s531['heading'] === 'Cottage Wizard' && $s531['view_cottage'] === 'View Cottage' && $s531['w_workspace'] === 'Deskspace');
    // Precedence unchanged: a stored value still beats every default.
    $own = Selector_Widget::config_from_snapshot(Selector_Widget::design_snapshot([
        'str_intro' => 'STORED INTRO', 'icon_mode_quick' => ['value' => 'fas fa-list-ol', 'library' => 'fa-solid']]));
    ok('0.53.1: a stored intro still beats the packaged one', $own['strings']['intro'] === 'STORED INTRO');
    ok('0.53.1: a stored icon still beats the packaged one (and goes to Elementor, not the SVG map)',
        strpos((string) ($own['icons']['mode_quick'] ?? 'x'), 'viewBox="0 0 384 512"') === false);
    // Nothing writes options on install / activation / upgrade.
    $code = '';
    // uninstall.php is excluded: it runs only when someone DELETES the plugin
    // (guarded by WP_UNINSTALL_PLUGIN, pinned below), never on install or upgrade.
    foreach (array_filter(glob(DCCS_DIR . '{*.php,includes/*.php}', GLOB_BRACE), fn($f) => basename($f) !== 'uninstall.php') as $f) {
        foreach (token_get_all(file_get_contents($f)) as $t) {
            if (is_array($t) && in_array($t[0], [T_COMMENT, T_DOC_COMMENT], true)) { continue; }
            $code .= is_array($t) ? $t[1] : $t;
        }
    }
    ok('0.53.1: no activation / deactivation / upgrade hook exists',
        !preg_match('/register_activation_hook|register_deactivation_hook|upgrader_process_complete|activated_plugin/', $code));
    preg_match_all('/\b(update_option|add_option|delete_option|update_post_meta|delete_post_meta)\s*\(/', $code, $w);
    ok('0.53.1: the only option writes are the three known runtime ones (publish, prune, settings save) [' . count($w[0]) . ']',
        count($w[0]) === 3 && !in_array('delete_option', $w[1], true) && !preg_grep('/post_meta/', $w[1]));
    ok('0.53.1: uninstall.php deletes only under WP_UNINSTALL_PLUGIN',
        (bool) preg_match('/^\s*<\?php.*?if\s*\(\s*!\s*defined\(\s*[\'"]WP_UNINSTALL_PLUGIN[\'"]\s*\)\s*\)\s*\{\s*exit;/s', (string) @file_get_contents(DCCS_DIR . 'uninstall.php')));

    // ---- 0.53.0: Rob's mode menu / Compare Mode / quiz changes -----------------
    // Baked in as PACKAGED defaults. The preset copies of the old wording were
    // removed (not edited): a preset copy would be the two-copies hazard, and a
    // preset colour on the mode button would pin new widgets to white/black.
    $s53 = \DCCS\Config::strings();
    $want53 = [
        'mode_compare'   => 'Compare Mode',
        'mode_quick'     => 'Matching Quiz',
        'q_pullout'      => 'What about a pull-out couch?',
        'q_layout'       => 'Which layout: studio or 1-bedroom?',
        'q_ground'       => 'Do you need ground floor only?',
        'opt_either'     => 'Skip',
        'compare_prompt' => 'Pick 2+ cottages to compare their features side by side.',
        'compare_title'  => 'Compare',
    ];
    foreach ($want53 as $k => $v) {
        ok("0.53.0: Config '$k' is exactly " . json_encode($v), ($s53[$k] ?? null) === $v);
    }
    ok('0.53.0: the mode button\'s accessible-name template takes the mode name',
        isset($s53['mode_current']) && substr_count($s53['mode_current'], '%s') === 1);
    foreach (['q_dining', 'opt_seats2', 'opt_seats4', 'compare_scroll_all'] as $gone) {
        ok("0.53.0: string '$gone' is gone", !array_key_exists($gone, $s53));
    }
    // Compare-table data is untouched: dining seats are still a compared field.
    ok('0.53.0: dining seats are still compared', in_array('diningSeats', \DCCS\Data::DIFF_FIELDS ?? \DCCS\Config::build()['diffFields'], true));
    foreach (['str_mode_compare', 'str_opt_either', 'str_q_layout', 'str_q_pullout', 'str_compare_prompt',
              'str_compare_scroll_all', 'str_q_dining', 'str_opt_seats2', 'str_opt_seats4', 'modetab_bg', 'modetab_color'] as $k) {
        ok("0.53.0: preset no longer carries '$k'", !array_key_exists($k, $preset));
    }
    foreach (['str_q_dining', 'str_opt_seats2', 'str_opt_seats4', 'str_compare_scroll_all', 'icon_q_dining'] as $k) {
        ok("0.53.0: control '$k' is no longer registered (its stored value is inert)", !isset($reg[$k]));
    }
    // The colour controls stay usable in the panel — they just no longer ship a value.
    foreach (['modetab_bg', 'modetab_color'] as $k) {
        ok("0.53.0: '$k' is still a registered control", isset($reg[$k]));
        ok("0.53.0: '$k' carries no default (selector.css supplies navy/white)", !array_key_exists('default', $reg[$k] ?? []));
    }
    // Questions/answers fell back to PLACEHOLDER-only once their preset default went.
    foreach (['str_q_layout', 'str_q_pullout', 'str_opt_either'] as $k) {
        ok("0.53.0: '$k' has no default (placeholder-only, Loco keeps working)", isset($reg[$k]) && !array_key_exists('default', $reg[$k]));
    }
    ok('0.53.0: the mode-name control defaults to the new name',
        ($reg['str_mode_compare']['default'] ?? null) === 'Compare Mode');

    // THE CLEAR-LIST, as the plugin sees it. A live widget that still stores the
    // 0.52.0 wording keeps showing it (stored beats packaged) — the reason the
    // Director gets a list of keys to clear. A cleared field is stored as '' and
    // falls through to the new packaged default.
    $old52 = [
        'str_mode_compare'   => 'Compare',
        'str_opt_either'     => 'No Preference',
        'str_q_pullout'      => 'Do you need a pull-out couch?',
        'str_q_layout'       => 'Which layout do you prefer: studio or 1-bedroom?',
        'str_compare_prompt' => 'Select 2+ cottages to compare side by side.',
    ];
    $stale = Selector_Widget::config_from_snapshot(Selector_Widget::design_snapshot($old52))['strings'];
    ok('0.53.0: a widget STILL storing the old wording shows it (positive control: clearing is necessary)',
        $stale['mode_compare'] === 'Compare' && $stale['opt_either'] === 'No Preference');
    $cleared = Selector_Widget::config_from_snapshot(Selector_Widget::design_snapshot(array_fill_keys(array_keys($old52), '')))['strings'];
    foreach ($old52 as $k => $_) {
        $key = substr($k, 4);
        ok("0.53.0: clearing '$k' in the panel shows the new default", $cleared[$key] === $s53[$key]);
    }

    // 0.40.0: the two load-bearing notes are PLACEHOLDER-only controls. Elementor
    // materialises a control DEFAULT into the settings it saves, so leaving one on
    // these would let the next Update in the editor re-create the per-widget
    // override that was just removed from all three live instances — refreezing
    // today's English text in the database and bypassing Loco with it. A
    // placeholder shows the packaged text in the panel without storing it, and an
    // empty field falls through because Config::build() only applies a NON-EMPTY
    // override. Assert on the registered args, not on the source text.
    foreach (['str_capacity_note', 'str_pet_note'] as $noteKey) {
        ok($noteKey . ' is registered at all', isset($reg[$noteKey]));
        ok($noteKey . ' carries NO default Elementor could store',
            !array_key_exists('default', $reg[$noteKey] ?? []));
        ok($noteKey . ' shows the packaged copy as a placeholder instead',
            ($reg[$noteKey]['placeholder'] ?? null)
                === (\DCCS\Config::strings()[substr($noteKey, 4)] ?? null));
    }
    // Positive control: a sibling in the SAME loop still carries a default, so the
    // assertions above are not passing because defaults vanished wholesale.
    // It must be a key the PRESET does not cover: Preset_Defaults::apply() adds a
    // default to every preset key after the loop runs, so a preset-backed control
    // would keep its default however the loop behaved and prove nothing. (The
    // first version of this control used str_results_heading and did exactly that
    // — a mutation making EVERY key a placeholder sailed through it.)
    ok('the control used for the positive check is genuinely not preset-backed',
        !array_key_exists('str_fee_link', $preset));
    ok('a non-preset sibling in the same loop still carries its default',
        array_key_exists('default', $reg['str_fee_link'] ?? []));
    ok('and that default is the packaged string',
        ($reg['str_fee_link']['default'] ?? null) === (\DCCS\Config::strings()['fee_link'] ?? null));

    // 0.26.0: the heading default is PLAIN, because the widget now draws the marks
    // either side of it (see Heading_Marks). The Mini Entry prompt deliberately
    // keeps its emoji — it is a button, it gets no marks, and it would otherwise be
    // left with nothing. The two are meant to differ now; this pins that on purpose
    // so nobody "fixes" the heading back to matching it.
    ok('the heading default carries no emoji, since the marks supply them',
        !preg_match('/[\x{1F300}-\x{1FAFF}]/u', (string) ($preset['str_heading'] ?? '')));
    // 0.53.1 (Rob, B6): the label lost both emojis; ONE inline hat-wizard icon
    // leads it instead, and the plain label is the translatable packaged default.
    ok('the Mini Entry label is no longer preset (it was the emoji version)', !array_key_exists('copy', $preset));
    // The guarantee Rob depends on: a preset is a control DEFAULT, and a widget's
    // OWN saved value must still win. Anything else would silently overwrite the
    // hand-tuned settings across this site.
    $savedWins = Selector_Widget::design_snapshot(['str_heading' => 'Rob\'s own heading']);
    ok('a saved heading beats the preset default',
        ($savedWins['string_overrides']['heading'] ?? null) === "Rob's own heading");
    ok('a widget with no saved heading contributes no override',
        !array_key_exists('heading', Selector_Widget::design_snapshot([])['string_overrides']));

    ok('map still holds the captured site wording', ($preset['str_q_desk'] ?? null) === 'Do you need a computer desk?');
    ok('map still holds the captured icons', is_array($preset['icon_submit'] ?? null));

    // Now that the preset is live, every value is handed to Elementor as a control
    // DEFAULT — so its SHAPE has to match what that control type expects. A colour
    // string parked on a SLIDER (or a slider array on a COLOR) is not a PHP error; it
    // surfaces as a broken or dead control in the editor panel, which is exactly the
    // kind of damage a preset captured by hand can do. Check each value against the
    // type of the control it targets.
    $shapeOk = function ($type, $v) {
        switch ($type) {
            case 'color':
            case 'text':
            case 'textarea':
            case 'wysiwyg':
            case 'select':
            case 'switcher':
                return is_string($v);
            case 'slider':
                return is_array($v) && array_key_exists('size', $v) && array_key_exists('unit', $v);
            case 'dimensions':
                return is_array($v) && isset($v['unit'])
                    && isset($v['top'], $v['right'], $v['bottom'], $v['left']);
            case 'icons':
                return is_array($v) && array_key_exists('value', $v) && array_key_exists('library', $v);
            case 'select2':
                return is_array($v) || is_string($v);
            default:
                return true;   // group fields and anything exotic: shape is the group's business
        }
    };
    $badShape = [];
    foreach ($preset as $key => $value) {
        $args = $reg[$key] ?? null;
        if (!is_array($args)) {
            continue;   // group-control field; covered by the orphan check above
        }
        $type = (string) ($args['type'] ?? 'text');
        if (!$shapeOk($type, $value)) {
            $badShape[] = "$key($type)";
        }
    }
    ok('every preset value matches its control type' . ($badShape ? ' [' . implode(', ', $badShape) . ']' : ''),
        $badShape === []);

    // A SELECT default that isn't one of its own options renders as a blank dropdown.
    $badOption = [];
    foreach ($preset as $key => $value) {
        $args = $reg[$key] ?? null;
        if (!is_array($args) || ($args['type'] ?? '') !== 'select' || !isset($args['options'])) {
            continue;
        }
        if (!array_key_exists((string) $value, (array) $args['options'])) {
            $badOption[] = $key;
        }
    }
    ok('every preset SELECT value is one of that control\'s options'
        . ($badOption ? ' [' . implode(', ', $badOption) . ']' : ''), $badOption === []);

    echo "\n$pass passed, $fail failed\n";
    exit($fail ? 1 : 0);
}
