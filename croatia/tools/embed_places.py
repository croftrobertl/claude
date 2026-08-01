#!/usr/bin/env python3
"""Embed each item's place name directly into the media file's metadata, so the
name travels WITH the file forever — it survives copying, re-download, AirDrop,
and re-import into any future project or photo app.

- Photos (.jpg): XMP-dc:Description + XMP-iptcCore:Location. XMP has no length
  limit (unlike legacy IPTC:Sub-location, capped at 32 chars). Existing GPS is
  left untouched.
- Videos (.mp4): QuickTime:Description + Keys:Description + XMP-dc:Description.
- Clips are Google-Drive files, not local copies — skipped. Their names live in
  the sidecar; we never modify the user's Drive/iCloud originals.

Only touches the repo's OWN copies under tour-data/media. Requires exiftool
(`apt-get install libimage-exiftool-perl`).

  python3 tools/embed_places.py --dry     # build the exiftool CSVs, write nothing
  python3 tools/embed_places.py --write    # actually embed
"""
import json, csv, os, sys, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                      # tour-data/
names = json.load(open(f"{ROOT}/data/place-names.json"))
photo_csv, video_csv = f"{HERE}/embed_photos.csv", f"{HERE}/embed_videos.csv"

def resolve(rec):
    f = rec.get("file") or ""
    p = os.path.join(ROOT, f) if f else ""
    return p if p and os.path.exists(p) else None

ph, vd, skip = [], [], 0
for iid, rec in names.items():
    if rec["kind"] == "clip":
        skip += 1; continue
    path, place = resolve(rec), (rec.get("place") or "").strip()
    if not path or not place:
        skip += 1; continue
    (ph if rec["kind"] == "photo" else vd).append((path, place))

with open(photo_csv, "w", newline="") as f:
    w = csv.writer(f); w.writerow(["SourceFile", "XMP-dc:Description", "XMP-iptcCore:Location"])
    for path, place in ph: w.writerow([path, place, place])
with open(video_csv, "w", newline="") as f:
    w = csv.writer(f); w.writerow(["SourceFile", "QuickTime:Description", "Keys:Description", "XMP-dc:Description"])
    for path, place in vd: w.writerow([path, place, place, place])

print(f"photos: {len(ph)}   videos: {len(vd)}   skipped (clips/no-file/no-name): {skip}")
if "--write" in sys.argv:
    print("embedding photos…")
    subprocess.run(["exiftool", "-overwrite_original", "-m", f"-csv={photo_csv}", f"{ROOT}/media"], check=False)
    print("embedding videos…")
    subprocess.run(["exiftool", "-overwrite_original", "-m", "-api", "QuickTimeUTC", f"-csv={video_csv}", f"{ROOT}/media"], check=False)
    print("done. verify: exiftool -s -XMP-dc:Description <file>")
else:
    print("dry run — pass --write to actually embed.")
