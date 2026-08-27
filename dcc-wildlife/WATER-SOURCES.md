# Water module — sources, confidence, and gaps

**DCC Wildlife 1.4.0 · "Fishing & Water Conditions"**

This is the audit document for the water module. Every fact that can reach a
guest's screen is listed here with its origin, its confidence tier and its
date. If you ever see something on the page that is not in this list, that is
a bug — tell me.

---

## 1. The build constraint you need to know about

The environment this module was built in **had no outbound internet access**.
Every data host was blocked at the gateway:

```
waterservices.usgs.gov  -> blocked (gateway 403)
api.weather.gov         -> unreachable
myfwc.com               -> unreachable
lake.wateratlas.usf.edu -> unreachable
waterdata.usgs.gov      -> unreachable
sjrwmd.com              -> unreachable
```

That means **I could not verify a single figure** — not one lake depth, not
one Secchi reading, not one gauge ID, not one species list, not the shape of
the Harris Chain or which waters connect to which.

Under your rule, the response to that is not to write plausible numbers and
soften them with "approximately". It is to **write none**. So the almanac
ships **empty**, and what I built instead is the machinery that makes it
impossible to fill it carelessly later:

- a schema where an unsourced fact **cannot be constructed**, let alone rendered;
- a live layer where the value, its source and its measurement time all arrive
  together from the API, so I never choose a number;
- a **gauge-discovery tool** that asks USGS, from your live server, which
  gauges actually exist near you — so the site IDs come from USGS, not from
  anyone's memory.

---

## 2. Every fact that can reach the page

### 2a. Live layer — tier `live` (only when enabled AND configured)

| Field | Source | Value comes from | Date shown |
|---|---|---|---|
| Water temperature | USGS Water Services, parameter `00010`, per configured site | The API response | The gauge's own measurement timestamp |
| Gauge height | USGS Water Services, parameter `00065` | The API response | Measurement timestamp |
| Discharge | USGS Water Services, parameter `00060` | The API response | Measurement timestamp |
| Forecast — *(period)* | NWS `api.weather.gov` forecast for your coordinates | The API response | Forecast issuance time (`properties.updated`) |
| Wind | NWS, same forecast payload | The API response | Forecast issuance time |

Notes on these five, because they are the only numbers this plugin will ever
produce on its own:

- The **station name and site number are printed next to every USGS reading**
  and link to that station's USGS page. You can click through and check.
- **Water temperature is the one value that is transformed:** USGS reports
  Celsius, guests read Fahrenheit. The conversion is exact, and the original
  reading is disclosed in the row ("converted from 25.5 °C as reported").
  Nothing else is transformed.
- USGS's no-data sentinel (`-999999`) is discarded rather than displayed.
- The time shown is always the **measurement** time, never the time the site
  fetched it. A reading taken at 2:15 PM says 2:15 PM even if the page is
  served from cache at 6 PM.

### 2b. Almanac — tiers `published` / `general`

**Ships empty. There are zero pre-filled facts.**

Anything that ever appears here will have been entered by you on
Settings → DCC Water (or added in code via the `dcc_wl_water_almanac`
filter), and the form **refuses to save a row** that lacks a confidence tier,
a source name and a valid date. When it drops rows, it tells you which ones
and what they were missing.

### 2c. "From the dock" — your own words

Free text you write, rendered in a visually distinct coral panel, labelled
"First-hand notes from your hosts" with the date you last updated it. This is
the only section allowed to speak without a citation, precisely because it is
explicitly marked as *your observation* rather than published data. It is also
the most valuable content on the page — no national source can tell a guest
what the canal does 48 hours after a hard rain.

### 2d. Links and fixed text

Outbound links assert nothing. The only fixed factual sentence in the module
is the disclaimer: *"Licences, seasons and limits change — check the FWC
before you fish."* That is deliberately the **only** thing said about
regulations — see §4.

---

## 3. Source list — what I used, and what I refused to use

### Used as data (official, public, machine-readable)

| Source | Used for | Why it qualifies |
|---|---|---|
| **USGS Water Services** | Gauge height, discharge, water temperature; gauge discovery | Public domain, REST/JSON, no key, self-timestamping |
| **NWS `api.weather.gov`** | Forecast, wind | Public domain, no key. Sends a descriptive `User-Agent` as they require |

### Wired for you to cite, but not ingested

| Source | Why not automated |
|---|---|
| **Lake County Water Atlas** (USF) | The right home for Secchi/clarity, but I could not reach it to confirm whether it exposes a machine-readable endpoint. Linked, and it is the source you would name on a clarity row you enter by hand |
| **Florida FWC** | Species, regulations, ramps, bathymetry. Some open GIS exists, but I could not confirm any endpoint or its shape. Linked as the authority |
| **SJRWMD / Lake County Water Authority** | Lake levels and basin management. Same reason |

### Link only — never ingested, by policy

Cabela's, Bass Pro, Dick's, BassOnline, Harris Chain Reports, Lake County
Bass, Fishbrain, onWater, Fishing Points, Fishbox, Lakefront Florida, Bass
Fishing Florida, Life in Lake, Paddling, Discover Lake County, Mount Dora
Boating Center.

Two separate reasons, and the second matters more: their content is
copyrighted with no public API, so ingesting it would breach their terms —
**and** their reports are one angler's afternoon. "They were crushing them on
the north shoal Tuesday" is a true statement about Tuesday and a false
statement about your guest's Saturday. That is exactly the confident falsehood
this module exists to prevent. The "Local reports & charters" section takes
whichever of these you trust, as plain outbound links.

---

## 4. What I deliberately left out, and why

1. **Every lake depth, average and maximum.** Could not reach FWC or any
   bathymetric source. Guessing a depth on a page guests may act on is
   exactly the failure mode you described.
2. **All water-clarity / Secchi figures.** The field most likely to be wrong
   if guessed, and it changes with the season. Live-or-omit; the almanac row
   exists for when you have a dated Water Atlas reading in hand.
3. **The list of Harris Chain lakes and how they connect.** I will not assert
   which lakes the Dora Canal joins or which way water flows. See §5.
4. **Specific fishing spots and any coordinates.** The module supports
   describing *kinds* of water (grass lines, canal mouths, drop-offs, cypress
   edges); it invents no hot spots.
5. **Depth at which fish hold, as a site-specific number.** Available only as
   `general` guidance, rendered inside a visibly separate "General guidance —
   not measured on this water" box.
6. **Every bag limit, size limit and season.** These change, and a stale limit
   on a guest page could get someone cited. The module links FWC and says
   "check before you fish" — that is the correct answer, not a table.
7. **Solunar tables.** Not established science; deliberately absent.
8. **Ramps, locks, low bridges, idle-speed and manatee zones.** Safety-relevant
   navigation facts are the *last* place to guess. Structurally supported as
   almanac rows; shipped empty pending sourced values.
9. **Any species list presented as "found here".** Needs FWC per-waterbody
   data I could not read. The wildlife module's own fish entry is unaffected.
10. **Preset USGS site IDs.** A wrong site ID silently shows a real reading
    from the wrong river — worse than no reading. Hence the discovery tool.

---

## 5. Questions only you can answer

Hyperlocal facts I will not guess. Answer any of these and I can wire them in
as sourced rows (with you as the named source, dated):

1. **Which waters should the module list?** Name them exactly as you would say
   them to a guest — and which the Dora Canal actually connects to.
2. **Where is the property, to four decimals?** Needed for the NWS forecast
   and for gauge discovery. Nothing is guessed, so both stay off until you
   enter it.
3. **Which USGS gauge is genuinely representative of your water?** Run the
   discovery button and tell me which of the returned stations you would trust
   — proximity alone is not the same as relevance.
4. **What do guests actually catch off your dock, and when?** This becomes
   "From the dock", the best content on the page.
5. **What does the canal do after heavy rain?** You have said it colours up —
   how long does it take to clear in your experience?
6. **Nearest ramp(s) guests really use**, and any idle-speed, manatee-zone,
   lock or low-bridge constraint between you and the open lakes. I would
   rather print your first-hand navigation knowledge than a guessed map.
7. **Do you want the live layer on at all?** It is off by default and breaks
   the plugin's old "no external services" promise — deliberately, in the
   open, with the header rewritten to say what actually happens.

---

## 6. How to audit the page yourself

1. Look at any value on the guest page.
2. Read the small grey line directly beneath it: that is its source and date.
3. If it is a USGS reading, click the source — it opens that exact station.
4. If a value has no line beneath it, that is a bug. It should not be possible.
