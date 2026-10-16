#!/usr/bin/env python3
"""
Mutation run for the v0.24.0 Front Desk button.

Copies the plugin, breaks ONE guarantee at a time, rebuilds the minified
bundles so the browser test sees the break, and runs both suites against the
broken copy. Every mutant must make at least one of them FAIL; a survivor is a
guarantee nothing is actually guarding.

    python3 tests/front-desk.mutations.py
"""
import os, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(ROOT, 'dcc-guest-guide')
PHP_TEST = os.path.join(ROOT, 'tests', 'front-desk.test.php')
UI_TEST = os.path.join(ROOT, 'tests', 'front-desk.ui.js')
W, J, C = 'includes/class-widget.php', 'assets/js/widget.js', 'assets/css/widget.css'

MUTANTS = [
    ('a single item falls back to the popover', W,
     "        if (count($items) === 1) {", "        if (false) {"),
    ('the section key is dropped from Report', W,
     '<?php if ($only === \'report\') : ?>data-report-section="<?php echo esc_attr($section_key); ?>"<?php endif; ?>',
     '<?php if ($only === \'report\') : ?>data-report-section=""<?php endif; ?>'),
    ('the action class is dropped, so the handler never fires', W,
     'dccgg-more--direct <?php echo esc_attr($face_class); ?> <?php echo esc_attr($action_class); ?>',
     'dccgg-more--direct <?php echo esc_attr($face_class); ?>'),
    ('the accessible name drifts from the visible label', W,
     "        $needs_aria = !$round || $label_text === '';",
     "        $needs_aria = true;"),
    ('the emoji is exposed to screen readers instead of hidden', W,
     '<span class="dccgg-fd-icon" aria-hidden="true">',
     '<span class="dccgg-fd-icon">'),
    ('a guide saved before the label control existed loses its label', W,
     "$label_text     = trim((string) ($s['more_button_label'] ?? self::MORE_BUTTON_LABEL));",
     "$label_text     = trim((string) ($s['more_button_label'] ?? ''));"),
    ('the slot defaults go back to print/save_pdf/report', W,
     "public const MORE_SLOT_DEFAULTS = ['report', 'none', 'none'];",
     "public const MORE_SLOT_DEFAULTS = ['print', 'save_pdf', 'report'];"),
    ('the label is allowed to wrap', C, 'white-space: nowrap;\n    color: var(--dccgg-text, #111);',
     'white-space: normal;\n    color: var(--dccgg-text, #111);'),
    ('the label turns white on hover, like a filled button', C,
     '.dccgg-stage.dccgg-stage .dccgg-more-summary--fd:focus-visible .dccgg-fd-label {\n    color: var(--dccgg-text, #111);',
     '.dccgg-stage.dccgg-stage .dccgg-more-summary--fd:focus-visible .dccgg-fd-label {\n    color: #fff;'),
    ('the theme reset drops to a specificity the kit beats', C,
     # anchored on the base rule's first declaration: v0.24.1 added a second
     # rule that opens with the same two selectors.
     '.dccgg-root.dccgg-root .dccgg-more--fd.dccgg-more--fd,\n.dccgg-root.dccgg-root .dccgg-more-summary--fd.dccgg-more-summary--fd,\n.dccgg-stage.dccgg-stage .dccgg-more--fd.dccgg-more--fd,\n.dccgg-stage.dccgg-stage .dccgg-more-summary--fd.dccgg-more-summary--fd {\n    display: inline-flex;',
     '.dccgg-root .dccgg-more--fd,\n.dccgg-root .dccgg-more-summary--fd,\n.dccgg-stage .dccgg-more--fd,\n.dccgg-stage .dccgg-more-summary--fd {\n    display: inline-flex;'),
    ('the emoji font stack is dropped', C,
     'font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;\n    font-size: 24px;',
     'font-family: inherit;\n    font-size: 24px;'),
    ('the label inherits html{font-weight:700} instead of stating 700', C,
     'font-size: 12px;\n    font-weight: 700;\n    line-height: 1.2;', 'font-size: 12px;\n    line-height: 1.2;'),
    ('the circle shrinks below the 48px target', C, 'width: 48px;\n    height: 48px;', 'width: 32px;\n    height: 32px;'),
    ('the pressed fill is dropped, so a touch guest gets no feedback', C,
     '.dccgg-root.dccgg-root .dccgg-more--fd:active .dccgg-fd-icon,',
     '.dccgg-root.dccgg-root .dccgg-more--fd.never:active .dccgg-fd-icon,'),
    ('the focus ring is removed', C,
     'outline: 3px solid var(--dccgg-primary, #006BCF);\n    outline-offset: 2px;', 'outline: none;\n    outline-offset: 2px;'),
    ('the print-hide is lost by renaming the wrapper class', W,
     'class="dccgg-more <?php echo esc_attr($modifier); ?> dccgg-more--direct',
     'class="dccgg-frontdesk <?php echo esc_attr($modifier); ?> dccgg-more--direct'),
    ('focus never returns to the button that was tapped', J,
     "            d.__dccggOpener = opener || document.activeElement;", "            d.__dccggOpener = null;"),
    ('the direct button loses its Print branch', J,
     "const btn = e.target.closest('.dccgg-more--direct.dccgg-more-print');",
     "const btn = e.target.closest('.dccgg-more--direct.dccgg-more-nothing');"),
]

def run(cmd, plugin_dir):
    env = dict(os.environ, DCCGG_PLUGIN_DIR=plugin_dir, DCCGG_UI_SOURCE='1',
               NODE_PATH=os.path.join(ROOT, 'node_modules'))
    return subprocess.run(cmd, env=env, capture_output=True, text=True, cwd=ROOT)

def suites(plugin_dir):
    out = []
    for cmd in (['php', PHP_TEST], ['node', UI_TEST]):
        r = run(cmd, plugin_dir)
        failed = [l.strip()[2:] for l in r.stdout.splitlines() if l.strip().startswith('✗')]
        out.append((os.path.basename(cmd[1]), r.returncode, failed, 'Fatal' in r.stdout + r.stderr or 'Error' in r.stderr))
    return out

base = suites(PLUGIN)
if any(rc != 0 for _, rc, _, _ in base):
    print('The unmutated plugin fails its own suites; fix that first.')
    for n, rc, f, _ in base: print(' ', n, rc, f[:3])
    sys.exit(2)

survivors = 0
print(f"{len(MUTANTS)} mutants against front-desk.test.php + front-desk.ui.js\n")
for name, rel, old, new in MUTANTS:
    tmp = tempfile.mkdtemp(prefix='dccgg-fd-')
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
        # Both suites run against the mutated SOURCES (DCCGG_UI_SOURCE=1), so
        # no minified rebuild is needed — and a mutant is never masked by a
        # stale bundle, which is what made twelve of them "survive" at first.
        res = suites(dst)
        killers = [(n, fl) for n, rc, fl, _ in res if rc != 0]
        if killers:
            n, fl = killers[0]
            why = fl[0] if fl else 'non-zero exit'
            extra = sum(len(x[1]) for x in killers) - 1
            print(f"  ✓ killed  {name}\n             by {n}: {why}" + (f"  (+{extra} more)" if extra > 0 else ''))
        else:
            survivors += 1
            print(f"  ✗ SURVIVED  {name}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
print(f"\n{len(MUTANTS) - survivors} killed, {survivors} survived")
sys.exit(1 if survivors else 0)
