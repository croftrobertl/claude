#!/usr/bin/env python3
"""Build the flat, day-first trip.json from labeled items."""
import json, datetime as dt
import os as _os
PIPE = _os.path.dirname(_os.path.abspath(__file__))
ROOT = _os.path.dirname(_os.path.dirname(PIPE))       # tour-data/
LOCAL = _os.path.join(ROOT, "data-local")             # gitignored local-only inputs

from collections import defaultdict, Counter

SP = PIPE

items_path = f"{SP}/flat_items_named.json" if _os.path.exists(f"{SP}/flat_items_named.json") else f"{SP}/flat_items_labeled.json"
items = json.load(open(items_path))
# per-item extras (who shot it + camera compass heading), keyed by media GUID
ITEM_META = json.load(open(f"{SP}/item_meta.json")) if _os.path.exists(f"{SP}/item_meta.json") else {}
trip = json.load(open(f"{ROOT}/trip.json"))["trip"]   # carry forward existing trip metadata

AREA = {"orl-mco":"Orlando, FL","lgw":"London Gatwick","dbv-airport":"Dubrovnik Airport",
        "cavtat":"Cavtat","dubrovnik-old-town":"Dubrovnik · Old Town",
        "mount-srd":"Dubrovnik · Lapad & Gruž","soline":"Župa Dubrovačka",
        "elaphiti":"Elaphiti Islands"}

def media_obj(it):
    o = {"kind": it["kind"], "time": (it.get("datetime") or "")[11:16], "place": it.get("place") or "En route"}
    if it.get("lat") is not None: o["lat"] = round(it["lat"], 6); o["lng"] = round(it["lng"], 6)
    if it["kind"] == "photo":
        o["src"] = it["src"]; o["full"] = it["full"]
    elif it["kind"] == "video":
        o["type"] = "self_hosted"; o["url"] = it["url"]; o["poster"] = it["poster"]
    else:  # clip
        o["type"] = "drive"; o["id"] = it["id"]
    # who shot it: clips are all GoPro; photos/videos come from item_meta by GUID
    meta = ITEM_META.get(it.get("id"), {})
    person = "GoPro" if it["kind"] == "clip" else meta.get("person")
    if person: o["person"] = person
    if meta.get("heading") is not None: o["heading"] = meta["heading"]
    # city for grouping/sorting — the trailing component of the place name
    pl = o["place"]
    o["city"] = pl.rsplit(",", 1)[-1].strip() if "," in pl else pl
    return o

byday = defaultdict(list)
for it in items:
    if it.get("date"): byday[it["date"]].append(it)

days = []
for i, d in enumerate(sorted(byday), 1):
    its = sorted(byday[d], key=lambda x: x.get("datetime") or "")
    dobj = dt.datetime.strptime(d, "%Y-%m-%d")
    area = AREA.get(Counter(x["chapter"] for x in its).most_common(1)[0][0], "")
    # group by place, ordered by first appearance
    order, groups = [], defaultdict(list)
    for it in its:
        pl = it.get("place") or "En route"
        if pl not in groups: order.append(pl)
        groups[pl].append(it)
    places = []
    for pl in order:
        g = groups[pl]
        coords = [(x["lat"], x["lng"]) for x in g if x.get("lat") is not None]
        p = {"name": pl, "count": len(g),
             "from": (g[0].get("datetime") or "")[11:16],
             "to": (g[-1].get("datetime") or "")[11:16],
             "items": [media_obj(x) for x in g]}
        if coords:
            p["lat"] = round(sum(c[0] for c in coords)/len(coords), 6)
            p["lng"] = round(sum(c[1] for c in coords)/len(coords), 6)
        places.append(p)
    days.append({
        "date": d, "index": i,
        "label": dobj.strftime("%A · %b ") + str(dobj.day),
        "short": dobj.strftime("%a %-d"),
        "area": area, "story": "", "count": len(its),
        "kinds": {"photo": sum(1 for x in its if x["kind"]=="photo"),
                  "video": sum(1 for x in its if x["kind"]=="video"),
                  "clip":  sum(1 for x in its if x["kind"]=="clip")},
        "places": places,
    })

out = {"trip": trip, "generated": dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
       "item_count": len(items), "day_count": len(days), "days": days}
json.dump(out, open(f"{ROOT}/trip.json", "w"), ensure_ascii=False, separators=(",", ":"))
import os
print("wrote trip.json:", round(os.path.getsize(f"{ROOT}/trip.json")/1024,1), "KB")
print("days:", len(days), "items:", len(items),
      "places-per-day avg:", round(sum(len(d['places']) for d in days)/len(days),1))
print("sample day:", days[3]["label"], "|", days[3]["area"], "| places:", [p["name"] for p in days[3]["places"]][:6])
