#!/usr/bin/env python3
"""
Mutation run for v0.26.0 — the app shell.

Breaks ONE guarantee at a time and runs the two suites against the broken
copy. Every mutant must make one of them FAIL.

    python3 tests/app-shell.mutations.py
"""
import os, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(ROOT, 'dcc-guest-guide')
SUITES = [
    ['php',  os.path.join(ROOT, 'tests', 'app-shell.test.php')],
    ['node', os.path.join(ROOT, 'tests', 'app-shell.ui.js')],
]
APP = 'assets/js/widget-app.js'
STAY = 'includes/class-stay.php'
W = 'includes/class-widget.php'
P = 'includes/class-plugin.php'
CSS = 'assets/css/widget.css'

MUTANTS = [
    # ---- the greeting: the property's clock, and its boundaries ---------
    ('morning runs one hour long', APP,
     "        const text = h < 12 ? S.morning : (h < 18 ? S.afternoon : S.evening);",
     "        const text = h <= 12 ? S.morning : (h < 18 ? S.afternoon : S.evening);"),
    ('evening starts at eight, not six', APP,
     "        const text = h < 12 ? S.morning : (h < 18 ? S.afternoon : S.evening);",
     "        const text = h < 12 ? S.morning : (h < 20 ? S.afternoon : S.evening);"),
    ('the greeting reads the DEVICE clock, not the property one', APP,
     "        const p = partsIn(app.tz, new Date(), { hour: 'numeric', hour12: false });\n"
     "        const h = p.hour === undefined ? new Date().getHours() : (p.hour === '24' ? 0 : +p.hour);",
     "        const h = new Date().getHours();"),

    # ---- the stay: never guessed ----------------------------------------
    ('the stay endpoint is called even with no token on the link', APP,
     "        const token = stayToken();\n        if (!token) { return; }",
     "        const token = stayToken();"),
    ('an unresolved stay is filled in with a plausible one', APP,
     "                const stay = j && j.success && j.data && j.data.stay;",
     "                const stay = (j && j.success && j.data && j.data.stay)\n"
     "                    || { cottage: 'Cottage 1', checkIn: '2026-06-18', checkOut: '2026-06-21',\n"
     "                         timeIn: '14:00', timeOut: '11:00' };"),
    ('the progress bar is not clamped to the stay', APP,
     "            const pct = Math.max(0, Math.min(100, ((Date.now() - start) / (end - start)) * 100));",
     "            const pct = ((Date.now() - start) / (end - start)) * 100;"),
    ('the dates are formatted on the device clock', APP,
     "        const at = instantAt(tz, iso, hhmm || '12:00');",
     "        const at = new Date(iso + 'T' + (hhmm || '12:00') + ':00');"),
    ('the progress bar tells a screen reader nothing', APP,
     "            bar.setAttribute('aria-label', Math.round(pct) + '%');", ""),

    # ---- "Tavares Now": show nothing rather than something wrong --------
    ('a missing reading is printed as zero', APP,
     "                const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : null;",
     "                const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : 0;"),
    ('an empty strip is shown anyway', APP,
     "                if (!out.length) { return; }", ""),
    ("yesterday's sunset is taken, because index 0 is", APP,
     "                const hit = sunsets.find((v) => typeof v === 'string' && v.slice(0, 10) === todayISO);",
     "                const hit = sunsets[0];"),

    # ---- the checkout line ----------------------------------------------
    ('the count is dropped from the checkout line', APP,
     "            if (total > 0) { parts.push(fmt(S.done, [done, total])); }", ""),
    ('a day is named even when no stay is known', APP,
     "            const stay = root.__dccggStay;",
     "            const stay = root.__dccggStay || { checkOut: '2026-06-21', timeOut: '11:00' };"),
    ('the due lines are re-queried from the root, which the portal emptied', APP,
     "        (root.__dccggDues || []).forEach((el) => {",
     "        root.querySelectorAll('[data-dccgg-due]').forEach((el) => {"),
    ('the line stops following the ticks', APP,
     "        const obs = new MutationObserver(() => paintDue(root, app));",
     "        const obs = new MutationObserver(() => {});"),

    # ---- the tab bar ------------------------------------------------------
    ('the bar floats over the open sheet', CSS,
     "html.dccgg-detail-open .dccgg-app-tabs {\n    display: none;\n}", ""),
    ('the bar stops following which section is open', APP,
     "                if (key) { openDetail(root, key); mark(tab); }",
     "                if (key) { openDetail(root, key); }"),
    ('the bar keeps claiming a section after the sheet closes', APP,
     "        root.__dccggAppOnClose = () => mark(tabs[0]);", ""),

    # ---- the Back button --------------------------------------------------
    ('Back leaves the page instead of closing the sheet', APP,
     "                try { history.pushState({ dccggSheet: 1 }, ''); pushed = true; } catch (_) {}", ""),
    ('popstate stops closing the sheet', APP,
     "            if (pushed && isOpen()) { pushed = false; closeDetail(root); }", ""),

    # ---- the token --------------------------------------------------------
    ('the signature stops covering the booking id', STAY,
     "            hash_hmac('sha256', self::HMAC_CONTEXT . $booking_id, self::secret()),",
     "            hash_hmac('sha256', self::HMAC_CONTEXT, self::secret()),"),
    ('the comparison becomes a plain ===', STAY,
     "        return hash_equals(self::sign($id), $sig) ? $id : 0;",
     "        return self::sign($id) === $sig ? $id : 0;"),
    ('a cancelled booking greets the guest', STAY,
     "        if (!$booking || $booking->post_type !== 'mphb_booking' || $booking->post_status !== self::GREETING_STATUS) {",
     "        if (!$booking || $booking->post_type !== 'mphb_booking') {"),
    ('any post id is accepted as a booking', STAY,
     "$booking->post_type !== 'mphb_booking' || ", ""),
    ('a backwards date range is accepted', STAY,
     "        if (!self::is_iso_date($in) || !self::is_iso_date($out) || $out <= $in) {",
     "        if (!self::is_iso_date($in) || !self::is_iso_date($out)) {"),
    ('an impossible date passes as a date', STAY,
     "        return checkdate((int) $m[2], (int) $m[3], (int) $m[1]);", "        return true;"),
    ('a leading colon empties the cottage name', STAY,
     "        if ($pos !== false && $pos > 0) {", "        if ($pos !== false) {"),
    ('a malformed property time is shown as given', STAY,
     "                        if (preg_match('/^([01]?\\d|2[0-3]):[0-5]\\d$/', $v)) {\n                            return $v;\n                        }",
     "                        return $v;"),
    ('the guest name rides along with the stay', STAY,
     "        $stay = [\n            'cottage' => self::cottage_label($booking_id),",
     "        $stay = [\n            'guestName' => (string) get_post_meta($booking_id, 'mphb_first_name', true),\n"
     "            'cottage' => self::cottage_label($booking_id),"),

    # ---- the tile summaries ------------------------------------------------
    ('an empty section is labelled "0 items"', W,
     "            if ($item_count > 0) {\n                if ($item_count === 1 && substr($noun, -1) === 's') {\n"
     "                    $noun = substr($noun, 0, -1);\n                }\n                $summary = $item_count . ' ' . $noun;\n            }",
     "            if ($item_count === 1 && substr($noun, -1) === 's') {\n                $noun = substr($noun, 0, -1);\n            }\n"
     "            $summary = $item_count . ' ' . $noun;"),
    ('the count overrides what the host wrote', W,
     "        $summary = trim((string) ($sec['section_summary'] ?? ''));\n        if ($summary === '') {",
     "        $summary = '';\n        if ($summary === '') {"),
    ('one item keeps the plural', W,
     "                if ($item_count === 1 && substr($noun, -1) === 's') {\n                    $noun = substr($noun, 0, -1);\n                }", ""),
    ('a separator is printed where there is no time', W,
     "            $clock = self::app_clock($checkout_time);\n            if ($clock !== '') {",
     "            $clock = self::app_clock($checkout_time);\n            if (true) {"),
    ('the clock loses its AM / PM', W,
     "        return $ts === false ? '' : gmdate('g:i A', $ts);",
     "        return $ts === false ? '' : gmdate('G:i', $ts);"),

    # ---- opt-in, and public mode -------------------------------------------
    ('the shell renders on every layout', W,
     "        $is_app       = ($menu_layout === 'app');", "        $is_app       = true;"),

    ('the hub keeps a second Front Desk control', W,
     "                    if (!$is_app && ($s['enable_detail_more_menu'] ?? '') === 'yes') {",
     "                    if (($s['enable_detail_more_menu'] ?? '') === 'yes') {"),
    ('the pop-up header keeps one too, clipped at the sheet edge', W,
     "                        $show_popup_more = !$is_app && ($s['enable_popup_more_menu'] ?? '') === 'yes'",
     "                        $show_popup_more = ($s['enable_popup_more_menu'] ?? '') === 'yes'"),

    # ---- the endpoint -------------------------------------------------------
    ('the stay endpoint reads a POST body', P,
     "        $token = isset($_GET['t']) ? sanitize_text_field(wp_unslash((string) $_GET['t'])) : '';",
     "        $token = isset($_POST['t']) ? sanitize_text_field(wp_unslash((string) $_POST['t'])) : '';"),
    ('the stay endpoint stops checking the nonce', P,
     "        check_ajax_referer('dccgg_nonce', 'nonce');\n\n        $ip_hash = substr(sha1((string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0')), 0, 12);\n        $rl_key  = 'dccgg_stay_rl_'",
     "        $ip_hash = substr(sha1((string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0')), 0, 12);\n        $rl_key  = 'dccgg_stay_rl_'"),
    ('the stay endpoint stops being rate-limited', P,
     "        set_transient($rl_key, $count + 1, 15 * MINUTE_IN_SECONDS);\n\n        $token = isset($_GET['t'])",
     "        $token = isset($_GET['t'])"),
    ('sunset is no longer asked of the weather proxy', P,
     "precipitation_probability_max,uv_index_max,sunset'", "precipitation_probability_max,uv_index_max'"),
    ('the worker stops precaching the app chunk', P,
     "['conditions', 'gallery', 'wizard', 'video', 'app']", "['conditions', 'gallery', 'wizard', 'video']"),

    # ---- the layout ----------------------------------------------------------
    ('the tab labels drop below the 14px floor', CSS,
     ".dccgg-app-tab-label {\n    font-size: 14px;", ".dccgg-app-tab-label {\n    font-size: 12px;"),
    ('the tiles go back to one up on a phone', CSS,
     ".dccgg-layout-app .dccgg-menu {\n    grid-template-columns: repeat(2, minmax(0, 1fr));",
     ".dccgg-layout-app .dccgg-menu {\n    grid-template-columns: repeat(1, minmax(0, 1fr));"),
    ('the pill loses its colour to the theme', CSS,
     "    background: var(--dccgg-app-fd, #d9480f);\n    color: #ffffff;", "    color: #ffffff;"),
    ('the chunk is no longer loaded for the shell', 'assets/js/widget.js',
     "        app:        '.dccgg-app-shell',", ""),
    ('the chunk gate stops testing the root itself', 'assets/js/widget.js',
     "            const present = root.matches && root.matches(CHUNKS[name])\n                ? true : !!root.querySelector(CHUNKS[name]);",
     "            const present = !!root.querySelector(CHUNKS[name]);"),
]

EQUIVALENT = [
    ('the three !is_public_mode guards on the Front Desk pill and tab',
     "measured: with ALL THREE removed, the public app shell still renders no "
     "pill and no Front Desk tab. apply_public_mode() writes "
     "enable_problem_report off, and render_app_front_desk_pill() and the tab "
     "bar both test that flag, so either mechanism alone is enough. The guards "
     "stay — this is the same defence in depth as the two focus guards recorded "
     "in v0.24.3 — and this is recorded rather than dressed up as a kill."),
    ('the tab bar\'s min-height dropped from 54px to 30px',
     "measured at 390: the tabs are 51px with the mutant and 54px without, so "
     "the 44px floor the brief sets is never crossed. It is held by the content "
     "box — a 20px icon, a 14px label at 1.2 line-height, 12px of padding and a "
     "2px gap — not by min-height, which only squares the row off. The "
     "guarantee the suite states is therefore not broken by this mutant, and "
     "inventing a test that failed on 51px would be testing the decoration "
     "rather than the floor."),
]
UNREACHABLE = []

def run(cmd, plugin_dir):
    env = dict(os.environ, DCCGG_PLUGIN_DIR=plugin_dir, DCCGG_UI_SOURCE='1',
               NODE_PATH=os.path.join(ROOT, 'node_modules'))
    return subprocess.run(cmd, env=env, capture_output=True, text=True, cwd=ROOT)

def suites(plugin_dir, stop_early=True):
    out = []
    for cmd in SUITES:
        r = run(cmd, plugin_dir)
        failed = [l.strip()[2:] for l in r.stdout.splitlines() if l.strip().startswith('✗')]
        out.append((os.path.basename(cmd[1]), r.returncode, failed))
        if stop_early and r.returncode != 0:
            break
    return out

base = suites(PLUGIN, stop_early=False)
if any(rc != 0 for _, rc, _ in base):
    print('The unmutated plugin fails its own suites; fix that first.')
    for n, rc, f in base: print(' ', n, rc, f[:3])
    sys.exit(2)

survivors = 0
print(f"{len(MUTANTS)} mutants against app-shell.test.php + app-shell.ui.js\n")
for name, rel, old, new in MUTANTS:
    tmp = tempfile.mkdtemp(prefix='dccgg-260-')
    try:
        dst = os.path.join(tmp, 'dcc-guest-guide')
        shutil.copytree(PLUGIN, dst)
        f = os.path.join(dst, rel)
        src = open(f).read()
        if src.count(old) != 1:
            print(f"  ?  {name}: target text found {src.count(old)} times — not applied"); survivors += 1; continue
        open(f, 'w').write(src.replace(old, new))
        if rel.endswith('.php'):
            lint = subprocess.run(['php', '-l', f], capture_output=True, text=True)
            if lint.returncode != 0:
                print(f"  ?  {name}: mutant does not parse"); survivors += 1; continue
        res = suites(dst)
        killers = [(n, fl) for n, rc, fl in res if rc != 0]
        if killers:
            n, fl = killers[0]
            print(f"  ✓ killed  {name}\n             by {n}: {(fl[0] if fl else 'non-zero exit')[:100]}")
        else:
            survivors += 1
            print(f"  ✗ SURVIVED  {name}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
print(f"\n{len(MUTANTS) - survivors} killed, {survivors} survived")
if UNREACHABLE:
    print(f"\n{len(UNREACHABLE)} mutant(s) NOT run — unreachable here, not passing by default:")
    for n, why in UNREACHABLE: print(f"  · {n}\n      {why}")
if EQUIVALENT:
    print(f"\n{len(EQUIVALENT)} mutant(s) NOT run — equivalent, not passing by default:")
    for n, why in EQUIVALENT: print(f"  · {n}\n      {why}")
sys.exit(1 if survivors else 0)
