#!/usr/bin/env python3
"""
Mutation runner for the DCC Custom Checkout suites.

    python3 tests/mutate/run.py            # every mutation
    python3 tests/mutate/run.py breakdown  # only mutations naming that suite

Applies one textual mutation to a source file, runs the suites that claim to
cover it, and records whether they noticed.

  KILLED    a suite went red -- the claim is tested.
  SURVIVED  every suite stayed green -- the claim is prose.
  STALE     the mutation did not apply, or applied a different number of times
            than declared. NOT a pass. The mutation is wrong, not the suite.

STALE is reported as loudly as SURVIVED on purpose: a mutation that never
landed proves nothing, and counting it as "killed" is how a mutation run
flatters itself.
"""
import json, os, subprocess, sys, shutil, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

SUITES = {
    'breakdown':    ('node', 'tests/breakdown/run.js'),
    'button':       ('node', 'tests/button/run.js'),
    'fields':       ('node', 'tests/fields/run.js'),
    'footnote':     ('node', 'tests/footnote/run.js'),
    'admin-guests': ('php',  'tests/admin-guests/run.php'),
    'copy':         ('php',  'tests/copy/run.php'),
    'id-files':     ('php',  'tests/id-files/run.php'),
    'pricing':      ('php',  'tests/pricing/run.php'),
    'backstops':    ('php',  'tests/backstops/run.php'),
}

def run_suite(name):
    cmd, script = SUITES[name]
    p = subprocess.run([cmd, script], cwd=ROOT, capture_output=True, text=True, timeout=300)
    return p.returncode == 0, (p.stdout + p.stderr)

def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    muts = json.load(open(os.path.join(ROOT, 'tests/mutate/mutations.json')))
    if only:
        muts = [m for m in muts if only in m['suites'] or only == m['id']]

    results = []
    for m in muts:
        path = os.path.join(ROOT, m['file'])
        original = open(path, encoding='utf-8').read()
        want = m.get('count', 1)
        found = original.count(m['find'])
        if found != want:
            results.append((m['id'], 'STALE', f"pattern found {found}x, declared {want}x", ''))
            continue
        mutated = original.replace(m['find'], m['replace'])
        if mutated == original:
            results.append((m['id'], 'STALE', 'replacement is identical to the original', ''))
            continue
        try:
            open(path, 'w', encoding='utf-8').write(mutated)
            noticed_by, quiet = [], []
            for s in m['suites']:
                ok, out = run_suite(s)
                (quiet if ok else noticed_by).append(s)
            verdict = 'KILLED' if noticed_by else 'SURVIVED'
            results.append((m['id'], verdict, m['claim'], ','.join(noticed_by) or '-'))
        finally:
            open(path, 'w', encoding='utf-8').write(original)
        print(f"  {results[-1][1]:9s} {m['id']}", flush=True)

    print('\n' + '=' * 78)
    for ident, verdict, note, by in results:
        print(f"{verdict:9s} {ident:42s} {by}")
        if verdict != 'KILLED':
            print(f"          {note}")
    k = sum(1 for r in results if r[1] == 'KILLED')
    s = sum(1 for r in results if r[1] == 'SURVIVED')
    t = sum(1 for r in results if r[1] == 'STALE')
    print('=' * 78)
    print(f"{len(results)} mutations: {k} killed, {s} SURVIVED, {t} STALE")
    return 0

if __name__ == '__main__':
    sys.exit(main())
