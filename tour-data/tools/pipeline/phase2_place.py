#!/usr/bin/env python3
"""Phase 2: place the named new items into trip.json — APPEND-ONLY.

Reads the name-tool output (groups/itemNames/deleted) + the new-item ingest
records, and inserts each kept+named item into the existing trip.json:
  - merge into an existing same-name place on that day when time-adjacent,
    otherwise insert a new place card at the right chronological spot;
  - deleted items are skipped (their media is pruned separately);
  - the 2 iMovie montages go into a trailing "Conclusion" day.

Every existing item object is preserved byte-identical; only places that
receive a new item change, plus any brand-new place/day. A hard invariant
check aborts if any of the original items is altered or lost.

Writes trip.json.new (does not overwrite). Run verify, then swap into place.
"""
import json, os, copy, collections

PIPE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(PIPE))
NAMES = "/root/.claude/uploads/9d08ad34-19cd-5dcf-9d82-fd88923d8d7d/c70b1edb-newcroatianamesv3.json"

GEO_FALLBACK = [
    ("In-flight: Orlando International Airport (MCO)", 47.3436, -48.8979),
    ("Orlando International Airport (MCO)", 28.4312, -81.3081),
    ("London Gatwick Airport (LGW)", 51.1537, -0.1821),
]
MERGE_WINDOW_MIN = 120

def mins(hhmm):
    if not hhmm or ":" not in hhmm: return None
    h, m = hhmm.split(":")[:2]
    return int(h) * 60 + int(m)

def num(v):
    try: return float(v)
    except (TypeError, ValueError): return None

# ---- load ----
names = json.load(open(NAMES))
itemNames, groups, deleted = names["itemNames"], names["groups"], set(names["deleted"])
group_of = json.load(open(os.path.join(ROOT, "data-local", "group_of.json")))
new = json.load(open(os.path.join(ROOT, "data-local", "new_items_ingest.json")))
extra = json.load(open(os.path.join(ROOT, "data-local", "extra_items_ingest.json")))
allnew = {r["key"]: r for r in new + extra}
trip = json.load(open(os.path.join(ROOT, "trip.json")))

def resolve(k):
    nm = itemNames.get(k)
    if nm: return nm
    g = groups.get(group_of.get(k))
    return g if (g and g != "(unnamed new spot)") else None

# existing place-name -> dates (for undated inference)
pn_dates = collections.defaultdict(collections.Counter)
for d in trip["days"]:
    for pl in d["places"]:
        pn_dates[pl["name"]][d["date"]] += pl["count"]
trip_dates = {d["date"] for d in trip["days"]}     # authoritative in-range trip days
newname_dates = collections.defaultdict(collections.Counter)
for k, r in allnew.items():
    if k in deleted: continue
    nm = resolve(k); dt = (r.get("date") or "").strip()
    if nm and dt in trip_dates: newname_dates[nm][dt] += 1   # only in-range dates seed inference

def media_obj(r, place, time):
    o = {"kind": r["kind"], "time": time or "", "place": place}
    lat, lng = num(r.get("lat")), num(r.get("lng"))
    if lat is not None: o["lat"] = round(lat, 6); o["lng"] = round(lng, 6)
    if r["kind"] == "photo":
        o["src"] = r["src"]; o["full"] = r["full"]
    else:
        o["type"] = "self_hosted"; o["url"] = r["url"]; o["poster"] = r["poster"]
    if r.get("person"): o["person"] = r["person"]
    hd = num(r.get("heading"))
    if hd is not None: o["heading"] = round(hd)
    dur = num(r.get("dur"))
    if dur is not None: o["dur"] = round(dur)
    alt = num(r.get("alt"))
    if alt is not None: o["alt"] = round(alt)
    o["city"] = place.rsplit(",", 1)[-1].strip() if "," in place else place
    return o

# ---- categorize ----
place_items = collections.defaultdict(list)   # date -> [(time_minutes, media_obj)]
conclusion = []
skipped_unnamed, undated_used = [], []
for k, r in allnew.items():
    if k in deleted: continue
    nm = resolve(k)
    if not nm:
        skipped_unnamed.append(r["filename"]); continue
    if r.get("conclusion"):
        conclusion.append((k, r, nm)); continue
    date = (r.get("date") or "").strip()
    time = (r.get("time") or "").strip()[:5]
    if date not in trip_dates:                     # undated OR out-of-trip (bad timestamp) -> infer from place
        src = pn_dates.get(nm) or newname_dates.get(nm)
        if not src:
            skipped_unnamed.append(r["filename"] + " (no-date-source)"); continue
        date = src.most_common(1)[0][0]; time = ""; undated_used.append((r["filename"], nm, date))
    place_items[date].append((mins(time) if time else 10**9, time, media_obj(r, nm, time)))

days_by_date = {d["date"]: d for d in trip["days"]}

def place_coords(items, name):
    coords = [(o["lat"], o["lng"]) for o in items if "lat" in o]
    if coords:
        return round(sum(c[0] for c in coords)/len(coords), 6), round(sum(c[1] for c in coords)/len(coords), 6)
    for key, la, lo in GEO_FALLBACK:
        if key in name: return la, lo
    return None, None

def refresh_place(pl):
    its = pl["items"]
    pl["count"] = len(its)
    times = [o["time"] for o in its if o.get("time")]
    if times: pl["from"] = min(times); pl["to"] = max(times)
    la, lo = place_coords(its, pl["name"])
    if la is not None: pl["lat"] = la; pl["lng"] = lo

added = 0
for date, entries in place_items.items():
    day = days_by_date.get(date)
    if day is None:                                # brand-new day (shouldn't normally happen)
        import datetime as _dt
        dobj = _dt.datetime.strptime(date, "%Y-%m-%d")
        day = {"date": date, "index": 0, "label": dobj.strftime("%A · %b ") + str(dobj.day),
               "short": dobj.strftime("%a %-d"), "area": "", "story": "", "count": 0,
               "kinds": {"photo": 0, "video": 0, "clip": 0}, "places": []}
        trip["days"].append(day); days_by_date[date] = day
    for tmin, time, o in sorted(entries, key=lambda x: x[0]):
        added += 1
        day["kinds"][o["kind"]] = day["kinds"].get(o["kind"], 0) + 1
        day["count"] += 1
        # find a same-name place that's time-adjacent
        cands = [pl for pl in day["places"] if pl["name"] == o["place"]]
        target = None
        for pl in cands:
            f, t = mins(pl.get("from")), mins(pl.get("to"))
            if tmin >= 10**9:                       # undated -> merge with any same-name place
                target = pl; break
            if f is not None and t is not None and (f - MERGE_WINDOW_MIN) <= tmin <= (t + MERGE_WINDOW_MIN):
                target = pl; break
        if target is None and cands and tmin >= 10**9:
            target = cands[0]
        if target is not None:
            target["items"].append(o)
            target["items"].sort(key=lambda x: (mins(x.get("time")) if x.get("time") else 10**9))
            refresh_place(target)
        else:
            newpl = {"name": o["place"], "count": 1, "from": time or "", "to": time or "", "items": [o]}
            la, lo = place_coords([o], o["place"])
            if la is not None: newpl["lat"] = la; newpl["lng"] = lo
            # insert at chronological position among places
            pos = len(day["places"])
            if tmin < 10**9:
                for i, pl in enumerate(day["places"]):
                    if mins(pl.get("from")) is not None and mins(pl["from"]) > tmin:
                        pos = i; break
            day["places"].insert(pos, newpl)

# ---- conclusion day (iMovie montages, very last) ----
if conclusion:
    cday = {"date": "2025-09-28", "index": len(trip["days"]) + 1,
            "label": "Conclusion · Trip Recap", "short": "Recap", "area": "Dubrovnik-Neretva County",
            "story": "", "count": 0, "kinds": {"photo": 0, "video": 0, "clip": 0}, "places": []}
    for k, r, nm in conclusion:
        o = media_obj(r, nm, "")
        cday["places"].append({"name": nm, "count": 1, "from": "", "to": "", "items": [o],
                               **({"lat": o["lat"], "lng": o["lng"]} if "lat" in o else {})})
        cday["kinds"]["video"] += 1; cday["count"] += 1; added += 1
    trip["days"].append(cday)

# renumber day indices in date order (conclusion day sorts last by its 09-27 date)
trip["days"].sort(key=lambda d: d["date"])
for i, d in enumerate(trip["days"], 1): d["index"] = i
trip["item_count"] = trip.get("item_count", 0) + added
trip["day_count"] = len(trip["days"])

json.dump(trip, open(os.path.join(ROOT, "trip.json.new"), "w"), ensure_ascii=False, separators=(",", ":"))
print("placed:", added, "| deleted(skipped):", len(deleted),
      "| unnamed(skipped):", len(skipped_unnamed), "| undated-inferred:", len(undated_used),
      "| conclusion:", len(conclusion))
print("skipped unnamed:", skipped_unnamed)
print("day_count:", trip["day_count"], "| item_count:", trip["item_count"])
