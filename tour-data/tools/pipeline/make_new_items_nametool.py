#!/usr/bin/env python3
"""Standalone name-tool scoped to ONLY the new (unbucketed) items, so places can
be assigned to them without seeing or disturbing the existing 2,031.

Geolocated new items are greedily clustered by day + ~60 m proximity into
unnamed "spots" (name each once); items without GPS become individually-named
orphans. Previews point at the public site, so the file works from disk.

Output: new-items-name-tool.html
"""
import json, os
from math import radians, sin, cos, asin, sqrt

PIPE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(PIPE))
MEDIA_BASE = "https://croftrobertl.github.io/claude/tour-data/"
ING = json.load(open(os.path.join(ROOT, "data-local", "new_items_ingest.json")))
_extra_path = os.path.join(ROOT, "data-local", "extra_items_ingest.json")
if os.path.exists(_extra_path):
    ING = ING + json.load(open(_extra_path))   # + quarantined-for-review + iMovie conclusion videos

def to_item(r):
    it = {"id": r["key"], "kind": r["kind"], "place": "", "chapter": "unbucketed",
          "datetime": r.get("datetime", "") or ""}
    if r.get("lat"):
        it["lat"] = float(r["lat"]); it["lng"] = float(r["lng"])
    if r["kind"] == "photo":
        it["src"] = r["src"]; it["full"] = r["full"]
    else:
        it["url"] = r["url"]; it["poster"] = r["poster"]
    return it

items = [to_item(r) for r in ING]

def hav(a, b):
    R = 6371000.0
    la1, lo1, la2, lo2 = map(radians, [a[0], a[1], b[0], b[1]])
    h = sin((la2-la1)/2)**2 + cos(la1)*cos(la2)*sin((lo2-lo1)/2)**2
    return 2*R*asin(sqrt(h))

geo = [it for it in items if "lat" in it]
clusters = []
for it in sorted(geo, key=lambda x: x.get("datetime", "")):
    day = (it.get("datetime") or "")[:10]
    best = next((c for c in clusters if c["day"] == day
                 and hav((c["lat"], c["lng"]), (it["lat"], it["lng"])) <= 60), None)
    if best:
        best["ids"].append(it["id"]); n = len(best["ids"])
        best["lat"] = (best["lat"]*(n-1) + it["lat"]) / n
        best["lng"] = (best["lng"]*(n-1) + it["lng"]) / n
    else:
        clusters.append({"ids": [it["id"]], "lat": it["lat"], "lng": it["lng"], "day": day})

cmap = {f"new-{i:03d}": {"label": "(unnamed new spot)",
                         "lat": round(c["lat"], 5), "lng": round(c["lng"], 5),
                         "ids": c["ids"]}
        for i, c in enumerate(clusters, 1)}

KEEP = ("id", "kind", "place", "lat", "lng", "datetime", "chapter",
        "src", "full", "poster", "url")
slim = [{k: it[k] for k in KEEP if k in it} for it in items]
payload = {"items": slim, "cmap": cmap, "names": {"groups": {}, "itemNames": {}, "deleted": []}}
data_js = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

inject = ("<script>\n"
          f"window.__MEDIA_BASE__ = {json.dumps(MEDIA_BASE)};\n"
          f"window.__EMBEDDED__ = {data_js};\n"
          "</script>\n")
html = open(os.path.join(PIPE, "name-tool.html"), encoding="utf-8").read()
marker = '<script>\n"use strict";'
if marker not in html:
    raise SystemExit("could not find the main <script> in name-tool.html")
out = html.replace(marker, inject + marker, 1)
dest = os.path.join(PIPE, "new-items-name-tool.html")
open(dest, "w", encoding="utf-8").write(out)
print("wrote", dest)
print("  items         :", len(slim))
print("  geo clusters  :", len(cmap))
print("  orphans(no gps):", sum(1 for it in items if "lat" not in it))
print("  size          :", round(len(out)/1024), "KB")
