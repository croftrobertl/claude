#!/usr/bin/env bash
# DCC Guest Guide — produce minified JS + CSS bundles next to the
# unminified sources. Run at release time before zipping the plugin.
#
# Requires `npx` on PATH (Node 16+). Uses terser for JS and a tiny
# regex-based CSS minifier for the stylesheet (no Node toolchain on
# the deploy host — we ship pre-built `.min` files in the zip).
set -euo pipefail

cd "$(dirname "$0")"

SRC_JS="dcc-guest-guide/assets/js/widget.js"
OUT_JS="dcc-guest-guide/assets/js/widget.min.js"
SRC_CSS="dcc-guest-guide/assets/css/widget.css"
OUT_CSS="dcc-guest-guide/assets/css/widget.min.css"

if [ ! -f "$SRC_JS" ] || [ ! -f "$SRC_CSS" ]; then
    echo "build-min.sh: source files missing" >&2
    exit 1
fi

echo "Minifying $SRC_JS ..."
npx --yes terser "$SRC_JS" \
    --compress "passes=2,drop_console=false" \
    --mangle \
    --output "$OUT_JS" 2>&1 | grep -v "^npm " || true

echo "Minifying $SRC_CSS ..."
python3 - "$SRC_CSS" "$OUT_CSS" <<'PY'
import re, sys
src = open(sys.argv[1]).read()
# Strip block comments.
src = re.sub(r'/\*[\s\S]*?\*/', '', src)
# Collapse whitespace around CSS metacharacters.
src = re.sub(r'\s+', ' ', src)
src = re.sub(r'\s*([{};:,>+~])\s*', r'\1', src)
# Remove trailing semicolons before close-brace.
src = src.replace(';}', '}')
# Strip leading whitespace.
src = src.strip()
open(sys.argv[2], 'w').write(src)
PY

echo "Sizes:"
ls -la "$SRC_JS" "$OUT_JS" "$SRC_CSS" "$OUT_CSS"
