# Water module — sources, confidence, and gaps

**DCC Wildlife 1.6.0 · "Fishing & Water Conditions"**

This is the audit document. Every fact that can reach a guest's screen is
listed here with its origin, confidence tier and date. If you ever see
something on the page that is not in this list, that is a bug — tell me.

---

## 0. What changed since 1.5.0, and two assumptions I got wrong

You called the Lake County Water Atlas API from a networked session on
2026-08-27 and resolved it completely. The build environment here still has
no egress, so what follows is built against your captured responses, taken as
your first-hand report.

**Two things I had assumed in 1.5.0 were wrong. Recording them plainly so
neither is repeated:**

1. **I keyed the integration on the FDEP WBID (`2831B`).** That is a different
   identifier entirely and does not work against this API. The correct key is
   the Water Atlas **waterbody id — Lake Dora is `7972`**. The old
   `{wbid}` template has been removed.
2. **I expected a `WaterClarity` endpoint to carry Secchi.** It does not. It
   is an *annual* report (ReportYear, period-of-record) returning apparent
   colour, chlorophyll A, true colour and turbidity — no Secchi at all — and
   `siteID=1` returns 400. Secchi lives in **WaterQuality**. The wrong
   endpoint is gone, and a test asserts it is never called again.

Two smaller corrections also recorded in code comments: there is **no `/api/`
path prefix** (that 404s), and **`s` is an integer Site Id** (`s=lake` returns
400, omitting it 404s).

What did not change: the `Water_Fact` gate, the measurement-time rule, the
"label matches the statistic" discipline, graceful degradation, and the
permanent absence of water temperature.

---

## 1. The resolved endpoints

```
GET https://api.wateratlas.usf.edu/waterbodies/7972/WaterQuality?s=1
GET https://api.wateratlas.usf.edu/waterbodies/7972/LevelsFlows?s=1
```

Cached for **6 hours**. These values move monthly, not by the minute, and it
is an academic API — so the module caches hard, backs off on failure, and
never polls. Settings → DCC → Water has a **Test** button that calls both
reports from your live server and lists every reading recognised.

Every reading is used exactly as the API states it: **units and precision are
read from the payload, never assumed.** A test proves this by feeding the same
component in metres at three decimals and checking the output follows.

---

## 2. Every fact that can reach the page

### 2a. From the Water Atlas

| Field | Component | How the value is produced | Tier |
|---|---|---|---|
| **Water level** | `Water Levels`, SJRWMD station **30013010, on Lake Dora** | A **deviation in inches** from `historicAverageForMonth.norm` | `live` |
| **Water clarity** | `Secchi disk depth`, station DORASQUIRRELPT | The reading, plus a comparison against the API's own long-run median | `published` |
| **Dissolved oxygen** | `Dissolved Oxygen`, FDEP | The reading, with a plain-English gloss | `published` |
| **TSI** | `TSI` (payloadType `LimitingParameter`) | The index, with a gloss and its limiting nutrient | `published` |
| **Depth map** | `Bathymetry` | A link to the LCWA survey PDF | `published` |

**Water level is never shown raw.** 61.19 ft is an elevation above NAVD88 and
a guest reads that as depth — the exact trap the USGS gauges were dropped
for, and this station is no different. The headline is *"About 5 inches below
normal for August"*; the raw reading, its datum, the norm and its 1994–2026
period of record all sit in the small print.

The baseline is `historicAverageForMonth.norm` **and nothing else**. That
component's outer `historic` block is unreliable here — its `minValue` is 0,
impossible for a lake sitting at 61 ft NAVD88, and `medValue` is null. A test
asserts the deviation is never computed from it. (Secchi's `historic` block
*is* sound and is used; the difference is per-parameter, not a rule about the
API.)

**Water clarity is where the API does the work for us.** It supplies its own
period-of-record statistics, so *"3.61 ft — clearer than usual here; the
long-run median is 1.50 ft across 1,246 samples since 1978"* is the API's
arithmetic, not ours, and every number in it is citable. The comparison clause
only appears when the difference is unmistakable (≥1.5× or ≤0.67× the median);
a middling reading gets no editorial spin.

**Clarity is dated, not labelled stale.** The 45-day current/stale rule is
gone. Lake County samples monthly to quarterly, so it would have read "most
recent known reading" almost permanently — accurate, but it reads as broken.
The page says *"sampled 28 May"* and lets you judge. A one-year backstop still
drops anything genuinely ancient.

**The depth map answers a question open since 1.4.0.** You asked for water
depth at the very start and it has been absent ever since, because no single
depth figure could be sourced. An authoritative bathymetric chart is more use
to an angler than any average would have been, and it invents nothing:
LCWA, DGPS-SONAR, NAVD88, surveyed 2013-09-14.

### 2b. From USGS

| Field | Source | Notes |
|---|---|---|
| **Recent rain** | USGS `00045` daily sums (`statCd=00006`) at **02237700** | Labelled by **calendar days**, not a rolling 48 hours |

The USGS **level** gauges are gone entirely — none sat on Lake Dora, and the
atlas exposes an SJRWMD station that does. Rainfall is the one thing those
gauges still do better than anything else nearby.

### 2c. From NWS

Forecast and wind for the Tavares grid (MLB 11,78), unchanged.

### 2d. Owner's own words

"From the dock", plus the **rain note** rendered directly beneath the measured
rainfall — the gauge measures the rain, you say what it means here. Two
blocks, never one sentence.

### 2e. "About the water"

Reference facts about the waterbody rather than today's state. Currently one
row: Lake Dora, 4,385 acres. See §4 for why it lives in its own block.

---

## 3. What is deliberately left out

1. **Water temperature.** Still gone, permanently. The nearest `00010` gauges
   are springs at a near-constant ~72 °F while the canal swings from the
   fifties to near ninety — wrong in exactly the direction that drives bass
   behaviour. A comment in `class-water-live.php` records the reasoning.
2. **Turbidity.** Available in the same payload; your call to exclude it. Two
   clarity numbers would confuse more than they inform.
3. **The raw gauge elevation as a headline.**
4. **That level component's outer `historic` block.**
5. **A flow row.** `Water Flows` returns null flows for this lake. Its
   `levels.historicAvg` (61.02, 52 samples) remains available as a second
   opinion on the level baseline if you ever want it.
6. **The `WaterClarity` endpoint.**
7. **"About normal" as a daily line.** A level within 2 inches of its monthly
   norm says nothing an angler can use, and printing it every day teaches
   guests to stop reading. Same for a dry two days of rainfall: silence.
8. **Lake list and hydrology.** Still not asserted — see §5.
9. **Bag limits, seasons, ramps, manatee zones, solunar tables.** Unchanged
   from 1.5.0: link FWC, guess nothing.

---

## 4. The render bar, raised

1.5.0 published the section on the strength of the seeded acreage row, so the
live page showed *"Surface area: 4,385 acres"* under a heading promising
fishing and water conditions. Acreage is not a condition.

Almanac rows now carry a **section**: `conditions` or `about`. Only
`conditions` rows, the owner's dock notes, or a live layer that could plausibly
return something will make the module render at all. `about` rows appear in
their own block below everything else, set off by a rule. A test asserts that
the defaults alone — acreage only, live off — publish **nothing**.

---

## 5. Still yours to answer — do not let anyone guess these

1. **Which waters should the module list**, and what the Dora Canal actually
   connects to.
2. **What do guests actually catch off the dock, and when?**
3. **Nearest ramps**, and any idle-speed, manatee-zone, lock or low-bridge
   constraint between you and the open lakes.
4. **Do you want the live layer on?** Still off by default, because it makes
   network calls and that should stay a deliberate act.

---

## 6. How to audit the page yourself

1. Look at any value on the guest page.
2. Read the small grey line beneath it: the source, the station, whether it
   was *read*, *sampled* or *surveyed*, when — and for the level, the raw
   reading and the comparison basis.
3. Click the source: atlas readings open that station's metadata page, the
   depth map opens the PDF, USGS opens that gauge.
4. If a value has no line beneath it, that is a bug. It should not be possible.
