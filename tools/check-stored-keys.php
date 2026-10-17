<?php
/**
 * Cottage Selector 0.53.3 — READ-ONLY check of stored widget keys.
 *
 * Run:   wp eval-file "Cottage Selector - 0.53.3 check-stored-keys.php"
 *
 * Writes NOTHING. Reads _elementor_data for every published, non-revision post that
 * holds a dccs_selector or dccs_mini_entry widget, plus the dccs_design_sources
 * option, and for each instance compares the watched stored keys with the 0.53.3
 * PACKAGED DEFAULT:
 *
 *   MASKS (read)        stored, differs from the 0.53.3 default, and the widget READS
 *                       it — it hides a 0.53.1-0.53.3 change until cleared.
 *   unread (safe)       stored and differs, but a mirroring Mini Entry never reads its
 *                       own text keys (its pop-up uses the source's), so clearing it
 *                       changes nothing a guest sees.
 *   legacy (safe)       keys whose control no longer exists.
 *
 * An EMPTY stored value is treated as cleared: it falls through to the default.
 * Run it before clearing and again after Update; every "MASKS" line should be gone.
 *
 * 0.53.3 adds: the pet note and the pet-note link on every widget; the SITE row's
 * pet link (dccs_settings), where a stored '' — unlike a widget's — does NOT fall
 * through but means "no link"; and the "Primary" registry entry, which mirroring
 * pop-ups read and which now refreshes ONLY when its page is Updated in Elementor.
 */

global $wpdb;

// 0.53.3 packaged defaults for every key a 0.53.1-0.53.3 change touches.
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
    // 0.53.3
    'str_pet_note'        => 'One dog up to 20 lbs, Cottage 34 only, $50 per night, pre-approval required.',
];
$PET_URL = function_exists('home_url') ? home_url('/accommodation/cottage-34/') : '/accommodation/cottage-34/';
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

$show = function ($v) { return is_scalar($v) ? json_encode((string) $v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : json_encode($v); };
$total = 0;

$walk = function ($els, $row) use (&$walk, &$total, $DEFAULTS, $MINI_OWN, $LEGACY, $show, $PET_URL) {
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
                if ($readsIt) { echo "  MASKS (read)    $k = " . $show($s[$k]) . "   (0.53.3 default: " . $show($want) . ")\n"; $mask++; }
                else { echo "  unread (safe)   $k = " . $show($s[$k]) . "\n"; $unread++; }
            }
            // A widget's own pet link beats the site's (0.53.3). An empty one inherits.
            $wurl = is_array($s['pet_fee_url'] ?? null) ? trim((string) ($s['pet_fee_url']['url'] ?? '')) : '';
            if ($wurl !== '' && $wurl !== $PET_URL) {
                if (!$mirroring) { echo "  MASKS (read)    pet_fee_url = " . $show($wurl) . "   (0.53.3 site default: " . $show($PET_URL) . ")\n"; $mask++; }
                else { echo "  unread (safe)   pet_fee_url = " . $show($wurl) . "\n"; $unread++; }
            }
            if ($mini && $mirroring && isset($s['str_intro']) && (string) $s['str_intro'] !== '') {
                echo "  note            str_intro is stored but NOT read: the line above the button reads entry_line (0.53.2)\n";
            }
            foreach ($LEGACY as $k) { if (array_key_exists($k, $s)) { $legacy++; } }
            echo "  legacy (safe)   $legacy key(s) whose control no longer exists\n";
            echo "  " . ($mask ? "=> $mask key(s) to clear" : "=> nothing masks 0.53.3") . ($unread ? ", plus $unread unread copy(ies) safe to clear" : '') . "\n";
            $total += $mask;
        }
        if (!empty($e['elements'])) { $walk($e['elements'], $row); }
    }
};
foreach ($rows as $row) { $walk(json_decode($row->meta_value, true), $row); }

echo "\n== dccs_settings (the DCC > Cottage Selector page)\n";
$site = get_option('dccs_settings', []);
if (is_array($site) && array_key_exists('pet_fee_url', $site) && (string) $site['pet_fee_url'] !== $PET_URL) {
    echo "  MASKS (read)    pet_fee_url = " . $show($site['pet_fee_url']) . "   (0.53.3 default: " . $show($PET_URL) . ")\n";
    echo "                  A stored '' here means NO LINK; it does not fall through. Fix: type the URL into\n";
    echo "                  DCC > Cottage Selector > Pet note link and Save.\n";
    $total++;
} else {
    echo "  pet_fee_url: " . (is_array($site) && array_key_exists('pet_fee_url', $site) ? 'already the Cottage 34 page' : 'not stored, the default applies') . "\n";
}

echo "\n== dccs_design_sources (read only; a source whose page is gone is ignored)\n";
foreach ((array) get_option('dccs_design_sources', []) as $name => $src) {
    $pid = (int) ($src['post_id'] ?? 0);
    $st  = get_post_status($pid);
    $inUse = $st && $st !== 'trash';
    echo "  \"$name\" -> post $pid " . ($inUse ? "($st) — in use" : '(missing) — IGNORED, left in the option untouched') . "\n";
    if (!$inUse) { continue; }
    // Mirroring pop-ups read THIS copy. Since 0.53.3 it refreshes only when post $pid
    // is Updated in Elementor, so a stale copy here is fixed by that Update.
    $stale = 0;
    foreach ((array) ($src['overrides']['string_overrides'] ?? []) as $k => $v) {
        $want = $DEFAULTS['str_' . $k] ?? null;
        if ($want !== null && is_scalar($v) && (string) $v !== '' && (string) $v !== $want) {
            echo "    stale copy      $k = " . $show($v) . "\n"; $stale++;
        }
    }
    echo "    " . ($stale ? "=> $stale stale string(s): Update post $pid in Elementor AFTER clearing its keys" : "=> registry copy is current") . "\n";
}
echo "\nTOTAL keys that mask 0.53.3: $total\n";
