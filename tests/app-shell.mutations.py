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
CORE = 'assets/js/widget.js'

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
    ('the sun times are no longer asked of the weather proxy', P,
     "precipitation_probability_max,uv_index_max,sunrise,sunset'", "precipitation_probability_max,uv_index_max'"),

    # ---- v0.26.2 ----------------------------------------------------------
    ('the property name is shown in whatever case it is stored in', W,
     "        $name = self::title_case(trim(wp_strip_all_tags((string) get_bloginfo('name'))));",
     "        $name = trim(wp_strip_all_tags((string) get_bloginfo('name')));"),
    ('a name the host already cased gets re-cased anyway', W,
     "        if ($name === '' || preg_match('/\\p{Ll}/u', $name)) {\n            return $name;   // already has lowercase: the host's own casing.\n        }",
     ""),
    ('a lone initialism is re-cased into a word', W,
     "        if (!preg_match('/\\s/u', $name)) {\n            return $name;\n        }",
     ""),
    ('the small words are capitalised too', W,
     "            if ($i !== $first && $i !== $last && in_array($w, $small, true)) {\n                continue;\n            }",
     ""),
    ('a checklist section counts items again', W,
     "                $noun = (($sec['checklist_mode'] ?? '') === 'yes')\n                    ? __('steps', 'dcc-guest-guide')\n                    : __('items', 'dcc-guest-guide');",
     "                $noun = __('items', 'dcc-guest-guide');"),
    ('every section counts steps, checklist or not', W,
     "                $noun = (($sec['checklist_mode'] ?? '') === 'yes')\n                    ? __('steps', 'dcc-guest-guide')\n                    : __('items', 'dcc-guest-guide');",
     "                $noun = __('steps', 'dcc-guest-guide');"),
    ('the conditions strip leaves the hero card again', W,
     "                self::render_app_now($s); ?>", "?>"),
    ('the server stops resolving the sun, so each side works it out alone', PROP,
     "        $data['sunToday'] = $sun;", "        unset($data['sunToday']);"),
    ("the sun row is picked by position, so it is yesterday's", PROP,
     "        $idx = array_search($today, $times, true);", "        $idx = 0;"),
    ('today is read on the server clock, not the cottage one', PROP,
     "        $today = (new \\DateTimeImmutable('now', $tz))->format('Y-m-d');",
     "        $today = (new \\DateTimeImmutable('now'))->format('Y-m-d');"),
    ('an unreadable timezone silently becomes the server\'s', PROP,
     "            $tz = new \\DateTimeZone($tz_name !== '' ? $tz_name : 'UTC');",
     "            $tz = new \\DateTimeZone('UTC');"),
    ('the strip stops reading the resolved value', APP,
     "                const sunset = d.sunToday && d.sunToday.sunset;",
     "                const sunset = (d.daily && d.daily.sunset && d.daily.sunset[0] || '').slice(11, 16);"),
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
    # ---- v0.27.0 --------------------------------------------------------
    ('the tab bar stays inside the widget, where a transform traps it', APP,
     "        document.body.appendChild(bar);", "        /* not portaled */"),
    ('the bar stops being scoped to the guide, and floats over what follows', APP,
     "                entries.forEach((e) => show(e.isIntersecting));",
     "                entries.forEach(() => show(true));"),
    ('the bar no longer steps aside for an open sheet', CSS,
     "html.dccgg-detail-open .dccgg-app-tabs.dccgg-app-tabs {\n    display: none;\n}", ""),
    ('the offscreen marker stops hiding anything', CSS,
     '.dccgg-app-tabs.dccgg-app-tabs[hidden],\n.dccgg-app-tabs.dccgg-app-tabs[data-dccgg-offscreen="1"] {\n    display: none;\n}', ""),
    ('the Front Desk tab loses its direct handler with the bar out of the root', APP,
     "                    if (typeof root.__dccggOpenReport === 'function') {\n"
     "                        root.__dccggOpenReport('', '', tab);\n                    }", ""),

    ('the browser restores its own scroll offset on the history rewind', APP,
     "            if ('scrollRestoration' in history) { history.scrollRestoration = 'manual'; }", ""),

    ('the pressed state is never taken off again', APP,
     "        ['touchmove', 'touchend', 'touchcancel'].forEach((type) => {\n"
     "            root.addEventListener(type, release, { passive: true });\n        });", ""),
    ('a scroll leaves the tile looking pressed', APP,
     "        bindGlobal(root, window, 'scroll', release, { passive: true });", ""),

    ('the tiles go back to left-aligned', CSS,
     "    text-align: center;\n    align-items: center;\n    /* No double-tap-to-zoom wait",
     "    text-align: left;\n    align-items: flex-start;\n    /* No double-tap-to-zoom wait"),
    # v0.27.5: the two mutants that lived here attacked the multi-sentence
    # rule — its regex, and the class it set. Rob rejected the rule itself,
    # so the code is gone and so are they. What replaces them is "the
    # left-alignment rule comes back", further down.
    ('Reset gets its second border back', CSS,
     ".dccgg-stage.dccgg-stage--app .dccgg-checklist-progress {\n    border: 0;\n    background: transparent;\n    padding: 0;\n    max-width: none;\n}", ""),
    ('the per-section Front Desk pill comes back', W,
     "        $label = (string) ($s['str_app_front_desk'] ?? __('Front Desk', 'dcc-guest-guide'));",
     "        $label = 'Wi-Fi Not Working? Tell the Front Desk';"),
    # ---- v0.27.1: a long title must not run under its controls ----------
    ('the side tracks can collapse to nothing again', CSS,
     "    grid-template-columns: minmax(min-content, 1fr) minmax(0, auto) minmax(min-content, 1fr);\n    align-items: center;",
     "    grid-template-columns: 1fr auto 1fr;\n    align-items: center;"),
    ('only the lead is protected, not the tail', CSS,
     "    grid-template-columns: minmax(min-content, 1fr) minmax(0, auto) minmax(min-content, 1fr);\n    align-items: center;",
     "    grid-template-columns: minmax(min-content, 1fr) minmax(0, auto) 1fr;\n    align-items: center;"),
    ('the centre track stops giving way, so the sides are pushed out', CSS,
     "    grid-template-columns: minmax(min-content, 1fr) minmax(0, auto) minmax(min-content, 1fr);\n    align-items: center;",
     "    grid-template-columns: minmax(min-content, 1fr) max-content minmax(min-content, 1fr);\n    align-items: center;"),
    ('a word longer than the track can neither hyphenate nor break', CSS,
     "    hyphens: auto;\n    overflow-wrap: break-word;", "    hyphens: auto;"),
    # ---- v0.27.2: dead centre, and the title's own leading ---------------
    # The four RESERVE mutants are in UNREACHABLE below, not here. They are
    # not unreachable because of the harness — they are unreachable because
    # the rule they attack is worth 1px on the host's real content.
    # ---- v0.27.5: centred, balanced, gapped, and pick A under 390 -------
    ("the left-alignment rule comes back", CSS,
     "    text-wrap: balance;\n}", "    text-wrap: balance;\n}\n"
     ".dccgg-stage.dccgg-stage .dccgg-item-body p { text-align: left; }"),
    ("balanced wrapping is dropped", CSS,
     "    margin: 0;\n    text-wrap: balance;", "    margin: 0;"),
    ("the blank line between paragraphs is dropped", CSS,
     ".dccgg-stage.dccgg-stage .dccgg-item-body p + p,\n"
     ".dccgg-report-dialog.dccgg-report-dialog .dccgg-item-body p + p {\n"
     "    margin-top: 1em;\n}", ""),
    ("the blank line is doubled", CSS, "    margin-top: 1em;\n}", "    margin-top: 2em;\n}"),
    ("the blank line lands above the FIRST paragraph too", CSS,
     ".dccgg-stage.dccgg-stage .dccgg-item-body p + p,\n"
     ".dccgg-report-dialog.dccgg-report-dialog .dccgg-item-body p + p {",
     ".dccgg-stage.dccgg-stage .dccgg-item-body p,\n"
     ".dccgg-report-dialog.dccgg-report-dialog .dccgg-item-body p {"),
    ("the declared margin: 0 goes, so the theme's default gaps the ends", CSS,
     "    margin: 0;\n    text-wrap: balance;", "    text-wrap: balance;"),
    ("pick A leaks past 390", CSS, "@media (max-width: 389.98px) {\n"
     "    .dccgg-item-title.dccgg-item-title {\n"
     "        grid-template-areas:", "@media (max-width: 900px) {\n"
     "    .dccgg-item-title.dccgg-item-title {\n"
     "        grid-template-areas:"),
    ("pick A's emoji stays in the row instead of going above it", CSS,
     "    .dccgg-item-title-lead.dccgg-item-title-lead { display: contents; }", ""),
    ("pick A's left reserve goes, so the title drifts again under 390", CSS,
     "        content: \"\"; grid-area: lead; min-width: 44px; height: 0;",
     "        content: \"\"; grid-area: lead; min-width: 0; height: 0;"),
    ('the title inherits the theme 1.8 again', CSS,
     "    line-height: 1.25;\n}", "}"),
]

EQUIVALENT = [
    ('the doubled class on the open-sheet hide rule',
     "measured: html.dccgg-detail-open .dccgg-app-tabs is (0,2,1), which already "
     "outranks the bar's own (0,2,0), so the single-class form behaves "
     "identically. The doubling is consistency with the rest of the file, not "
     "necessity, and the CSS comment was corrected to say so rather than "
     "claiming a specificity it does not need."),
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
UNREACHABLE = [
    ('the four mutants on the symmetric side reserve',
     "removing the reserve outright, reserving on the lead only, dropping it "
     "to a single class so min-width: 0 beats it, and pinning it at its "
     "narrow floor — all four survive, and the honest reason is not the "
     "harness. MEASURED ON THE REAL PAGES with tools/title-overlap.js: live "
     "0.27.1, which has no reserve at all, is already 0px off centre at 768 "
     "and 1440 and 1px at 390; 0.27.2 with the full reserve is 0px at 390 "
     "and the same 0px above it. So the reserve buys ONE PIXEL at one width "
     "on the content Rob has today, and nothing anywhere else. Where there "
     "is free space the two 1fr side tracks are equalised by the fr "
     "distribution with no reserve needed, and at 320 — the only width with "
     "a real shift, 22px — the clamp holds the reserve at its floor on "
     "purpose, because the alternative is breaking a word. An assertion that "
     "could kill these would have to resolve 1px, which is below the noise "
     "of a laid-out line box. The rule is kept because it is the mechanism "
     "Rob asked for and it binds if a title ever grows long enough to create "
     "pressure; it is NOT kept on a claim that it is doing visible work "
     "today, and the report says so in those words. An earlier draft of that "
     "report quoted '5px at 390' for 0.27.1 as though it were a live figure. "
     "It was a FIXTURE figure. The live number was always 1px."),
    ('removing hyphens: auto from the title',
     "measured, and it decides the other one too: THIS CHROMIUM DOES NOT "
     "HYPHENATE AT ALL. A 15-character word in a 90px box renders three "
     "lines and 87px with hyphens:auto, with hyphens:manual, with "
     "hyphens:none, and with no lang attribute — four cases, one result. The "
     "container carries no hyphenation dictionary, so no test that can run "
     "here can tell the declaration from its absence. It is kept because "
     "mobile Safari, which is the browser Rob uses, does hyphenate en-US — "
     "but note what follows: hyphens:auto is NOT what fixed 'Kitchenwar / e' "
     "in this release, the 6px narrow-width gap is. Hyphenation is a backstop "
     "for a longer word later, and it is unverified here. Said so in the "
     "report rather than implying iPhone coverage."),
    ('giving the narrow-width gap back, so the longest word no longer fits',
     "not reachable by THIS SUITE, and the reason is the harness rather than "
     "the guide: measured at 320, the fixture lays the title track out at "
     "82px in 20px type where the live page gives it 151px in 25px. No "
     "fixture word sits at the real boundary, so the gap can be given back "
     "with nothing to break — renaming two fixture items to Rob's own titles "
     "was tried and makes 'Kitchenware' split at ANY gap, which measures the "
     "model and not the property. The mutant IS killed, against the real "
     "pages, by tools/title-overlap.js: with the 6px rule removed it reports "
     "SPLIT \"Kitchenware\" by 8px on both /guest/ and /test/ at 320, and "
     "nothing on the clean tree. Demonstrated, not asserted."),
    ('the three belt-and-braces guards on the scroll restore and the tab bar',
     "all three measured in Chromium, each on its own, and none of them can be "
     "made to show: (a) reverting window.scrollTo to the plain form still gives "
     "ZERO visible drift, with html{scroll-behavior:smooth} genuinely in effect "
     "and the page genuinely scrollable — both asserted in the same test — "
     "because the scroll is issued in the same task as the unpin and there is no "
     "painted frame to animate from; (b) dropping the inline scroll-behavior "
     "override changes nothing for the same reason; (c) removing the tab bar's "
     "initial hidden attribute never produces a flash, because Chromium delivers "
     "the first IntersectionObserver callback before the bar's first paint. "
     "The load-bearing fix IS tested and IS killed: history.scrollRestoration = "
     "'manual', without which the close drifts 756px on the real page. These "
     "three are kept rather than deleted — unlike the two no-op CSS rules this "
     "release removed — because those were redundant in EVERY engine, while "
     "these are redundant only in the one we can run. Safari is the browser Rob "
     "uses and the one WebKit-less containers cannot check."),
    ('removing touch-action: manipulation from the tiles',
     "measured, clean and mutant alike: getComputedStyle(tile).touchAction reports "
     "'manipulation' with the declaration and without it. Chromium already treats "
     "an interactive element as manipulation on a page carrying a device-width "
     "viewport, so in THIS browser the declaration changes nothing and no test "
     "here can tell the two apart. It is kept because the browser it is for is "
     "mobile Safari, which honours user-scalable=yes and holds a tap ~300ms for "
     "double-tap zoom — and WebKit is not installable in this container (see the "
     "note from v0.24.2). Unverified on a real iPhone; said so in the report."),
]

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
