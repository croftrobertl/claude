#!/usr/bin/env python3
"""
Mutation runner for the DCC Custom Checkout suites.

    python3 tests/mutate/run.py            # every mutation
    python3 tests/mutate/run.py breakdown  # only mutations naming that suite
    python3 tests/mutate/run.py css-banner-border      # one, by id
    python3 tests/mutate/run.py --preflight             # baseline only, no mutations

AN EXIT CODE IS NOT A TEST RESULT.
=================================

The first version of this file decided a suite had "noticed" a mutation with

    return p.returncode == 0, ...

which makes a crash, a syntax error, a missing dependency and a genuine
assertion failure indistinguishable. Measured on 2026-09-19: with
tests/footnote/node_modules moved aside, `css-footnote-width-pair` was reported
KILLED by a suite that never executed one assertion. The Calendar's runner had
the same fault with a different trigger (nine mutations "caught" by suites whose
paths did not resolve), and this one had already been seen here four days
earlier -- "both suites crashed on require('playwright'); I nearly read the tail
of that output as a pass" -- and only its trigger was fixed.

So a suite's outcome is now read from what it PRINTED, and the two failure modes
that are not results have names of their own:

    PASS      exit 0, at least one PASS line, no FAIL line.
    FAIL      at least one FAIL line. This is the only thing that kills.
    NO RUN    it produced no verdict: no PASS and no FAIL lines, or it exited
              non-zero without a single FAIL line (a crash, possibly part-way
              through). NOT red.
    NO SUITE  the script is not on disk, or the mutation names a suite this
              runner does not know. NOT red.

A mutation whose suites report NO RUN or NO SUITE is HARNESS, never KILLED, and
the process exits non-zero however the other mutations went -- a broken harness
is not evidence about the code.

BASELINE PREFLIGHT. Every suite is run once, unmutated, before any source file
is touched. If one is not green, every mutation after it would look killed, so
the run stops there. The preflight also prints the suite files found on disk
beside the suites this runner will execute, so a suite that exists but is not
wired up (or vice versa) is visible rather than silently skipped.
"""
import glob
import json
import os
import subprocess
import sys

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

PASS, FAIL, NO_RUN, NO_SUITE = 'PASS', 'FAIL', 'NO RUN', 'NO SUITE'

# Syntax checkers per file type. A mutation that makes the file unparseable is
# not a mutation -- it is a broken build, and every suite that loads the file
# will crash. The old runner read that crash as a kill: js-form-ceiling-ALL
# left checkout.js with unbalanced braces and was reported KILLED for five
# days, so the claim it was meant to isolate ("a service row can never be the
# form") had no evidence behind it at all.
SYNTAX = {'.js': ['node', '--check'], '.php': ['php', '-l']}


def parses(path):
    """Return (ok, message) for the file as it currently stands on disk."""
    ext = os.path.splitext(path)[1]
    if ext not in SYNTAX:
        return True, ''
    p = subprocess.run(SYNTAX[ext] + [path], capture_output=True, text=True)
    if p.returncode == 0:
        return True, ''
    first = (p.stdout + p.stderr).strip().splitlines()
    return False, first[0][:120] if first else f'exit {p.returncode}'


def run_suite(name):
    """Return (outcome, detail). Outcome is one of the four constants above."""
    if name not in SUITES:
        return NO_SUITE, f'no such suite in this runner: {name!r}'
    cmd, script = SUITES[name]
    path = os.path.join(ROOT, script)
    if not os.path.isfile(path):
        return NO_SUITE, f'{script} is not on disk'
    try:
        p = subprocess.run([cmd, script], cwd=ROOT,
                           capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        return NO_RUN, 'timed out after 300s'
    out = p.stdout + p.stderr
    passes = sum(1 for ln in out.splitlines() if ln.startswith('PASS'))
    fails = sum(1 for ln in out.splitlines() if ln.startswith('FAIL'))
    if fails:
        return FAIL, f'{fails} failing assertion(s)'
    if not passes:
        return NO_RUN, f'no PASS or FAIL line printed (exit {p.returncode}); ' \
                       f'last output: {out.strip().splitlines()[-1][:80] if out.strip() else "(none)"}'
    if p.returncode != 0:
        return NO_RUN, f'exit {p.returncode} with {passes} passes and no FAIL ' \
                       f'line -- crashed part-way, not a verdict'
    return PASS, f'{passes} passing'


def preflight():
    """Every suite green, unmutated, before anything is touched."""
    print('Suite files on disk:')
    on_disk = sorted(glob.glob(os.path.join(ROOT, 'tests/*/run.js')) +
                     glob.glob(os.path.join(ROOT, 'tests/*/run.php')))
    wired = {os.path.join(ROOT, s) for _, s in SUITES.values()}
    for f in on_disk:
        rel = os.path.relpath(f, ROOT)
        print(f'  {rel:34s} {"wired up" if f in wired else "*** NOT WIRED INTO THIS RUNNER ***"}')
    missing = [s for _, s in SUITES.values() if os.path.join(ROOT, s) not in set(on_disk)]
    for s in missing:
        print(f'  {s:34s} *** WIRED UP BUT NOT ON DISK ***')

    print('\nBaseline (unmutated):')
    bad = []
    for name in SUITES:
        outcome, detail = run_suite(name)
        print(f'  {outcome:8s} {name:14s} {detail}')
        if outcome != PASS:
            bad.append(name)
    if bad:
        print(f'\nBASELINE NOT GREEN: {", ".join(bad)}')
        print('Every mutation would look killed. Fix the harness first.')
    return not bad


def main():
    args = [a for a in sys.argv[1:]]
    only = None
    for a in args:
        if a != '--preflight':
            only = a

    if not preflight():
        return 2
    if '--preflight' in args:
        return 0

    muts = json.load(open(os.path.join(ROOT, 'tests/mutate/mutations.json')))
    if only:
        muts = [m for m in muts if only in m['suites'] or only == m['id']]
        if not muts:
            print(f'\nno mutation matches {only!r}')
            return 2

    print(f'\nApplying {len(muts)} mutation(s):')
    results = []
    for m in muts:
        path = os.path.join(ROOT, m['file'])
        if not os.path.isfile(path):
            results.append((m['id'], 'STALE', f"{m['file']} is not on disk", ''))
            print(f'  {"STALE":9s} {m["id"]}', flush=True)
            continue
        original = open(path, encoding='utf-8').read()
        want = m.get('count', 1)
        found = original.count(m['find'])
        if found != want:
            results.append((m['id'], 'STALE',
                            f'pattern found {found}x, declared {want}x', ''))
            print(f'  {"STALE":9s} {m["id"]}', flush=True)
            continue
        mutated = original.replace(m['find'], m['replace'])
        if mutated == original:
            results.append((m['id'], 'STALE',
                            'replacement is identical to the original', ''))
            print(f'  {"STALE":9s} {m["id"]}', flush=True)
            continue
        try:
            open(path, 'w', encoding='utf-8').write(mutated)
            ok, why = parses(path)
            if not ok:
                results.append((m['id'], 'INVALID',
                                f'the mutated file does not parse: {why}', ''))
                print(f'  {"INVALID":9s} {m["id"]}', flush=True)
                continue
            per = {}
            for s in m['suites']:
                per[s] = run_suite(s)
            broken = [s for s, (o, _) in per.items() if o in (NO_RUN, NO_SUITE)]
            killers = [s for s, (o, _) in per.items() if o == FAIL]
            if broken:
                verdict = 'HARNESS'
                note = '; '.join(f'{s}: {per[s][0]} -- {per[s][1]}' for s in broken)
                by = ','.join(broken)
            elif killers:
                verdict, note, by = 'KILLED', m['claim'], ','.join(killers)
            else:
                verdict, note, by = 'SURVIVED', m['claim'], '-'
            results.append((m['id'], verdict, note, by))
        finally:
            open(path, 'w', encoding='utf-8').write(original)
            if open(path, encoding='utf-8').read() != original:
                print(f'  !!! {m["file"]} was NOT restored cleanly', flush=True)
        print(f'  {results[-1][1]:9s} {m["id"]}', flush=True)

    print('\n' + '=' * 78)
    for ident, verdict, note, by in results:
        print(f'{verdict:9s} {ident:42s} {by}')
        if verdict != 'KILLED':
            print(f'          {note}')
    tally = {v: sum(1 for r in results if r[1] == v) for v in
             ('KILLED', 'SURVIVED', 'STALE', 'HARNESS', 'INVALID')}
    print('=' * 78)
    print(f"{len(results)} mutations: {tally['KILLED']} killed, "
          f"{tally['SURVIVED']} SURVIVED, {tally['STALE']} STALE, "
          f"{tally['HARNESS']} HARNESS, {tally['INVALID']} INVALID")
    if tally['HARNESS']:
        print('\nHARNESS means a suite did not run. Those mutations are not '
              'evidence either way.')
    if tally['INVALID']:
        print('\nINVALID means the mutated source does not parse. The mutation '
              'is wrong, and it proves nothing about the suite.')
    return 0 if all(tally[v] == 0 for v in
                    ('SURVIVED', 'STALE', 'HARNESS', 'INVALID')) else 1


if __name__ == '__main__':
    sys.exit(main())
