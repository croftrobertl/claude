#!/usr/bin/env python3
"""
Mutation run for v0.27.8 — the Property Map card and its full-screen layer.

Breaks ONE guarantee at a time and runs the suites against the broken copy.
Every mutant must make at least one of them FAIL.

    python3 tests/map-card.mutations.py
"""
import os, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(ROOT, 'dcc-guest-guide')
SUITES = [['node', os.path.join(ROOT, 'tests', 'map-card.ui.js')],
          ['php', os.path.join(ROOT, 'tests', 'public-mode.test.php')]]
C, J, W = 'assets/css/widget.css', 'assets/js/widget.js', 'includes/class-widget.php'

MUTANTS = [
    # ---- the named case: the iframe is present before the tap ------------
    ('the embed is left in place, so the iframe loads before any tap', W,
     "        if ($html === '' || stripos($html, 'maps/d/embed') === false) { return $html; }",
     "        if (true) { return $html; }"),
    ('the swap matches ANY iframe, so other embeds are eaten too', W,
     "'~<iframe\\b[^>]*\\bsrc=\"(https?://(?:www\\.)?google\\.com/maps/d/embed\\?[^\"]*)\"[^>]*>\\s*</iframe>~i'",
     "'~<iframe\\b[^>]*\\bsrc=\"([^\"]*)\"[^>]*>\\s*</iframe>~i'"),
    ('the picture loses loading="lazy", so it costs something at page load', W,
     "                'loading'  => 'lazy',",
     "                'loading'  => 'eager',"),
    ('the picture loses its intrinsic size, so the card reflows on load', W,
     "            return '<img width=\"900\" height=\"591\" '",
     "            return '<img '"),

    # ---- the named case: the layer is moved by the portal ----------------
    ('the layer is appended to the guide root, so the portal moves it', J,
     '        document.body.appendChild(el);',
     '        (document.querySelector(".dccgg-stage") || document.body).appendChild(el);'),
    ('the iframe is rebuilt on every open, so reopening costs a request', J,
     '        if (!mapLayer.iframe) {',
     '        if (true) {'),
    ('the iframe is destroyed on close', J,
     "        el.hidden = true;\n        document.documentElement.classList.remove('dccgg-map-open');",
     "        el.hidden = true;\n        if (mapLayer.iframe) { mapLayer.iframe.remove(); mapLayer.iframe = null; }\n"
     "        document.documentElement.classList.remove('dccgg-map-open');"),
    ('the src is set when the card renders rather than on open', W,
     '<div class="dccgg-mapcard" data-dccgg-map-src="<?php echo esc_attr($embed_url); ?>"',
     '<iframe src="<?php echo esc_url($embed_url); ?>" width="640" height="480"></iframe>'
     '<div class="dccgg-mapcard" data-dccgg-map-src="<?php echo esc_attr($embed_url); ?>"'),

    # ---- the named case: the back gesture does not close -----------------
    ('no history entry is pushed, so the back gesture leaves the page', J,
     "            history.pushState({ dccggMap: 1 }, '');\n            mapLayer.pushed = true;",
     "            mapLayer.pushed = false;"),
    ('popstate no longer closes the layer', J,
     "        window.addEventListener('popstate', () => {\n            if (el.hidden) return;",
     "        window.addEventListener('popstate', () => {\n            if (true) return;"),
    ('Escape no longer closes the layer', J,
     "            if (e.key !== 'Escape' || el.hidden) return;",
     "            if (true) return;"),

    # ---- the named case: buttons unequal or wrapping at 320 --------------
    ('the row wraps instead of staying one line', C,
     '.dccgg-mapcard-actions {\n    display: flex;\n    gap: 8px;\n    justify-content: center;\n}',
     '.dccgg-mapcard-actions {\n    display: flex;\n    flex-wrap: wrap;\n    gap: 8px;\n    justify-content: center;\n}'),
    ('the narrow-width rule is removed, so the label overflows at 320', C,
     '    .dccgg-mapcard-actions { gap: 6px; }\n    .dccgg-mapcard-actions > * { flex: 0 1 auto; }',
     '    .dccgg-mapcard-actions { gap: 8px; }'),
    ('the label is left at the kit font size, so it no longer fits', C,
     '    font-size: 15px;\n    font-weight: 700;\n    line-height: 1.25;\n    letter-spacing: normal;\n    text-transform: none;',
     '    font-weight: 700;\n    line-height: 1.25;'),
    ('the kit capitalisation is let through', C,
     '    letter-spacing: normal;\n    text-transform: none;\n    text-decoration: none;',
     '    letter-spacing: normal;\n    text-decoration: none;'),

    # ---- the named case: Where to Launch changed ------------------------
    ('the duplicate-link gate keys off the title, catching Where to Launch', W,
     "            $show_map    = $map_on  && $map_url !== '' && !$has_map_card;",
     "            $show_map    = $map_on  && $map_url !== '' && stripos($title, 'map') === false;"),
    ('the map link is suppressed for every item', W,
     "            $show_map    = $map_on  && $map_url !== '' && !$has_map_card;",
     "            $show_map    = false;"),

    # ---- the rest of the contract ---------------------------------------
    ('the external button points at the embed url, not the viewer', W,
     "        $viewer = $mid !== ''\n            ? 'https://www.google.com/maps/d/viewer?mid=' . rawurlencode($mid)\n            : $embed_url;",
     "        $viewer = $embed_url;"),
    ('the external link drops rel=noopener', W,
     '<a class="dccgg-btn dccgg-mapcard-ext" href="<?php echo esc_url($viewer); ?>" target="_blank" rel="noopener">',
     '<a class="dccgg-btn dccgg-mapcard-ext" href="<?php echo esc_url($viewer); ?>" target="_blank">'),
    ('the scroll lock is never applied', C,
     'html.dccgg-map-open, html.dccgg-map-open body {\n    overflow: hidden;',
     'html.dccgg-map-open, html.dccgg-map-open body {\n    overflow: visible;'),
    ('the close button drops below 44px', C,
     '.dccgg-maplayer-close.dccgg-maplayer-close {\n    width: 44px;\n    height: 44px;',
     '.dccgg-maplayer-close.dccgg-maplayer-close {\n    width: 32px;\n    height: 32px;'),
    ('the layer sinks below the open sheet', C,
     '    height: 100dvh;\n    z-index: 100001;',
     '    height: 100dvh;\n    z-index: 10;'),
    ('focus never enters the layer', J,
     '        setTimeout(() => { try { mapLayer.title.focus(); } catch (_) {} }, 0);',
     '        /* focus left where it was */'),
    ('Tab escapes the layer', J,
     "        el.addEventListener('keydown', (e) => {\n            if (e.key !== 'Tab') return;",
     "        el.addEventListener('keydown', (e) => {\n            if (true) return;"),
    ('the card is wired on the root, which the portal moves away from', J,
     "        bindGlobal(root, document, 'click', (e) => {\n            const t = e.target.closest('.dccgg-mapcard-shot, .dccgg-mapcard-open');",
     "        bindGlobal(root, root, 'click', (e) => {\n            const t = e.target.closest('.dccgg-mapcard-shot, .dccgg-mapcard-open');"),
    ('tapping the picture no longer opens the layer', J,
     "            const t = e.target.closest('.dccgg-mapcard-shot, .dccgg-mapcard-open');",
     "            const t = e.target.closest('.dccgg-mapcard-open');"),
]

EQUIVALENT = [
    ('the buttons lose box-sizing (border-box -> content-box)',
     'measured: all 60 map-card assertions stay green, and the honest reason is that '
     'box-sizing is NOT what equalises the two heights. BOTH buttons carry a 2px border — '
     'the filled one\'s is transparent — so their boxes match under either box model. The '
     'brief asked for box-sizing specifically and it is kept as hygiene, but the transparent '
     'border is doing the work, and claiming a kill here would be claiming the rule earns '
     'something it does not. Remove the transparent border instead and the heights really do '
     'diverge; that is a different rule and a different mutant.'),
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
    for n, rc, f in base:
        print(' ', n, rc, f[:3])
    sys.exit(2)

survivors = 0
for name, rel, old, new in MUTANTS:
    tmp = tempfile.mkdtemp(prefix='dccgg-278-')
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
            print(f"  ✓ killed  {name}\n             by {n}: {(fl[0] if fl else 'non-zero exit')[:96]}")
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
