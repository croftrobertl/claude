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
# v0.22.0: the public mini guide renders none of the Request Support form, the
# review prompt, the ⋯ menu, the emergency strip or AI search — public mode
# switches all five off — so their CSS is split into a second bundle that only
# the full guide loads. Authoring stays in ONE file; the split happens here.
OUT_CSS_GUEST="dcc-guest-guide/assets/css/widget-guest.min.css"

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
python3 - "$SRC_CSS" "$OUT_CSS" "$OUT_CSS_GUEST" <<'PY'
import re, sys
src = open(sys.argv[1]).read()

# ---- audience split -------------------------------------------------------
# Comments are stripped BEFORE anything counts braces: several comments here
# quote a CSS rule, and a brace inside a comment derails the counter, which
# silently mis-assigns whole blocks.
src = re.sub(r'/\*[\s\S]*?\*/', '', src)

GUEST = re.compile(r'\.dccgg-(report|review|ai-|sos|emergency|more|btn-send|btn-cancel)[-a-z]*')
NESTED = re.compile(r'^@(media|supports|layer|container)\b', re.I)

def split_top(css):
    i, n, parts = 0, len(css), []
    while i < n:
        b = css.find('{', i)
        if b == -1:
            parts.append(('raw', css[i:])); break
        depth, j = 1, b + 1
        while j < n and depth:
            if css[j] == '{': depth += 1
            elif css[j] == '}': depth -= 1
            j += 1
        parts.append(('rule', css[i:j]))
        i = j
    return parts

def split_selectors(prelude):
    """Top-level commas only: :is(a, b) is ONE selector."""
    out, buf, depth = [], '', 0
    for ch in prelude:
        if ch == '(': depth += 1
        elif ch == ')': depth -= 1
        if ch == ',' and depth == 0:
            if buf.strip(): out.append(buf.strip())
            buf = ''
        else:
            buf += ch
    if buf.strip(): out.append(buf.strip())
    return out

def partition(css):
    """(core, guest) for one nesting level."""
    core, guest = [], []
    for kind, chunk in split_top(css):
        if kind == 'raw':
            core.append(chunk); continue
        prelude, body = chunk.split('{', 1)
        body = body.rsplit('}', 1)[0]
        if prelude.lstrip().startswith('@'):
            if NESTED.match(prelude.strip()):
                # An at-rule usually holds rules for both audiences, so the
                # wrapper is reproduced in whichever bundle has rules for it.
                inner_core, inner_guest = partition(body)
                if inner_core.strip(): core.append(prelude + '{' + inner_core + '}')
                if inner_guest.strip(): guest.append(prelude + '{' + inner_guest + '}')
            else:
                core.append(chunk)   # @font-face / @keyframes: not audience-specific
            continue
        # A selector LIST is split per selector. Moving a whole rule because one
        # of its selectors is guest-only would strip the public guide of styling
        # it needs — that is exactly how the first attempt at this broke.
        mine = [x for x in split_selectors(prelude) if not GUEST.search(x)]
        theirs = [x for x in split_selectors(prelude) if GUEST.search(x)]
        if mine:   core.append(',\n'.join(mine) + '{' + body + '}')
        if theirs: guest.append(',\n'.join(theirs) + '{' + body + '}')
    return ''.join(core), ''.join(guest)

src, guest_src = partition(src)

def minify(t):
    t = re.sub(r'/\*[\s\S]*?\*/', '', t)
    t = re.sub(r'\s+', ' ', t)
    t = re.sub(r'\s*([{};,>+~])\s*', r'\1', t)
    t = re.sub(r':\s+', ':', t)
    return t.replace(';}', '}').strip()
# Strip block comments.
src = re.sub(r'/\*[\s\S]*?\*/', '', src)
# Collapse whitespace around CSS metacharacters.
src = re.sub(r'\s+', ' ', src)
src = re.sub(r'\s*([{};,>+~])\s*', r'\1', src)
# The colon is NOT in the set above, deliberately. A space BEFORE a colon is
# a descendant combinator when a pseudo follows it: `.a .b :is(x)` means "an
# x inside .b", while `.a .b:is(x)` means ".b which is also x" — a different
# selector that silently matches nothing. Stripping it broke the v0.14.0
# button rule in the minified bundle while the unminified file was correct.
# Only the space after a colon is safe to remove (`color: red`).
src = re.sub(r':\s+', ':', src)
# Remove trailing semicolons before close-brace.
src = src.replace(';}', '}')
# Strip leading whitespace.
src = src.strip()
open(sys.argv[2], 'w').write(src)
open(sys.argv[3], 'w').write(minify(guest_src))
PY

echo "Sizes:"
ls -la "$SRC_JS" "$OUT_JS" "$SRC_CSS" "$OUT_CSS" "$OUT_CSS_GUEST"
