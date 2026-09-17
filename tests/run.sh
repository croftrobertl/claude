#!/usr/bin/env bash
# Run every PHP harness. No arguments; exits non-zero if any suite fails.
#
# These live in the REPOSITORY, not in a session scratchpad. On 2026-09-17 a
# container recycle deleted all 31 uncommitted harnesses at once, after they
# had been used to verify fourteen releases. Anything load-bearing gets
# committed.
set -u
cd "$(dirname "$0")"
rc=0
for f in *-test.php; do
    printf '%-28s ' "$f"
    out=$(php "$f" 2>&1) || rc=1
    printf '%s\n' "$(printf '%s' "$out" | tail -1)"
    if printf '%s' "$out" | grep -q '^FAIL'; then
        printf '%s\n' "$out" | grep '^FAIL' | sed 's/^/    /'
        rc=1
    fi
done
exit $rc
