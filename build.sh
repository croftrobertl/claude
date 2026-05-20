#!/usr/bin/env bash
# Build the installable plugin zip.
# Usage: ./build.sh [output-path]
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

OUT="${1:-$ROOT/mphb-availability-calendar.zip}"
rm -f "$OUT"
zip -r "$OUT" mphb-availability-calendar
echo "Built: $OUT"
