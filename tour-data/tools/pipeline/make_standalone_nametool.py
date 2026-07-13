#!/usr/bin/env python3
"""Build a standalone, double-clickable copy of name-tool.html.

The normal name-tool.html fetches its data files and shows media from local
paths, so it needs a local web server. This bakes the data straight into the
HTML and points previews at the public site, so the output file works when
opened directly from disk (file://) — no server required.

Output: name-tool-standalone.html  (send this to yourself / open in a browser)

Usage: python3 make_standalone_nametool.py
"""
import json, os

PIPE = os.path.dirname(os.path.abspath(__file__))
# public base where media/ is served (used only for photo/video/clip previews)
MEDIA_BASE = "https://croftrobertl.github.io/claude/tour-data/"

# only the item fields the tool actually reads — keeps the file ~40% smaller
KEEP = ("id", "kind", "place", "lat", "lng", "datetime", "chapter",
        "src", "full", "poster", "url")

def load(name):
    with open(os.path.join(PIPE, name), encoding="utf-8") as f:
        return json.load(f)

items = load("flat_items_labeled.json")
slim = [{k: it[k] for k in KEEP if k in it} for it in items]
cmap = load("cluster_map.json")
try:
    names = load("croatia-names-v3.json")
except FileNotFoundError:
    names = {"groups": {}, "itemNames": {}, "deleted": []}

with open(os.path.join(PIPE, "name-tool.html"), encoding="utf-8") as f:
    html = f.read()

payload = {"items": slim, "cmap": cmap, "names": names}
data_js = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
# never let embedded text close the <script> tag or break the line
data_js = data_js.replace("</", "<\\/").replace(" ", " ").replace(" ", " ")

inject = (
    "<script>\n"
    f"window.__MEDIA_BASE__ = {json.dumps(MEDIA_BASE)};\n"
    f"window.__EMBEDDED__ = {data_js};\n"
    "</script>\n"
)

marker = '<script>\n"use strict";'
if marker not in html:
    raise SystemExit("could not find the main <script> in name-tool.html")
out = html.replace(marker, inject + marker, 1)

dest = os.path.join(PIPE, "name-tool-standalone.html")
with open(dest, "w", encoding="utf-8") as f:
    f.write(out)

print(f"wrote {dest}")
print(f"  items embedded : {len(slim)}")
print(f"  clusters       : {len(cmap)}")
print(f"  size           : {round(len(out)/1024)} KB")
print(f"  media previews : {MEDIA_BASE}")
