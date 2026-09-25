#!/usr/bin/env bash
# Run every suite in this directory. Discovery-based: drop a file in and it runs.
#
#   test-*.php   PHP suites; no WordPress needed (tools/tests/wp-stubs.php).
#   ui-*.mjs     browser suites; need playwright-core + a local Chromium, and
#                SKIP loudly rather than passing when either is missing.
#
# The exit code of each suite is the result. A suite that crashes (255) is a
# failure, which a `grep FAIL` check would have missed — that mistake is why
# this script reads codes and nothing else.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$here"

php_bin="${PHP_BIN:-php}"
node_bin="${NODE_BIN:-node}"
only="${1:-}"

pass=0; fail=0; skipped=0; failed_suites=()

hr() { printf '\n\033[1m════ %s ════\033[0m\n' "$1"; }

run_suite() {
	local label="$1"; shift
	if [ -n "$only" ] && [[ "$label" != *"$only"* ]]; then return; fi
	hr "$label"
	"$@"
	local code=$?
	case "$code" in
		0)  pass=$((pass + 1)) ;;
		77) skipped=$((skipped + 1)); printf '  \033[33m(suite skipped)\033[0m\n' ;;
		*)  fail=$((fail + 1)); failed_suites+=("$label (exit $code)") ;;
	esac
}

# ---- lint gates, before anything asserts behaviour ----------------------
hr "lint: php -l over every plugin file"
lint_bad=0
while IFS= read -r -d '' f; do
	if ! out=$("$php_bin" -l "$f" 2>&1); then
		echo "  FAIL $f"; echo "$out" | sed 's/^/        /'; lint_bad=$((lint_bad + 1))
	fi
done < <(find "$here/../.." -name '*.php' -not -path '*/tools/*' -print0)
if [ "$lint_bad" -eq 0 ]; then echo "  ok   every plugin PHP file parses"; pass=$((pass + 1));
else fail=$((fail + 1)); failed_suites+=("php -l ($lint_bad files)"); fi

hr "lint: node --check over every plugin script"
js_bad=0
for f in "$here"/../../assets/js/*.js; do
	[ -e "$f" ] || continue
	if ! out=$("$node_bin" --check "$f" 2>&1); then
		echo "  FAIL $f"; echo "$out" | sed 's/^/        /'; js_bad=$((js_bad + 1))
	fi
done
if [ "$js_bad" -eq 0 ]; then echo "  ok   every plugin JS file parses"; pass=$((pass + 1));
else fail=$((fail + 1)); failed_suites+=("node --check ($js_bad files)"); fi

# ---- the suites --------------------------------------------------------
for f in test-*.php; do
	[ -e "$f" ] || continue
	run_suite "$f" "$php_bin" "$f"
done

for f in ui-*.mjs; do
	[ -e "$f" ] || continue
	run_suite "$f" "$node_bin" "$f"
done

# ---- every file here is either a suite or a known helper ---------------
hr "classification check"
unclassified=0
for f in *; do
	case "$f" in
		test-*.php|ui-*.mjs) ;;
		run-all.sh|lib.php|lib.mjs|wp-stubs.php|elementor-stubs.php|render-fixture.php) ;;
		README.md|.gitignore|fixtures|node_modules|package.json|package-lock.json) ;;
		*) echo "  unclassified: $f"; unclassified=$((unclassified + 1)) ;;
	esac
done
if [ "$unclassified" -eq 0 ]; then echo "  ok   every file is a suite or a known helper"; pass=$((pass + 1));
else fail=$((fail + 1)); failed_suites+=("unclassified files"); fi

hr "result"
printf '  %s suites passed, %s failed, %s skipped\n' "$pass" "$fail" "$skipped"
if [ "${#failed_suites[@]}" -gt 0 ]; then
	printf '\n  failures:\n'
	for s in "${failed_suites[@]}"; do printf '    - %s\n' "$s"; done
fi
[ "$fail" -eq 0 ]
