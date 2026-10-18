#!/usr/bin/env python3
"""
Mutation run for the v0.24.4 focus-colour fixes.

Breaks ONE guarantee at a time and runs the suite against the broken copy.
Every mutant must make it FAIL.

    python3 tests/focus-colour.mutations.py
"""
import os, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(ROOT, 'dcc-guest-guide')
SUITES = [['node', os.path.join(ROOT, 'tests', 'focus-colour.ui.js')]]
W, J, C = 'includes/class-widget.php', 'assets/js/widget.js', 'assets/css/widget.css'

MUTANTS = [
    # ---- part 2: where focus lands, and whether it shows ----
    ('a pointer open goes back to focusing Back', J,
     "                let target = byKeyboard ? null : scope.querySelector('.dccgg-detail-title[tabindex]');",
     "                let target = null;"),
    ('the heading loses its tabindex, so it cannot take focus', W,
     '<h2 class="dccgg-detail-title" tabindex="-1">', '<h2 class="dccgg-detail-title">'),
    ('every open is treated as a pointer open, so the keyboard loses its ring', J,
     "            const byKeyboard = !!root.__dccggOpenByKeyboard;", "            const byKeyboard = false;"),
    ('every open is treated as a keyboard open, so a tap rings Back', J,
     "            const byKeyboard = !!root.__dccggOpenByKeyboard;", "            const byKeyboard = true;"),
    ('the intent tracker is never wired, so nothing knows a key from a finger', J,
     "        wireOpenIntent(root);\n", ''),
    ('a scripted click counts as a keyboard press again', J,
     "            root.__dccggOpenByKeyboard = !!(e && e.isTrusted && e.detail === 0);",
     "            root.__dccggOpenByKeyboard = !!(e && e.detail === 0);"),
    ('the heading is allowed to show its own focus ring', C,
     """.dccgg-root.dccgg-root .dccgg-detail-title:focus,
.dccgg-root.dccgg-root .dccgg-detail-title:focus-visible,
.dccgg-stage.dccgg-stage .dccgg-detail-title:focus,
.dccgg-stage.dccgg-stage .dccgg-detail-title:focus-visible {
    outline: none;
}""",
     """.dccgg-root.dccgg-root .dccgg-detail-title:focus,
.dccgg-root.dccgg-root .dccgg-detail-title:focus-visible,
.dccgg-stage.dccgg-stage .dccgg-detail-title:focus,
.dccgg-stage.dccgg-stage .dccgg-detail-title:focus-visible {
    outline: 3px solid #111111;
}"""),
    ('Shift+Tab from the heading walks out of the modal again', J,
     "                if (e.shiftKey && (!inside || onHeading || document.activeElement === first)) { e.preventDefault(); last.focus(); }",
     "                if (e.shiftKey && (!inside || document.activeElement === first)) { e.preventDefault(); last.focus(); }"),

    # ---- part 1: the eight controls the host kit still reached ----
    ('the Front Desk menu items lose their fill back to the kit', C,
     """.dccgg-root.dccgg-root .dccgg-more-item.dccgg-more-item,
.dccgg-stage.dccgg-stage .dccgg-more-item.dccgg-more-item,
.dccgg-report-dialog.dccgg-report-dialog .dccgg-more-item.dccgg-more-item {
    background-color: transparent;
    color: var(--dccgg-text);
    border-radius: 6px;
}""", ''),
    ('the menu items keep the colour but lose the fill', C,
     """.dccgg-report-dialog.dccgg-report-dialog .dccgg-more-item.dccgg-more-item {
    background-color: transparent;""",
     """.dccgg-report-dialog.dccgg-report-dialog .dccgg-more-item.dccgg-more-item {"""),
    ('the menu items are re-asserted at single specificity, which still loses', C,
     '.dccgg-root.dccgg-root .dccgg-more-item.dccgg-more-item,\n.dccgg-stage.dccgg-stage .dccgg-more-item.dccgg-more-item,\n.dccgg-report-dialog.dccgg-report-dialog .dccgg-more-item.dccgg-more-item {\n    background-color: transparent;',
     '.dccgg-more-item,\n.dccgg-more-item,\n.dccgg-more-item {\n    background-color: transparent;'),
    ('the emergency button goes back to the kit coral', C,
     """.dccgg-root.dccgg-root .dccgg-sos-fab.dccgg-sos-fab,
.dccgg-stage.dccgg-stage .dccgg-sos-fab.dccgg-sos-fab,
.dccgg-report-dialog.dccgg-report-dialog .dccgg-sos-fab.dccgg-sos-fab {
    background-color: var(--dccgg-color-emergency);
    color: #fff;
    border-radius: 50%;
}""", ''),
    ('the search rows go back to the kit coral', C,
     """.dccgg-root.dccgg-root :is(.dccgg-search-result, .dccgg-search-still-stuck):is(.dccgg-search-result, .dccgg-search-still-stuck),
.dccgg-stage.dccgg-stage :is(.dccgg-search-result, .dccgg-search-still-stuck):is(.dccgg-search-result, .dccgg-search-still-stuck) {
    background-color: transparent;
    color: var(--dccgg-text);
    border-radius: 8px;
}""", ''),
    ('only the still-stuck row is dropped from that group', C,
     ':is(.dccgg-search-result, .dccgg-search-still-stuck):is(.dccgg-search-result, .dccgg-search-still-stuck),\n.dccgg-stage.dccgg-stage :is(.dccgg-search-result, .dccgg-search-still-stuck):is(.dccgg-search-result, .dccgg-search-still-stuck) {',
     ':is(.dccgg-search-result):is(.dccgg-search-result),\n.dccgg-stage.dccgg-stage :is(.dccgg-search-result):is(.dccgg-search-result) {'),
    ('Read more goes back to being a coral pill', C,
     """.dccgg-root.dccgg-root .dccgg-btn-text.dccgg-btn-text,
.dccgg-stage.dccgg-stage .dccgg-btn-text.dccgg-btn-text {
    background-color: transparent;
    color: var(--dccgg-primary);
    border-radius: 0;
}""", ''),
    ('gallery thumbnails take the coral wash again', C,
     """.dccgg-root.dccgg-root .dccgg-gallery-thumb.dccgg-gallery-thumb,
.dccgg-stage.dccgg-stage .dccgg-gallery-thumb.dccgg-gallery-thumb {
    background-color: #000;
    color: inherit;
    border-radius: 10px;
}""", ''),
    ('video posters take the coral wash again', C,
     """.dccgg-root.dccgg-root .dccgg-video-poster.dccgg-video-poster,
.dccgg-stage.dccgg-stage .dccgg-video-poster.dccgg-video-poster {
    background-color: #000;
    color: inherit;
    border-radius: 12px;
}""", ''),
    ('the "did you mean" chip loses its own wash', C,
     """.dccgg-root.dccgg-root .dccgg-search-dym-chip.dccgg-search-dym-chip,
.dccgg-stage.dccgg-stage .dccgg-search-dym-chip.dccgg-search-dym-chip {
    background-color: color-mix(in srgb, var(--dccgg-primary) 8%, transparent);
    color: var(--dccgg-text);
}""", ''),

    # ---- the pre-existing guard the audit thought was missing ----
    ('the .dccgg-btn family loses its doubled class, so the kit reaches Back', C,
     '.dccgg-root.dccgg-root :is(.dccgg-btn, .dccgg-checklist-reset):is(.dccgg-btn, .dccgg-checklist-reset),\n.dccgg-stage.dccgg-stage :is(.dccgg-btn, .dccgg-checklist-reset):is(.dccgg-btn, .dccgg-checklist-reset),\n.dccgg-root.dccgg-root :is(.dccgg-btn-send, .dccgg-btn-cancel, .dccgg-review-yes, .dccgg-review-no, .dccgg-review-platform):is(.dccgg-btn-send, .dccgg-btn-cancel, .dccgg-review-yes, .dccgg-review-no, .dccgg-review-platform),\n.dccgg-stage.dccgg-stage :is(.dccgg-btn-send, .dccgg-btn-cancel, .dccgg-review-yes, .dccgg-review-no, .dccgg-review-platform):is(.dccgg-btn-send, .dccgg-btn-cancel, .dccgg-review-yes, .dccgg-review-no, .dccgg-review-platform),\n.dccgg-report-dialog.dccgg-report-dialog :is(.dccgg-btn-send, .dccgg-btn-cancel, .dccgg-review-yes, .dccgg-review-no, .dccgg-review-platform):is(.dccgg-btn-send, .dccgg-btn-cancel, .dccgg-review-yes, .dccgg-review-no, .dccgg-review-platform) {\n    display: inline-flex;',
     '.dccgg-btn,\n.dccgg-checklist-reset,\n.dccgg-btn-send,\n.dccgg-btn-cancel,\n.dccgg-review-yes,\n.dccgg-review-no,\n.dccgg-review-platform {\n    display: inline-flex;'),
]

# Known UNREACHABLE in this browser, with the measured reason, rather than
# quietly dropped.
UNREACHABLE = [
    ('the pointer guard loosened to (hover: hover) alone, so a tap leaves a tint',
     "it only shows on a HYBRID device — (hover: hover) with (pointer: coarse), a "
     "touchscreen laptop. Measured in this container: Chromium ignores "
     "Emulation.setEmulatedMedia's hover and pointer features, and both simply "
     "follow the context's hasTouch, so they are always hover+fine or none+coarse "
     "and never the mix. Under either of those the loosened query and the original "
     "match identically."),
]

# EQUIVALENT, recorded rather than dropped.
EQUIVALENT = [
    ('the data-dccgg-quiet-focus marker removed from focusIntoPanel',
     'with the heading taking focus on every pointer open, nothing the marker '
     'protects is ever focused by this path — it only covers the fallback for a '
     'guide whose heading is not focusable, and the "loses its tabindex" mutant '
     'above is what exercises that'),
    ('focus({focusVisible}) removed from the focus call',
     'Chromium ignores the option entirely, so the attribute is the only '
     'mechanism this browser can test; it is kept for Safari and Firefox, where '
     'this container cannot run'),
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
print(f"{len(MUTANTS)} mutants against focus-colour.ui.js\n")
for mut in MUTANTS:
    name, rel, old, new = mut[0], mut[1], mut[2], mut[3]
    extra = mut[4] if len(mut) > 4 else {}
    tmp = tempfile.mkdtemp(prefix='dccgg-244-')
    try:
        dst = os.path.join(tmp, 'dcc-guest-guide')
        shutil.copytree(PLUGIN, dst)
        f = os.path.join(dst, rel)
        src = open(f).read()
        if src.count(old) != 1:
            print(f"  ?  {name}: target text found {src.count(old)} times — not applied"); survivors += 1; continue
        src = src.replace(old, new)
        if extra.get('also'):
            a_old, a_new = extra['also']
            if src.count(a_old) != 1:
                print(f"  ?  {name}: second target found {src.count(a_old)} times — not applied"); survivors += 1; continue
            src = src.replace(a_old, a_new)
        open(f, 'w').write(src)
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
    print(f"\n{len(UNREACHABLE)} mutant(s) NOT run — unreachable in this browser, not passing by default:")
    for name, why in UNREACHABLE:
        print(f"  · {name}\n      {why}")
if EQUIVALENT:
    print(f"\n{len(EQUIVALENT)} mutant(s) NOT run — equivalent, not passing by default:")
    for name, why in EQUIVALENT:
        print(f"  · {name}\n      {why}")
sys.exit(1 if survivors else 0)
