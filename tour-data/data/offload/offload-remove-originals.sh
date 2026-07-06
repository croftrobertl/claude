#!/usr/bin/env bash
# Remove the moved originals from Pages AFTER they're uploaded to the release
# and places.json is repointed. Run from tour-data/.
#
# Safety: refuses to run unless places.json 'full'/'url' already point at the
# release (i.e. offload-repoint.py has run) -- otherwise you'd delete files the
# live site still references locally.
set -euo pipefail
MANIFEST="data/offload/media-offload-manifest.tsv"
[ -f "$MANIFEST" ] || { echo "run from tour-data/ (manifest not found)"; exit 1; }

if grep -q '"full": "media/' places.json 2>/dev/null; then
  echo "ABORT: places.json still has local 'full' paths. Run offload-repoint.py first."
  exit 1
fi

echo "git rm'ing $(( $(wc -l < "$MANIFEST") - 1 )) offloaded originals ..."
tail -n +2 "$MANIFEST" | cut -f1 | while IFS= read -r p; do
  [ -e "$p" ] && git rm -q "$p" || true
done
echo "Done. Review 'git status', then commit + push."
