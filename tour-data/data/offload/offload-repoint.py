#!/usr/bin/env python3
"""Repoint places.json 'full' and self-hosted 'url' fields to the media-v1
GitHub Release, and bump the service-worker CACHE_VERSION.

Run AFTER offload-upload.sh has finished (assets must exist, or the site 404s).
By default it verifies a sample of release URLs resolve before rewriting;
pass --no-verify to skip.

    cd tour-data && python3 data/offload/offload-repoint.py

Then commit places.json + service-worker.js, and finally remove the moved
originals (see offload-README.md).
"""
import json, os, re, sys, urllib.request

REPO = "croftrobertl/claude"
TAG  = "media-v1"
BASE = f"https://github.com/{REPO}/releases/download/{TAG}"
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))          # tour-data/
PLACES = os.path.join(ROOT, "places.json")
SW     = os.path.join(ROOT, "service-worker.js")

def rel_url(local_path):
    return f"{BASE}/{os.path.basename(local_path)}"

def head_ok(url):
    req = urllib.request.Request(url, method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status in (200, 302)
    except Exception as e:
        print(f"  HEAD failed for {url}: {e}")
        return False

def main():
    verify = "--no-verify" not in sys.argv
    d = json.load(open(PLACES))
    # collect what we'd rewrite
    to_full, to_url = [], []
    for p in d["places"]:
        for m in p.get("media", []):
            if m.get("full") and not m["full"].startswith("http"):
                to_full.append(m)
            if m.get("type") == "self_hosted" and m.get("url") and not m["url"].startswith("http"):
                to_url.append(m)
    print(f"will repoint {len(to_full)} 'full' + {len(to_url)} 'url' fields")

    if verify and (to_full or to_url):
        sample = [rel_url(m["full"]) for m in to_full[:3]] + [rel_url(m["url"]) for m in to_url[:3]]
        print("verifying sample release URLs resolve ...")
        if not all(head_ok(u) for u in sample):
            print("ABORT: sample release assets are not reachable. Run offload-upload.sh "
                  "first, or pass --no-verify if you're sure.")
            sys.exit(1)

    for m in to_full:
        m["full"] = rel_url(m["full"])
    for m in to_url:
        m["url"] = rel_url(m["url"])
    d["version"] = d.get("version", 5) + 1
    json.dump(d, open(PLACES, "w"), ensure_ascii=False, indent=1)
    print(f"places.json repointed; version -> {d['version']}")

    # bump SW CACHE_VERSION (dcc-tour-vN -> vN+1)
    sw = open(SW).read()
    def bump(mo):
        return f"{mo.group(1)}{int(mo.group(2))+1}{mo.group(3)}"
    new = re.sub(r"(CACHE_VERSION\s*=\s*'dcc-tour-v)(\d+)(')", bump, sw, count=1)
    if new != sw:
        open(SW, "w").write(new)
        v = re.search(r"dcc-tour-v(\d+)", new).group(1)
        print(f"service-worker CACHE_VERSION -> dcc-tour-v{v}")
    else:
        print("WARN: could not find CACHE_VERSION to bump")

if __name__ == "__main__":
    main()
