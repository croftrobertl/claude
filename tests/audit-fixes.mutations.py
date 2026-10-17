#!/usr/bin/env python3
"""
Mutation run for the v0.24.3 audit fixes.

Breaks ONE guarantee at a time and runs both suites against the broken copy.
Every mutant must make at least one of them FAIL.

    python3 tests/audit-fixes.mutations.py
"""
import os, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(ROOT, 'dcc-guest-guide')
SUITES = [['php', os.path.join(ROOT, 'tests', 'report-hardening.test.php')],
          ['node', os.path.join(ROOT, 'tests', 'audit-fixes.ui.js')]]
P, J, C, S = 'includes/class-plugin.php', 'assets/js/widget.js', 'assets/css/widget.css', 'includes/class-settings.php'

MUTANTS = [
    # 1 — spam, dwell, cap
    ('the spam trap is ignored', P,
     "        if ($trap !== '') {\n            wp_send_json_success(['sent' => true]);\n        }", ''),
    ('the trap answers with an error, telling a script it was caught', P,
     "            wp_send_json_success(['sent' => true]);\n        }\n\n        // v0.24.3, dwell time.",
     "            wp_send_json_error(['message' => 'Spam.'], 400);\n        }\n\n        // v0.24.3, dwell time."),
    ('the dwell floor is dropped', P,
     'if ($elapsed >= 0 && $elapsed < self::REPORT_MIN_DWELL_MS) {', 'if (false) {'),
    ('the dwell floor is lowered to nothing', P, 'public const REPORT_MIN_DWELL_MS = 3000;', 'public const REPORT_MIN_DWELL_MS = 0;'),
    ('the site-wide daily cap is dropped', P,
     "        if ($daily_cap > 0 && $daily_count >= $daily_cap) {\n            wp_send_json_error([\n                'message' => __('We can",
     "        if (false) {\n            wp_send_json_error([\n                'message' => __('We can"),
    ('a guest at the cap is dropped silently instead of being told', P,
     "            wp_send_json_error([\n                'message' => __('We can\\'t send this just now. Please call or text the front desk and we\\'ll sort it out straight away.', 'dcc-guest-guide'),\n                'at_cap'  => true,\n            ], 429);",
     "            wp_send_json_success(['sent' => true]);"),
    ('the daily counter never moves, so the cap can never be reached', P,
     "        set_transient('dccgg_report_daily', $daily_count + 1, $ttl);", ''),
    # 2 — focus
    ('focus is tried once, before the section is laid out', J,
     "            if (!focusIntoPanel()) {\n                requestAnimationFrame(() => {\n                    if (!focusIntoPanel()) { setTimeout(focusIntoPanel, 160); }\n                });\n            }",
     "            focusIntoPanel();"),
    # 3 — tap area
    ('the read-aloud button loses its 44px tap area', C,
     '.dccgg-root .dccgg-item-tts::after,\n', '', {'also': ('.dccgg-stage .dccgg-item-tts::after,\n', '')}),
    # 4 — escaping
    ('values go into the email unescaped again', P,
     "        foreach ($tags as $tag => $value) {\n            if ($tag === '{report_text}' || $tag === '{page_url}') { continue; }\n            $tags[$tag] = esc_html((string) $value);\n        }", ''),
    ('the subject keeps its newlines', P,
     "        $subject = trim(preg_replace('/[\\r\\n\\t]+/', ' ', wp_strip_all_tags($subject)) ?? '');", ''),
    ('the subject is no longer capped', P,
     '        $subject = mb_substr($subject, 0, self::REPORT_SUBJECT_MAX);', ''),
    # 5 — visibility
    ('the report handler reads any post id again', P,
     "        $post = get_post($post_id);\n        if (!$post\n            || ($post->post_status !== 'publish' && !current_user_can('read_post', $post_id))\n            || post_password_required($post)) {\n            wp_send_json_error(['message' => 'Not found.'], 404);\n        }", ''),
    ('only the password check is dropped', P,
     "            || post_password_required($post)) {\n            wp_send_json_error(['message' => 'Not found.'], 404);\n        }\n\n        // v0.9.7.14: recipient list",
     "            ) {\n            wp_send_json_error(['message' => 'Not found.'], 404);\n        }\n\n        // v0.9.7.14: recipient list"),
    # 6 — dialog name
    ('the dialog loses its accessible name', J,
     "            dialog.setAttribute('aria-labelledby', headId);", ''),
    # 7 — reveal memory
    ('the packaged reveal window goes back to a week', S, "'default' => 48,", "'default' => 168,"),
    ('an already-stored reveal ignores the window in force', J,
     "        const win = memWindowMs(config);\n        if (win <= 0) return false;                      // session-only: the store handles it\n        const created = memCreatedAt(o);\n        return created > 0 && now > created + win;       // the window the host set TODAY",
     "        return false;"),
    ('a copy written before v0.24.3 can never be aged', J,
     "        if (o && typeof o.exp === 'number' && o.exp > 0) { return o.exp - LEGACY_WINDOW_MS; }", ''),
]

# EQUIVALENT, and recorded rather than dropped. The focus fix has two guards:
# it scopes the lookup to the open section, AND it rejects anything with no
# client rects. Removing EITHER one alone still lands focus on the open
# section's Back button, because only that section is visible — so neither can
# be killed on its own. Removing BOTH reproduces the original bug, which is
# what the "tried once, before the section is laid out" mutant above covers.
EQUIVALENT = [
    ('focus scoped to the whole stage instead of the open section',
     'the visibility guard alone still finds the open section first'),
    ('a hidden control counted as focusable again',
     'the scoping alone still finds the open section\'s own Back button'),
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
print(f"{len(MUTANTS)} mutants against report-hardening.test.php + audit-fixes.ui.js\n")
for mut in MUTANTS:
    name, rel, old, new = mut[0], mut[1], mut[2], mut[3]
    extra = mut[4] if len(mut) > 4 else {}
    tmp = tempfile.mkdtemp(prefix='dccgg-243-')
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
if EQUIVALENT:
    print(f"\n{len(EQUIVALENT)} mutant(s) NOT run — equivalent, not passing by default:")
    for name, why in EQUIVALENT:
        print(f"  · {name}\n      {why}")
sys.exit(1 if survivors else 0)
