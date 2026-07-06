# Next-session TODO (Croatia tour)

Status of the three items from the prior handoff (branch
`claude/croatia-trip-interactive-tour-9omtya`):

## 1. Venue naming — DONE ✅
All 180 null venues reverse-geocoded via Nominatim (1 req/sec). named_count
16 → 196. Preferred POI name → street → locality; rejected highway route refs
(D8/E65), bare house numbers, postcodes.
- ⚠️ No Google Saved Places / Timeline **name** dataset was present in the repo
  or session, so every name is from Nominatim (the documented fallback). 13 are
  low-confidence district/county fallbacks worth a human pass; drop a
  Saved-Places export in the repo to override.
- Chapter fixes: 10 Koločep/Kalamota clusters mount-srd → elaphiti; Ljuta and
  2 Čibača clusters → the south-coast/Župa (`soline`) chapter. Left borderline
  p139/p179 in dubrovnik-old-town. Did **not** rename `soline` (its summary is
  Soline-specific); ask the owner if a dedicated `zupa-dubrovacka` chapter with
  their own narrative is wanted.

## 2. Embed the 240 GoPro clips — DONE ✅
All 240 `.mp4` from Drive folder `1JIqaK0jU3MxEEus_hEr6u1TxjIx21b1v` embedded as
`{"type":"drive","id":...}`, bucketed by filename place-hint + capture datetime
(local CEST → UTC matched against the 1801-photo place timeline). Created two
holder places for chapters that had no clusters: p196 Orlando (MCO, 8 clips),
p197 London Gatwick (LGW, 20 clips). places 196 → 198.

## 3. Offload heavy media off Pages — PREPARED, needs a local run ⚠️
The web session's agent proxy **forbids creating/editing GitHub Releases**
(`HTTP 403: not permitted for this session type`), so the 8 GB upload could not
run here. A turnkey kit is committed under `data/offload/`:
```
cd tour-data
bash   data/offload/offload-upload.sh            # gh release create + upload 8.14 GB (resumable)
python3 data/offload/offload-repoint.py          # repoint full/url -> release, bump SW v7->v8
bash   data/offload/offload-remove-originals.sh  # git rm the 2001 moved originals (guarded)
```
See `data/offload/offload-README.md`. places.json full/url are intentionally
still local (repointing before upload would 404 the site); no originals deleted.

## Data artifacts (all in tour-data/data/)
- places.json (app copy is tour-data/places.json) — now 198 places, fully named,
  240 Drive clips embedded.
- joined_gps.json — guid → real GPS + datetime (used for clip bucketing).
- bundle3-manifest.csv — authoritative iPhone metadata (2312 rows).
- offload/ — the Task-3 kit + manifest.
