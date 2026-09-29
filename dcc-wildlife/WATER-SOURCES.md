# Water module — sources, confidence, and gaps

**DCC Wildlife 1.7.3 · "Fishing & Water Conditions"**

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
| Depth map | Atlas `Bathymetry` — LCWA survey PDF, newest survey | `published` |
| Chain comparison | One row per water, clarity against its own median | `published` |
| Recent rain | USGS `00045` daily sums at 02237700, labelled by calendar days | `live` |
| Forecast, wind | NWS, issuance time from `updateTime` | `live` |

**Dates say only what the source knows.** Everything but the NWS forecast is
dated to the day, so the page shows "sampled May 28, 2026" rather than a
midnight that never happened; only the forecast carries a real issuance time.
Date-only values are read in the source's own frame, so a guest in any
timezone sees the same calendar date the Atlas recorded.

**The depth map shows the newest survey.** Most waters publish a same-date
pair — one entry with `method: UNKNOWN`, one `DGPS-SONAR` — which are
different exports of the same survey rather than better and worse versions.
Date therefore decides first and method only breaks a tie: preferring the
labelled method outright would give Lake Harris a 2001 map in place of its
2014 one. Eustis and Yale have no bathymetry, and simply omit the row.

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
whichever order things happen in.

**Completed in 1.8.0:** the countdown *rendering* is absorbed too, from the
mu-plugin source you supplied — same markup, same styling, same option, day
count still computed in the browser in canal time, plus a standalone
`[dcc_wildlife_countdown]` shortcode. While the mu-plugin file exists it keeps
rendering and this plugin stands down, so nothing doubles up in either order.
**After verifying 1.8.0 on the live site, delete
`wp-content/mu-plugins/dcc-wildlife-countdown.php`** — that is the last step;
the settings page then takes the `dcc-wildlife` slug on its own.

Also in 1.8.0, from the self-audit: a version-keyed settings migration (the
1.7.1 seeded chain coordinates could never reach a site that saved settings
under 1.7.0 — the stored array shadowed them; now backfilled once and guarded
at read time), the dead `usgs_sites` list removed (nothing read it since
1.6.0), map popups made translatable with a per-mode colour legend, the
rainfall line reworded to "the two most recent reporting days", and opt-in
uninstall cleanup (default: settings survive reinstalls).

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

---

## v1.11.0 — Fishing almanac, wildlife accuracy pass, and species photos (2026-09-01)

Three additions, each owner-authorised on 2026-09-01, each with its own sourcing.

### 1. Fishing almanac (`Water_Data::default_fishing()` → the "Fishing the Harris Chain" block)

A deliberate expansion of the prior **link-only** fishing policy (the owner does
not fish; earlier versions refused to state anything). Now rendered under its own
honestly-labelled heading, **never** through the `Water_Fact` gate (it is
seasonal guidance, not a measured reading) and **season-shaped** so nothing
month-specific is baked into cached HTML.

- **Regulations** — FWC statewide bag & length limits, verified against
  https://myfwc.com/fishing/freshwater/regulations/general/ : black bass 5/day
  (one ≥16″), crappie 25/day, panfish 50/day aggregate, sunshine/striped/white
  bass 20/day (6 ≥24″), no statewide limit on catfish/gar/bowfin/pickerel. No
  Harris-Chain-specific special reg exists (checked the Special Limits page).
- **Sportfish + attractors** — FWC Harris Chain forecast
  (https://myfwc.com/fishing/freshwater/sites-forecasts/ne/lake-harris/) and the
  FWC attractor list (https://myfwc.com/media/20144/fw-harris-fish-attractors.pdf,
  11 "Mossback" attractors in Lake Dora). We link the PDF rather than bake the
  coordinates, which FWC re-works over time.
- **Season-by-season patterns** — FWC forecast + FWC bream/crappie pages
  (full-moon bedding is FWC-stated) plus reputable guide reports (Bassmaster,
  BassOnline). The block says so, and the "solunar tables are folklore, not FWC
  science" caveat is stated outright. The FWC forecast text rotates through the
  year, so we stay at season scale and disclaim it.
- **Left out on purpose:** trophy-size superlatives and precise bite-time
  predictions (guide marketing, not FWC), and any claim that reads as the owner's
  personal local knowledge.

### 2. Wildlife guide accuracy pass (`Species::registry()` / `calendar()`)

Every species carries a scientific name and its facts were re-verified against
FWC, the Cornell Lab (All About Birds / Birds of the World), the USF Plant Atlas,
USGS, USFWS, the Florida Museum and UF/IFAS. Corrections of record: turtles no
longer list the dry-upland gopher tortoise; the manatee is the rare warm-month
visitor it actually is (first Harris-Chain record 2015), not a winter regular;
the bald-cypress "knees" are an unresolved mystery, not settled fact; the belted
kingfisher lost an unsourceable "25 mph"; the wood stork is a post-2026-ESA-
delisting recovery success (FWC's own profile still lags on this); the
resurrection fern uses its current name *Pleopeltis michauxiana*; the water snake
gains a cottonmouth safety caveat. Six iconic canal species were added (limpkin,
white ibis, wood stork, little blue / tricolored / green heron) plus the native
Florida apple snail (*Pomacea paludosa*), the keystone the limpkin and snail kite
feed on.

### 3. Species photos (`Species::photos()` → `assets/photos/`)

17 of 24 species now open their detail sheet with a real photo; see the CLAUDE.md
"Image files" rule for the full policy. Every photo is a **free-tier Adobe Stock
license** (zero cost), visually vetted for the correct species before licensing,
and optimised to ≤ ~210KB, lazy-loaded one at a time. The 7 species with no
accurate free photo (white ibis, wood stork, little blue / tricolored heron,
water snake, apple snail, resurrection fern — the free results were European
storks, great egrets, sea kraits, etc.) keep their drawn sprite: a wrong-species
photo would undo the accuracy pass above, so it is never substituted. Attribution
is shown in the sheet ("Photo: Adobe Stock").

## Astronomy (v1.12.0) — computed, never fetched

"Tonight on the Canal" (moon phase + first/last light) is **computed in the
browser**, not fetched: Meeus' phase-angle formula for the moon and the standard
sunrise equation for the sun, at the property's own coordinates, in canal time.
No API, no key, no network call — it is maths, so there is no source to attribute
beyond the formulae themselves. It is deliberately kept out of the cached HTML
(client-side, like the season countdown and the live strip). The fishing tie-in it
prints (full moon → bedding bream / staging crappie) is the same FWC-sourced fact
already documented above; the moon just says which nights it applies to.

## Phase 2 — batch 1 (1.19.0): "Know before you go" and the snake split

Seasonality rows are activity/encounter likelihood on the property, not
abundance. Sources are the ones the guide already leans on — FWC species
profiles, the Florida Museum herpetology accounts, UF/IFAS "Featured
Creatures" — from knowledge, with confidence noted; the session with network
access should spot-check the MEDIUM rows against the named page.

| id | row | basis | confidence |
|---|---|---|---|
| cottonmouth | Mar–Sep at 3, shoulder Oct/Feb | FWC/Florida Museum: active most of the year in Florida, most encountered in the warm months; out on warm winter days | HIGH |
| diamondback | Apr–May and Sep–Oct at 3 | Florida Museum: encounters peak in spring and during the autumn mating season; midsummer activity shifts to dawn/dusk | MEDIUM |
| pygmy | May–Oct at 3 | Florida Museum: warm-season activity; litters born Jul–Sep; the most frequently encountered venomous snake in FL | MEDIUM |
| coralsnake | Apr–May, Sep–Oct at 3 | Florida Museum: fossorial; surface activity highest in spring and autumn, often after rain | MEDIUM |
| fireant | Mar–Oct at 3 | UF/IFAS: year-round colonies; mound building and foraging most visible in warm, wet months | HIGH |
| poisonivy | Apr–Oct at 3 | USF Plant Atlas / UF/IFAS: deciduous in central FL, in leaf roughly Mar–Nov; urushiol in all parts year-round | HIGH |
| mosquito | May–Oct at 3 | FL Dept of Health / UF/IFAS FMEL: wet-season peak; Culicoides biting midges bite most in spring and autumn at dawn/dusk | HIGH |
| lovebug | May and Sep at 3, Apr/Aug at 2 | UF/IFAS Featured Creatures: two flights, late Apr–May and late Aug–Sep | HIGH |
| bandedwater | Apr–Sep at 3 | the former generic "snake" row, unchanged | HIGH |
| brownwater | Apr–Aug at 3 | Florida Museum: basks on overhanging limbs spring–summer; less conspicuous in cool months | MEDIUM |
| greenwater | May–Aug at 3 | Florida Museum: warm-season; marsh and weedy-shallows specialist | MEDIUM |

Facts checked against the same accounts: cottonmouth = *Agkistrodon conanti*
(split from *A. piscivorus* in 2015; the brief's name, kept); the "red touches
yellow" rule is reliable for the eastern coral snake in the SE US; *Solenopsis
invicta* entered the US at Mobile, AL in the 1930s (UF/IFAS); the brown
watersnake's wide head is the classic cause of cottonmouth misidentification
(Florida Museum). Photos: none for batch 1 yet — every new tile shows the
group glyph until a vetted image arrives.

## Phase 2 — batch 2 (1.20.0): wading birds and water birds

Seventeen new species. Rows are how likely a guest is to SEE one from the
property or the canal, not abundance; sources are Cornell Lab / All About
Birds range-and-season accounts and FWC species profiles, from knowledge,
with confidence noted. The MEDIUM rows are the ones worth a spot-check by a
session with network access.

| id | row | basis | confidence |
|---|---|---|---|
| greategret | year-round 3 | Cornell: common permanent resident throughout FL | HIGH |
| cattleegret | Mar–Sep at 3 | Cornell/FWC: resident, numbers swell with breeding; disperses in winter | HIGH |
| bcnightheron | Mar–Aug at 3 | Cornell: resident; most conspicuous around breeding colonies | MEDIUM |
| ycnightheron | Apr–Aug at 3 | Cornell: breeds through the peninsula, part of the population withdraws south in winter | MEDIUM |
| leastbittern | May–Aug at 3 | Cornell: summer breeder in central FL; vocal Apr–Aug, secretive otherwise | HIGH |
| glossyibis | Mar–Sep at 3 | Cornell: resident in peninsular FL, more numerous in the wet season | MEDIUM |
| sandhill | Oct–Apr at 3 | FWC: *pratensis* is a non-migratory resident; migratory greater sandhills swell numbers Nov–Feb | HIGH |
| cormorant | Oct–Mar at 3 | Cornell: resident, with northern birds wintering — highest counts in the cool season | MEDIUM |
| commongallinule | year-round 3 | Cornell: abundant permanent resident in FL freshwater marsh | HIGH |
| purplegallinule | Apr–Aug at 3 | Cornell: breeds in FL; inland numbers drop sharply in midwinter | HIGH |
| coot | Nov–Mar at 3, absent Jun–Aug | Cornell: abundant FL winter visitor, very local breeder | HIGH |
| grebe | Nov–Mar at 3 | Cornell: resident but far more numerous in winter | HIGH |
| woodduck | Nov–Apr at 3 | Cornell/FWC: resident cavity nester; most visible in the cool season | MEDIUM |
| mottledduck | Nov–Apr at 3 | FWC: non-migratory FL endemic subspecies; pairs conspicuous winter–spring | HIGH |
| whistlingduck | Apr–Sep at 3 | Cornell/FWC: established and expanding resident, most numerous in warm months | MEDIUM |
| pelican | Nov–Mar at 3, absent Jun–Sep | Cornell: winter visitor to FL lakes; breeds on northern prairie lakes | HIGH |
| fishcrow | Mar–Jul at 3 | Cornell: common resident, most vocal in the breeding season | HIGH |

Facts checked against the same accounts: the great egret is the National
Audubon Society's emblem, adopted after the plume-hunting fight; cattle egrets
reached Florida in the 1950s after crossing the Atlantic unaided; *Nycticorax*
means "night raven"; wood ducklings leave the cavity the day after hatching;
the Florida mottled duck's main threat is hybridisation with released
mallards; the American white pelican feeds cooperatively and does not
plunge-dive. Taxonomy follows the brief: *Antigone canadensis pratensis* and
*Nannopterum auritum* stay as given.

PROTECTED flags: the Florida sandhill crane is added (state-designated
threatened, and feeding cranes is illegal in Florida). Two more candidates —
little blue heron and tricolored heron, both believed state-designated
threatened since FWC's 2017 rule — are NOT flagged here because that listing
was not verified from a source in this environment. Worth confirming, then
adding.

LOOK-ALIKE SETS were re-cut for the new arrivals: `white` is now the five
confusable white waders, the two ibises get their own pair, `dark` holds the
tall ones (great blue, tricolored, sandhill, anhinga, cormorant), and a new
`night` set holds the two night herons, the green heron and the least bittern.
The green heron moved out of `dark`: nobody confuses a four-foot heron with an
eighteen-inch one, but people do confuse it with a night heron.

### Batch 2 addendum (1.21.0) — the two state-listed herons

Confirmed by the owner from FWC's own species profiles: the little blue heron
(*Egretta caerulea*) and the tricolored heron (*Egretta tricolor*) are both
**State-designated Threatened** under Florida's Endangered and Threatened
Species Rule. Both now carry the PROTECTED flag and a what-to-do line.

- https://myfwc.com/wildlifehabitats/profiles/birds/waterbirds/little-blue-heron/
- https://myfwc.com/wildlifehabitats/profiles/birds/waterbirds/tricolored-heron/

Batch-2 Wikidata entities were confirmed against P225 on 2026-09-09 and are
recorded in tools/entities-batch2.csv. Two notes worth keeping: the
double-crested cormorant's live entity is Q117254648 (*Nannopterum auritum*) —
Q725289 (*Phalacrocorax auritus*) is a stale duplicate with no sitelink — and
the cattle egret has had no English Wikipedia sitelink since the 2023 split.

## Phase 2 — the 1.33.0 expansion: the four odds the owner flagged

He named four species in the brief and asked for their odds to be set from
evidence rather than from the master list. Checked 2026-09-28; each is
recorded with what the evidence actually said, including where it disagreed
with the premise of the question.

**Barn swallow — HE WAS RIGHT, AND THE LIST WAS WRONG.** The master list has
it "Certain". Cornell: barn swallows BREED in northern Florida and pass
through the rest of the state on migration. Lake County is in the rest of the
state. So it is a spring and autumn bird here, not a summer resident, and its
calendar has to be migration-shaped — up in April–May and again in
August–September, down in midsummer and winter. Odds: **Likely on passage**,
not Certain.

**American bullfrog — HE WAS RIGHT AGAIN.** USGS: the native range reaches
*central Florida* and no further; south Florida populations are introductions.
Lake County is at that southern edge. It is present but not a frog a guest
will reliably meet, so **Occasional**, not Likely. And the useful thing for
the entry: the deep call a guest hears at night on this canal is almost
certainly a PIG FROG, which is common here. Two frogs, one voice, and the
guide should say which one you are actually hearing.

**Sunshine bass — CONFIRMED STOCKED.** FWC stocks largemouth and sunshine
bass into lakes of the Harris Chain; Lake Harris took 219,243 hybrid
striped-bass fingerlings. They are a real fish of this chain, not a hopeful
entry. They school in open water rather than in a shaded canal, which is what
the entry should say. Odds: **Likely**, as the list has it, now on evidence.

**Channel catfish — THE PREMISE OF THE QUESTION WAS OFF, AND THAT IS WORTH
SAYING.** He asked whether it is "really Certain in the canal" given it is
"largely stocked in peninsular Florida". USGS NAS has *Ictalurus punctatus*
as NATIVE to peninsular Florida (and probably introduced in Georgia, of all
places); it is also stocked very widely, so both things are true. FWC's own
Harris Chain forecast lists it. The honest odds problem is not nativity but
BEHAVIOUR: it feeds on the bottom, after dark. An angler fishing a bottom
bait at night will catch one; a guest walking the dock will never see one.
**Likely**, with the entry saying plainly what it takes.

**The rule this sets for the remaining 348.** Where the evidence contradicts
the master list, the evidence wins and the owner is told — never a silent
change. Where it contradicts the PREMISE of a question rather than its
answer, say so too: "it is native, and also stocked" is more useful than
picking one.

## Phase 2 — the 1.33.0 narration pass: every retained sentence, re-verified

The owner's ruling of 2026-09-28, in his words:

> "Sources for EVERYTHING that stays, not only what's new. […] The same applies
> to every sentence kept 'unchanged' in any entry: re-verify it, or it goes."

So this is not a record of what changed. It is a record of **what the text is
now allowed to say**, claim by claim, for all 51 entries. Anything that could
not be re-verified this session was cut, and the cuts are listed first, because
they are the part that is easy to lose.

### What was CUT for want of a source

| entry | the claim | why it went |
|---|---|---|
| Largemouth Bass | "Lake Dora has given up largemouth over twelve pounds" | No FWC or TrophyCatch record found for a twelve-pound Lake Dora fish. It was also exactly the "trophy-size superlative" §1 of this document already says we leave out. Replaced with a Lake-Dora-specific fact that *is* sourced: FWC's trophy-bass study surgically tagged bass over eight pounds in Lake Dora and Lake Eustis. |
| Bald Cypress | "spared by the loggers of the 1800s" | Tour operators say the canal's cypress are ancient; nobody I could find documents that the stand was never cut. Replaced with the dated fact underneath it: the waterway was the Elfin River until 1882, when it was widened for steamboats, and cypress here run past 400 years. |

### What was CORRECTED, because the old text was wrong in the unsafe direction

These are additions to the safety content, not trims of it.

| entry | was | now | source |
|---|---|---|---|
| Eastern Diamondback | "a rattle it will usually sound before you get close" | "Do not count on hearing it: one that would rather go unnoticed lies still and says nothing." | UF/IFAS and FWC both state diamondbacks frequently do **not** rattle, and that a snake trying to stay unnoticed is quieter, not louder. The old line taught a guest that silence is an all-clear. That is the single most dangerous sentence the guide contained. |
| Eastern Coral Snake | "The old rhyme holds here" | the **black snout** is the tell; the rhyme is true of a normally marked snake, and markings vary | Florida Museum's Florida Snake ID Guide: coral snake has a black snout and neck; the scarlet kingsnake and scarlet snake have red heads. Animal Diversity Web notes aberrant colour patterns, so the rhyme alone is not safe. |
| Poison Ivy | "wash […] within the hour" | "as soon as you can — the oil starts binding to skin within about fifteen minutes" | FDA consumer guidance: urushiol binds to skin proteins within about 15 minutes; washing inside that window can prevent or reduce the reaction. An hour is not the number. |
| Wood Stork | `safe` said "Federally threatened" | "No longer federally listed […] but still a protected migratory bird" | USFWS: the Southeast U.S. DPS was **delisted entirely**, final 9 March 2026 (Federal Register 2026-02588). It is not threatened any more; saying so is simply out of date. |
| Dusky Pygmy | "Painful, rarely fatal" | "Bites hurt, and tissue damage is common — but no death from one has ever been recorded." | UF: no recorded fatality from a pygmy rattlesnake bite. Tissue loss is the real hazard. Stronger *and* truer. |
| Mosquitoes / No-see-ums | no-see-um season given as "spring and autumn" | "April into November" | UF/IFAS Entomology: biting midges are most active at dusk and dawn from April through November. |

### One claim RESTORED to the guide

In the STEP 1a samples I said I could not verify, to this guide's standard, that
a cottonmouth swims with its whole body on the surface while a watersnake swims
mostly submerged, and I left it out of the cottonmouth entry. **On re-checking
it this session, it clears the bar**: the University of Georgia's Savannah River
Ecology Laboratory herpetology account and the Virginia Department of Wildlife
Resources both state it directly. It stays in the brown watersnake's "Tell it
apart" line, where it already was, and is now sourced rather than inherited.

### Know-before-you-go: the actionable facts, and where each one lives now

The owner's rule — "keep every fact a guest acts on that today's text has" — is
enforced by `tools/tests/test-narration.php`, which is the real record. The
suite holds a table of the actionable facts per safety species and fails if any
one of them stops appearing. Five mutations were run against it and all five go
red: dropping "does not chase people", restoring the rattle promise, putting the
wash window back to an hour, softening the fire-ant mound description, and
adding a new safety species without declaring its facts.

**The fact the owner named:** "It does not chase people" had been dropped by my
trim sample. It is back in the shipped entry, now as "It does not chase people;
that part is folklore" — and it is verified rather than merely restored. The
Florida Museum's Florida Snake ID Guide states that cottonmouths are not
aggressive and do not chase people, and explains the folklore: a cornered snake
heads for the nearest cover whether or not a person is standing in that
direction.

**Audit of the other seven safety entries for the same kind of loss.** Nothing
else had been dropped — the trim sample only ever covered the cottonmouth — but
each entry was re-read against its pre-trim text fact by fact. Restored or
strengthened as a result: the fire-ant mound's *no hole in the top* (it is the
single most reliable way to tell a fire-ant mound from any other ant hill, and
the trim had blurred it to "soft soil"); the lovebug *acid* reason for washing
the car the same day, which had been an unexplained instruction; and the
diamondback's *silence is not an all-clear*, which is new.

### Claim-by-claim sources for the rewritten openings

Cornell = Cornell Lab of Ornithology (All About Birds / Birds of the World).

| entry | claims now made | source |
|---|---|---|
| Florida Cottonmouth | blocky head, dark eye mask, pale lip stripe, vertical pupil, facial pit; juvenile yellow tail tip used as a caudal lure for frogs; coils and gapes white when cornered; does not chase people | Florida Museum, Florida Snake ID Guide |
| Eastern Diamondback | largest venomous snake in North America; sandhill / longleaf pine / palmetto scrub, not waterside; declining range-wide; does not reliably rattle | FWC species profile; FNAI field guide; UF/IFAS |
| Dusky Pygmy | most abundant venomous snake in Florida; 18 in typical, 31 in record; grey with dark blotches and a rusty dorsal stripe; insect-like rattle; leaf litter at trail edges; tissue damage common, no recorded fatality | UF; Florida Museum; Animal Diversity Web |
| Eastern Coral Snake | red/yellow/black rings right round the body; black snout vs the red heads of scarlet kingsnake and scarlet snake; fossorial under litter and logs; bites almost only when handled | Florida Museum, Florida Snake ID Guide; Animal Diversity Web |
| Red Imported Fire Ant | arrived at Mobile in ship's ballast soil, 1930s; mound is a crumbly dome with **no entry hole on top**, entered by tunnels running yards out; mass stinging; white pustules | Encyclopedia of Alabama; UF/IFAS; Texas A&M Imported Fire Ant Project |
| Poison Ivy | leaves of three; hairy aerial-rooted climbing vine; leaflets toothed or smooth, red in spring and autumn; urushiol in every part including the leafless winter vine; rash hours to days later | Clemson HGIC; UConn Home & Garden; FDA; Johns Hopkins Medicine |
| Mosquitoes & No-see-ums | *Culicoides* are 1–3 mm and pass through standard 18×16 window mesh; dawn and dusk, April to November | UF/IFAS EENY-349 / IN626; Clemson Extension (20×20 mesh to exclude) |
| Lovebugs | two flights, four to five weeks from late April and from late August; *Plecia nearctica*, a march fly; larvae decompose plant litter; body fluids acidic, worse after bacterial action over days; no bite, no sting | UF/IFAS EDIS MG068 |
| Alligator | state reptile; bellow carries infrasound; Faraday waves throw water off the back in a spray; courtship April–May; hatchlings chirp from inside the egg to be dug out | Published fluid-dynamics work on the alligator "water dance"; standard *A. mississippiensis* accounts |
| Manatee | first record in Lake County 2015, a female locally named Leesburg; calf "Sunset" 2017; killed by a boat 2020; kin to elephants | Mid-Florida Newspapers (Triangle News Leader) account of the Harris Chain manatees |
| River Otter | up to eight minutes submerged; latrine sites as scent-marking noticeboards conveying identity and status | Sacramento Zoo; Humboldt State latrine-site thesis; *Animal Behaviour* scent-marking study |
| Turtles | cooters and sliders share basking logs; Florida softshell is flat and leathery, buries in mud, breathes at the surface | Florida Museum herpetology accounts (unchanged from the 1.11.0 pass) |
| Florida Banded Watersnake | crossbands, eye-to-jaw line; round pupil, narrow head, no facial pit; harmless | Florida Museum, Southern Watersnake |
| Brown Watersnake | square blotches, head wider than neck, mistaken for a cottonmouth; basks on overhanging branches and drops in; the swimming-posture difference | Florida Museum; UGA SREL herpetology; Virginia DWR |
| Florida Green Watersnake | largest watersnake in North America, record 74 in; plain olive, no bands; weedy shallows; harmless | *Nerodia floridana* accounts; SC DNR species PDF; USFWS |
| Largemouth Bass | Harris Chain trophy water; FWC radio-tagged bass over 8 lb in Lake Dora and Lake Eustis; bluegill and black crappie in the shallows | FWC Florida Trophy Bass Project; FWC Harris Chain forecast |
| Apple Snail | main food of limpkin and the endangered snail kite; eggs laid above the waterline in pale pink clutches, out of reach of fish | FWC apple-snail assessment; USGS NAS *Pomacea paludosa* profile |
| Bald Eagle | largest nest of any bird: St Petersburg, Florida, 9 ft 6 in wide, 20 ft deep, over two tonnes, measured 1963; Florida birds nest in the cool season; the movie scream is a red-tailed hawk | Guinness World Records; Cornell; Missouri Dept of Conservation |
| Osprey | the only raptor that submerges after fish; reversible outer toe and barbed foot pads; carries the catch head-first to cut drag; call likened by Cornell to a whistling kettle taken off the stove | American Bird Conservancy; HawkWatch International; Cornell (Osprey Sounds) |
| Great Egret | the National Audubon Society emblem; plume hunting and the society's founding; slow stalking; breeding aigrettes | Audubon |
| Snowy Egret | golden feet shuffled to flush prey; plume trade; Audubon movement | Audubon; Cornell |
| Cattle Egret | crossed the Atlantic unaided, reaching South America c. 1877; first Florida record 1941, first Florida nesting 1953; follows livestock and mowers | Cornell; Minnesota Breeding Bird Atlas; Wild South Florida |
| Little Blue Heron | white juvenile, slate adult, calico in between; snowy egrets drive off blue adults but tolerate white juveniles, which then catch more fish | Audubon, "The Little Blue Heron's Color Swap"; Cornell |
| Wood Stork | feeds by tactolocation with the bill open; listed 1984 after a >75% decline; **delisted 9 March 2026** | USFWS press release and Federal Register 2026-02588 |
| White Ibis | probes by feel; crayfish; black wingtips shown only in flight | Cornell |
| Glossy Ibis | Old World origin, reached the Americas unaided, first New World record 1817 (New Jersey); iridescent bronze and green | Cornell; standard *Plegadis falcinellus* accounts |
| Great Blue Heron | modified sixth cervical vertebra allows the strike; rod-rich retina for night hunting; "frawnk" averaging 19.7 s | Cornell (Birds of the World, Sounds) |
| Tricolored Heron | dashes and pirouettes, foot-rakes the bottom; fish are 90–99.7% of the diet | Cornell, Birds of the World, Diet and Foraging |
| Florida Sandhill Crane | non-migratory Florida subspecies; winter influx of migrants; trachea coiled into the sternum; bugle carries over a mile; chicks are colts; feeding is illegal in Florida | FWC; Cornell |
| Black-crowned Night Heron | day roosts, dusk feeding; *Nycticorax* = "night raven"; flat "quok" | Cornell |
| Yellow-crowned Night Heron | crustacean specialist with a heavy bill; striped face under a pale crown; more diurnal than its cousin | Cornell |
| Green Heron | bait-fishing with twigs, feathers and insects — and **trims the twig to length**, making it a tool-maker | Audubon; Bird Observer, "Bait-fishing by Birds"; Cornell Bird Academy |
| Least Bittern | smallest heron in the Americas; straddles reed stems instead of wading, so it can feed where the water is too deep for its legs; bill-up freeze | Cornell; Chesapeake Bay Program; Guinness (smallest heron) |
| Anhinga | feathers not waterproof — poorly developed oil glands — which is what lets it sink and hunt; wing-spread drying; nest clicking likened by Cornell to a treadle sewing machine or "a croaking frog with a sore throat" | Cornell (Anhinga Sounds); NH PBS NatureWorks |
| Double-crested Cormorant | swims low, foot-propelled underwater, dries wings-open; **hooked** bill vs the anhinga's dagger | Cornell |
| Common Gallinule | red frontal shield, yellow-tipped bill, long toes on floating vegetation; head-jerk swimming | Cornell |
| Purple Gallinule | purple-blue and bronze-green, pale blue shield, yellow legs; climbs pickerelweed for seeds | Cornell |
| American Coot | a rail, not a duck; **lobed** toes; must patter across the water to take off; winter rafts | Audubon, "The American Coot and Its Wonderfully Weird Feet"; Cornell |
| Pied-billed Grebe | squeezes air from feathers and air sacs to sink without diving; black bill band when breeding | Audubon, "Pied-billed Grebes Sink Like Submarines"; BirdNote |
| Wood Duck | drake's plumage; cavity nesting; ducklings jump the day after hatching, from over 50 ft, unhurt | Cornell; National Wildlife Federation |
| Florida Mottled Duck | non-migratory, peninsula population endemic; both sexes resemble a dark hen mallard; hybridisation with released feral mallards is the **biggest** threat, 7–12% already showing hybrid ancestry | FWC ("The Problem — Hybridization"); *Journal of Wildlife Management* (Bielefeld 2024) |
| Black-bellied Whistling Duck | tree-perching, cavity-nesting, whistles in flight; pink bill, white wing stripe; **one Sarasota flock in 1981 to nearly the whole peninsula now** | Audubon Florida; USF Breeding Bird Atlas; FWC |
| American White Pelican | nine-foot wingspan; never plunge-dives; flocks line up and herd fish into the shallows; winter only | Audubon; FWC |
| Belted Kingfisher | hovers then dives; the **female** carries the extra rusty belly band, unusual among birds; mostly a winter visitor here | Cornell ("Why do female Belted Kingfishers have an extra rust-colored belt?") |
| Limpkin | apple-snail specialist; bill gaps near the tip like tweezers and curves right to follow the shell's spiral; shell middens on the bank | Cornell (Birds of the World / All About Birds) |
| Limpkin — *Listen for* | **the call is the voice of the hippogriff in *Harry Potter and the Prisoner of Azkaban*, supplied by Cornell** | **Verified.** Cornell Chronicle, Dec 2005: the Macaulay Library supplied a limpkin screech for the hippogriff; curator of audio Greg Budney chose it. This is the claim the owner asked me to source or cut — it is sourced, from Cornell's own newsroom, and it stays. |
| Fish Crow | separable from the American crow by the nasal two-note call alone — with the honest caveat that young American crows also sound nasal | Cornell (Fish Crow Sounds); Audubon, "Birdist Rule #65" |
| Bald Cypress | the Elfin River widened for steamboats in 1882; the species can pass 2,000 years; the purpose of the knees is still unsettled | Lake County tourism / Mount Dora boating history for the 1882 canal; 1.11.0 pass for the knees |
| Spanish Moss | a bromeliad, not a moss and not a parasite; **no roots**; water and nutrients taken through trichomes | Standard *Tillandsia usneoides* accounts; Bermuda DENR species spotlight |
| Resurrection Fern | epiphyte, takes nothing from the host; survives losing over 95% of its water; photosynthesis back to pre-drought values within about 12 hours of rehydration | NC State Extension; Arkansas Native Plant Society; desiccation/rehydration study (PMC8566288) |
| White Waterlily | flowers open early morning and close around noon; pads shelter fish, frogs and dragonflies | Minnesota DNR; Lady Bird Johnson Wildflower Center |
| Saw Palmetto | fire-adapted, resprouts from an underground stem; major nectar source; fruit eaten by black bears, foxes and **over a hundred** bird species | UF/IFAS Pinellas ("Secrets of the Saw Palmetto"); USDA FEIS; Florida Native Plant Society |

### What the rewrite cost, measured

51 opening paragraphs rewritten, 51 of 51. Mean length 43.4 → 53.9 words, which
is where the approved trim samples themselves sat (52, 56 and 58 words). The
sections — *Where to look*, *Best time*, *Listen for*, *Tell it apart* — were
left short and plain as instructed. Across all 51 entries only **ten section
lines changed at all**, by 354 characters in total, and every one of them is
either a correction listed above or the light polish the owner allowed:

| entry | line | why |
|---|---|---|
| Eastern Diamondback | *What to do* | added "silence is not an all-clear" |
| Poison Ivy | *What to do* | the fifteen-minute window replaces "within the hour" |
| Mosquitoes & No-see-ums | *Best time* | season corrected to April–November |
| Lovebugs | *What to do* | says *why* to wash the car the same day (acidity) |
| Wood Stork | *What to do* | no longer says "federally threatened" |
| Alligator | *Listen for* | polish only |
| Great Blue Heron | *Listen for* | attributes the twenty seconds to Cornell |
| Limpkin | *Best time*, *Where to look* | the two polish edits the owner approved in the STEP 1a sample |
| Fish Crow | *Listen for* | adds the young-American-crow caveat |

`mark` — *Tell it apart* — did not change by a single character across the
whole guide.

Every entry over 60 words is a Know-before-you-go entry carrying one of the
corrections above. That is deliberate: the owner's no-loss rule outranks the
length target on exactly those eight entries.

## The manatee timeline, and the wood stork's badge (1.33.0, second pass)

### Leesburg — the exact timeline, as the owner asked

He kept the story, including her death, and asked for the dates to be right.
Verified against the Clearwater Marine Aquarium's own account ("A Manatee's
Legacy: The Life and Loss of Leesburg", mission.cmaquarium.org) and the
Mid-Florida Newspapers reporting of the Harris Chain manatees:

| when | what |
|---|---|
| 2015 | The first manatee ever recorded in Lake County. Named **Leesburg**, for the city where she was first seen. |
| summer 2017 | Her first calf, a male the community named **Sunset**. |
| through Mar 2019 | She and Sunset used the Silver River as a winter warm-water refuge, seen monthly. |
| early Dec 2019 | Sighted, and visibly pregnant. Struck by a boat around this time. |
| **9 January 2020** | A citizen reported an injured manatee; FWC and CMARI reached her but she died before they could bring her ashore. The necropsy found she died of severe injuries from a boat strike about a month earlier. She was carrying a near-full-term male calf. |

The entry now carries the arrival, the calf, the strike and the date of death.
**A judgement call I am flagging rather than burying:** the near-full-term calf
is in the text too. It is verified, and it is the single fact that makes "keep
the boat at idle when one is near" mean something rather than read as boilerplate.
It is also the bleakest sentence in the guide. One clause to cut if that is the
wrong note for a holiday cottage — say the word.

### Wood stork — the badge is right, but for a different reason than it was

The question the owner set: the "Protected — by law" badge must now match the
text, and the Migratory Bird Treaty Act covers every native bird in the guide,
so it cannot be what singles this one out. Decide from evidence.

**Evidence:** the federal delisting was final on 9 March 2026 (USFWS; Federal
Register 2026-02588). But **Florida state protection did not lapse with it**.
Under Rule 68A-27.0012 F.A.C. a species removed from the federal list gets a
Biological Status Review by a Biological Review Group, and the wood stork
remains protected under Rule 68A-27.003 F.A.C. until that review reaches a final
listing decision. FWC has yet to convene it.

**What I did:** kept the `protected` flag and the badge, and rewrote the
what-to-do line to say what is actually true today —

> "Off the federal list since March 2026 — that is the good news — and still
> protected under Florida law while the state reviews where it now belongs."

So the badge is carried by a live state protection specific to this species, not
by the MBTA, and not by a federal listing that no longer exists. **This needs
re-checking when FWC's review lands**: if the Biological Review Group recommends
no state listing, the flag and the badge come off and the entry says so.

### Batch 8 photographs (17 species: nine snakes, eight lizards)

Files and credits landed together, ahead of the species entries themselves, so a
photograph can never reach the page before its attribution. Two CC0 photographs
are credited to their observers anyway — CC0 waives the requirement, not the
courtesy.

**One `PHOTO_NOTES` line was required**, by the same rule that governs the
Florida mud turtle and the fish crow: the **Eastern Indigo Snake**. The file
states no location and its source is a U.S. Army page at Fort Stewart, Georgia,
so it is very likely not a Florida animal — the same species, photographed
elsewhere in its range. Every other reptile photograph in the pack is a Florida
animal with a county named, so the exception has to be said out loud rather than
left for a reader to assume.

## Sheet heights at 390px, before and after the narration rewrite

The owner asked for this table for all 51 entries. Measured in the real
species sheet at 390px wide, in the harness's serif fallback (this sandbox
has no Raleway, so the real sheets will differ a little in absolute height —
the DELTAS are what the rewrite is responsible for).

`before` is commit `72f69a8`, the last before the rewrite. `after` includes the
exact Leesburg timeline and the wood stork's corrected what-to-do line.

**Summary: median +56px, mean +50px, range −92 to +154.** Seven entries are
unchanged and three got SHORTER. A line of body text in this sheet is about
30px, so the typical entry grew by not quite two lines — which is what the
owner said he was choosing when he accepted the trim density.

| entry | sheet before | sheet after | Δ sheet | paragraph before | paragraph after | Δ para |
|---|---:|---:|---:|---:|---:|---:|
| manatee | 1093 | 1247 | +154 | 216 | 370 | +154 |
| diamondback | 1109 | 1252 | +143 | 247 | 339 | +92 |
| turtle | 896 | 1020 | +124 | 185 | 308 | +123 |
| cypress | 896 | 1020 | +124 | 185 | 308 | +123 |
| littleblue | 1757 | 1880 | +123 | 185 | 308 | +123 |
| alligator | 1239 | 1332 | +93 | 154 | 247 | +93 |
| applesnail | 896 | 989 | +93 | 185 | 277 | +92 |
| otter | 987 | 1079 | +92 | 154 | 247 | +93 |
| eagle | 1496 | 1588 | +92 | 185 | 277 | +92 |
| osprey | 1264 | 1356 | +92 | 154 | 247 | +93 |
| egret | 1599 | 1691 | +92 | 185 | 277 | +92 |
| greenheron | 1534 | 1626 | +92 | 154 | 247 | +93 |
| mosquito | 1175 | 1262 | +87 | 247 | 308 | +61 |
| pygmy | 1165 | 1227 | +62 | 277 | 339 | +62 |
| coralsnake | 1171 | 1233 | +62 | 308 | 370 | +62 |
| fireant | 1306 | 1368 | +62 | 277 | 339 | +62 |
| fish | 896 | 958 | +62 | 185 | 247 | +62 |
| bcnightheron | 1539 | 1601 | +62 | 185 | 247 | +62 |
| anhinga | 1811 | 1873 | +62 | 185 | 247 | +62 |
| kingfisher | 1017 | 1079 | +62 | 185 | 247 | +62 |
| moss | 932 | 994 | +62 | 185 | 247 | +62 |
| fern | 932 | 994 | +62 | 185 | 247 | +62 |
| palmetto | 865 | 927 | +62 | 185 | 247 | +62 |
| coot | 1420 | 1481 | +61 | 185 | 247 | +62 |
| lily | 907 | 968 | +61 | 185 | 247 | +62 |
| heron | 1780 | 1836 | +56 | 154 | 185 | +31 |
| poisonivy | 1196 | 1247 | +51 | 308 | 308 | +0 |
| fishcrow | 1265 | 1316 | +51 | 247 | 247 | +0 |
| woodstork | 1979 | 2023 | +44 | 216 | 277 | +61 |
| cottonmouth | 1934 | 1965 | +31 | 308 | 339 | +31 |
| greenwater | 1674 | 1705 | +31 | 247 | 277 | +30 |
| greategret | 1797 | 1828 | +31 | 247 | 277 | +30 |
| cattleegret | 1677 | 1708 | +31 | 247 | 277 | +30 |
| ibis | 1248 | 1279 | +31 | 154 | 185 | +31 |
| glossyibis | 1245 | 1276 | +31 | 247 | 277 | +30 |
| tricolored | 1895 | 1926 | +31 | 154 | 185 | +31 |
| leastbittern | 1622 | 1653 | +31 | 247 | 277 | +30 |
| whistlingduck | 1526 | 1557 | +31 | 247 | 277 | +30 |
| grebe | 1451 | 1481 | +30 | 216 | 247 | +31 |
| woodduck | 1497 | 1527 | +30 | 277 | 308 | +31 |
| lovebug | 1165 | 1191 | +26 | 277 | 277 | +0 |
| sandhill | 2023 | 2023 | +0 | 277 | 277 | +0 |
| ycnightheron | 1571 | 1571 | +0 | 216 | 216 | +0 |
| cormorant | 1786 | 1786 | +0 | 247 | 247 | +0 |
| commongallinule | 1582 | 1582 | +0 | 216 | 216 | +0 |
| purplegallinule | 1481 | 1481 | +0 | 247 | 247 | +0 |
| mottledduck | 1401 | 1401 | +0 | 277 | 277 | +0 |
| limpkin | 1155 | 1155 | +0 | 277 | 277 | +0 |
| brownwater | 1663 | 1632 | -31 | 308 | 277 | -31 |
| pelican | 1135 | 1104 | -31 | 277 | 247 | -30 |
| bandedwater | 1831 | 1739 | -92 | 370 | 277 | -93 |

The three that shrank are the three where re-verification let the text say
MORE with fewer words: the banded watersnake's three-mark comparison (−92px),
the brown watersnake (−31px) and the white pelican (−31px).

The four biggest growers are all entries where a verified fact replaced a
vaguer one: the manatee (+154px, the exact Leesburg timeline), the
diamondback (+143px, the rattle correction), and the turtles and bald cypress
(+124px each, both replacing a claim that could not be sourced).

## Item 6, batches 6–8 (1.33.0): sources for the 43 new species

Every entry below was written from the sources named, on the same terms as the
narration pass: no verified source, no claim. The master list supplied names,
scientific names, flags and a one-line habitat; it is not a source, and each
fact was checked separately.

### Turtles (batch 6, 12 species)

| species | claims made | source |
|---|---|---|
| Peninsula Cooter | two doubled-back "hairpin" head stripes; dozens of yellow lines on shell, limbs and tail; yellow not red plastron | *Pseudemys peninsularis* accounts; Animal Diversity Web |
| Florida Red-bellied Cooter | nests inside living alligator nest mounds; arrowhead head stripe, jaw cusps, red plastron | verified for the STEP 1a sample; unchanged |
| Red-eared Slider | native to the Mississippi drainage; released pets; interbreeding with native sliders; release prohibited by FWC Rule 68-5.001 F.A.C.; red ear patch | FWC Red-Eared Slider profile; FWC nonnative species |
| Florida Softshell | largest softshell in North America (to ~30 in carapace); leathery flat shell, snorkel snout, buried ambush | *Apalone ferox* accounts; USGS NAS |
| Common Snapping Turtle | bottom ambush predator; rarely basks, and then floating with only the carapace showing; long saw-toothed tail | *Chelydra serpentina* accounts; Wild South Florida |
| Gopher Tortoise | burrow holds steady temperature year-round; **more than 350 species recorded using burrows**; eastern indigo snake depends on them; state-threatened | FWC gopher tortoise commensals; UF/IFAS Lake County; Orianne Society |
| Florida Box Turtle | hinged plastron closes the shell completely; radiating yellow lines on a high dome | *Terrapene* accounts; Florida Box Turtle profiles |
| Eastern Musk Turtle | four musk glands under the shell rim; bottom-walker rather than swimmer; climbs bankside branches | Virginia Herpetological Society; Missouri Dept of Conservation |
| Loggerhead Musk Turtle | oversized head; crushes snails and mussels; clear limestone springs | USFWS; *Sternotherus minor* accounts |
| Striped Mud Turtle | three pale stripes on the shell, two yellow stripes each side of the face | FWC striped mud turtle profile; Virginia DWR |
| Florida Mud Turtle | endemic to Florida; small, dark and unmarked — the ABSENCE of the striped mud turtle's marks is the identification | *Kinosternon steindachneri* accounts; USFWS |
| Florida Chicken Turtle | neck nearly as long as the shell; net of fine yellow lines; Florida subspecies limited to the peninsula; quiet weedy water, walks overland | USFWS; Animal Diversity Web |

### Know before you go (batch 7, 14 species)

| species | claims made | source |
|---|---|---|
| No-see-ums | *Culicoides* 1–3 mm, pass standard 18×16 window mesh; dawn and dusk April–November; moving air deters them | UF/IFAS EENY-349/IN626; Clemson Extension |
| Cane Toad | introduced for cane beetles; parotoid gland behind each eye; bufotoxin absorbed through gums; can kill a dog in minutes; wipe gums, rinse mouth pointing down and out, see a vet | Florida veterinary and municipal guidance (Weston, Tequesta); VCA; PetMD; FWC |
| Southern Black Widow | glossy black; a SINGLE JOINED red hourglass; untidy tangle webs in dark undisturbed places; bites on reaching | Penn State Extension; Florida sources |
| Brown Widow | now the commoner widow around buildings; **spiky egg sac like a sandspur**; orange-yellow hourglass; more potent venom but far less injected, and timid | Clemson HGIC; UC Riverside CISR; UF/IFAS NW District |
| Puss Caterpillar | among the most venomous caterpillars in the US; hollow venomous spines under the "fur"; remove spines with tape | UF/IFAS EENY-545/IN976; Merck Manual |
| Saddleback Caterpillar | green "saddle" with a brown oval; hollow venom-tipped spines that break off in tissue | UF/IFAS EENY-522; published venom work |
| Paper Wasps | open unwrapped umbrella comb under eaves and rails; defend only when the nest is disturbed; can sting more than once | standard *Polistes* accounts; NC State Extension |
| Southern Yellowjacket | nests in the ground; stings repeatedly with a smooth stinger; southern colonies can overwinter and grow very large | NC State Extension; *Vespula squamosa* accounts |
| Lone Star Tick | commonest human-biting tick in Florida; single silvery-white spot on the female; **alpha-gal syndrome**, delayed red-meat allergy; remove straight out with fine tweezers | UF PHHP; UF/IFAS IN1017; Cleveland Clinic; AAFA |
| Chiggers | larva bites, not the adult; **does not burrow and does not drink blood** — it builds a stylostome and feeds through it; nail polish is useless; hot soapy shower | Texas A&M AgriLife; Mississippi State Extension; Cleveland Clinic |
| Yellow Fly | described as the most aggressive fly in Florida; ~1 cm, yellow with black fore-legs and purple-banded green eyes; bites blister | UF/IFAS EENY-320; *Cutis* clinical review |
| Tread-softly | stinging hairs on stem, leaf, flower AND fruit; also called finger rot; deeply lobed leaves, white flowers | UF/IFAS HB003; Clemson; Florida Native Plant Society |
| Brazilian Pepper | introduced as an ornamental before 1900; over 750,000 acres in Florida; cashew family, same as poison ivy, causes contact dermatitis; smoke is worse | FDACS noxious weed profile; *Cutis*; UF/IFAS |
| Eastern Velvet Ant | a wingless female WASP, not an ant; sting widely rated the most painful in the Southeast; not aggressive — stings are to bare feet | Mississippi State Extension; PestWorld |

### Snakes and lizards (batch 8, 17 species)

| species | claims made | source |
|---|---|---|
| Black Racer | fast, sight-hunting, holds its head up; white chin; harmless | Florida Museum, North American Racer; UF/IFAS Escambia |
| Yellow Rat Snake | angled belly scales that grip bark; four thin dark stripes on mustard yellow; climbs | *Pantherophis quadrivittatus* accounts |
| Corn Snake | spear-point mark on the head; black-edged red saddles on orange; placid rodent specialist | NC Wildlife; Outdoor Alabama; Smithsonian NZ |
| Eastern Garter Snake | three pale stripes; damp edges; **black lips, no pre-ocular spot** | Mass Audubon; *Thamnophis sirtalis* accounts |
| Peninsula Ribbon Snake | slimmer than a garter; **white lips and a white spot before the eye**; waterside | Mass Audubon; *Thamnophis sauritus* accounts |
| Southern Ringneck Snake | pale neck ring; orange belly shown by coiling the tail upright as an aposematic display | UGA SREL; Florida Museum; Outdoor Alabama |
| Rough Green Snake | arboreal; eats mostly insects — caterpillars, spiders, crickets; very reluctant to bite | Missouri Dept of Conservation; Chesapeake Bay Program |
| Eastern Mud Snake | glossy black above, red-and-black barred belly; specialises on amphiumas and sirens; rolls to flash the belly and presses the pointed tail tip | Loyola LUCEC; Virginia Herpetological Society; Animal Diversity Web |
| Eastern Indigo Snake | **longest native snake in the US** (to ~8.6 ft); eats other snakes including rattlesnakes and is unaffected by their venom; winters in gopher tortoise burrows; ESA-threatened since 1978 | USFWS; Smithsonian NZ; Florida Wildlife Federation |
| Green Anole | pink dewlap; colour change is mood and temperature; **moved up into the branches after the brown anole arrived, and toe pads measurably enlarged in ~15 years / 20 generations** | published work reported by *The Conversation* and Reptiles Magazine |
| Brown Anole | native to Cuba and the Bahamas; Florida Keys 1887; now nearly every county; eats young green anoles; orange-red dewlap with a pale border; stays low | UF/IFAS NW District; *Anolis sagrei* accounts |
| Southeastern Five-lined Skink | five pale stripes, ~8 in; blue juvenile tail as a decoy | Florida State Parks; SC PARC |
| Broad-headed Skink | Florida's largest skink, to ~13 in; males' heads swell and flush orange in spring; arboreal | Florida State Parks; NSIS Florida Wildlife |
| Ground Skink | smallest lizard here, 3–5.75 in; moves through leaf litter; **transparent window in the lower eyelid** | NC Wildlife; Animal Diversity Web; Virginia Herpetological Society |
| Six-lined Racerunner | six pale lines; **clocked at 18 mph**; active in full midday heat | Kansas Wetlands Education Center; *Aspidoscelis sexlineata* accounts |
| Eastern Glass Lizard | legless lizard with **movable eyelids and external ear openings**, which no snake has; tail shatters and is more than half the animal | NC Wildlife; Herps of NC; Britannica |
| Mediterranean House Gecko | non-native, from the Mediterranean; nocturnal; hunts insects drawn to lights | Texas Invasive Species Institute; NDOW |

### Photograph notes added with these batches

Four, each for a different reason, by the rule that a photograph is a claim:

- **Florida mud turtle** — the only open-licence photograph of the species that
  could be found, and it is a head-in-shell close-up, so the plainness that
  identifies it is easier checked against the striped mud turtle's photo.
- **Eastern indigo snake** — no location stated and the source is a U.S. Army
  page in Georgia, so very likely not a Florida animal; every other reptile in
  the pack is.
- **Puss caterpillar** and **paper wasps** — photographed in Virginia. The
  species occur here; most open-licence puss caterpillar images are of the adult
  moth, and the caterpillar is the stage that stings.
- **Chiggers** — an adult mite. The stage that bites is a larva too small to
  photograph usefully, which is itself the point of the entry.

The mosquito's existing note lost its "no-see-ums are not shown" clause: they
have their own entry now, so it described a gap that no longer exists.
