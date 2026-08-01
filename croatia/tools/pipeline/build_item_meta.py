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

# ---- refine person by CAMERA MODEL (who physically shot it), overriding the
#      contributor tag where they disagree. The contributor = whose library/shared
#      album the photo came from, which is wrong for photos shared between family
#      members; the EXIF camera model is the true device. Model comes from the
#      bundle3 manifest, joined to our items on capture time (exact local second,
#      falling back to minute + rounded GPS). Trip-verified device map:
#        iPhone 16 → Rob · iPhone 14 Pro Max → Erica · iPhone 14 Plus → Alice
import datetime as _dt
MODEL2P = {"iPhone 16": "Rob", "iPhone 14 Pro Max": "Erica", "iPhone 14 Plus": "Alice"}
man_path = os.path.join(LOCAL, "bundle3-manifest.csv")
if os.path.exists(man_path) and os.path.exists(jg_path):
    by_sec, by_min = {}, {}
    with open(man_path, newline="") as fh:
        for row in csv.DictReader(fh):
            model = (row.get("camera_model") or "").strip()
            if not model or model == "?":
                continue
            dt = (row.get("capture_datetime") or "")[:19]
            if dt:
                by_sec.setdefault(dt, set()).add(model)
            la, lo = row.get("gps_lat"), row.get("gps_lng")
            if len(dt) >= 16 and la and lo:
                try:
                    by_min.setdefault(dt[:16] + "|%.4f,%.4f" % (float(la), float(lo)), set()).add(model)
                except ValueError:
                    pass
    retag = 0
    for guid, e in json.load(open(jg_path)).items():
        if guid not in meta:
            continue
        try:
            d = _dt.datetime.strptime((e.get("datetime") or "")[:19], "%Y-%m-%dT%H:%M:%S") + _dt.timedelta(hours=2)
        except Exception:
            continue
        models = by_sec.get(d.strftime("%Y:%m:%d %H:%M:%S"))
        if not models and e.get("lat") is not None:
            models = by_min.get(d.strftime("%Y:%m:%d %H:%M") + "|%.4f,%.4f" % (float(e["lat"]), float(e["lng"])))
        if not models:
            continue
        persons = {MODEL2P[m] for m in models if m in MODEL2P}
        if len(persons) == 1:
            p = next(iter(persons))
            if meta.get(guid, {}).get("person") != p:
                meta.setdefault(guid, {})["person"] = p
                retag += 1
    print(f"device retag: {retag} person tags overridden by camera model")

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
