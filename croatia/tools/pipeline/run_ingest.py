#!/usr/bin/env python3
"""Download each new original from Google Drive and convert it into the site's
self-hosted web derivatives under media/unbucketed/. Resumable (skips items
whose output already exists) and idempotent.

Usage:
  python3 run_ingest.py [--kind photo|video] [--limit N] [--key KEY ...]
"""
import json, os, re, subprocess, sys, csv, time

PIPE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(PIPE))
OUT  = os.path.join(ROOT, "media", "unbucketed")
TMP  = "/tmp/claude-0/-home-user-claude/9d08ad34-19cd-5dcf-9d82-fd88923d8d7d/scratchpad/orig"
LOG  = os.path.join(ROOT, "data-local", "ingest_log.csv")
COOKIE = "/tmp/gcookie.txt"
os.makedirs(OUT, exist_ok=True); os.makedirs(TMP, exist_ok=True)

def drive_download(file_id, dest, expected=0):
    url = f"https://drive.google.com/uc?export=download&id={file_id}"
    subprocess.run(["curl", "-sL", "--retry", "3", "-m", "600",
                    "-c", COOKIE, url, "-o", dest], check=True)
    with open(dest, "rb") as f:
        head = f.read(1024)
    if head[:15].lower().lstrip().startswith(b"<!doctype") or b"<html" in head.lower():
        html = open(dest, encoding="utf-8", errors="ignore").read()
        conf = re.search(r'name="confirm"\s+value="([^"]+)"', html)
        uuid = re.search(r'name="uuid"\s+value="([^"]+)"', html)
        u = (f"https://drive.usercontent.google.com/download?id={file_id}"
             f"&export=download&confirm={conf.group(1) if conf else 't'}")
        if uuid: u += f"&uuid={uuid.group(1)}"
        subprocess.run(["curl", "-sL", "--retry", "3", "-m", "600",
                        "-b", COOKIE, u, "-o", dest], check=True)
    got = os.path.getsize(dest)
    if expected and abs(got - expected) > max(4096, 0.02 * expected):
        raise RuntimeError(f"size mismatch: got {got} expected {expected}")
    return dest

def done(r):
    if r["kind"] == "photo":
        return os.path.exists(os.path.join(OUT, r["key"] + "-full.jpg"))
    return os.path.exists(os.path.join(OUT, r["key"] + "-hd.mp4"))

def main():
    a = sys.argv[1:]
    kind = None; limit = None; keys = None
    if "--kind" in a:  kind = a[a.index("--kind")+1]
    if "--limit" in a: limit = int(a[a.index("--limit")+1])
    if "--key" in a:   keys = set(a[i+1] for i,x in enumerate(a) if x == "--key")
    src_file = a[a.index("--file")+1] if "--file" in a else os.path.join(ROOT, "data-local", "new_items_ingest.json")
    items = json.load(open(src_file if os.path.isabs(src_file) else os.path.join(ROOT, src_file)))
    if kind: items = [r for r in items if r["kind"] == kind]
    if keys: items = [r for r in items if r["key"] in keys]

    logf = open(LOG, "a", newline="")
    lw = csv.writer(logf)
    ok = skip = err = 0
    n = 0
    for r in items:
        if limit and n >= limit: break
        if done(r):
            skip += 1; continue
        n += 1
        key, fid = r["key"], r["fileId"]
        ext = r["filename"].rsplit(".", 1)[-1].lower()
        tmp = os.path.join(TMP, key + "." + ext)
        t0 = time.time()
        try:
            drive_download(fid, tmp, r.get("fsize", 0))
            subprocess.run(["python3", os.path.join(PIPE, "ingest_convert.py"),
                            tmp, key, r["kind"], OUT], check=True)
            outsz = 0
            for suf in (("-full.jpg","-thumb.jpg") if r["kind"]=="photo" else ("-hd.mp4","-poster.jpg")):
                p = os.path.join(OUT, key+suf)
                outsz += os.path.getsize(p) if os.path.exists(p) else 0
            ok += 1
            lw.writerow([key, r["filename"], r["kind"], "ok", outsz, round(time.time()-t0,1)])
            print(f"[{ok+err}] ok  {r['kind']:5} {r['filename']:32} {outsz//1024}KB {round(time.time()-t0,1)}s", flush=True)
        except Exception as e:
            err += 1
            lw.writerow([key, r["filename"], r["kind"], "ERROR", str(e)[:200], round(time.time()-t0,1)])
            print(f"[{ok+err}] ERR {r['filename']}: {e}", flush=True)
        finally:
            if os.path.exists(tmp): os.remove(tmp)
            logf.flush()
    print(f"\nDONE  ok={ok} skip={skip} err={err}", flush=True)

if __name__ == "__main__":
    main()
