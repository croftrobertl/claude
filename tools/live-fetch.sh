#!/usr/bin/env bash
# Cache the live /guest/ document and its combined stylesheet for
# tools/live-shell.js. The egress proxy reached doracanalcourt.com from
# 2026-11-01; before that it 403'd and this was not possible.
set -euo pipefail
mkdir -p /tmp/live
curl -sS -m 60 "https://doracanalcourt.com/guest/" -o /tmp/live/guest.html
CSS=$(grep -o 'href="[^"]*\.css[^"]*"' /tmp/live/guest.html | sed 's/href="//;s/"$//' | head -1)
curl -sS -m 90 "$CSS" -o /tmp/live/combined.css
ls -l /tmp/live/guest.html /tmp/live/combined.css
