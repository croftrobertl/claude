#!/usr/bin/env python3
"""
Mutation run for v0.25.0 — the guest bundle, the per-element chunks, alignment.

Breaks ONE guarantee at a time and runs both suites against the broken copy.
Every mutant must make at least one of them FAIL.

    python3 tests/bundle-split.mutations.py
"""
import os, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(ROOT, 'dcc-guest-guide')
SUITES = [['php', os.path.join(ROOT, 'tests', 'bundle-split.test.php')],
          ['node', os.path.join(ROOT, 'tests', 'bundle-split.ui.js')]]
J, G, W, P, C = ('assets/js/widget.js', 'assets/js/widget-guest.js',
                 'includes/class-widget.php', 'includes/class-plugin.php',
                 'assets/css/widget.css')
VID = 'assets/js/widget-video.js'

MUTANTS = [
    # ---- the guest bundle reaches the public page ------------------------
    ('the guest bundle is enqueued for everyone, public page included', W,
     """        if (self::is_public_mode($s)) {
            self::apply_public_mode($s);
        } else {
            self::enqueue_guest_css();
            self::enqueue_guest_js();
        }""",
     """        self::enqueue_guest_js();
        if (self::is_public_mode($s)) {
            self::apply_public_mode($s);
        } else {
            self::enqueue_guest_css();
        }"""),
    ('the guest script is gated on split_guest_css, so turning that off kills the form', W,
     "    public static function enqueue_guest_js(): void\n    {\n        if (wp_script_is(",
     "    public static function enqueue_guest_js(): void\n    {\n        if (!Settings::get('split_guest_css')) { return; }\n        if (wp_script_is("),
    ('render() stops asking for the guest script', W,
     "            self::enqueue_guest_css();\n            self::enqueue_guest_js();\n        }",
     "            self::enqueue_guest_css();\n        }"),

    # ---- the DCCGG_GUEST guard ------------------------------------------
    ('applyGuest drops its guard and calls into a bundle that may not be there', J,
     "        const G = window.DCCGG_GUEST;\n        if (!G || root.__dccggGuestWired) return;",
     "        const G = window.DCCGG_GUEST || {};\n        if (root.__dccggGuestWired) return;"),
    ('the search miss call loses its guard', J,
     "        if (window.DCCGG_GUEST) window.DCCGG_GUEST.reportSearchMiss(root, config, query);",
     "        window.DCCGG_GUEST.reportSearchMiss(root, config, query);"),
    ('the AI call loses its guard', J,
     "                    if (window.DCCGG_GUEST) window.DCCGG_GUEST.askAi(root, config, query, wrap);",
     "                    window.DCCGG_GUEST.askAi(root, config, query, wrap);"),
    ('a root can be wired twice, so one press sends two reports', J,
     "        if (!G || root.__dccggGuestWired) return;\n        root.__dccggGuestWired = true;",
     "        if (!G) return;"),

    # ---- the contract ----------------------------------------------------
    ('the guest bundle gives up when it loads first', G,
     "    if (window.DCCGG_CORE) { boot(window.DCCGG_CORE); }\n    else { window.__dccggGuestBoot = boot; }",
     "    if (window.DCCGG_CORE) { boot(window.DCCGG_CORE); }"),
    ('core never starts a bundle that was waiting for it', J,
     "    if (typeof window.__dccggGuestBoot === 'function') {",
     "    if (false) {"),
    ('core stops publishing the helper the form needs', J,
     "        dccggFetch,\n        escAttr,", "        escAttr,"),
    ('the bundle never announces itself', G,
     "        window.DCCGG_GUEST = {\n            wireReportProblem,", "        window.DCCGG_GUEST_X = {\n            wireReportProblem,"),

    # ---- the chunks ------------------------------------------------------
    ('a chunk is fetched on a tap instead of at init', J,
     """    function applyChunks(root, config) {
        const done = root.__dccggChunks || (root.__dccggChunks = {});
        Object.keys(CHUNKS).forEach((name) => {
            if (done[name] || !root.querySelector(CHUNKS[name])) return;""",
     """    function applyChunks(root, config) {
        const done = root.__dccggChunks || (root.__dccggChunks = {});
        document.addEventListener('click', () => applyChunksNow(root, config), { once: true });
    }
    function applyChunksNow(root, config) {
        const done = root.__dccggChunks || (root.__dccggChunks = {});
        Object.keys(CHUNKS).forEach((name) => {
            if (done[name] || !root.querySelector(CHUNKS[name])) return;"""),
    ('chunks are loaded regardless of whether the page has the element', J,
     "            if (done[name] || !root.querySelector(CHUNKS[name])) return;",
     "            if (done[name]) return;"),
    ('the video chunk stops registering its wiring', VID,
     "(window.DCCGG_CHUNK = window.DCCGG_CHUNK || {})['video']",
     "(window.DCCGG_CHUNK = window.DCCGG_CHUNK || {})['video_x']"),
    ('the gallery chunk forgets the plain-image lightbox trigger', J,
     "        gallery:    '.dccgg-gallery-thumb, img.dccgg-media',",
     "        gallery:    '.dccgg-gallery-thumb',"),
    ('the conditions chunk is left in core as well as split out', J,
     "    const CHUNKS = {\n        conditions: '.dccgg-conditions',",
     "    function wireConditions() {}\n    const CHUNKS = {\n        conditions: '.dccgg-conditions',"),
    ('a failed chunk is swallowed silently', J,
     "                done[name] = false;\n                if (window.console) console.warn(String(err && err.message || err));",
     "                done[name] = true;"),
    ('the worker stops precaching the chunks', P,
     "        foreach (['conditions', 'gallery', 'wizard', 'video'] as $name) {",
     "        foreach ([] as $name) {"),
    ('the worker stops precaching the guest script', P,
     "        $gjs = DCCGG_URL . (file_exists(DCCGG_DIR . 'assets/js/widget-guest.min.js')\n            ? 'assets/js/widget-guest.min.js' : 'assets/js/widget-guest.js') . '?ver=' . $ver;",
     "        $gjs = '';"),
    ('core is told the wrong place to fetch a chunk from', W,
     "            'base' => DCCGG_URL . 'assets/js/',", "            'base' => '',"),

    # ---- Rob's alignment rule -------------------------------------------
    ('the note is left-aligned whatever it says', G,
     "dccgg-report-privacy${isMulti(STR.privacy) ? ' dccgg-multi' : ''}",
     "dccgg-report-privacy dccgg-multi"),
    ('the note is never left-aligned', G,
     "dccgg-report-privacy${isMulti(STR.privacy) ? ' dccgg-multi' : ''}",
     "dccgg-report-privacy"),
    ('the rule fires on any full stop, not on a sentence BREAK', G,
     "const isMulti = (text) => /[.!?][\"\\u201D']?\\s+\\S/.test(String(text == null ? '' : text));",
     "const isMulti = (text) => /[.!?]/.test(String(text == null ? '' : text));"),
    ('the stylesheet stops left-aligning a multi-sentence note', C,
     ".dccgg-report-dialog.dccgg-report-dialog .dccgg-multi { text-align: left; }",
     ".dccgg-report-dialog.dccgg-report-dialog .dccgg-multi { text-align: center; }"),
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
print(f"{len(MUTANTS)} mutants against bundle-split.test.php + bundle-split.ui.js\n")
for mut in MUTANTS:
    name, rel, old, new = mut[0], mut[1], mut[2], mut[3]
    extra = mut[4] if len(mut) > 4 else {}
    tmp = tempfile.mkdtemp(prefix='dccgg-250-')
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
