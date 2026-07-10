#!/usr/bin/env python3
"""Build a durable, project-independent record of place names, keyed by each
item's PERMANENT id (the Apple asset GUID for photos/videos — the same string
baked into every media filename — or the Google-Drive file id for GoPro clips).

Outputs (committed to the repo, so they last as long as the repo):
  tour-data/data/place-names.csv   — one row per item, spreadsheet-friendly
  tour-data/data/place-names.json  — { id: {place, kind, file, date, time, lat, lng} }

Because the key is the GUID that is in the filename, this record can be re-joined
to the originals (or any future export of them) forever, independent of this
project. Run it any time trip.json changes:  python3 tools/gen_sidecar.py
"""
import json, csv, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                     # tour-data/
trip = json.load(open(f"{ROOT}/trip.json"))

def id_of(it):
    if it["kind"] == "clip":
        return it.get("id"), ""                  # drive id, no local file
    ref = it.get("full") or it.get("src") or it.get("url") or it.get("poster") or ""
    base = os.path.basename(ref)
    guid = re.sub(r"-(full|thumb|hd|poster)\.\w+$", "", base)
    guid = re.sub(r"\.\w+$", "", guid)
    return guid, ref

rows = []
for d in trip["days"]:
    for pl in d["places"]:
        for it in pl["items"]:
            iid, ref = id_of(it)
            if not iid:
                continue
            rows.append({
                "id": iid, "kind": it["kind"], "date": d["date"],
                "time": it.get("time", ""), "lat": it.get("lat", ""),
                "lng": it.get("lng", ""), "place": it.get("place", ""), "file": ref,
            })

os.makedirs(f"{ROOT}/data", exist_ok=True)
cols = ["id", "kind", "date", "time", "lat", "lng", "place", "file"]
with open(f"{ROOT}/data/place-names.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(rows)
byid = {r["id"]: {k: r[k] for k in ("place", "kind", "file", "date", "time", "lat", "lng")}
        for r in rows}
json.dump(byid, open(f"{ROOT}/data/place-names.json", "w"), ensure_ascii=False, indent=1)

from collections import Counter
print(f"wrote place-names.csv / .json : {len(rows)} items, {len(byid)} unique ids")
print("by kind:", dict(Counter(r["kind"] for r in rows)))
