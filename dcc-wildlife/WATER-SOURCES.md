# Water module — sources, confidence, and gaps

**DCC Wildlife 1.7.0 · "Fishing & Water Conditions"**

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

**Satellite imagery is NOT included.** The brief said to verify the tile
provider's licensing for a commercial rental site and, failing that, to ship
OSM only and say so. This build environment has no network, so I could not
verify Esri's terms — so OSM only. Worth noting separately: OSM's own tile
policy discourages heavy commercial use, so the tile URL is a setting; if the
map gets busy, point it at a paid provider.

**Waterbody coordinates are not seeded.** Your capture did not include them,
so none are invented. The code scans each Atlas payload for coordinates and the
admin screen lets you enter any that are missing; a water without coordinates
still appears in the comparison list, it is simply not drawn.

---

## 6. One settings page

The countdown toggle moves into this plugin, so DCC → Wildlife and DCC → Water
become one page with **Field guide / Water / Map** sections.

The toggle keeps its own standalone option so your current value survives
rather than resetting. **One thing to confirm:** I could not read
`dcc-wildlife-countdown.php` from here, so the option key is my best inference,
`dcc_wildlife_countdown`, and it is filterable via `dcc_wl_countdown_option`.
Check it against the mu-plugin before deleting that file; if it differs, the fix
is one filter, not a code change.

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

**Which waters you want listed.** Ten are configured; the list is editable.
Everything else you previously could not answer is now sourced, and the module
no longer asks you for fishing technique or dock knowledge — that is the whole
point of it speaking at chain scale.

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
