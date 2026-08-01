#!/usr/bin/env python3
"""Apply a v3 naming-tool download (croatia-names-v3.json) to the items.

Resolution per item:
  deleted        -> dropped from the project entirely
  itemNames[id]  -> per-photo name wins
  groups[key]    -> cluster (spot) name, via cluster_map.json
  else           -> keep existing label

Writes flat_items_named.json (input to build_trip.py) and refreshes the carry-
over presets so the next regenerated tool shows this progress.

Usage: python3 apply_names_v3.py /path/to/croatia-names-v3.json
"""
import json, sys, os
import os as _os
PIPE = _os.path.dirname(_os.path.abspath(__file__))
ROOT = _os.path.dirname(_os.path.dirname(PIPE))       # tour-data/
LOCAL = _os.path.join(ROOT, "data-local")             # gitignored local-only inputs

from collections import Counter

SP = PIPE
dl_path = sys.argv[1] if len(sys.argv) > 1 else f"{PIPE}/croatia-names-v3.json"
dl = json.load(open(dl_path))
groups = dl.get("groups", {})
item_names = dl.get("itemNames", {})
deleted = set(dl.get("deleted", []))

cluster_map = json.load(open(f"{SP}/cluster_map.json"))
label_preset = json.load(open(f"{SP}/label_preset.json")) if os.path.exists(f"{SP}/label_preset.json") else {}
id_to_key = {iid: key for key, info in cluster_map.items() for iid in info["ids"]}

items = json.load(open(f"{SP}/flat_items_labeled.json"))
out, n_del = [], 0
n_item, n_group, n_keep = 0, 0, 0
for it in items:
    iid = it.get("id")
    if iid in deleted:
        n_del += 1
        continue
    nm = (item_names.get(iid) or "").strip()
    if nm:
        it["place"] = nm; n_item += 1
    else:
        key = id_to_key.get(iid)
        gv = (groups.get(key) or "").strip() if key else ""
        if gv:
            it["place"] = gv; n_group += 1
        else:
            n_keep += 1
    out.append(it)

json.dump(out, open(f"{SP}/flat_items_named.json", "w"), ensure_ascii=False)

# ---- refresh carry-over presets ----
def inherited_of(key):
    lbl = cluster_map.get(key, {}).get("label", "")
    return label_preset.get(lbl, lbl)
# store only names the user specialised past the inherited guess
cluster_pre = {k: v for k, v in groups.items() if v and v != inherited_of(k)}
json.dump(cluster_pre, open(f"{SP}/cluster_preset.json", "w"), ensure_ascii=False, indent=1)
json.dump(item_names, open(f"{SP}/itemNames_preset.json", "w"), ensure_ascii=False, indent=1)
json.dump(sorted(deleted), open(f"{SP}/deleted_preset.json", "w"), ensure_ascii=False, indent=1)

places = Counter(i.get("place") or "(unlabeled)" for i in out)
print(f"items kept: {len(out)}   deleted: {n_del}")
print(f"  named by photo override : {n_item}")
print(f"  named by spot/group     : {n_group}")
print(f"  unchanged (kept label)  : {n_keep}")
print(f"distinct place names now  : {len(places)}")
print(f"specialised spot names    : {len(cluster_pre)}")
print("\ntop 10 places by item count:")
for name, c in places.most_common(10):
    print(f"  {c:4}  {name}")
