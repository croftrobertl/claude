# Balkans History — History tab for the Croatia tour

Interactive map of the Balkans across 35 eras (500 BC → today), with capitals, capital
moves, today's borders as an overlay, vassal/occupation hatching, a "+N years" timeline,
and a running Ragusa/Dubrovnik panel (territory by era, LIBERTAS counter, 1699 Neum
cession, 1991–92 siege, 2022 Pelješac Bridge).

## Files
| File | Purpose |
|---|---|
| `history.js` | Vanilla JS component, no dependencies. `BalkansHistory.mount(el, opts)` |
| `history.css` | Scoped `bh-*` styles. Reads the site's `--dcc-tour-*` tokens, with fallbacks |
| `history-data.json` | All 35 eras as pre-projected SVG paths (~590 KB, gzips to ~150 KB) |
| `street.json` | Street-accurate outlines for the Map tab's "Then" overlay (~230 KB, gzips to ~65 KB): Ragusa's parts on OpenStreetMap municipal boundaries, today's border lines that follow the old frontier and the 1699 corridors, the Stradun, and the land the Yugoslav army held in 1991–92 (by municipality). Built by `../tools/build-street.py` |
| `index.html` | Standalone demo (`python3 -m http.server`, open `/index.html`) |
| `balkans-highlights.mp4` | 61-second vertical film (1080×1920, H.264, ~8 MB) |
| `source/` | Python pipeline that generates the data and the videos (not shipped to users) |

## API
```js
const h = BalkansHistory.mount(container, {
  dataUrl: 'history/history-data.json', // or data: obj
  hash: false,          // true = component reads/writes location.hash itself
  start: '1453',        // era slug: label lowercased, spaces removed ('500bc', 'mar1878', '14ad')
  onChange(frame, slug) {}  // fires on every era change
});
h.show('1992');         // jump to an era by slug or index
```
Keyboard: ← → step eras. Touch: drag to pan when zoomed, pinch to zoom, tap a region to name it.

## Regenerating data (after a correction)
Needs Python 3.11+, geopandas, matplotlib, the historical-basemaps repo and Natural Earth
1:50m + 1:10m admin-0 GeoJSON (paths are at the top of `render.py`). Edit `keyframes.py`
(eras, captions, override shapes) or `RTEXT` in `render.py` (Ragusa notes), then:
```
python3 render.py            # video keyframes (optional)
python3 export_data.py       # writes history-data.json
python3 compose2.py out.mp4 [--highlights]
```
Never hand-edit `history-data.json`.

## Accuracy
Borders come from historical-basemaps (A. Ourednik) and Natural Earth, with hand-drawn
corrections for the Balkans (1210, 1355, 1453, 1526, 1600–1832, 1878 ×2, 1913, 1942, 1992).
Hand-drawn eras are close approximations, not survey-exact.

## The Map tab's "Then" overlay
`street.json` comes from OpenStreetMap (© OpenStreetMap contributors, ODbL) via Nominatim:
```
python3 tools/build-street.py --fetch /tmp/osm   # downloads ~17 boundaries, 1 request/s
python3 tools/build-street.py /tmp/osm           # writes history/street.json
```
If the Python `shapely` package is installed (`pip install shapely`), Sutorina is cut exactly
to the land between today's Herceg Novi boundary and the old Ragusan line; without it the build
falls back to a latitude cut, which is close but rougher.

Ragusa's parts are cut at the same lines the coast map uses, so both maps agree on what was
Ragusan when. The landmarks and their dates live in `THEN_MARKS` in `bundle.js`.
