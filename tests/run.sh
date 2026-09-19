#!/usr/bin/env bash
# Run every harness — PHP and browser. Exits non-zero if any suite fails.
#
# These live in the REPOSITORY, not in a session scratchpad. On 2026-09-17 a
# container recycle deleted all 31 uncommitted harnesses at once, after they
# had been used to verify fourteen releases. Anything load-bearing gets
# committed.
#
# Browser suites need playwright-core (tests/browser/npm install). Chromium is
# provided by the environment at /opt/pw-browsers — do NOT run
# `playwright install`.
set -u
cd "$(dirname "$0")"
rc=0

run() {  # run <runner> <label> <path>
    printf '%-28s ' "$2"
    out=$("$1" "$3" 2>&1) || rc=1
    printf '%s\n' "$(printf '%s' "$out" | tail -1)"
    if printf '%s' "$out" | grep -q '^FAIL'; then
        printf '%s' "$out" | grep '^FAIL' | sed 's/^/    /'
        rc=1
    fi
}

for f in *-test.php; do run php "$f" "$f"; done

# tests/js/ runs in plain node — no browser, no dependencies. It was MISSING
# from this runner, so five suites passed only when run by hand and the
# aggregate reported green without them.
for f in js/*-test.js; do run node "$f" "$f"; done

if [ -d browser/node_modules ]; then
    for f in browser/*-test.js; do run node "$(basename "$f")" "$f"; done
else
    echo
    echo "browser suites SKIPPED — run: (cd browser && npm install)"
    rc=1
fi

echo
# A count, so a suite silently dropping out of the runner is visible.
found=$(ls *-test.php js/*-test.js browser/*-test.js 2>/dev/null | wc -l)
echo "suites on disk: $found"
echo "then: php mutate.php   # every assertion must be able to fail"
exit $rc
