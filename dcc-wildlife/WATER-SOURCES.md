# Water module — sources, confidence, and gaps

**DCC Wildlife 1.7.2 · "Fishing & Water Conditions"**

Every fact that can reach a guest's screen is listed here with its origin,
confidence tier and date. If you see something on the page that is not in
this list, that is a bug — tell me.

---

## 0. A correction I owe you

Earlier versions of this document said, of the canal after heavy rain:
*"You have said it colours up."*

**You never said that.** It began as a hypothesis of mine, was repeated back
into a prompt as though it were your observation, and arrived in this document
as sourced fact. Nobody checked it because it had already acquired the shape of
something you'd told us.

That is precisely the failure this module exists to prevent, and it happened in
the document that exists to prevent it. It has been removed. The rain-note
feature built on top of it is gone too — see §1.

---

## 1. Removed: "From the dock" and the rain note

You live about an hour from the cottages and do not fish, and you will not risk
giving inaccurate local detail to guests who are seasoned, dedicated fishermen
and boaters. So `dock_notes`, `dock_updated`, `dock_rain_note` and
`dock_rain_updated` are deleted — settings, storage, rendering and tests. A test
now asserts no reference to any of them survives anywhere in the code.

**The replacement for local colour is breadth, not invention.** The module
speaks at Harris Chain scale, from the Atlas's own numbers, and no wider.

---

## 2. Two bugs that shipped in 1.6.0

The live layer was switched on for the first time on 2026-08-27 and returned
**one reading out of seven**. Both causes were invisible to an offline build,
and both now have regression tests.

**Bug 1 — the payload envelope.** The Atlas wraps every reading as
`{ name, payloadType, payload: { value, sampleDate, units, precision, historic } }`.
The wrapper carries the name the matcher matches on; the payload carries the
data. `find_component()` returned the wrapper, so `value`, `sampleDate` and
`units` were all null, every reading failed its age check, and every one was
dropped — while `probe_atlas()` cheerfully reported both endpoints healthy,
because they were. Fixed: an associative `payload` is unwrapped and merged with
the wrapper's identity keys; a **list** payload (Bathymetry is a list of survey
maps) keeps the wrapper so the caller can walk it.

**Bug 2 — the NWS issuance time.** Forecast responses do not carry
`properties.updated`. They carry `units, forecastGenerator, generatedAt,
updateTime, validTimes, elevation, periods`. The guard required `updated`, so
forecast *and* wind were dropped every single time. Fixed:
`updated ?? updateTime ?? generatedAt`, with **`updateTime` as the issuance
time** — the measurement time we want. `generatedAt` is only when the JSON was
rendered, so it is the last resort.

One implementation note: the unwrap uses `array_is_list()`, which is PHP 8.1+.
The plugin supports 8.0, so it is behind a `function_exists()` guard with a
fallback.

---

## 3. Chain-wide — ids verified live 2026-08-27

Resolved via `/waterbodies/closest?lat=&lng=&len=20&s=1`. Note `len` caps at 20
and `search/waterbodies` returns 500, so `closest` is the endpoint.

| Water | Atlas id | Clarity | Its own median | Level | Level date |
|---|---|---|---|---|---|
| Lake Dora | 7972 | 3.61 ft | 1.50 | 61.19 | 2026-08-22 |
| Lake Eustis | 7985 | 4.27 ft | 2.30 | 61.01 | 2026-08-26 |
| Lake Harris | 7999 | 2.30 ft | 2.30 | 61.04 | 2026-08-26 |
| Little Lake Harris | 8099 | 1.64 ft | 2.18 | — | none |
| Lake Griffin | 7998 | 1.48 ft | 1.64 | 57.78 | **2008-09-04** |
| Lake Beauclair | 7953 | 1.97 ft | 1.21 | 61.52 | 2026-07-31 |
| Lake Carlton | 7840 | 1.64 ft | 1.31 | 61.37 | 2026-07-07 |
| Lake Yale | 8080 | 1.64 ft | 2.80 | 58.69 | **2025-01-02** |
| Apopka-Beauclair Canal | 1101 | 2.30 ft | 2.62 | 60.81 | 2026-08-25 |
| Dead River | 1107 | 2.50 ft | 2.30 | — | none |

**Staleness is per-water, never global.** Griffin's level is eighteen years old
and Yale's nineteen months. Neither may render as a current condition: both are
flagged stale, excluded from any deviation, and greyed on the map with their
date shown. Tests cover both specifically.

**Each water is compared against its OWN record**, because a chain-wide average
would be meaningless when the medians run from 1.21 to 2.80 ft. The comparison
list is ordered clearest-relative-to-its-own-normal first — which puts **Dora
top at 2.41× its median**, ahead of Eustis at 1.86×, a ranking that is not
obvious from the raw numbers and is exactly why the comparison is worth making.

`Ecology` returns empty components for these waters. There is no vegetation
data, and none is invented.

---

## 4. Every fact that can reach the page

| Field | Source | Tier |
|---|---|---|
| Water level (featured water) | Atlas `Water Levels`, SJRWMD 30013010 on Lake Dora — deviation from `historicAverageForMonth.norm`, never raw elevation | `live` |
| Water clarity | Atlas `Secchi disk depth`, against that station's own long-run median | `published` |
| Dissolved oxygen | Atlas, FDEP — with a plain-English gloss | `published` |
| TSI | Atlas (`LimitingParameter` shape), with gloss and limiting nutrient | `published` |
| Depth map | Atlas `Bathymetry` — LCWA survey PDF | `published` |
| Chain comparison | One row per water, clarity against its own median | `published` |
| Recent rain | USGS `00045` daily sums at 02237700, labelled by calendar days | `live` |
| Forecast, wind | NWS, issuance time from `updateTime` | `live` |

Units and precision are read from every payload and never assumed. Lines stay
silent when they have nothing to say: a level within 2 inches of its monthly
norm, or a rainfall total rounding to zero, renders nothing.

---

## 5. The map

Modelled on the layout of your Croatia map — bottom control bar, "Colour by"
segmented control, "Layers" dropdown, fullscreen — in DCC's palette, with 44px
tap targets and type sized for reading a phone in sunlight.

**It costs nothing until opened.** No Leaflet, no stylesheet, no tiles and no
map data load until a guest presses the button. A browser test confirms **zero
external requests** before the click.

| Layer | Source |
|---|---|
| Boat ramps | FWC's public ArcGIS ramp inventory, Lake County, paginated |
| Chain waters | The same cached Atlas readings as the text above |
| Monitoring stations | The stations those readings name |
| The cottages | 28.8045, -81.7450 |

**Colour by** clarity (vs that water's own median), level (vs its own monthly
norm) or **data age** — the honest option, which turns Griffin's 2008 level from
a hidden caveat into a visibly grey lake.

**`Status` is honoured.** Lake Saunders Boat Ramp is currently `Closed`; it is
shown greyed and marked CLOSED rather than hidden, because a guest towing a
boat to a closed ramp is the error we are trying to avoid. Ramps without
coordinates are dropped rather than placed approximately.

**Distances are straight-line** from the cottages, computed from coordinates
and labelled as such. Not drive time, which cannot be sourced.

### Base maps

Two layers, both verified working 2026-08-27. **Satellite is the default** —
anglers and boaters read structure, grass lines and shoreline far better from
imagery than from a street map — with streets one tap away under Layers.

| Layer | URL template | Attribution shown when active |
|---|---|---|
| Satellite | `server.arcgisonline.com/…/World_Imagery/MapServer/tile/{z}/{y}/{x}` | Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community |
| Streets | `tile.openstreetmap.org/{z}/{x}/{y}.png` | © OpenStreetMap contributors |

You decided to include satellite and proceed on these tiles. Recorded as your
decision; the module implements it.

**Mind the coordinate order.** Esri's template is `{z}/{y}/{x}` and OSM's is
`{z}/{x}/{y}`. Swapping them produces a map that renders perfectly and shows
the wrong part of Florida — no error, no blank tiles, just the wrong place.
A test asserts each default ends in the right order.

Each layer carries its **own** `attribution`, so Leaflet swaps the credit with
the layer rather than showing one line for both.

### When tiles fail

The realistic risk is operational, not legal: providers throttle or block by
referrer and volume, and the symptom would be a grid of grey squares on the
Guest Guide. So:

- **Both URLs and both attributions are settings.** Swapping to a paid
  provider is pasting a URL into DCC → Wildlife, not shipping a release.
- **A failing layer falls back to the other.** Five tile misses are tolerated
  (normal at the edge of coverage); sustained failure switches layers, and the
  Base map control follows the switch so the UI never lies about what is shown.
- **If both fail the imagery is dropped**, not left broken: the markers stay on
  a plain background under one line — *"Map imagery is unavailable right now —
  the markers below are still accurate."* The data is the valuable part; the
  imagery is the backdrop.

All of this stays behind the existing load-on-demand behaviour, re-verified:
zero external requests before the button is pressed.

### Waterbody coordinates

Seeded in 1.7.1 from the Atlas's own `Waterbody.Location` centroids, retrieved
2026-08-27 via `/waterbodies/closest`. They are `published` and sourced to the
Atlas — centroid points, not anything measured on the water. All ten remain
editable in the admin table.

| Water | Atlas id | Latitude | Longitude |
|---|---|---|---|
| Lake Dora | 7972 | 28.79067 | -81.69114 |
| Lake Eustis | 7985 | 28.84662 | -81.72718 |
| Lake Harris | 7999 | 28.77764 | -81.81551 |
| Little Lake Harris | 8099 | 28.72206 | -81.75587 |
| Lake Griffin | 7998 | 28.86775 | -81.84831 |
| Lake Beauclair | 7953 | 28.77345 | -81.66019 |
| Lake Carlton | 7840 | 28.75970 | -81.65749 |
| Lake Yale | 8080 | 28.91248 | -81.73657 |
| Apopka-Beauclair Canal | 1101 | 28.73306 | -81.68444 |
| Dead River | 1107 | 28.81391 | -81.76456 |

---

## 6. One settings page

The countdown toggle moves into this plugin, so DCC → Wildlife and DCC → Water
become one page with **Field guide / Water / Map** sections.

The toggle keeps its own standalone option so your current value survives
rather than resetting. **Resolved in 1.7.1:** the key is
`dcc_wl_countdown_enabled` (mu-plugin line 17), read with a default of **1**.
My 1.7.0 inference — `dcc_wildlife_countdown` — was wrong and would have shown
your toggle as OFF the first time. Both the key and the default now match the
mu-plugin, so deleting that file changes nothing for a site that never touched
the setting. It remains filterable via `dcc_wl_countdown_option`.

The page registers at slug `dcc-wildlife` **only if that slug is free**. While
the mu-plugin is active it owns that slug, so this page stays at
`dcc-wildlife-water` and shows a notice telling you to delete the mu-plugin —
at which point it takes the slug over. Neither page can silently disappear,
whichever order things happen in. **`dcc-wildlife-countdown.php` can be deleted
as part of this change.**

---

## 7. Still deliberately absent

Water temperature (springs, wrong in the direction that matters). Turbidity
(your call). Raw gauge elevation as a headline. The Water Levels component's
outer `historic` block (`minValue` 0 is impossible for a lake at 61 ft NAVD88).
Flow rows (null for these waters). Bag limits, seasons and solunar tables.
Drive times. Any hydrology claim about which water connects to which.

---

## 8. Still yours

**Answered:** as many of the chain as possible.

Ten are configured with coordinates. I could not add more from here — this
build environment has no network, and inventing Atlas ids is the precise
failure this module exists to prevent — so 1.7.2 adds **"Find more chain
waters"** to DCC → Wildlife instead. It sweeps the Atlas from the property
*and* from every water already listed, unions the results, drops anything
already configured or lacking coordinates, and lists the rest nearest-first
with real ids for one-click adding.

The sweep exists because `closest` caps at `len=20`: twenty nearest to the
property is not the whole chain, but a water at the far end turns up in a
sweep centred on its own neighbourhood. Sweep points are capped at eight so a
long chain cannot cause a request storm, and the result is cached for a day.

Nothing is added automatically. `closest` returns whatever water is nearest —
ponds and unrelated lakes included — so **you pick which belong to the chain**.
Names commonly counted in the Harris Chain that are not yet listed are Haines
Creek, Lake Denham and Trout Lake; that is general local knowledge, flagged as
such in the admin screen, not sourced data. Check what the Atlas actually
returns.

A larger chain is handled by design: the background pass fetches a bounded
number of uncached waters per run and the rest fill in over subsequent passes,
each cached for six hours. A water with nothing cached yet simply does not
appear until it does — it is never shown with invented or empty readings.

---

## 9. How to audit the page yourself

1. Look at any value.
2. Read the grey line beneath it: source, station, whether it was *read*,
   *sampled* or *surveyed*, and when.
3. Click through — Atlas readings open that station's page, the depth map opens
   the PDF, USGS opens that gauge.
4. On the map, switch "Colour by" to **Data age** to see instantly which waters
   are reporting and which are not.
5. If a value has no line beneath it, that is a bug. It should not be possible.
