<?php
/**
 * Cottage Selector 0.53.2 — READ-ONLY check of stored widget keys.
 *
 * Run:   wp eval-file "Cottage Selector - 0.53.2 check-stored-keys.php"
 *
 * Writes NOTHING. Reads _elementor_data for every published, non-revision post that
 * holds a dccs_selector or dccs_mini_entry widget, plus the dccs_design_sources
 * option, and for each instance compares the watched stored keys with the 0.53.2
 * PACKAGED DEFAULT:
 *
 *   MASKS (read)        stored, differs from the 0.53.2 default, and the widget READS
 *                       it — it hides a 0.53.2 (or 0.53.1) change until cleared.
 *   unread (safe)       stored and differs, but a mirroring Mini Entry never reads its
 *                       own text keys (its pop-up uses the source's), so clearing it
 *                       changes nothing a guest sees.
 *   legacy (safe)       keys whose control no longer exists.
 *
 * An EMPTY stored value is treated as cleared: it falls through to the default.
 * Run it before clearing and again after Update; every "MASKS" line should be gone.
 */

global $wpdb;

// 0.53.2 packaged defaults for every key a 0.53.1/0.53.2 change touches.
$DEFAULTS = [
    // 0.53.1
    'str_intro'           => 'Answer a few questions to find your best match, or select cottages to compare side by side.',
    'str_results_heading' => 'Your Top Matches',
    'str_review_heading'  => 'Review Your Answers',
    // 0.53.2 Part B (labels)
    'str_w_moreroom'      => 'More Room',
    'str_w_fewerstairs'   => 'No Stairway',
    'str_w_pet'           => 'Pet-Friendly',
    'str_w_studio'        => 'Studio Simplicity',
    'str_w_onebed'        => '1-Bedroom Separation',
    'str_w_dining'        => '4+ Dining Comfort',
    'str_w_pullout'       => 'Pull-Out Couch Flexibility',
    'str_w_screenedporch' => 'Private, Screened-In Porch',
    'str_w_party'         => 'Room for 3-4 Guests',
    'str_fee_link'        => 'Fee Details',
];
// Read by the Mini Entry ITSELF, whether or not it mirrors.
$MINI_OWN = [
    'copy'       => 'Cottage Wizard',
    'entry_line' => 'Use the Cottage Wizard below to compare cottages or find your best match.',
];
$LEGACY = ['remember', 'content_max_width_tablet', 'content_max_width_mobile', 'str_compare_select', 'str_nav_home',
           'str_q_dining', 'str_opt_seats2', 'str_opt_seats4', 'str_compare_scroll_all'];

$rows = $wpdb->get_results(
    "SELECT pm.post_id, p.post_title, p.post_type, pm.meta_value
       FROM {$wpdb->postmeta} pm JOIN {$wpdb->posts} p ON p.ID = pm.post_id
      WHERE pm.meta_key = '_elementor_data' AND p.post_type <> 'revision' AND p.post_status = 'publish'
        AND (pm.meta_value LIKE '%dccs_selector%' OR pm.meta_value LIKE '%dccs_mini_entry%')"
);

$show = function ($v) { return is_scalar($v) ? json_encode((string) $v, JSON_UNESCAPED_UNICODE) : json_encode($v); };
$total = 0;

$walk = function ($els, $row) use (&$walk, &$total, $DEFAULTS, $MINI_OWN, $LEGACY, $show) {
    foreach ((array) $els as $e) {
        $type = $e['widgetType'] ?? '';
        if ($type === 'dccs_selector' || $type === 'dccs_mini_entry') {
            $s = (array) ($e['settings'] ?? []);
            $mini = $type === 'dccs_mini_entry';
            $mirroring = $mini && ($s['mirror_source'] ?? '') !== '';
            $shares = !$mini && ($s['share_design'] ?? '') === 'yes';
            echo "\n== post {$row->post_id} ({$row->post_title}) — {$type} {$e['id']}"
                . ($mirroring ? "  [mirrors \"{$s['mirror_source']}\"]" : '') . ($shares ? "  [shares as \"" . ($s['design_name'] ?? '') . "\"]" : '') . "\n";
            $mask = 0; $unread = 0; $legacy = 0;
            $watched = $DEFAULTS + ($mini ? $MINI_OWN : []);
            foreach ($watched as $k => $want) {
                if (!array_key_exists($k, $s) || !is_scalar($s[$k]) || (string) $s[$k] === '' || (string) $s[$k] === $want) { continue; }
                $readsIt = !$mirroring || isset($MINI_OWN[$k]);
                if ($readsIt) { echo "  MASKS (read)    $k = " . $show($s[$k]) . "   (0.53.2 default: " . $show($want) . ")\n"; $mask++; }
                else { echo "  unread (safe)   $k = " . $show($s[$k]) . "\n"; $unread++; }
            }
            if ($mini && $mirroring && isset($s['str_intro']) && (string) $s['str_intro'] !== '') {
                echo "  note            str_intro is stored but NOT read: the line above the button reads entry_line (0.53.2)\n";
            }
            foreach ($LEGACY as $k) { if (array_key_exists($k, $s)) { $legacy++; } }
            echo "  legacy (safe)   $legacy key(s) whose control no longer exists\n";
            echo "  " . ($mask ? "=> $mask key(s) to clear" : "=> nothing masks 0.53.2") . ($unread ? ", plus $unread unread copy(ies) safe to clear" : '') . "\n";
            $total += $mask;
        }
        if (!empty($e['elements'])) { $walk($e['elements'], $row); }
    }
};
foreach ($rows as $row) { $walk(json_decode($row->meta_value, true), $row); }

echo "\n== dccs_design_sources (read only; a source whose page is gone is ignored)\n";
foreach ((array) get_option('dccs_design_sources', []) as $name => $src) {
    $pid = (int) ($src['post_id'] ?? 0);
    $st  = get_post_status($pid);
    echo "  \"$name\" -> post $pid " . ($st && $st !== 'trash' ? "($st) — in use" : '(missing) — IGNORED, left in the option untouched') . "\n";
}
echo "\nTOTAL keys that mask 0.53.2: $total\n";
