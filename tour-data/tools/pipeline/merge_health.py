#!/usr/bin/env python3
"""Merge watch steps/distance + photo-altitude elevation into trip.json."""
import csv, json, math, datetime as dt
import os as _os
PIPE = _os.path.dirname(_os.path.abspath(__file__))
ROOT = _os.path.dirname(_os.path.dirname(PIPE))       # tour-data/
LOCAL = _os.path.join(ROOT, "data-local")             # gitignored local-only inputs

from collections import defaultdict


SP = LOCAL
CEST = dt.timezone(dt.timedelta(hours=2))

# ---- 1. watch steps/distance -> per Croatia-local-day ----
health = json.load  # placeholder
day_steps = defaultdict(float); day_dist = defaultdict(float)
step_events = []  # (utc_dt, steps) for cumulative timeline
dist_unit = "km"
if not _os.path.exists(f"{SP}/trip_health.csv"):
    print("trip_health.csv not in data-local/ — skipping health merge (trip.json keeps its current health data)"); raise SystemExit(0)
for r in csv.DictReader(open(f"{SP}/trip_health.csv")):
    t = dt.datetime.strptime(r["startDate"], "%Y-%m-%d %H:%M:%S %z")
    local = t.astimezone(CEST); day = local.strftime("%Y-%m-%d")
    v = float(r["value"])
    if r["type"] == "StepCount":
        day_steps[day] += v
        step_events.append((t.astimezone(dt.timezone.utc), v))
    elif r["type"] == "DistanceWalkingRunning":
        day_dist[day] += v; dist_unit = r["unit"]
step_events.sort()

# ---- 2. photo altitude by coordinate ----
def f(x):
    try: return float(x)
    except: return None
mrows = []
for r in csv.DictReader(open(f"{LOCAL}/bundle3-manifest.csv")):
    la, ln, al = f(r.get("gps_lat")), f(r.get("gps_lng")), f(r.get("gps_altitude_m"))
    if la and ln and al is not None: mrows.append((la, ln, al))
lut = {}
for la, ln, al in mrows: lut.setdefault((round(la,5),round(ln,5)), al)
mrows.sort()
def alt_at(lat, lng):
    v = lut.get((round(lat,5),round(lng,5)))
    if v is not None: return v
    best=None; bd=30
    for la,ln,al in mrows:
        if la < lat-0.0004: continue
        if la > lat+0.0004: break
        d=math.hypot((la-lat)*111000,(ln-lng)*82000)
        if d<bd: bd=d; best=al
    return best

trip = json.load(open(f"{ROOT}/trip.json"))
# attach altitude to every located item
for d in trip["days"]:
    for p in d["places"]:
        for it in p["items"]:
            if it.get("lat") is not None:
                a = alt_at(it["lat"], it["lng"])
                if a is not None: it["alt"] = round(a)

# ---- 3. per-day elevation stats + trip totals ----
NOISE = 5  # metres; ignore altitude wiggles below this as GPS noise
trip_climb = 0
for d in trip["days"]:
    alts = []  # (datetime, alt) time-ordered
    for p in d["places"]:
        for it in p["items"]:
            if it.get("alt") is not None and it.get("time"):
                alts.append((it["time"], it["alt"]))
    alts.sort()
    series = [a for _, a in alts]
    climb = 0
    for i in range(1, len(series)):
        dd = series[i] - series[i-1]
        if dd >= NOISE: climb += dd
    trip_climb += climb
    hp = {}
    if series:
        hp["alt_min"] = min(series); hp["alt_max"] = max(series)
        hp["climb_m"] = round(climb)
        # downsample profile to <=40 points for a sparkline
        step = max(1, len(series)//40)
        hp["profile"] = series[::step][:40]
    steps = round(day_steps.get(d["date"], 0))
    if steps: hp["steps"] = steps
    if day_dist.get(d["date"]): hp["dist"] = round(day_dist[d["date"]], 2)
    d["health"] = hp

tot_steps = round(sum(day_steps.values()))
tot_dist = round(sum(day_dist.values()), 1)
trip["health"] = {
    "steps": tot_steps, "dist": tot_dist, "dist_unit": dist_unit,
    "climb_m": round(trip_climb),
    "flights": round(trip_climb/3),          # ~3 m per flight
    "stair_steps": round(trip_climb/0.17),   # ~17 cm per step
    "watch": "Robert’s Apple Watch",
    "days_with_steps": sum(1 for v in day_steps.values() if v),
}
json.dump(trip, open(f"{ROOT}/trip.json","w"), ensure_ascii=False, separators=(",",":"))

print("TRIP TOTALS")
print(f"  steps: {tot_steps:,}   distance: {tot_dist} {dist_unit}")
print(f"  vertical climbed (photo-alt est): {round(trip_climb):,} m  ≈ {round(trip_climb/3)} flights  ≈ {round(trip_climb/0.17):,} stair-steps")
print("\nPER DAY (steps · dist · climb · alt range):")
for d in trip["days"]:
    h=d["health"]
    print(f"  {d['date']} {d['short']:6}  steps {h.get('steps',0):6}  dist {h.get('dist',0):5} {dist_unit}  "
          f"climb {h.get('climb_m',0):4}m  alt {h.get('alt_min','-')}–{h.get('alt_max','-')}m")
# save step timeline for #7 later
json.dump([[t.strftime('%Y-%m-%dT%H:%M:%SZ'), v] for t,v in step_events],
          open(f"{SP}/step_timeline.json","w"))
