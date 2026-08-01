#!/usr/bin/env python3
"""Phase-1 enrichment of trip.json (run as the final pipeline step):
  - video durations (extracted from the media via exiftool)
  - per-day distance travelled (from the GPS sequence)
  - per-place minutes spent
  - trip-level summary stats (most-visited place, busiest day, totals)
  - per-day weather IF tour-data/data/weather.json (date -> {...}) exists

Self-contained & idempotent. Needs exiftool for durations (optional — skipped
if unavailable).  Usage:  python3 tools/enrich_trip.py
"""
import json, os, math, subprocess, csv, io
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                       # tour-data/
trip = json.load(open(f"{ROOT}/trip.json"))

def hav(a, b, c, e):
    R = 6371000; dl = math.radians(c-a); dn = math.radians(e-b)
    x = math.sin(dl/2)**2 + math.cos(math.radians(a))*math.cos(math.radians(c))*math.sin(dn/2)**2
    return 2*R*math.atan2(math.sqrt(x), math.sqrt(1-x))

# ---- video durations via exiftool ----
dur = {}
try:
    out = subprocess.run(["exiftool", "-q", "-m", "-r", "-api", "largefilesupport=1",
                          "-csv", "-FileName", "-Duration#", f"{ROOT}/media", "-ext", "mp4"],
                         capture_output=True, text=True, timeout=600).stdout
    for r in csv.DictReader(io.StringIO(out)):
        v = r.get("Duration#") or r.get("Duration")
        if v:
            try: dur[r["FileName"]] = round(float(v))
            except ValueError: pass
except Exception as e:
    print("duration extraction skipped:", e)
print("durations:", len(dur))

# ---- optional weather ----
weather = {}
wpath = f"{ROOT}/data/weather.json"
if os.path.exists(wpath):
    weather = json.load(open(wpath))
print("weather days:", len(weather))

def mins(a, b):
    def m(t):
        try: h, mm = t.split(":"); return int(h)*60+int(mm)
        except: return None
    x, y = m(a), m(b)
    return (y-x) if (x is not None and y is not None and y >= x) else None

place_counts = Counter()
for d in trip["days"]:
    located = []
    for p in d["places"]:
        for it in p["items"]:
            if it.get("lat") is not None:
                located.append((it.get("time") or "", it["lat"], it["lng"]))
    located.sort()
    wm = sum(hav(located[i-1][1], located[i-1][2], located[i][1], located[i][2])
             for i in range(1, len(located))
             if hav(located[i-1][1], located[i-1][2], located[i][1], located[i][2]) < 3000)
    d["walk_km"] = round(wm/1000, 1)
    for p in d["places"]:
        pm = mins(p.get("from"), p.get("to"))
        if pm is not None: p["mins"] = pm
        place_counts[p["name"]] += p["count"]
        for it in p["items"]:
            if it.get("type") == "self_hosted" and it.get("url"):
                fn = os.path.basename(it["url"])
                if fn in dur: it["dur"] = dur[fn]
    if d["date"] in weather:
        d["weather"] = weather[d["date"]]

most = place_counts.most_common(1)[0] if place_counts else ("", 0)
by_items = max(trip["days"], key=lambda d: d["count"])
by_walk = max(trip["days"], key=lambda d: d.get("walk_km", 0))
trip["stats"] = {
    "most_visited": {"name": most[0], "count": most[1]},
    "most_active_day": {"index": by_items["index"], "label": by_items["short"], "count": by_items["count"]},
    "longest_walk_day": {"index": by_walk["index"], "label": by_walk["short"], "km": by_walk.get("walk_km", 0)},
    "total_locations": len(place_counts),
    "total_video_min": round(sum(it.get("dur", 0) for d in trip["days"] for p in d["places"] for it in p["items"]) / 60),
    "trip_walk_km": round(sum(d.get("walk_km", 0) for d in trip["days"]), 1),
    "photos": sum(d["kinds"]["photo"] for d in trip["days"]),
    "videos": sum(d["kinds"]["video"] for d in trip["days"]),
    "clips": sum(d["kinds"]["clip"] for d in trip["days"]),
}
json.dump(trip, open(f"{ROOT}/trip.json", "w"), ensure_ascii=False, separators=(",", ":"))
print("stats:", json.dumps(trip["stats"], ensure_ascii=False))
