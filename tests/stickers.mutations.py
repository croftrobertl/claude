#!/usr/bin/env python3
"""
Mutation run for v0.24.1 — Front Desk layout (Part A) and stickers (Part B).

Copies the plugin, breaks ONE guarantee at a time and runs the four suites
against the broken copy. Every mutant must make at least one of them FAIL.

    python3 tests/stickers.mutations.py
"""
import os, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(ROOT, 'dcc-guest-guide')
SUITES = [
    ['php', os.path.join(ROOT, 'tests', 'front-desk.test.php')],
    ['node', os.path.join(ROOT, 'tests', 'front-desk.ui.js')],
    ['php', os.path.join(ROOT, 'tests', 'stickers.test.php')],
    ['node', os.path.join(ROOT, 'tests', 'stickers.ui.js')],
]
W, J, C, I = 'includes/class-widget.php', 'assets/js/widget.js', 'assets/css/widget.css', 'includes/class-icons.php'

MUTANTS = [
    # ---- Part A
    ('the label goes back under the circle', C,
     'flex-direction: row;\n    align-items: center;\n    gap: 6px;', 'flex-direction: column;\n    align-items: center;\n    gap: 6px;'),
    ('the label moves to the right of the circle', C,
     'flex-direction: row;\n    align-items: center;\n    gap: 6px;', 'flex-direction: row-reverse;\n    align-items: center;\n    gap: 6px;'),
    ('the label is allowed a third line', W,
     "$words = preg_split('/\\s+/u', $label_text, 2) ?: [$label_text];",
     "$words = preg_split('/\\s+/u', $label_text) ?: [$label_text];"),
    ('the label lines stop being right-aligned', C, 'text-align: right;\n    line-height: 1.15;', 'text-align: left;\n    line-height: 1.15;'),
    ('the circle is shrunk', C, 'width: 48px;\n    height: 48px;\n    flex: 0 0 48px;', 'width: 34px;\n    height: 34px;\n    flex: 0 0 34px;'),
    ('the coral fill is shown after a tap-close', J,
     "                    if (!keyboard) {\n                        opener.setAttribute('data-dccgg-quiet-focus', '');",
     "                    if (false) {\n                        opener.setAttribute('data-dccgg-quiet-focus', '');"),
    ('no ring after a keyboard close', J,
     '                    if (!keyboard) {', '                    if (true) {'),
    ('Escape stops counting as a keyboard close', J,
     "dialog.addEventListener('cancel', () => { dialog.__dccggCloseKeyboard = true; });",
     "dialog.addEventListener('cancel', () => { dialog.__dccggCloseKeyboard = false; });"),
    ('the quiet-focus marker never clears, so the ring never comes back', J,
     "                            opener.removeAttribute('data-dccgg-quiet-focus');\n                            opener.removeEventListener('blur', clear);",
     "                            opener.removeEventListener('blur', clear);"),
    ('the title bar grows past 48px', C,
     'width: 34px;\n    height: 34px;\n    flex: 0 0 34px;\n    border-width: 2px;',
     'width: 70px;\n    height: 70px;\n    flex: 0 0 70px;\n    border-width: 2px;'),
    # ---- Part B
    ('the button reserves a width, so it overflows its column onto the title', C,
     'carries its own fixed width, so nothing is left unreserved. */\n    min-height: 48px;',
     'carries its own fixed width, so nothing is left unreserved. */\n    min-width: 48px;'),
    ('the title icon loses its tile', W,
     '<span class="dccgg-detail-title-icon"<?php echo self::sticker_style($sec); // phpcs:ignore WordPress.Security.EscapeOutput ?>>',
     '<span class="dccgg-detail-title-icon">'),
    ('the sticker colour stops coming from the section key', W,
     "        return $custom !== '' ? $custom : Icons::color_for((string) ($sec['section_key'] ?? ''));",
     "        return $custom !== '' ? $custom : Icons::color_for((string) ($sec['section_title'] ?? ''));"),
    ('the hub tile and the title tile drift apart', W,
     '<span class="dccgg-detail-title-icon"<?php echo self::sticker_style($sec); // phpcs:ignore WordPress.Security.EscapeOutput ?>>',
     '<span class="dccgg-detail-title-icon" style="--dccgg-sticker:#006BCF">'),
    ('a section gets the wrong colour', I, "'rules'     => '#C43A3A',", "'rules'     => '#0E9AAF',"),
    ('the unknown-key fallback disappears', I, 'return self::SECTION_COLORS[$key] ?? self::COLOR_FALLBACK;',
     "return self::SECTION_COLORS[$key] ?? '';"),
    ('a glyph gets a hard-coded colour', C, 'fill: currentColor;\n    filter: drop-shadow', 'fill: #222;\n    filter: drop-shadow'),
    ('the white rim is dropped', C, 'border: 3px solid #fff;\n    box-sizing: border-box;', 'border: 0;\n    box-sizing: border-box;'),
    ('the shadow is dropped', C,
     'box-shadow: 0 0 0 2px rgba(0,0,0,.06), 0 5px 10px rgba(0,0,0,.18);\n    /* Only the shadow moves',
     'box-shadow: none;\n    /* Only the shadow moves'),
    ('hover recolours every sticker to the site coral, hiding Review Us', C,
     'box-shadow: 0 0 0 2px rgba(0,0,0,.08), 0 8px 16px rgba(0,0,0,.26);',
     'box-shadow: 0 0 0 2px rgba(0,0,0,.08), 0 8px 16px rgba(0,0,0,.26); background: var(--dccgg-btn-hover-bg, #f08080);'),
    ('a symbol is duplicated per tile instead of shared', I,
     'self::$used[$key] = true;', 'self::$used[$key . uniqid()] = true;'),
    ('an icon font is pulled from Google Fonts', C,
     '.dccgg-glyph {', '@font-face{font-family:MI;src:url("https://fonts.gstatic.com/s/materialicons/v1/mi.woff2")}\n.dccgg-glyph {'),
    ('the wiggle runs under reduced motion', C,
     '@media (prefers-reduced-motion: reduce) {\n    .dccgg-root.dccgg-root .dccgg-tile-icon,\n    .dccgg-stage.dccgg-stage .dccgg-tile-icon { transition: none; }\n}',
     '@media (prefers-reduced-motion: reduce) {\n    .dccgg-root.dccgg-root .dccgg-tile-icon { animation-duration: 500ms !important; }\n}'),
    ('the Material washer is dropped in unscaled', I, "'scale'   => 0.90,", "'scale'   => 1.00,"),
    ('the wrapper copies the glyph viewBox, pushing Material glyphs off-screen', I,
     "            esc_attr(self::outer_view_box($g['viewBox'])),", "            esc_attr($g['viewBox']),"),
    ('an unknown glyph emits broken markup instead of nothing', I,
     "        if ($key === '') { return; }", "        if ($key === '') { $key = 'nope'; }"),
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
print(f"{len(MUTANTS)} mutants against four suites\n")
for name, rel, old, new in MUTANTS:
    tmp = tempfile.mkdtemp(prefix='dccgg-241-')
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
            print(f"  ✓ killed  {name}\n             by {n}: {(fl[0] if fl else 'non-zero exit')[:110]}")
        else:
            survivors += 1
            print(f"  ✗ SURVIVED  {name}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
print(f"\n{len(MUTANTS) - survivors} killed, {survivors} survived")
sys.exit(1 if survivors else 0)
