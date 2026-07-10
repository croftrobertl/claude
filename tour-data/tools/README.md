# Durable place-name record

Your naming work is saved so it lasts **forever** and can be reused in any future
project — in **two independent forms**, both keyed to each item's **permanent id**
(the Apple asset GUID for photos/videos, which is the same string in every media
filename; the Google-Drive file id for GoPro clips).

## 1. Sidecar files (separate, referenceable)

- `../data/place-names.csv` — one row per item: `id, kind, date, time, lat, lng, place, file`
- `../data/place-names.json` — `{ id: { place, kind, file, date, time, lat, lng } }`

Because the key is the filename GUID, you can re-join these names to the original
photos/videos in any tool (a spreadsheet, a new website, a photo library) with no
dependency on this trip project. Regenerate any time the names change:

```bash
python3 tools/gen_sidecar.py
```

## 2. Embedded in the media metadata (never separated)

`tools/embed_places.py` writes the place name **into each media file itself**, so
it travels with the file when copied, re-downloaded, or imported elsewhere:

- Photos → `XMP-dc:Description` + `XMP-iptcCore:Location` (standard fields every
  photo app reads; no length limit). Existing GPS is left intact.
- Videos → `QuickTime:Description` + `Keys:Description` + `XMP-dc:Description`.
- Clips (Google-Drive) are skipped — their names stay in the sidecar. The script
  only touches this repo's own copies under `tour-data/media`, never the
  originals in iCloud/Google Drive.

```bash
apt-get install libimage-exiftool-perl      # one-time
python3 tools/embed_places.py --dry          # preview counts, writes nothing
python3 tools/embed_places.py --write         # embed for real
# verify:  exiftool -s -XMP-dc:Description tour-data/media/<...>-full.jpg
```

Run `--write` **after** the names are finalized (it rewrites every jpg/mp4).
