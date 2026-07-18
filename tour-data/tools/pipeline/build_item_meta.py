#!/usr/bin/env python3
"""Build item_meta.json — per-photo extras that the app surfaces:

  person   : who shot it (Rob / Erica / Alice), from the private contributor
             tags in data-local/joined_gps.json. Clips are all GoPro (handled
             in build_trip.py, not here). iMovie edits are left unattributed.
  heading  : compass bearing the camera faced (EXIF GPSImgDirection), read from
             this repo's own media/**/*-full.jpg — no originals needed.

Keyed by media GUID (the filename stem). Committed so build_trip.py stays
self-contained; re-run this whenever names/media change and joined_gps is present.

Usage: python3 build_item_meta.py
"""
import json, os, subprocess, csv, io, glob

PIPE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(PIPE))            # tour-data/
LOCAL = os.path.join(ROOT, "data-local")

PERSON = {"Dad (Rob)": "Rob", "Wife": "Erica", "Daughter": "Alice"}

meta = {}

# ---- person, from the private GPS/contributor join (if available) ----
jg_path = os.path.join(LOCAL, "joined_gps.json")
if os.path.exists(jg_path):
    jg = json.load(open(jg_path))
    for guid, info in jg.items():
        p = PERSON.get((info or {}).get("contributor"))
        if p:
            meta.setdefault(guid, {})["person"] = p
    print(f"person tags: {sum('person' in v for v in meta.values())} from joined_gps")
else:
    print("joined_gps.json absent — person tags skipped (kept from prior item_meta.json)")
    # preserve existing person tags if we can't recompute them
    prev = os.path.join(PIPE, "item_meta.json")
    if os.path.exists(prev):
        for g, v in json.load(open(prev)).items():
            if v.get("person"):
                meta.setdefault(g, {})["person"] = v["person"]

# ---- heading, from EXIF GPSImgDirection on the full-res copies ----
fulls = glob.glob(os.path.join(ROOT, "media", "**", "*-full.jpg"), recursive=True)
if fulls:
    out = subprocess.run(
        ["exiftool", "-q", "-m", "-csv", "-FileName", "-GPSImgDirection", *fulls],
        capture_output=True, text=True).stdout
    n = 0
    for r in csv.DictReader(io.StringIO(out)):
        fn = r.get("FileName", "")
        if not fn.endswith("-full.jpg"):
            continue
        guid = fn[:-len("-full.jpg")]
        deg = r.get("GPSImgDirection", "")
        if deg not in ("", None):
            try:
                meta.setdefault(guid, {})["heading"] = round(float(deg))
                n += 1
            except ValueError:
                pass
    print(f"headings: {n} from EXIF ({len(fulls)} full-res photos scanned)")
else:
    print("no media/**/*-full.jpg found — headings skipped")

json.dump(meta, open(os.path.join(PIPE, "item_meta.json"), "w"), ensure_ascii=False,
          indent=0, sort_keys=True)
print(f"wrote item_meta.json: {len(meta)} items")
