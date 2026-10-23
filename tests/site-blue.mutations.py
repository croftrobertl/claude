#!/usr/bin/env python3
"""
Mutation run for v0.24.5 — the site blue, the editor split, the Front Desk form.

Breaks ONE guarantee at a time and runs both suites against the broken copy.
Every mutant must make at least one of them FAIL.

    python3 tests/site-blue.mutations.py
"""
import os, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(ROOT, 'dcc-guest-guide')
SUITES = [['php', os.path.join(ROOT, 'tests', 'site-blue.test.php')],
          ['node', os.path.join(ROOT, 'tests', 'front-desk-form.ui.js')]]
C, J, JE, W, P = ('assets/css/widget.css', 'assets/js/widget.js', 'assets/js/widget-editor.js',
                  'includes/class-widget.php', 'includes/class-plugin.php')

MUTANTS = [
    # ---- 1. the site blue -------------------------------------------------
    ('the primary token goes back to the guide blue', C,
     '--dccgg-primary: #006bcf;', '--dccgg-primary: #0f6dbf;'),
    ('the token moves but a var() fallback is left behind', C,
     'border: 1px solid var(--dccgg-primary, #006bcf);', 'border: 1px solid var(--dccgg-primary, #0f6dbf);'),
    ('the print stylesheet keeps the old blue', C,
     '        background: #006bcf;', '        background: #0f6dbf;'),
    ('the tile border keeps the old rgba', C,
     '--dccgg-tile-border: rgba(0, 107, 207, 0.15);', '--dccgg-tile-border: rgba(15, 109, 191, 0.15);'),
    ('the coastal preset is left on the old blue (CSS)', C,
     '.dccgg-preset-coastal {\n    --dccgg-primary:      #006bcf;',
     '.dccgg-preset-coastal {\n    --dccgg-primary:      #0f6dbf;'),
    ('the coastal preset is left on the old blue (PHP map)', W,
     "'--dccgg-primary'      => '#006bcf',", "'--dccgg-primary'      => '#0f6dbf',"),
    ('the installed app keeps the old theme colour', P,
     "'theme_color'      => '#006bcf',", "'theme_color'      => '#0f6dbf',"),
    ('the theme-color meta keeps the old blue', P,
     '<meta name="theme-color" content="#006bcf">', '<meta name="theme-color" content="#0f6dbf">'),
    ('the confetti keeps the old blue', J,
     "'#a94c66', '#006bcf', '#c19a4b'", "'#a94c66', '#0f6dbf', '#c19a4b'"),
    ('the coral hover is swept up with it', C,
     '--dccgg-btn-hover-bg: #f08080;', '--dccgg-btn-hover-bg: #006bcf;'),

    # ---- 2. the editor-only bundle ---------------------------------------
    ('the editor code is back in core', J,
     "    function editorPreviewToast(title, detail) {",
     "    function welcomePackPayload() { return { sections: [], items: [] }; }\n"
     "    function wireWelcomePackEditor() {}\n"
     "    function exportGuide() {}\n"
     "    function importGuide() {}\n"
     "    function insertWelcomePack() {}\n"
     "    function editorPostId() { return 0; }\n"
     "    function editorPreviewToast(title, detail) {"),
    ('core registers the editor click listener again', J,
     "        wireGlobalArrowKeys();\n", "        wireGlobalArrowKeys();\n        wireWelcomePackEditor();\n"),
    ('the editor bundle is enqueued on the front end too', W,
     "        wp_enqueue_script('dccgg-widget');\n        // v0.24.5: the preview iframe",
     "        wp_enqueue_script('dccgg-widget');\n        wp_enqueue_script('dccgg-widget-editor');\n        // v0.24.5: the preview iframe"),
    ('the editor panel stops loading it', W,
     "        // v0.24.5: the panel's Welcome Pack / Export / Import buttons are\n"
     "        // handled here now, not in the core bundle.\n"
     "        wp_enqueue_script('dccgg-widget-editor');\n", ''),
    ('the preview iframe stops loading it', W,
     "        // v0.24.5: the preview iframe is exactly where the editor toast is\n"
     "        // meant to appear, so it loads the editor bundle as well.\n"
     "        wp_enqueue_script('dccgg-widget-editor');\n", ''),
    ('the toast hook is dropped, so core can never reach the real one', J,
     "        const fn = window.__dccggEditorToast;", "        const fn = null;"),
    ('the editor bundle never installs its toast', JE,
     'window.__dccggEditorToast = editorPreviewToast;', '/* removed */'),
    ('the Export / Import data is localized onto the wrong handle', W,
     "wp_localize_script('dccgg-widget-editor', 'dccggEditor', [",
     "wp_localize_script('dccgg-widget', 'dccggEditor', ["),
    ('isElementorEditorPreview is moved out of core, breaking the editor preview', J,
     "    function isElementorEditorPreview() {", "    function isElementorEditorPreviewMoved() {"),

    # ---- 3. the Front Desk form ------------------------------------------
    ('one label slips back to sentence case (control default)', W,
     "'str_report_name'     => [__('Report dialog \"Your name\" label', 'dcc-guest-guide'),  __('Your Name (Optional)', 'dcc-guest-guide')],",
     "'str_report_name'     => [__('Report dialog \"Your name\" label', 'dcc-guest-guide'),  __('Your name (optional)', 'dcc-guest-guide')],"),
    ('a label is Title Cased in the control but not in the fallback', W,
     "'cottage'    => (string) ($s['str_report_cottage'] ?? __('Which Cottage Are You Staying In?', 'dcc-guest-guide')),",
     "'cottage'    => (string) ($s['str_report_cottage'] ?? __('Which cottage are you staying in?', 'dcc-guest-guide')),"),
    ('the JS fallback label is left in sentence case', J,
     "STR.phone || 'Phone (Optional)'", "STR.phone || 'Phone (optional)'"),
    ('"(Optional)" loses its capital', W,
     "'str_report_phone'    => [__('Report dialog \"Phone\" label', 'dcc-guest-guide'),      __('Phone (Optional)', 'dcc-guest-guide')],",
     "'str_report_phone'    => [__('Report dialog \"Phone\" label', 'dcc-guest-guide'),      __('Phone (optional)', 'dcc-guest-guide')],"),
    ('opening the form focuses the Name field again', J,
     "                const target = head || desc;", "                const target = d.querySelector('.dccgg-report-name') || desc;"),
    ('the heading is not focusable, so focus falls to the field', J,
     '            const headAttrs = ` id="${headId}" tabindex="-1"`;',
     '            const headAttrs = ` id="${headId}"`;'),
    ('the heading is allowed to show a focus ring', C,
     """.dccgg-report-dialog.dccgg-report-dialog .dccgg-report-head h3:focus,
.dccgg-report-dialog.dccgg-report-dialog .dccgg-report-head h3:focus-visible {
    outline: none;
}""",
     """.dccgg-report-dialog.dccgg-report-dialog .dccgg-report-head h3:focus,
.dccgg-report-dialog.dccgg-report-dialog .dccgg-report-head h3:focus-visible {
    outline: 3px solid #111111;
}"""),
    ('the Voice Search mic loses its 44x44 tap area', C,
     '.dccgg-root .dccgg-search-mic::after,\n', '',
     {'also': ('.dccgg-stage .dccgg-search-mic::after {', '.dccgg-stage .dccgg-search-mic-x::after {')}),
    ('the mic is given position: relative, which drops it out of the search bar', C,
     '.dccgg-root .dccgg-copy--inline,\n.dccgg-stage .dccgg-item-check,',
     '.dccgg-root .dccgg-copy--inline,\n.dccgg-root .dccgg-search-mic,\n.dccgg-stage .dccgg-item-check,'),
]

EQUIVALENT = []
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
print(f"{len(MUTANTS)} mutants against site-blue.test.php + front-desk-form.ui.js\n")
for mut in MUTANTS:
    name, rel, old, new = mut[0], mut[1], mut[2], mut[3]
    extra = mut[4] if len(mut) > 4 else {}
    tmp = tempfile.mkdtemp(prefix='dccgg-245-')
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
