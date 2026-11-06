#!/usr/bin/env python3
"""
Mutation run for v0.27.10 — the popup that grows out of the tile.

Breaks ONE guarantee at a time and runs the suites against the broken copy.
Every mutant must make at least one of them FAIL.

    python3 tests/grow-open.mutations.py
"""
import os, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(ROOT, 'dcc-guest-guide')
SUITES = [['node', os.path.join(ROOT, 'tests', 'grow-open.ui.js')],
          ['php', os.path.join(ROOT, 'tests', 'public-mode.test.php')]]
C, J, W = 'assets/css/widget.css', 'assets/js/widget.js', 'includes/class-widget.php'

MUTANTS = [
    # ---- the seven the Director named --------------------------------
    ('a LAYOUT property is animated instead of the clip', J,
     """        const a = el.animate(reverse ? [{ clipPath: full }, { clipPath: small }]
                                     : [{ clipPath: small }, { clipPath: full }],""",
     """        const a = el.animate(reverse ? [{ height: box.height + 'px' }, { height: '40px' }]
                                     : [{ height: '40px' }, { height: box.height + 'px' }],"""),
    ('the open SCALES the popup instead of clipping it', J,
     """        const a = el.animate(reverse ? [{ clipPath: full }, { clipPath: small }]
                                     : [{ clipPath: small }, { clipPath: full }],
            { duration: ms, easing: reverse ? GROW_EASE_IN : GROW_EASE_OUT, fill: 'both' });""",
     """        const a = el.animate(reverse ? [{ scale: 1 }, { scale: 0.3 }]
                                     : [{ scale: 0.3 }, { scale: 1 }],
            { duration: ms, easing: reverse ? GROW_EASE_IN : GROW_EASE_OUT, fill: 'both' });"""),
    ('the stage keeps its own scale transition alongside the grow', C,
     """body.dccgg-detail-open .dccgg-stage.dccgg-growing.dccgg-growing {
    transition: none;
    opacity: 1;
    visibility: visible;
}""",
     """body.dccgg-detail-open .dccgg-stage.dccgg-growing.dccgg-growing {
    opacity: 1;
    visibility: visible;
}"""),
    ('the close does not reverse — the popup grows again on the way out', J,
     """                closeWait = growClip(state.stage, back, {
                    duration: GROW_CLOSE_MS, reverse: true,""",
     """                closeWait = growClip(state.stage, back, {
                    duration: GROW_CLOSE_MS,"""),
    ('the arrows slide the wrong way', J,
     """        const from = dir > 0 ? '100% 0' : '-100% 0';""",
     """        const from = dir > 0 ? '-100% 0' : '100% 0';"""),
    ('next and previous are swapped at the button', J,
     """                root.__dccggNavDir = btn.classList.contains('dccgg-section-next') ? 1 : -1;""",
     """                root.__dccggNavDir = btn.classList.contains('dccgg-section-next') ? -1 : 1;"""),
    ('there is no reduced-motion fallback', J,
     """        if (REDUCED_MOTION) { return growFade(el, reverse, o.content); }""",
     """        if (false) { return growFade(el, reverse, o.content); }"""),
    ('the map layer is re-appended on open, which reloads the iframe', J,
     """        el.hidden = false;
        document.documentElement.classList.add('dccgg-map-open');""",
     """        el.hidden = false;
        document.body.appendChild(el);
        document.documentElement.classList.add('dccgg-map-open');"""),
    ('will-change is left on after the animation', J,
     """            el.style.willChange = '';
            const c = el.__dccggGrowContent;
            if (c) c.style.willChange = '';""",
     """            const c = el.__dccggGrowContent;"""),

    # ---- the ordering fix, which IS the reported fault ---------------
    ('the panel flip goes back inside a whole-page View Transition', J,
     """        if (willGrow) { flipPanels(); } else { withViewTransition(flipPanels); }""",
     """        withViewTransition(flipPanels);"""),
    ('the open state waits a frame again, as the old forced-reflow path did', J,
     """        state.stage.classList.add('is-modal-open');
        {
            const panel = activePanel(state.stage, root.__dccggActiveKey || '');""",
     """        requestAnimationFrame(() => state.stage.classList.add('is-modal-open'));
        {
            const panel = activePanel(state.stage, root.__dccggActiveKey || '');"""),
    ('the hub is still hidden when the close measures the tile', J,
     """        if (wasModal) { root.classList.remove('is-detail'); }
        else { withViewTransition(() => root.classList.remove('is-detail')); }
        if (wasModal) hideDetailModal(root);""",
     """        if (wasModal) hideDetailModal(root);
        if (wasModal) { root.classList.remove('is-detail'); }
        else { withViewTransition(() => root.classList.remove('is-detail')); }"""),
    ('the custom-property walk goes back on the tap', J,
     """        cacheCustomProps(root);""", """"""),
    ('the teardown no longer waits for the shrink', J,
     """        }, closeWait);""", """        }, 0);"""),
    ('a re-open mid-close is mistaken for an arrow switch', J,
     """            && !openState.closeTimer
            && openState.stage.classList.contains('is-modal-open'));""",
     """            && openState.stage.classList.contains('is-modal-open'));"""),

    ('a superseded arrow swap hides the section the guest just arrived at', J,
     """            if (outgoing.__dccggSwapOut !== a) return;   // superseded
            outgoing.__dccggSwapOut = null;
""", """"""),
    ('a superseded arrow swap leaves that section out of flow and inert', J,
     """        el.style.position = '';
        el.style.top = '';
        el.style.left = '';
        el.style.right = '';
        el.style.pointerEvents = '';
        el.__dccggSwapOut = null;
""", """"""),

    # ---- the rest of the contract ------------------------------------
    ('the content stops fading in late and pops in as before', J,
     """                  delay: reverse ? 0 : Math.round(ms * 0.45),""",
     """                  delay: 0,"""),
    ('the open is no longer ~250ms', J,
     """    const GROW_OPEN_MS  = 250;""", """    const GROW_OPEN_MS  = 600;"""),
    ('the close is no longer ~200ms', J,
     """    const GROW_CLOSE_MS = 200;""", """    const GROW_CLOSE_MS = 450;"""),
    ('an arrow switch is no longer ~220ms', J,
     """    const GROW_NAV_MS   = 220;""", """    const GROW_NAV_MS   = 500;"""),
    ('the start rectangle stops being the tile and becomes an arbitrary box', J,
     """        let top    = cl(from.top - box.top, box.height);""",
     """        let top    = cl(from.top - box.top + 40, box.height);"""),
    ('the clip loses its rounded corner, so the corners are square while it grows', J,
     """        const radii = o.radii || cornerRadii(el);""",
     """        const radii = '0px';"""),
    ('an off-screen tile grows out of nowhere instead of fading', J,
     """        if (!(box.width > 0) || !(box.height > 0) || !rectOnScreen(from)) {
            return growFadeDrop(el, reverse, o.content);
        }""",
     """        if (!(box.width > 0) || !(box.height > 0)) {
            return growFadeDrop(el, reverse, o.content);
        }
        if (!from) { return growFadeDrop(el, reverse, o.content); }"""),
    ('the dim no longer takes as long as the grow', C,
     """    transition: opacity 0.25s ease;
}
.dccgg-detail-overlay:not([hidden]) {""",
     """    transition: opacity 0.05s ease;
}
.dccgg-detail-overlay:not([hidden]) {"""),
    ('the dim never appears at all', J,
     """        state.overlay.hidden = false;""", """        state.overlay.hidden = true;"""),
    ('the arrow switch re-grows the whole frame as well as sliding', J,
     """                growStop(state.stage);
                state.stage.classList.remove('dccgg-growing');
                growSlide(panel, anim.navDir);""",
     """                growStop(state.stage);
                state.stage.classList.remove('dccgg-growing');
                growSlide(panel, anim.navDir);
                growClip(state.stage, anim.from || tileRectFor(root, root.__dccggActiveKey), {});"""),
    ('a permanent will-change comes back on the scrollbar thumb', C,
     """.dccgg-scrollrail-thumb {
    min-height: 28px;
    background: rgba(0, 0, 0, 0.38);""",
     """.dccgg-scrollrail-thumb {
    min-height: 28px;
    will-change: transform, height;
    background: rgba(0, 0, 0, 0.38);"""),
    ('the Review Us section stops being guest-only', W,
     "            if ($audience !== 'public' && $audience !== 'both') { continue; }",
     "            if ($audience === 'nope') { continue; }"),
]

EQUIVALENT = []
UNREACHABLE = [
    ('the grow does not hold 60fps on a real iPhone',
     'not reachable in this container and not pretended otherwise: WebKit cannot be installed here '
     '(the egress proxy refuses cdn.playwright.dev and the Microsoft mirror), so every frame figure '
     'in this release is Chromium with touch emulation and 4x CPU throttling. What IS measured is '
     'reported in tools/open-trace.js terms — tap to first open paint, the longest frame gap and the '
     'dropped-frame count, before and after — on the real /guest/ document. Safari is not covered.'),
    ('the Front Desk form does not shrink back into its button on close',
     'not a mutant but a stated limit: a <dialog> closed with .close() leaves the top layer in the '
     'same tick, so it cannot be held open for a 200ms shrink without delaying the guest\'s own Send. '
     'It GROWS out of its opener (asserted) and fades on the way out through the platform\'s discrete '
     'transitions in widget.css. There is nothing here to break that a test could catch.'),
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
    for n, rc, f in base:
        print(' ', n, rc, f[:3])
    sys.exit(2)

survivors = 0
for name, rel, old, new in MUTANTS:
    tmp = tempfile.mkdtemp(prefix='dccgg-2710-')
    try:
        dst = os.path.join(tmp, 'dcc-guest-guide')
        shutil.copytree(PLUGIN, dst)
        f = os.path.join(dst, rel)
        src = open(f).read()
        if src.count(old) != 1:
            print(f"  ?  {name}: target text found {src.count(old)} times — not applied")
            survivors += 1
            continue
        open(f, 'w').write(src.replace(old, new))
        if rel.endswith('.php'):
            lint = subprocess.run(['php', '-l', f], capture_output=True, text=True)
            if lint.returncode != 0:
                print(f"  ?  {name}: mutant does not parse")
                survivors += 1
                continue
        res = suites(dst)
        killers = [(n, fl) for n, rc, fl in res if rc != 0]
        if killers:
            n, fl = killers[0]
            print(f"  ✓ killed  {name}\n             by {n}: {(fl[0] if fl else 'non-zero exit')[:92]}")
        else:
            survivors += 1
            print(f"  ✗ SURVIVED  {name}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

print(f"\n{len(MUTANTS) - survivors} killed, {survivors} survived")
if UNREACHABLE:
    print(f"\n{len(UNREACHABLE)} mutant(s) NOT run — unreachable here, not passing by default:")
    for name, why in UNREACHABLE:
        print(f"  · {name}\n      {why}")
if EQUIVALENT:
    print(f"\n{len(EQUIVALENT)} mutant(s) NOT run — equivalent, not passing by default:")
    for name, why in EQUIVALENT:
        print(f"  · {name}\n      {why}")
sys.exit(1 if survivors else 0)
