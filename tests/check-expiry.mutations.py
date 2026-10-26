#!/usr/bin/env python3
"""
Mutation run for v0.25.2 — checklist ticks expire, matched to the stay.

Breaks ONE guarantee at a time and runs the suite against the broken copy.
Every mutant must make it FAIL. Both branches of the rule are covered.

    python3 tests/check-expiry.mutations.py
"""
import os, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(ROOT, 'dcc-guest-guide')
SUITES = [['node', os.path.join(ROOT, 'tests', 'check-expiry.ui.js')]]
J = 'assets/js/widget.js'

MUTANTS = [
    # ---- the no-stay branch: 48 hours after the last tick ----------------
    ('ticks never expire without a stay', J,
     "        const deadline = out ? endOfPropertyDay(nextISO(out))\n                             : (newest ? newest + CHECK_TTL_MS : 0);",
     "        const deadline = out ? endOfPropertyDay(nextISO(out)) : 0;"),
    ('the window shrinks to an hour', J,
     "    const CHECK_TTL_MS = 48 * 60 * 60 * 1000;",
     "    const CHECK_TTL_MS = 1 * 60 * 60 * 1000;"),
    ('the window stretches to a week', J,
     "    const CHECK_TTL_MS = 48 * 60 * 60 * 1000;",
     "    const CHECK_TTL_MS = 168 * 60 * 60 * 1000;"),
    ('the window runs from the OLDEST tick, not the newest', J,
     "            if (typeof t === 'number' && t > newest) newest = t;",
     "            if (typeof t === 'number' && (!newest || t < newest)) newest = t;"),

    # ---- the stay branch: end of the day AFTER checkout ------------------
    ('a stay with a checkout date falls back to 48 hours', J,
     "        const out = checkoutISO();", "        const out = '';"),
    ('ticks go at the end of CHECKOUT day, a day early', J,
     "        const deadline = out ? endOfPropertyDay(nextISO(out))",
     "        const deadline = out ? endOfPropertyDay(out)"),
    ('the checkout date is read only from ?stay=, never from ?out=', J,
     "            const direct = (p.get('out') || '').trim();\n            if (/^\\d{4}-\\d{2}-\\d{2}$/.test(direct)) return direct;",
     ""),
    ('a loose number in the stay is taken for a date', J,
     "            const m = (p.get('stay') || '').match(/(\\d{4}-\\d{2}-\\d{2})/);",
     "            const m = (p.get('stay') || '').match(/(\\d{4}-\\d{2})/);"),

    # ---- the property clock ----------------------------------------------
    ('the deadline is computed on the DEVICE clock, not the property one', J,
     "        const naive = Date.UTC(y, m - 1, d, 23, 59, 59, 999);\n        let ms = naive;\n        for (let i = 0; i < 2; i++) { ms = naive - tzOffsetMinutes(ms) * 60000; }\n        return ms;",
     "        return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();"),
    ('the property is put on the wrong coast', J,
     "    const PROPERTY_TZ  = 'America/New_York';",
     "    const PROPERTY_TZ  = 'America/Los_Angeles';"),

    # ---- the stored shape -------------------------------------------------
    ('a tick stores a bare true again, so it can never expire', J,
     "            if (next) { state[key] = { t: Date.now() }; }\n            else { delete state[key]; }",
     "            state[key] = next;"),
    ('unticking stores false instead of removing the entry', J,
     "            else { delete state[key]; }", "            else { state[key] = { t: Date.now() }; }"),
    ('a legacy entry is discarded instead of stamped', J,
     "            if (v === true) { state[k] = { t: nowMs }; changed = true; }",
     "            if (v === true) { delete state[k]; changed = true; continue; }"),
    ('a value of the wrong shape is trusted', J,
     "            else if (!v || typeof v !== 'object') { delete state[k]; changed = true; continue; }",
     ""),
    ('the pruned set is never written back', J,
     "        if (pruneChecks(state, Date.now())) saveChecks(widgetId, state);",
     "        pruneChecks(state, Date.now());"),
    ('pruning stops emptying an expired set', J,
     "            for (const k of Object.keys(state)) delete state[k];\n            return true;",
     "            return false;"),
    ('the sheet stops pruning on read altogether', J,
     "        if (pruneChecks(state, Date.now())) saveChecks(widgetId, state);", ""),
]

EQUIVALENT = [
    ('the second offset pass removed from endOfPropertyDay',
     "measured over 2025-2030, one pass and two agree on all 2016 days checked, "
     "both DST transitions among them: the naive instant (23:59 UTC of day D) "
     "and the corrected one (~05:00 UTC of D+1) are always the same side of a "
     "US transition, which happens at 07:00 UTC. The second pass is insurance "
     "for a future caller asking for a different hour — a start-of-day or an "
     "11:00 checkout would straddle it — so it stays, and this is recorded "
     "rather than dressed up as a kill."),
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
print(f"{len(MUTANTS)} mutants against check-expiry.ui.js\n")
for mut in MUTANTS:
    name, rel, old, new = mut[0], mut[1], mut[2], mut[3]
    extra = mut[4] if len(mut) > 4 else {}
    tmp = tempfile.mkdtemp(prefix='dccgg-252-')
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
