#!/usr/bin/env python3
"""Verify proposed Wikidata Q-ids against the scientific names they must match.

Usage:  python3 verify-wikidata.py entities.csv > result.csv
CSV in:  id,sci,qid,wiki_slug   (qid like Q193327; wiki_slug like American_alligator)
CSV out: id,sci,qid,status,detail

status:  PROPOSED  — qid was blank; this is the item whose taxon name (P225) equals sci.
                     Check the item by eye, copy the Q-id into the CSV, re-run: it must come back OK.
         OK        — the Q-id's taxon name (P225) equals sci (case/space-insensitive)
         SYNONYM   — P225 differs but sci appears among the item's aliases/labels
         MISMATCH  — the Q-id is a different taxon; DO NOT SHIP
         NO-P225   — the item is not a taxon item at all
         ERROR     — network/API problem; re-run

Only OK rows go into Species::entities(). SYNONYM rows need a human look
(often an older/newer name — check the brief's taxonomy notes). Needs network;
run it from a machine that has some. Requests are batched (50 per call) and
politely rate-limited.
"""
import csv, json, sys, time, urllib.parse, urllib.request

API = "https://www.wikidata.org/w/api.php"
UA  = "dcc-wildlife-entity-check/1.0 (doracanalcourt.com)"

def fetch(qids):
    q = "|".join(qids)
    url = API + "?" + urllib.parse.urlencode({
        "action": "wbgetentities", "ids": q, "props": "claims|labels|aliases",
        "languages": "en|la|mul", "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r).get("entities", {})

def norm(s): return " ".join((s or "").lower().split())

def lookup(sci):
    """Items whose P225 (taxon name) is exactly sci — via the search API."""
    url = API + "?" + urllib.parse.urlencode({"action": "query", "list": "search",
        "srsearch": f'haswbstatement:"P225={sci}"', "srlimit": 5, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return [h["title"] for h in json.load(r).get("query", {}).get("search", [])]

def taxon_name(ent):
    for c in ent.get("claims", {}).get("P225", []):
        v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
        if isinstance(v, str): return v
    return None

def names(ent):
    out = set()
    for lang, l in ent.get("labels", {}).items(): out.add(norm(l.get("value")))
    for lang, al in ent.get("aliases", {}).items():
        for a in al: out.add(norm(a.get("value")))
    return out

rows = list(csv.DictReader(open(sys.argv[1], newline="")))
w = csv.writer(sys.stdout); w.writerow(["id", "sci", "qid", "status", "detail"])
for i in range(0, len(rows), 50):
    chunk = rows[i:i+50]
    try:
        ents = fetch([r["qid"].strip() for r in chunk if r["qid"].strip()])
    except Exception as e:
        for r in chunk: w.writerow([r["id"], r["sci"], r["qid"], "ERROR", str(e)[:80]])
        continue
    for r in chunk:
        qid = r["qid"].strip(); sci = r["sci"].strip()
        ent = ents.get(qid)
        if not qid:
            try:
                found = lookup(sci)
            except Exception as e:
                w.writerow([r["id"], sci, "", "ERROR", str(e)[:80]]); continue
            w.writerow([r["id"], sci, found[0] if found else "", "PROPOSED" if found else "MISSING",
                        ("candidates: " + " ".join(found)) if found else "no item has this taxon name"])
            continue
        if not ent or "missing" in ent: w.writerow([r["id"], sci, qid, "MISMATCH", "no such item"]); continue
        t = taxon_name(ent)
        if t is None: w.writerow([r["id"], sci, qid, "NO-P225", "not a taxon item"]); continue
        if norm(t) == norm(sci): w.writerow([r["id"], sci, qid, "OK", t])
        elif norm(sci) in names(ent): w.writerow([r["id"], sci, qid, "SYNONYM", f"P225 is {t}"])
        else: w.writerow([r["id"], sci, qid, "MISMATCH", f"P225 is {t}"])
    time.sleep(1.0)
