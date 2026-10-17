#!/usr/bin/env python3
"""
Mutation run for the v0.24.2 iPhone fixes.

Copies the plugin, breaks ONE guarantee at a time and runs the browser suite
against the broken copy. Every mutant must make it FAIL.

    python3 tests/phone-fixes.mutations.py
"""
import os, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(ROOT, 'dcc-guest-guide')
UI = os.path.join(ROOT, 'tests', 'phone-fixes.ui.js')
C, J, W = 'assets/css/widget.css', 'assets/js/widget.js', 'includes/class-widget.php'

MUTANTS = [
    ('overflow:hidden back on the heading, clipping the mini tile', C,
     """       allowed to shrink so the grid can give the button its column. */
    min-width: 0;
}""",
     """       allowed to shrink so the grid can give the button its column. */
    min-width: 0;
    overflow: hidden;
}"""),
    ('the ellipsis taken off the title text, so a long title overlaps again', C,
     """.dccgg-stage.dccgg-stage .dccgg-detail-header-titlebar .dccgg-detail-title-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}""",
     """.dccgg-stage.dccgg-stage .dccgg-detail-header-titlebar .dccgg-detail-title-text {
    min-width: 0;
}"""),
    ('the 10px gap under the Back row removed', C,
     '    padding-bottom: 10px;\n    border-radius: 16px 16px 0 0;', '    border-radius: 16px 16px 0 0;'),
    ('the gap made transparent instead of the header\'s own background', C,
     '    padding-bottom: 10px;\n    border-radius: 16px 16px 0 0;',
     '    margin-bottom: 26px;\n    border-radius: 16px 16px 0 0;'),
    ('coral at the START of a touch, so a scroll flashes it', J,
     "        bindGlobal(root, document, 'touchstart', (e) => {\n            const t = e.target.closest && e.target.closest('.dccgg-tile');\n            if (!t || !root.contains(t)) { tile = null; return; }",
     "        bindGlobal(root, document, 'touchstart', (e) => {\n            const t = e.target.closest && e.target.closest('.dccgg-tile');\n            if (!t || !root.contains(t)) { tile = null; return; }\n            t.classList.add('is-tap');"),
    ('movement no longer cancels the tap', J,
     'moved = true;      // a scroll: this gesture gets no colour', 'moved = false;'),
    ('a background transition restored, so the colour fades', C,
     """    transition: transform var(--dccgg-transition-duration) var(--dccgg-transition-easing),
                box-shadow var(--dccgg-transition-duration) var(--dccgg-transition-easing),
                filter var(--dccgg-transition-duration) var(--dccgg-transition-easing);
}""",
     """    transition: transform var(--dccgg-transition-duration) var(--dccgg-transition-easing),
                box-shadow var(--dccgg-transition-duration) var(--dccgg-transition-easing),
                filter var(--dccgg-transition-duration) var(--dccgg-transition-easing),
                background var(--dccgg-transition-duration) var(--dccgg-transition-easing);
}"""),
    ('a tile left coral after the pop-up closes', J,
     "        if (typeof root.__dccggClearTileTap === 'function') root.__dccggClearTileTap();", ''),
    ('the tap class never cleared on its own', J,
     "            timer = setTimeout(() => { timer = null; t.classList.remove('is-tap'); }, TAP_HOLD_MS);", ''),
    ("the kit's :focus coral no longer neutralised, so a tile sticks", C,
     '.dccgg-root.dccgg-root .dccgg-tile:focus,\n', ''),
    ('Review Us turns coral like the rest', W,
     "        return $hex === self::TAP_COLOR ? ' data-sticker-coral=\"1\"' : '';", "        return '';"),
    ('the grey tap wash left on', C, '    -webkit-tap-highlight-color: transparent;', ''),
    ('reduced motion stops the instant colour too', C,
     """.dccgg-root.dccgg-root .dccgg-tile.is-tap,
.dccgg-stage.dccgg-stage .dccgg-tile.is-tap {
    background: var(--dccgg-btn-hover-bg, #f08080);""",
     """.dccgg-root.dccgg-root .dccgg-tile.is-tap,
.dccgg-stage.dccgg-stage .dccgg-tile.is-tap {
    background: var(--dccgg-tile-bg);"""),
]

# Known UNREACHABLE in this container, with the reason, rather than quietly
# dropped: removing `.dccgg-tile:active` from the neutralising list changes
# nothing in Chromium, because a pointer press always sets :hover too and the
# :hover rule already outranks the kit. The :active entry only does work on a
# real touch device, where iOS sets :active on finger-down without :hover —
# which is the case this container cannot produce (WebKit is not installed and
# the egress proxy refuses both Playwright download hosts). Verified by hand:
# with it removed, a held pointer still leaves the tile white.
UNREACHABLE = [
    ("the kit's :active coral no longer neutralised",
     'Chromium always pairs :active with :hover, and the :hover rule already wins; '
     'only a real iOS touch separates them.'),
]

def run(plugin_dir):
    env = dict(os.environ, DCCGG_PLUGIN_DIR=plugin_dir, DCCGG_UI_SOURCE='1',
               NODE_PATH=os.path.join(ROOT, 'node_modules'))
    return subprocess.run(['node', UI], env=env, capture_output=True, text=True, cwd=ROOT)

base = run(PLUGIN)
if base.returncode != 0:
    print('The unmutated plugin fails its own suite; fix that first.')
    print('\n'.join(l for l in base.stdout.splitlines() if l.strip().startswith('✗'))[:1500])
    sys.exit(2)

survivors = 0
print(f"{len(MUTANTS)} mutants against phone-fixes.ui.js\n")
for name, rel, old, new in MUTANTS:
    tmp = tempfile.mkdtemp(prefix='dccgg-242-')
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
        r = run(dst)
        failed = [l.strip()[2:] for l in r.stdout.splitlines() if l.strip().startswith('✗')]
        if r.returncode != 0:
            print(f"  ✓ killed  {name}\n             by: {(failed[0] if failed else 'non-zero exit')[:110]}")
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
sys.exit(1 if survivors else 0)
