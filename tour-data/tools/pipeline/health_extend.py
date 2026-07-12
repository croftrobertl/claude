#!/usr/bin/env python3
"""Add per-day step-curve + elevation profile (with times) + trip signature
climbs to trip.json, powering features #4/#6/#7/#3/#10."""
import csv, json, math, datetime as dt
import os as _os
PIPE = _os.path.dirname(_os.path.abspath(__file__))
ROOT = _os.path.dirname(_os.path.dirname(PIPE))       # tour-data/
LOCAL = _os.path.join(ROOT, "data-local")             # gitignored local-only inputs

from collections import defaultdict


SP = LOCAL
CEST = dt.timezone(dt.timedelta(hours=2))
trip = json.load(open(f"{ROOT}/trip.json"))

def hav(a,b,c,e):
    R=6371000;dl=math.radians(c-a);dn=math.radians(e-b)
    x=math.sin(dl/2)**2+math.cos(math.radians(a))*math.cos(math.radians(c))*math.sin(dn/2)**2
    return 2*R*math.atan2(math.sqrt(x),math.sqrt(1-x))

# ---- per-day cumulative step curve (Croatia-local minute of day) ----
day_steps = defaultdict(list)   # date -> [(minute, steps)]
if not _os.path.exists(f"{SP}/trip_health.csv"):
    print("trip_health.csv not in data-local/ — step curves kept from existing trip.json"); raise SystemExit(0)
for r in csv.DictReader(open(f"{SP}/trip_health.csv")):
    if r["type"] != "StepCount": continue
    t = dt.datetime.strptime(r["startDate"], "%Y-%m-%d %H:%M:%S %z").astimezone(CEST)
    day_steps[t.strftime("%Y-%m-%d")].append((t.hour*60 + t.minute, float(r["value"])))
def curve(pairs):
    pairs.sort(); cum=0; out=[]
    for m,v in pairs:
        cum+=v
        if out and out[-1][0]==m: out[-1][1]=round(cum)
        else: out.append([m, round(cum)])
    return out

# ---- signature climbs: curated Dubrovnik vertical landmarks ----
LANDMARKS = [
    ("Mount Srđ", 42.6492, 18.1116, "⛰"),
    ("City Walls", 42.6412, 18.1090, "🏰"),
    ("Lovrijenac Fortress", 42.6407, 18.1042, "🗼"),
    ("Jesuit Stairs (Skalini)", 42.6406, 18.1096, "🪜"),
    ("Lokrum – Fort Royal", 42.6369, 18.1215, "🌲"),
    ("Cavtat – Rat peninsula", 42.5793, 18.2230, "⚓"),
    ("Elaphiti hills (Šipan/Lopud)", 42.7100, 17.9100, "🏝"),
]
allpts = [(it["alt"], it["lat"], it["lng"])
          for d in trip["days"] for p in d["places"] for it in p["items"]
          if it.get("alt") is not None and it.get("lat") is not None]
sig = []
for name, la, ln, emo in LANDMARKS:
    near = [alt for alt, a, b in allpts if hav(a, b, la, ln) <= 220]
    if near:
        sig.append({"name": name, "emoji": emo, "max_alt": round(max(near)), "n": len(near)})
sig.sort(key=lambda s: -s["max_alt"])
trip["signature_climbs"] = sig

# ---- per-day elevation profile with times + step curve ----
for d in trip["days"]:
    elev = []
    for p in d["places"]:
        for it in p["items"]:
            if it.get("alt") is not None and it.get("time"):
                h, m = it["time"].split(":"); elev.append([int(h)*60+int(m), it["alt"]])
    elev.sort()
    # downsample to <= 60 points
    if len(elev) > 60:
        step = len(elev)/60
        elev = [elev[int(i*step)] for i in range(60)]
    d["health"]["elev"] = elev
    sc = curve(day_steps.get(d["date"], []))
    if sc: d["health"]["stepcurve"] = sc

json.dump(trip, open(f"{ROOT}/trip.json","w"), ensure_ascii=False, separators=(",",":"))
print("signature climbs:")
for s in sig: print(f"  {s['emoji']} {s['name']}: up to {s['max_alt']} m  ({s['n']} shots)")
print("\nsample day elev/stepcurve (Sep 22):")
d22 = next(d for d in trip["days"] if d["date"]=="2025-09-22")
print("  elev points:", len(d22["health"].get("elev",[])), "peak:", max((a for _,a in d22["health"]["elev"]), default=0))
print("  stepcurve points:", len(d22["health"].get("stepcurve",[])), "end steps:", d22["health"].get("stepcurve",[[0,0]])[-1][1])
import os; print("\ntrip.json:", round(os.path.getsize(f"{ROOT}/trip.json")/1024,1), "KB")
