# Media offload to GitHub Releases (Task 3)

**Goal:** move the ~8 GB of full-size photos and self-hosted videos off GitHub
Pages (which has a 1 GB soft limit — the repo is ~8.4 GB and Pages builds are
slow/flaky) onto a GitHub **Release**, and repoint `places.json` at the new
URLs. Thumbnails (`src`) and video posters stay on Pages so the grid still
renders instantly. Drive-embedded GoPro clips (`type:"drive"`) are already
off-repo — untouched.

## Why this wasn't finished automatically

The web session that prepared this is blocked by its agent proxy from
creating/editing GitHub Releases:

```
HTTP 403  "Creating, editing, or deleting releases is not permitted for this session type."
```

It could read the API but not create the release or upload assets. Everything
below is therefore packaged to run locally with the `gh` CLI. Three steps:

## Steps

```bash
cd tour-data

# 1) create release media-v1 and upload the 8.1 GB move-set (resumable)
bash data/offload/offload-upload.sh

# 2) repoint places.json 'full'/'url' -> release URLs, and bump SW CACHE_VERSION
#    (verifies a sample of release assets resolve before rewriting)
python3 data/offload/offload-repoint.py

# 3) review, then remove the moved originals from Pages and commit
git add places.json service-worker.js
git commit -m "Task 3: offload full-size photos + self-hosted video to media-v1 release"
bash data/offload/offload-remove-originals.sh   # git rm's the 2001 moved files
git commit -m "Task 3: git rm offloaded originals (now served from media-v1 release)"
git push
```

After the Pages build, the repo drops from ~8.4 GB to ~250 MB and deploys fast.

## What moves vs stays

| Pattern | Field | Action | Size |
|---|---|---|---|
| `media/**/*-full.jpg` | `full` | move to release, repoint | 1.4 GB (1437) |
| `media/**/*-hd.mp4`   | `url` (self_hosted) | move to release, repoint | 6.7 GB (564) |
| `media/**/*-thumb.jpg`| `src` | **keep on Pages** | 0.1 GB |
| `media/**/*-poster.jpg`| `poster` | **keep on Pages** | 0.1 GB |

`media-offload-manifest.tsv` lists every moved file → asset name → release URL
(2001 rows, 8.14 GB). ~231 of these are on-disk orphans not referenced by
places.json; they're uploaded too (so nothing is lost) and removed from Pages.

## Notes / gotchas

- `bundle.js` `resolveUrl()` returns absolute `http(s)` URLs unchanged, so the
  repointed release URLs work with no code change.
- The service worker network-firsts `*.json`, so the new `places.json` reaches
  clients without a version bump; the CACHE_VERSION bump additionally evicts any
  stale shell/media from old caches.
- Release assets are served cross-origin (github.com); the SW's fetch handler
  only caches same-origin + unpkg responses, so release media is fetched live
  and not cached by the SW. Fine for full-size/video (loaded on demand).
- If you prefer Cloudflare R2 instead, change `BASE` in both scripts to your R2
  public bucket URL; the manifest/asset names are host-agnostic.
