# Water module — sources, confidence, and gaps

**DCC Wildlife 1.5.0 · "Fishing & Water Conditions"**

This is the audit document. Every fact that can reach a guest's screen is
listed here with its origin, confidence tier and date. If you ever see
something on the page that is not in this list, that is a bug — tell me.

---

## 0. What changed since 1.4.0

1.4.0 was built with no outbound network, so nothing could be checked and the
almanac shipped empty. **You verified the sources from a networked session on
2026-08-27**, and 1.5.0 is built on those results.

One thing to keep straight: **this build environment still has no egress** —
USGS, NWS, FWC and the Water Atlas are all blocked here. So the figures below
are *your* verified findings, taken on trust as your first-hand report, not
values I independently re-checked. Everything derived from them is marked
accordingly. Where you did not verify something, it is still absent.

The gate itself is unchanged: `Water_Fact` still has a private constructor and
a single null-returning factory, and the renderer still accepts nothing else.

---

## 1. Verified sources

### USGS Water Services — confirmed working

Active gauges in Lake County (`countyCd=12069`). **API gotcha, now recorded in
the code:** passing `stateCd` and `countyCd` together returns HTTP 400 — only
one major filter is allowed, which is why discovery uses a bounding box.

| Site | Name | Reports | Used for |
|---|---|---|---|
| **02237700** | Apopka-Beauclair Canal near Astatula | `00045` precip, `00060` flow, `00065` stage, `63160` elev, `72255` velocity | **Water level + rainfall** (default) |
| 02237701 | Apopka-Beauclair Canal below dam | `00065`, `63160` | Available |
| **02238000** | Haynes Creek at Lisbon | `00065`, `63160` | Available (flow offline since 2026-03-03) |
| 02238001 | Haynes Creek below Burrell Dam | `00065`, `63160` | Available |
| 02237734 | Wolf Branch at FCRR near Mount Dora | `00060`, `00065` | Available |

02238000's dead flow series is exactly why there is now a **staleness guard**:
any instantaneous reading older than 6 hours is dropped rather than shown as
current. A five-month-old value can no longer reach the page.

### NWS — confirmed working

`api.weather.gov/points/28.8045,-81.7450` → Tavares, FL, office **MLB**, grid
**11,78**. Those coordinates are seeded as defaults; they are the same ones
your `dcc-sun-canal.php` mu-plugin has always used, and NWS grids are roughly
city-scale, so nothing about a precise address is exposed.

### Lake County Water Atlas — API exists, path not confirmed

`api.wateratlas.usf.edu` is public with no documented key, and publishes a
Water Clarity Report category. **The request path and response shape were not
part of what you verified**, so I did not invent one. Instead:

- the endpoint is a **configurable URL template** (`{wbid}` placeholder),
- the parser is deliberately **shape-tolerant** — it walks whatever JSON comes
  back looking for a depth-like value paired with a date-like value,
- and Settings → DCC Water has a **Test button** that fetches from your live
  server and reports exactly what it found, so the path gets confirmed against
  the real API rather than guessed here.

Lake Dora's WBID (**2831B**) and waterbody page are seeded from your check.

---

## 2. Every fact that can reach the page

### 2a. Live layer — only when enabled AND configured

| Field | Source | How the value is produced | Date shown |
|---|---|---|---|
| **Water level** | USGS `00065` (or `63160`) at the featured site | A **deviation in inches** from a baseline — never the raw elevation | Gauge measurement time |
| **Recent rain** | USGS `00045` daily sums (`statCd=00006`) | Sum of the last **two calendar days** | Date of the last complete day |
| **Water clarity** | Water Atlas clarity endpoint | Latest Secchi depth in the response | The reading's own sample date |
| **Forecast** | NWS forecast for the grid | The API's own short forecast + temperature | Forecast issuance time |
| **Wind** | NWS, same payload | The API's own wind speed/direction | Forecast issuance time |

Three things worth understanding about how these are worded:

**Water level is never shown raw.** `00065`/`63160` are heights above a datum;
Apopka-Beauclair reads about 65.93 ft, and a guest reading "Gage height: 65.93
ft" would conclude the water is 65 feet deep — a falsehood produced by the
module built to prevent falsehoods. So the headline is *"About 4 inches above
normal for this week"* and the raw reading sits in the small print where it is
unambiguous.

**The label always matches the statistic.** "Normal for this week" is only
printed when the daily-values record actually supports it: **three or more
distinct years** with at least nine observations in that calendar week. Below
that threshold it falls back to a trailing 30-day mean and says *"the last 30
days"* — never the word "normal" — with a note explaining that the record is
too short. Rainfall is labelled *"over the last two days"* with the calendar
dates named, because daily sums are what USGS actually publishes; it is not
described as a rolling 48 hours.

**Neither gauge is in Lake Dora.** Apopka-Beauclair is upstream of the
Beauclair/Dora pool and Haynes Creek is downstream past Eustis, so every
reading names its station and its straight-line distance ("about 3.2 mi from
the property"). Neither is ever called "your water", and the chain's hydrology
and flow direction are still not asserted anywhere.

### 2b. Almanac — one seeded row

| Waterbody | Field | Value | Tier | Source | Date |
|---|---|---|---|---|---|
| Lake Dora | Surface area | 4,385 acres | `published` | Lake County Water Atlas, WBID 2831B | 2026-08-27 (retrieved) |

That is the **only** pre-filled fact in the plugin. The date is the retrieval
date, not a claim about when the survey was done. Everything else is still
entered by you on Settings → DCC Water, where the form refuses any row missing
a tier, a source name or a date, and tells you which rows it dropped.

### 2c. Owner's own words — two places

"From the dock" (standing notes) and the **rain note**, which renders directly
beneath the measured rainfall in your voice. The gauge measures the rain; you
say what rain does to the canal. They are deliberately **two blocks, never one
sentence** — nothing implies the gauge said anything about the canal.

### 2d. Links

Now deep-linked where a deep link was verified: the **Lake Dora waterbody
page**, and per-gauge **USGS monitoring-location** pages built from your
confirmed site IDs. FWC, NWS and SJRWMD remain roots — no Lake-County-specific
path on those was verified, and a guessed deep link is a broken link. Those
three are yours to improve; the fields are editable.

---

## 3. What I deliberately left out, and why

1. **Water temperature — removed outright, and not coming back.** There is no
   `00010` series on this water. The nearest active ones are Rock Springs
   (~15 mi) and Wekiwa Springs (~18 mi) — both **springs**, discharging at a
   near-constant ~72 °F year round, while the canal is shallow surface water
   swinging from the fifties to near ninety. Since temperature is what drives
   bass behaviour, a spring reading would be confidently wrong in the
   direction that matters most: 72 °F in January and 72 °F in August, telling
   an angler the opposite of the truth in both. Disclosing the distance does
   not rescue it. The C→F conversion path is deleted and a comment in
   `class-water-live.php` records why, so nobody helpfully re-adds it. If a
   thermometer goes on the dock, it enters as a **dated owner observation**.
2. **Raw gauge elevation as a headline** — see above.
3. **The word "normal" on a short record** — the fallback says what it is.
4. **Lake depths, average and maximum.** Still unverified. Absent.
5. **The Harris Chain lake list and how the waters connect.** Still yours.
6. **Specific fishing spots and coordinates.** Kinds of water only.
7. **Bag limits, size limits and seasons.** These change, and a stale limit
   could get a guest cited. Link to FWC and "check before you fish".
8. **Solunar tables.** Not established science. Absent.
9. **Ramps, locks, low bridges, idle-speed and manatee zones.** Safety
   information is the last place to guess. Structurally supported, empty.
10. **A guessed Water Atlas endpoint path.** Configurable + Test button
    instead.
11. **Species lists presented as "found here".** Needs FWC per-waterbody data.

---

## 4. The empty-state change, measured

Rendering the actual v1.4.0 code with nothing configured produced **1,289
bytes** — a heading, five links to national homepages, a disclaimer, and zero
facts. On a guest page that reads as unfinished.

v1.5.0 in the same situation renders **0 bytes**. The module now emits nothing
at all unless it holds a sourced fact, your own words, or a live layer that
could plausibly return something. When only live content is possible, the
section is emitted **hidden** and the JavaScript reveals it *only* once real
readings arrive — so a failed fetch leaves the page clean rather than showing
an empty shell. You can place it on the Guest Guide now and let it light up as
it fills.

---

## 5. Still yours to answer — do not let anyone guess these

1. **Which waters should the module list**, and what the Dora Canal actually
   connects to.
2. **Which gauge do you consider representative?** Both are configured;
   02237700 is the default only because it is the one reporting rainfall.
3. **What do guests actually catch off the dock, and when?**
4. **Nearest ramps**, and any idle-speed, manatee-zone, lock or low-bridge
   constraint between you and the open lakes.
5. **The Water Atlas clarity endpoint path** — paste a candidate and press
   Test; it will tell you immediately whether it works.
6. **Do you want the live layer on?** It is still off by default, because it
   makes network calls and that should stay a deliberate act.

---

## 6. How to audit the page yourself

1. Look at any value on the guest page.
2. Read the small grey line beneath it: source, measurement time, and for the
   water level, the raw reading and the comparison basis.
3. If it is a USGS reading, click through — it opens that exact station.
4. If a value has no line beneath it, that is a bug. It should not be possible.
