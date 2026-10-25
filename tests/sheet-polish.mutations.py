#!/usr/bin/env python3
"""
Mutation run for v0.25.1 — the five sheet-polish items.

Breaks ONE guarantee at a time and runs the suite against the broken copy.
Every mutant must make it FAIL. At least one per item in the brief.

    python3 tests/sheet-polish.mutations.py
"""
import os, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(ROOT, 'dcc-guest-guide')
SUITES = [['node', os.path.join(ROOT, 'tests', 'sheet-polish.ui.js')]]
J, C, W = 'assets/js/widget.js', 'assets/css/widget.css', 'includes/class-widget.php'

MUTANTS = [
    # ---- item 1: tap targets ---------------------------------------------
    ('the row stops ticking — only the 24px box does', J,
     "            const hit = e.target.closest('.dccgg-item-check, .dccgg-item-title');",
     "            const hit = e.target.closest('.dccgg-item-check');"),
    ('the row swallows the per-item report flag, so flagging becomes ticking', J,
     "            if (e.target.closest('a, button:not(.dccgg-item-check), input, select, textarea, [role=\"button\"]:not(.dccgg-item-check)')) return;",
     ""),
    ('the read-aloud buttons go back to one shared name', W,
     "                        $tts_play = self::tts_label(",
     "                        $tts_play = (string) ($strings['str_tts_play'] ?? 'Read this item aloud'); $unused_play = self::tts_label("),
    ('the per-item name loses the title and emits a bare format', W,
     "        if ($title === '' || strpos($format, '%s') === false) {\n            return $plain;\n        }\n        return sprintf($format, $title);",
     "        return $format;"),
    ('the read-aloud tap area is dropped', C,
     '.dccgg-root .dccgg-item-tts::after,\n', '',
     {'also': ('.dccgg-stage .dccgg-item-tts::after,\n', '')}),

    # ---- item 2: the checklist's memory ----------------------------------
    ('ticks stop being written to the device', J,
     "        try { localStorage.setItem(checkStorageKey(widgetId), JSON.stringify(state)); } catch (_) {}",
     "        try { void checkStorageKey(widgetId); void state; } catch (_) {}"),
    ('ticks stop being read back on load', J,
     "        try { return JSON.parse(localStorage.getItem(checkStorageKey(widgetId)) || '{}'); }",
     "        try { return JSON.parse('{}'); }"),
    ('the key drops the stay, so two guests on one device collide', J,
     "    function checkStorageKey(widgetId) { return 'dccgg:check:' + widgetId + ':' + stayKey(); }",
     "    function checkStorageKey(widgetId) { return 'dccgg:check:' + widgetId; }"),
    ('Reset stops clearing what was stored', J,
     "            saveChecks(widgetId, state);\n            updateChecklistProgress(root, detail);",
     "            updateChecklistProgress(root, detail);"),

    # ---- item 3: the 768 layout ------------------------------------------
    ('the four-column rule is dropped', C,
     """@media (min-width: 600px) {
    .dccgg-layout-grid .dccgg-menu {
        grid-template-columns: repeat(4, minmax(0, 1fr));
    }
}""", ''),
    ('the mobile rule overlaps again at exactly 600px', C,
     '@media (max-width: 599.98px) and (orientation: portrait) {',
     '@media (max-width: 600px) and (orientation: portrait) {'),
    ('the column floor comes back, so 600px overflows instead of shrinking', C,
     '        grid-template-columns: repeat(4, minmax(0, 1fr));',
     '        grid-template-columns: repeat(4, minmax(var(--dccgg-tile-min), 1fr));'),
    ('the phone loses its single column', C,
     '@media (min-width: 600px) {\n    .dccgg-layout-grid .dccgg-menu {',
     '@media (min-width: 1px) {\n    .dccgg-layout-grid .dccgg-menu {'),

    # ---- item 4: the keyboard hint ---------------------------------------
    ('every platform is told to press ⌘K', J,
     "        if (kbd && !/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')) {",
     "        if (false) {"),
    ('the Mac is told to press Ctrl K', J,
     "        if (kbd && !/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')) {",
     "        if (kbd) {"),
    ('the hint is shown on touch, where there is no keyboard', C,
     '@media (hover: none) {\n    .dccgg-search-kbd { display: none; }\n}', ''),

    # ---- item 5: body copy weight ----------------------------------------
    ('the stage host is dropped, so the pop-up goes bold again', C,
     ".dccgg-stage.dccgg-stage .dccgg-item-body,\n.dccgg-stage.dccgg-stage .dccgg-item-body *:not(h1):not(h2):not(h3):not(h4):not(h5):not(h6),\n",
     ""),
    ('the guide stops declaring a body weight at all', C,
     """.dccgg-root.dccgg-root,
.dccgg-stage.dccgg-stage,
.dccgg-report-dialog.dccgg-report-dialog {
    font-weight: var(--dccgg-fw-body, 400);
}""", ''),
    ('the body weight is set to the theme\'s 700', C,
     '    --dccgg-fw-body: 400;', '    --dccgg-fw-body: 700;'),
    ('item titles are swept to the body weight', C,
     '.dccgg-item-title-text {\n    grid-column: 2;',
     '.dccgg-item-title-text {\n    font-weight: 400;\n    grid-column: 2;'),
]

EQUIVALENT = [
    ('the checkable test removed from the row handler',
     "the next line reads the item's own .dccgg-item-check and bails when there "
     "is none, and a non-checkable item has none — so removing the explicit "
     "test changes nothing observable. It stays in the code because it says "
     "what the handler MEANS; the !btn guard says only what it happens to need."),
    ("the row's exclusion list, as far as read-aloud is concerned",
     "read-aloud calls e.stopPropagation() in its own handler, so it never "
     "reaches the document-level row handler at all. What the exclusion really "
     "protects is the PER-ITEM REPORT flag, which does not stop propagation — "
     "and that mutant is in the list above, and dies."),
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
print(f"{len(MUTANTS)} mutants against sheet-polish.ui.js\n")
for mut in MUTANTS:
    name, rel, old, new = mut[0], mut[1], mut[2], mut[3]
    extra = mut[4] if len(mut) > 4 else {}
    tmp = tempfile.mkdtemp(prefix='dccgg-251-')
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
