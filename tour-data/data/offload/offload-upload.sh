#!/usr/bin/env bash
# Upload the 8 GB media move-set to a GitHub Release, so it can be served from
# github.com/.../releases/download/ instead of GitHub Pages.
#
# WHY THIS IS A SCRIPT AND NOT ALREADY DONE: the Claude Code web session that
# prepared this is blocked by its agent proxy from creating/editing releases
# ("not permitted for this session type"). Run this locally where you have the
# `gh` CLI authenticated (gh auth login). It is idempotent/resumable — assets
# already present on the release are skipped.
#
# Usage:  cd tour-data && bash data/offload/offload-upload.sh
set -euo pipefail

REPO="croftrobertl/claude"
TAG="media-v1"
BRANCH="claude/croatia-trip-interactive-tour-9omtya"
MANIFEST="data/offload/media-offload-manifest.tsv"

command -v gh >/dev/null || { echo "gh CLI not found. Install: https://cli.github.com/"; exit 1; }
[ -f "$MANIFEST" ] || { echo "manifest not found: $MANIFEST (run from tour-data/)"; exit 1; }

# 1) create the release if it doesn't exist
if ! gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  echo "Creating release $TAG ..."
  gh release create "$TAG" --repo "$REPO" --target "$BRANCH" \
    --title "Tour media v1 (full-size photos + GoPro/self-hosted videos)" \
    --notes "Offloaded from GitHub Pages to keep the Pages deploy under the 1 GB soft limit. Contains 2049px full-size photos (*-full.jpg) and re-encoded self-hosted clips (*-hd.mp4), referenced by tour-data/places.json 'full' and 'url' fields. Thumbnails/posters stay on Pages."
else
  echo "Release $TAG already exists — will upload only missing assets."
fi

# 2) figure out which asset names already exist (resumability)
existing="$(gh release view "$TAG" --repo "$REPO" --json assets --jq '.assets[].name' 2>/dev/null || true)"

# 3) upload in batches, skipping already-present assets
batch=(); n=0; up=0; skip=0
flush() {
  [ ${#batch[@]} -eq 0 ] && return
  gh release upload "$TAG" --repo "$REPO" "${batch[@]}"
  batch=()
}
while IFS=$'\t' read -r local_path asset_name release_url; do
  [ "$local_path" = "local_path" ] && continue   # header
  if grep -qxF "$asset_name" <<<"$existing"; then skip=$((skip+1)); continue; fi
  [ -f "$local_path" ] || { echo "WARN missing $local_path"; continue; }
  batch+=("$local_path"); n=$((n+1)); up=$((up+1))
  if [ $n -ge 40 ]; then flush; n=0; echo "  uploaded ~$up ..."; fi
done < "$MANIFEST"
flush

echo "Done. Uploaded $up asset(s), skipped $skip already present."
echo "Next: python3 data/offload/offload-repoint.py   (repoints places.json + bumps SW)"
