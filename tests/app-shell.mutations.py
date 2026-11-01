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
PROP = 'includes/class-property.php'
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
    ('the due lines are re-queried from the root, which the portal emptied', APP,
     "        (root.__dccggDues || []).forEach((el) => {",
     "        root.querySelectorAll('[data-dccgg-due]').forEach((el) => {"),
    ('the line stops following the ticks', APP,
     "        const obs = new MutationObserver(() => paintDue(root, app));",
     "        const obs = new MutationObserver(() => {});"),

    # ---- the tab bar ------------------------------------------------------
    ('the bar floats over the open sheet', CSS,
     "html.dccgg-detail-open .dccgg-root.dccgg-root .dccgg-app-tabs {\n    display: none;\n}", ""),
    ('the hide loses to the bar\'s own rule, as it did mid-sweep', CSS,
     "html.dccgg-detail-open .dccgg-root.dccgg-root .dccgg-app-tabs {",
     "html.dccgg-detail-open .dccgg-app-tabs {"),
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
    # ---- v0.26.1: working with nothing configured ------------------------
    ('the Checkout tile goes back to needing a section role', W,
     "        $is_checkout = (string) ($sec['section_role'] ?? '') === 'checkout'\n"
     "            || ($checkout_key !== '' && trim((string) ($sec['section_key'] ?? '')) === $checkout_key);",
     "        $is_checkout = (string) ($sec['section_role'] ?? '') === 'checkout';"),
    ('the checkout key is matched loosely, so any section gets the clock', W,
     "            if (strtolower(trim((string) ($sec['section_key'] ?? ''))) === 'checkout') {",
     "            if (true) {"),
    ('the Canal tab stops finding the map section', W,
     "        if ($canal_key === '') {\n            $canal_key = self::app_map_key((array) ($s['guide_sections'] ?? []));\n        }",
     ""),
    ('the Canal tab picks the first section instead of the map', W,
     "        foreach (['/\\bmaps?\\b/i', '/canal/i'] as $pattern) {",
     "        foreach (['/./', '/canal/i'] as $pattern) {"),
    ('the Guide tab disappears again when no section is chosen', W,
     "            'act'   => $guide_key !== '' ? 'section' : 'menu',",
     "            'act'   => 'section',"),
    ('the Guide tab does nothing when it has no section', APP,
     "                if (act === 'menu') {", "                if (false) {"),
    ('the welcome goes back to a bare word', W,
     "            $welcome = self::default_welcome();", "            $welcome = __('Welcome', 'dcc-guest-guide');"),
    ('the welcome loses to the kit again', CSS,
     ".dccgg-root.dccgg-root .dccgg-app-stay .dccgg-app-welcome {",
     ".dccgg-app-welcome {"),
    ('the tiles lose their border to the kit again', CSS,
     "    border: 1px solid color-mix(in srgb, var(--dccgg-app-ink) 14%, transparent);\n    border-radius: var(--dccgg-app-radius);",
     "    border-radius: var(--dccgg-app-radius);"),
    ('two counts again: the bar keeps its number', CSS,
     ".dccgg-stage--app .dccgg-checklist-progress .dccgg-checklist-progress-label {\n    display: none;\n}", ""),
    ('the due line names a weekday it cannot know', APP,
     "            const at = clock12(app.tz, app.timeOut || '');\n            if (at) { parts.push(fmt(S.by, [at])); }",
     "            parts.push('Sunday');"),
    ('the tile columns follow the viewport again', CSS,
     "@container dccgg-hub (min-width: 600px) {\n    .dccgg-layout-app .dccgg-menu { grid-template-columns: repeat(4, minmax(0, 1fr)); }\n}",
     ""),
    ('the hub stops being a query container', CSS,
     "    container-type: inline-size;\n    container-name: dccgg-hub;", ""),
    # The real shape of the v0.26.0 bug: initAll() called from where the
    # bootstrap used to sit, which is before `const liveRoots` exists.
    ('the bootstrap runs before its own declarations again', 'assets/js/widget.js',
     "    // v0.12.0: Elementor renders widgets in the editor preview via AJAX and\n"
     "    // swaps the DOM on every setting change — long after DOMContentLoaded —",
     "    initAll();\n"
     "    // v0.12.0: Elementor renders widgets in the editor preview via AJAX and\n"
     "    // swaps the DOM on every setting change — long after DOMContentLoaded —"),
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
