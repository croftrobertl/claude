# Next-session TODO (Croatia tour)

Two items remain. Both are best done in a **fresh session** (Nominatim
naming needs the network-policy allowlist to propagate on session start).

## 1. Venue naming — reverse-geocode the 180 unlabeled clusters
- `nominatim.openstreetmap.org` was allowlisted by the user but only takes
  effect on a fresh session (still 403 in the session that built this).
- On a new session, verify: `curl -s -o /dev/null -w "%{http_code}"
  "https://nominatim.openstreetmap.org/reverse?lat=42.64&lon=18.11&format=jsonv2&zoom=18"`
  → expect 200.
- For each place in `tour-data/places.json` where `venue` is null, reverse-
  geocode the centroid at 1 req/sec (cache results). Prefer, in order:
  (a) user's Google Saved Places / Timeline visit names where a cluster
  matches within ~60m, (b) Nominatim `name`/`road`. User note: Dubrovnik
  Old Town venue names churn; lean on their pre-saved Google Maps places.
- Also fix chapter mis-assignments (e.g. Ljuta village → tagged DBV airport;
  should be a Župa-Dubrovačka villages grouping).

## 2. Embed the 240 GoPro clips
- Drive Videos folder: `1JIqaK0jU3MxEEus_hEr6u1TxjIx21b1v` (public).
- Drive MCP paging WORKS (search_files, parentId = '<folder>' and title
  contains '.mp4', pageSize 100 + pageToken). ~3 pages.
- `scratchpad/gopro/page1.tsv` has 100 filename→id already (may be gone if
  container reclaimed — re-page if so).
- Filenames encode place: GX0100NN_YYYY-MM-DD_HH-MM-SS_<Place>.mp4. Bucket
  each clip to the nearest place / its chapter by the place hint +
  capture datetime (only 11 have embedded GPS). Add
  `{"type":"drive","id":"<fileId>"}` to that place's `media` array in
  places.json. Videos stream from Drive — no download, repo stays flat.
- bundle.js already renders `type:'drive'` as a /preview iframe.

## Data artifacts (all in tour-data/data/)
- places.json (app copy is tour-data/places.json) — 196 venue clusters.
- joined_gps.json — guid → real GPS (from the filename+datetime join).
- bundle3-manifest.csv — authoritative iPhone metadata (2312 rows).
